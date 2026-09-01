"""Data-quality endpoints — the corrupt-record register."""

from __future__ import annotations

import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import (
    ActionItem,
    ComplianceDirective,
    DataQualityFlag,
    FlagIssue,
    FlagSeverity,
    FlagSource,
    RegulatoryAuthority,
)
from ..schemas import FlagListOut, FlagOut, FlagResolve, FlagRow

router = APIRouter(prefix="/api/flags", tags=["data-quality"])

_SEVERITY_RANK = {FlagSeverity.CRITICAL: 0, FlagSeverity.WARNING: 1, FlagSeverity.INFO: 2}


@router.get("", response_model=FlagListOut)
def list_flags(
    db: Session = Depends(get_db),
    q: str | None = Query(None, max_length=200),
    severity: list[FlagSeverity] = Query(default_factory=list),
    issue: list[FlagIssue] = Query(default_factory=list),
    source: list[FlagSource] = Query(default_factory=list),
    authority: list[str] = Query(default_factory=list),
    state: str = Query("open", pattern="^(open|resolved|all)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> FlagListOut:
    stmt = select(DataQualityFlag).join(ComplianceDirective)

    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                DataQualityFlag.message.ilike(term),
                DataQualityFlag.field.ilike(term),
                DataQualityFlag.raw_value.ilike(term),
                ComplianceDirective.reference_code.ilike(term),
                ComplianceDirective.title.ilike(term),
            )
        )
    if severity:
        stmt = stmt.where(DataQualityFlag.severity.in_(severity))
    if issue:
        stmt = stmt.where(DataQualityFlag.issue.in_(issue))
    if source:
        stmt = stmt.where(DataQualityFlag.source.in_(source))
    if authority:
        stmt = stmt.where(
            ComplianceDirective.authority_id.in_(
                select(RegulatoryAuthority.id).where(
                    func.upper(RegulatoryAuthority.code).in_(
                        [a.upper() for a in authority]
                    )
                )
            )
        )
    if state == "open":
        stmt = stmt.where(DataQualityFlag.resolved_at.is_(None))
    elif state == "resolved":
        stmt = stmt.where(DataQualityFlag.resolved_at.is_not(None))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    # Postgres orders enums by declaration order, which here is INFO < WARNING <
    # CRITICAL — the opposite of what triage wants. Rank explicitly.
    severity_rank = case(
        (DataQualityFlag.severity == FlagSeverity.CRITICAL, 0),
        (DataQualityFlag.severity == FlagSeverity.WARNING, 1),
        else_=2,
    )

    stmt = (
        stmt.order_by(severity_rank.asc(), DataQualityFlag.detected_at.desc())
        .options(
            selectinload(DataQualityFlag.directive).selectinload(
                ComplianceDirective.authority
            )
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    flags = db.scalars(stmt).unique().all()

    item_titles = dict(
        db.execute(
            select(ActionItem.id, ActionItem.title).where(
                ActionItem.id.in_([f.action_item_id for f in flags if f.action_item_id] or [0])
            )
        ).all()
    )

    rows: list[FlagRow] = []
    for flag in flags:
        row = FlagRow.model_validate(flag)
        row.action_item_title = item_titles.get(flag.action_item_id)
        rows.append(row)

    return FlagListOut(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.post("/{flag_id}/resolve", response_model=FlagOut)
def resolve_flag(
    flag_id: int, payload: FlagResolve, db: Session = Depends(get_db)
) -> DataQualityFlag:
    """Acknowledge a defect.

    The flag is closed, never deleted — a defect that was reviewed is part of the
    record. Reopening is a separate, equally auditable act.
    """
    flag = db.get(DataQualityFlag, flag_id)
    if flag is None:
        raise HTTPException(status_code=404, detail=f"Flag {flag_id} not found.")
    if flag.resolved_at is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "already_resolved",
                "message": f"This flag was already acknowledged by {flag.resolved_by}.",
            },
        )

    flag.resolved_at = datetime.now(timezone.utc)
    flag.resolved_by = payload.resolved_by
    flag.resolution_note = payload.resolution_note
    db.commit()
    db.refresh(flag)
    return flag


@router.post("/{flag_id}/reopen", response_model=FlagOut)
def reopen_flag(flag_id: int, db: Session = Depends(get_db)) -> DataQualityFlag:
    flag = db.get(DataQualityFlag, flag_id)
    if flag is None:
        raise HTTPException(status_code=404, detail=f"Flag {flag_id} not found.")

    flag.resolved_at = None
    flag.resolved_by = None
    flag.resolution_note = None
    db.commit()
    db.refresh(flag)
    return flag
