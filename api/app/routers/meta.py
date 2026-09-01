"""Aggregate counts that drive the filter rail."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    ActionItem,
    ActionItemStatus,
    ComplianceDirective,
    DataQualityFlag,
    FlagSeverity,
    RegulatoryAuthority,
)
from ..schemas import AuthorityRow, CountBucket, MetaCounts

router = APIRouter(prefix="/api", tags=["meta"])

TERMINAL = {ActionItemStatus.RESOLVED, ActionItemStatus.DISMISSED}


def _label(value: str) -> str:
    return value.replace("_", " ").title()


@router.get("/authorities", response_model=list[AuthorityRow])
def list_authorities(db: Session = Depends(get_db)) -> list[AuthorityRow]:
    """Authorities with the portfolio stats the Authorities screen ranks by.

    Computed with grouped subqueries rather than per-authority queries, so adding
    an authority does not add a round trip.
    """
    authorities = db.scalars(
        select(RegulatoryAuthority).order_by(RegulatoryAuthority.code)
    ).all()

    directive_stats = dict(
        db.execute(
            select(
                ComplianceDirective.authority_id,
                func.count(ComplianceDirective.id),
            ).group_by(ComplianceDirective.authority_id)
        ).all()
    )
    latest_published = dict(
        db.execute(
            select(
                ComplianceDirective.authority_id,
                func.max(ComplianceDirective.published_date),
            ).group_by(ComplianceDirective.authority_id)
        ).all()
    )
    item_stats = dict(
        db.execute(
            select(ComplianceDirective.authority_id, func.count(ActionItem.id))
            .join(ActionItem, ActionItem.directive_id == ComplianceDirective.id)
            .group_by(ComplianceDirective.authority_id)
        ).all()
    )
    open_item_stats = dict(
        db.execute(
            select(ComplianceDirective.authority_id, func.count(ActionItem.id))
            .join(ActionItem, ActionItem.directive_id == ComplianceDirective.id)
            .where(ActionItem.status.notin_(TERMINAL))
            .group_by(ComplianceDirective.authority_id)
        ).all()
    )
    flag_stats = dict(
        db.execute(
            select(ComplianceDirective.authority_id, func.count(DataQualityFlag.id))
            .join(
                DataQualityFlag,
                DataQualityFlag.directive_id == ComplianceDirective.id,
            )
            .group_by(ComplianceDirective.authority_id)
        ).all()
    )
    critical_stats = dict(
        db.execute(
            select(ComplianceDirective.authority_id, func.count(DataQualityFlag.id))
            .join(
                DataQualityFlag,
                DataQualityFlag.directive_id == ComplianceDirective.id,
            )
            .where(DataQualityFlag.severity == FlagSeverity.CRITICAL)
            .group_by(ComplianceDirective.authority_id)
        ).all()
    )

    rows: list[AuthorityRow] = []
    for authority in authorities:
        row = AuthorityRow.model_validate(authority)
        row.directive_count = directive_stats.get(authority.id, 0)
        row.action_item_count = item_stats.get(authority.id, 0)
        row.open_action_items = open_item_stats.get(authority.id, 0)
        row.flag_count = flag_stats.get(authority.id, 0)
        row.critical_flag_count = critical_stats.get(authority.id, 0)
        row.latest_published = latest_published.get(authority.id)
        rows.append(row)
    return rows


@router.get("/meta/counts", response_model=MetaCounts)
def counts(db: Session = Depends(get_db)) -> MetaCounts:
    total_directives = db.scalar(select(func.count(ComplianceDirective.id))) or 0
    total_items = db.scalar(select(func.count(ActionItem.id))) or 0
    open_items = (
        db.scalar(
            select(func.count(ActionItem.id)).where(ActionItem.status.notin_(TERMINAL))
        )
        or 0
    )
    flagged_directives = (
        db.scalar(select(func.count(distinct(DataQualityFlag.directive_id)))) or 0
    )

    by_status = [
        CountBucket(key=status.value, label=_label(status.value), count=count)
        for status, count in db.execute(
            select(ComplianceDirective.status, func.count(ComplianceDirective.id))
            .group_by(ComplianceDirective.status)
            .order_by(func.count(ComplianceDirective.id).desc())
        )
    ]

    by_severity = [
        CountBucket(key=severity.value, label=_label(severity.value), count=count)
        for severity, count in db.execute(
            select(DataQualityFlag.severity, func.count(DataQualityFlag.id))
            .group_by(DataQualityFlag.severity)
            .order_by(func.count(DataQualityFlag.id).desc())
        )
    ]

    by_authority = [
        CountBucket(key=code, label=code, count=count)
        for code, count in db.execute(
            select(RegulatoryAuthority.code, func.count(ComplianceDirective.id))
            .join(ComplianceDirective, ComplianceDirective.authority_id == RegulatoryAuthority.id)
            .group_by(RegulatoryAuthority.code)
            .order_by(func.count(ComplianceDirective.id).desc())
        )
    ]

    by_issue = [
        CountBucket(key=issue.value, label=_label(issue.value), count=count)
        for issue, count in db.execute(
            select(DataQualityFlag.issue, func.count(DataQualityFlag.id))
            .group_by(DataQualityFlag.issue)
            .order_by(func.count(DataQualityFlag.id).desc())
        )
    ]

    return MetaCounts(
        total_directives=total_directives,
        total_action_items=total_items,
        open_action_items=open_items,
        flagged_directives=flagged_directives,
        by_status=by_status,
        by_severity=by_severity,
        by_authority=by_authority,
        by_issue=by_issue,
    )
