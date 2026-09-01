"""Directive read endpoints: the queries the triage table runs."""

from __future__ import annotations

import math
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from .. import rollup
from ..db import get_db
from ..models import (
    ActionItem,
    ActionItemStatus,
    ComplianceDirective,
    DataQualityFlag,
    DirectiveStatus,
    FlagIssue,
    FlagSeverity,
    FlagSource,
    RegulatoryAuthority,
    TriageStatus,
)
from ..normalize import (
    FindingCollector,
    check_date_order,
    check_reference_code,
    check_status_consistency,
    clean_text,
    coerce_directive_status,
    parse_date,
)
from ..schemas import (
    ActionItemCreate,
    ActionItemOut,
    DirectiveDetailOut,
    DirectiveListOut,
    DirectiveOut,
    FlagCreate,
    FlagOut,
    FlagSummary,
    RevalidateResult,
    SortKey,
)

router = APIRouter(prefix="/api/directives", tags=["directives"])

TERMINAL_STATUSES = rollup.TERMINAL_STATUSES

_SEVERITY_RANK = {FlagSeverity.INFO: 1, FlagSeverity.WARNING: 2, FlagSeverity.CRITICAL: 3}


def build_summary(directive: ComplianceDirective) -> FlagSummary:
    """Aggregate a directive's flags once, server-side.

    Doing this in the API rather than the browser keeps the table render cheap and
    means the sort order and the badge always agree on what 'critical' means.

    `max_severity` considers only unresolved flags: once an officer has reviewed a
    defect the row should stop screaming, but the flag itself is kept for history.
    """
    summary = FlagSummary(total=len(directive.flags))
    worst: FlagSeverity | None = None

    for flag in directive.flags:
        if flag.severity == FlagSeverity.CRITICAL:
            summary.critical += 1
        elif flag.severity == FlagSeverity.WARNING:
            summary.warning += 1
        else:
            summary.info += 1

        if flag.resolved_at is not None:
            continue

        summary.open += 1
        if worst is None or _SEVERITY_RANK[flag.severity] > _SEVERITY_RANK[worst]:
            worst = flag.severity

    summary.max_severity = worst
    return summary


def serialise(directive: ComplianceDirective, detail: bool = False):
    model = DirectiveDetailOut if detail else DirectiveOut
    payload = model.model_validate(directive)
    items = directive.action_items

    payload.flag_summary = build_summary(directive)
    payload.open_item_count = sum(1 for i in items if i.status not in TERMINAL_STATUSES)
    payload.triage_status = rollup.triage_status(items)
    payload.primary_owner = rollup.primary_owner(items)
    payload.owner_count = rollup.owner_count(items)
    payload.next_due_date = rollup.next_due_date(items)
    payload.overdue = rollup.is_overdue(items)
    return payload


def _critical_flag_count():
    """Correlated count of CRITICAL flags, used for risk-first ordering."""
    return (
        select(func.count(DataQualityFlag.id))
        .where(
            DataQualityFlag.directive_id == ComplianceDirective.id,
            DataQualityFlag.severity == FlagSeverity.CRITICAL,
        )
        .correlate(ComplianceDirective)
        .scalar_subquery()
    )


def _all_flag_count():
    return (
        select(func.count(DataQualityFlag.id))
        .where(DataQualityFlag.directive_id == ComplianceDirective.id)
        .correlate(ComplianceDirective)
        .scalar_subquery()
    )


def _items_exist():
    return (
        select(ActionItem.id)
        .where(ActionItem.directive_id == ComplianceDirective.id)
        .exists()
    )


def _has_open_items():
    return (
        select(ActionItem.id)
        .where(
            ActionItem.directive_id == ComplianceDirective.id,
            ActionItem.status.notin_(TERMINAL_STATUSES),
        )
        .exists()
    )


def _has_started_items():
    """Any item that is no longer sitting untouched in PENDING."""
    return (
        select(ActionItem.id)
        .where(
            ActionItem.directive_id == ComplianceDirective.id,
            ActionItem.status != ActionItemStatus.PENDING,
        )
        .exists()
    )


def _triage_condition(value: TriageStatus):
    """SQL mirror of rollup.triage_status().

    These two definitions must agree — if they drift, a directive can be filtered
    into a bucket whose badge says something else. The tests assert they match for
    every combination.
    """
    if value == TriageStatus.NO_ITEMS:
        return ~_items_exist()
    if value == TriageStatus.RESOLVED:
        return and_(_items_exist(), ~_has_open_items())
    if value == TriageStatus.PENDING:
        return and_(_items_exist(), ~_has_started_items())
    return and_(_items_exist(), _has_open_items(), _has_started_items())


def _apply_sort(stmt: Select, sort: SortKey, order: str) -> Select:
    descending = order == "desc"

    def direction(col):
        # NULLS LAST in both directions. A missing date is not "the earliest" —
        # it is absent, and absent records belong at the end of a deadline-ordered
        # queue whichever way it is sorted. (Their absence is already flagged.)
        return col.desc().nullslast() if descending else col.asc().nullslast()

    if sort == SortKey.risk:
        # Risk-first is the default because triage starts with what is most broken.
        return stmt.order_by(
            direction(_critical_flag_count()),
            direction(_all_flag_count()),
            ComplianceDirective.published_date.desc().nullslast(),
        )
    if sort == SortKey.published_date:
        return stmt.order_by(direction(ComplianceDirective.published_date))
    if sort == SortKey.effective_date:
        return stmt.order_by(direction(ComplianceDirective.effective_date))
    if sort == SortKey.due_date:
        # Sort by the earliest deadline among OPEN items — the date that binds.
        next_due = (
            select(func.min(ActionItem.due_date))
            .where(
                ActionItem.directive_id == ComplianceDirective.id,
                ActionItem.status.notin_(TERMINAL_STATUSES),
            )
            .correlate(ComplianceDirective)
            .scalar_subquery()
        )
        return stmt.order_by(direction(next_due))
    if sort == SortKey.title:
        return stmt.order_by(direction(func.lower(ComplianceDirective.title)))
    if sort == SortKey.authority:
        return stmt.join(RegulatoryAuthority).order_by(direction(RegulatoryAuthority.code))
    return stmt.order_by(direction(ComplianceDirective.status))


@router.get("", response_model=DirectiveListOut)
def list_directives(
    db: Session = Depends(get_db),
    q: str | None = Query(None, max_length=200, description="Free-text search"),
    authority: list[str] = Query(default_factory=list, description="Authority codes"),
    directive_status: list[DirectiveStatus] = Query(default_factory=list, alias="status"),
    severity: list[FlagSeverity] = Query(default_factory=list),
    issue: list[FlagIssue] = Query(default_factory=list),
    therapeutic_area: list[str] = Query(default_factory=list),
    triage: list[TriageStatus] = Query(default_factory=list),
    owner: list[str] = Query(default_factory=list),
    flagged_only: bool = False,
    has_open_items: bool = False,
    overdue_only: bool = False,
    sort: SortKey = SortKey.risk,
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> DirectiveListOut:
    stmt = select(ComplianceDirective)

    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                ComplianceDirective.title.ilike(term),
                ComplianceDirective.summary.ilike(term),
                ComplianceDirective.reference_code.ilike(term),
            )
        )

    if authority:
        stmt = stmt.where(
            ComplianceDirective.authority_id.in_(
                select(RegulatoryAuthority.id).where(
                    func.upper(RegulatoryAuthority.code).in_([a.upper() for a in authority])
                )
            )
        )

    if directive_status:
        stmt = stmt.where(ComplianceDirective.status.in_(directive_status))

    if therapeutic_area:
        stmt = stmt.where(ComplianceDirective.therapeutic_area.in_(therapeutic_area))

    # Flag-based filters are EXISTS rather than JOIN so a directive with three
    # critical flags is returned once, not three times.
    flag_conditions = []
    if flagged_only:
        flag_conditions.append(True)
    if severity:
        flag_conditions.append(DataQualityFlag.severity.in_(severity))
    if issue:
        flag_conditions.append(DataQualityFlag.issue.in_(issue))

    if flag_conditions:
        exists_stmt = select(DataQualityFlag.id).where(
            DataQualityFlag.directive_id == ComplianceDirective.id
        )
        if severity:
            exists_stmt = exists_stmt.where(DataQualityFlag.severity.in_(severity))
        if issue:
            exists_stmt = exists_stmt.where(DataQualityFlag.issue.in_(issue))
        stmt = stmt.where(exists_stmt.exists())

    if has_open_items:
        stmt = stmt.where(_has_open_items())

    if overdue_only:
        stmt = stmt.where(
            select(ActionItem.id)
            .where(
                ActionItem.directive_id == ComplianceDirective.id,
                ActionItem.status.notin_(TERMINAL_STATUSES),
                ActionItem.due_date.is_not(None),
                ActionItem.due_date < date.today(),
            )
            .exists()
        )

    if owner:
        stmt = stmt.where(
            select(ActionItem.id)
            .where(
                ActionItem.directive_id == ComplianceDirective.id,
                ActionItem.owner.in_(owner),
            )
            .exists()
        )

    if triage:
        stmt = stmt.where(or_(*[_triage_condition(t) for t in triage]))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    stmt = _apply_sort(stmt, sort, order)
    stmt = stmt.options(
        selectinload(ComplianceDirective.authority),
        selectinload(ComplianceDirective.action_items),
        selectinload(ComplianceDirective.flags),
    )
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    rows = db.scalars(stmt).unique().all()

    return DirectiveListOut(
        items=[serialise(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


def _load(db: Session, directive_id: int) -> ComplianceDirective:
    directive = db.scalar(
        select(ComplianceDirective)
        .where(ComplianceDirective.id == directive_id)
        .options(
            selectinload(ComplianceDirective.authority),
            selectinload(ComplianceDirective.action_items),
            selectinload(ComplianceDirective.flags),
        )
    )
    if directive is None:
        raise HTTPException(status_code=404, detail=f"Directive {directive_id} not found.")
    return directive


@router.get("/{directive_id}", response_model=DirectiveDetailOut)
def get_directive(directive_id: int, db: Session = Depends(get_db)) -> DirectiveDetailOut:
    return serialise(_load(db, directive_id), detail=True)


@router.get("/{directive_id}/neighbours")
def get_neighbours(directive_id: int, db: Session = Depends(get_db)) -> dict:
    """Previous/next ids in the default risk ordering.

    Powers the detail screen's record stepper so an officer can work the queue
    without bouncing back to the table between every record.
    """
    ordered = db.scalars(
        _apply_sort(select(ComplianceDirective), SortKey.risk, "desc")
    ).all()
    ids = [d.id for d in ordered]
    if directive_id not in ids:
        raise HTTPException(status_code=404, detail=f"Directive {directive_id} not found.")

    index = ids.index(directive_id)
    return {
        "previous_id": ids[index - 1] if index > 0 else None,
        "next_id": ids[index + 1] if index < len(ids) - 1 else None,
        "position": index + 1,
        "total": len(ids),
    }


@router.post(
    "/{directive_id}/action-items",
    response_model=ActionItemOut,
    status_code=http_status.HTTP_201_CREATED,
)
def create_action_item(
    directive_id: int,
    payload: ActionItemCreate,
    db: Session = Depends(get_db),
) -> ActionItem:
    """Create work against a directive.

    Officer-entered data is validated strictly and rejected on failure — the
    opposite of the ingest path, which coerces and flags. We can ask the person at
    the keyboard what they meant; we cannot ask the regulator.
    """
    directive = _load(db, directive_id)

    item = ActionItem(
        directive_id=directive.id,
        title=payload.title,
        description=payload.description,
        owner=payload.owner,
        priority=payload.priority,
        due_date=payload.due_date,
        status=ActionItemStatus.PENDING,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post(
    "/{directive_id}/flags",
    response_model=FlagOut,
    status_code=http_status.HTTP_201_CREATED,
)
def flag_directive(
    directive_id: int,
    payload: FlagCreate,
    db: Session = Depends(get_db),
) -> DataQualityFlag:
    """Raise a defect the automated pipeline could not detect.

    Stored with source=MANUAL so revalidation never deletes human judgement.
    """
    directive = _load(db, directive_id)

    if payload.action_item_id is not None:
        owned = {item.id for item in directive.action_items}
        if payload.action_item_id not in owned:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Action item {payload.action_item_id} does not belong to "
                    f"directive {directive_id}."
                ),
            )

    flag = DataQualityFlag(
        directive_id=directive.id,
        action_item_id=payload.action_item_id,
        field=payload.field,
        issue=payload.issue,
        severity=payload.severity,
        message=payload.message,
        raw_value=None,
        source=FlagSource.MANUAL,
    )
    db.add(flag)
    db.commit()
    db.refresh(flag)
    return flag


@router.post("/{directive_id}/revalidate", response_model=RevalidateResult)
def revalidate_directive(
    directive_id: int, db: Session = Depends(get_db)
) -> RevalidateResult:
    """Re-run the ingest pipeline against the stored raw payload.

    This is why raw_payload exists. Because the original record is kept verbatim,
    improving a rule in normalize.py can be replayed over data already ingested —
    without re-fetching from the source, and with the result diffed against what
    was previously detected.

    System flags are recomputed; MANUAL flags and any resolved flag are preserved.
    """
    directive = _load(db, directive_id)
    payload = directive.raw_payload or {}

    previous = list(directive.flags)
    replaceable = [
        f for f in previous if f.source == FlagSource.SYSTEM and f.resolved_at is None
    ]
    preserved = [f for f in previous if f not in replaceable]

    collector = FindingCollector()
    reference_code = clean_text(payload.get("reference_code"), "reference_code")
    check_reference_code(reference_code, {}, collector)
    clean_text(payload.get("title"), "title", collector=collector, max_length=490)
    clean_text(payload.get("summary"), "summary", collector=collector)

    published = parse_date(
        payload.get("published_date"),
        "published_date",
        collector=collector,
        required=True,
        severity_if_missing=FlagSeverity.WARNING,
    )
    effective = parse_date(
        payload.get("effective_date"),
        "effective_date",
        collector=collector,
        required=True,
        severity_if_missing=FlagSeverity.CRITICAL,
    )
    check_date_order(published, effective, collector)
    directive_status = coerce_directive_status(payload.get("status"), collector)

    # Consistency is checked against CURRENT item statuses, not the seeded ones —
    # so resolving the open work on a CLOSED directive genuinely clears its flag.
    check_status_consistency(
        directive_status, [i.status for i in directive.action_items], collector
    )

    for flag in replaceable:
        db.delete(flag)

    for finding in collector.findings:
        db.add(
            DataQualityFlag(
                directive_id=directive.id,
                action_item_id=None,
                field=finding.field,
                issue=finding.issue,
                severity=finding.severity,
                message=finding.message,
                raw_value=finding.raw_value,
                source=FlagSource.SYSTEM,
            )
        )

    db.commit()

    added = len(collector.findings)
    cleared = len(replaceable)
    net = added - cleared
    if net < 0:
        message = f"Revalidation cleared {-net} issue(s) that no longer apply."
    elif net > 0:
        message = f"Revalidation detected {net} new issue(s)."
    else:
        message = "Revalidation complete — no change in detected issues."

    return RevalidateResult(
        directive_id=directive.id,
        previous_flag_count=len(previous),
        current_flag_count=added + len(preserved),
        added=added,
        cleared=cleared,
        manual_preserved=len(preserved),
        message=message,
    )
