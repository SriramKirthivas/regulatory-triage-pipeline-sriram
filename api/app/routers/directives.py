"""Directive read endpoints: the queries the triage table runs."""

from __future__ import annotations

import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import (
    ActionItem,
    ActionItemStatus,
    ComplianceDirective,
    DataQualityFlag,
    DirectiveStatus,
    FlagIssue,
    FlagSeverity,
    RegulatoryAuthority,
)
from ..schemas import (
    DirectiveDetailOut,
    DirectiveListOut,
    DirectiveOut,
    FlagSummary,
    SortKey,
)

router = APIRouter(prefix="/api/directives", tags=["directives"])

TERMINAL_STATUSES = {ActionItemStatus.RESOLVED, ActionItemStatus.DISMISSED}

_SEVERITY_RANK = {FlagSeverity.INFO: 1, FlagSeverity.WARNING: 2, FlagSeverity.CRITICAL: 3}


def build_summary(directive: ComplianceDirective) -> tuple[FlagSummary, int]:
    """Aggregate a directive's flags once, server-side.

    Doing this in the API rather than the browser keeps the table render cheap and
    means the sort order and the badge always agree on what 'critical' means.
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

        if worst is None or _SEVERITY_RANK[flag.severity] > _SEVERITY_RANK[worst]:
            worst = flag.severity

    summary.max_severity = worst
    open_items = sum(1 for i in directive.action_items if i.status not in TERMINAL_STATUSES)
    return summary, open_items


def serialise(directive: ComplianceDirective, detail: bool = False):
    model = DirectiveDetailOut if detail else DirectiveOut
    payload = model.model_validate(directive)
    payload.flag_summary, payload.open_item_count = build_summary(directive)
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


def _apply_sort(stmt: Select, sort: SortKey, order: str) -> Select:
    descending = order == "desc"

    def direction(col):
        return col.desc().nullslast() if descending else col.asc().nullsfirst()

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
    flagged_only: bool = False,
    has_open_items: bool = False,
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
        stmt = stmt.where(
            select(ActionItem.id)
            .where(
                ActionItem.directive_id == ComplianceDirective.id,
                ActionItem.status.notin_(TERMINAL_STATUSES),
            )
            .exists()
        )

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


@router.get("/{directive_id}", response_model=DirectiveDetailOut)
def get_directive(directive_id: int, db: Session = Depends(get_db)) -> DirectiveDetailOut:
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
    return serialise(directive, detail=True)
