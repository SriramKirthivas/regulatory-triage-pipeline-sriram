"""Action item endpoints — where triage decisions actually happen."""

from __future__ import annotations

import math
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import (
    ActionItem,
    ActionItemStatus,
    ComplianceDirective,
    DataQualityFlag,
    Priority,
    RegulatoryAuthority,
    StatusChange,
)
from ..rollup import TERMINAL_STATUSES
from ..schemas import (
    ActionItemDetailOut,
    ActionItemListOut,
    ActionItemRow,
    ActionItemUpdate,
)
from ..triage import is_allowed, rejection_reason

router = APIRouter(prefix="/api/action-items", tags=["action-items"])


def _row(item: ActionItem, flag_count: int = 0) -> ActionItemRow:
    row = ActionItemRow.model_validate(item)
    row.overdue = bool(
        item.due_date
        and item.status not in TERMINAL_STATUSES
        and item.due_date < date.today()
    )
    row.flag_count = flag_count
    return row


@router.get("", response_model=ActionItemListOut)
def list_action_items(
    db: Session = Depends(get_db),
    q: str | None = Query(None, max_length=200),
    item_status: list[ActionItemStatus] = Query(default_factory=list, alias="status"),
    priority: list[Priority] = Query(default_factory=list),
    owner: list[str] = Query(default_factory=list),
    authority: list[str] = Query(default_factory=list),
    open_only: bool = False,
    overdue_only: bool = False,
    unassigned_only: bool = False,
    sort: str = Query("due_date", pattern="^(due_date|priority|status|updated_at)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> ActionItemListOut:
    """The Action Items screen: work across every directive, not one at a time."""
    stmt = select(ActionItem).join(ComplianceDirective)

    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                ActionItem.title.ilike(term),
                ActionItem.description.ilike(term),
                ComplianceDirective.reference_code.ilike(term),
            )
        )
    if item_status:
        stmt = stmt.where(ActionItem.status.in_(item_status))
    if priority:
        stmt = stmt.where(ActionItem.priority.in_(priority))
    if owner:
        stmt = stmt.where(ActionItem.owner.in_(owner))
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
    if open_only:
        stmt = stmt.where(ActionItem.status.notin_(TERMINAL_STATUSES))
    if unassigned_only:
        stmt = stmt.where(ActionItem.owner.is_(None))
    if overdue_only:
        stmt = stmt.where(
            ActionItem.status.notin_(TERMINAL_STATUSES),
            ActionItem.due_date.is_not(None),
            ActionItem.due_date < date.today(),
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    column = {
        "due_date": ActionItem.due_date,
        "priority": ActionItem.priority,
        "status": ActionItem.status,
        "updated_at": ActionItem.updated_at,
    }[sort]
    stmt = stmt.order_by(
        column.desc().nullslast() if order == "desc" else column.asc().nullslast(),
        ActionItem.id.asc(),
    )

    stmt = stmt.options(
        selectinload(ActionItem.directive).selectinload(ComplianceDirective.authority)
    ).offset((page - 1) * page_size).limit(page_size)

    items = db.scalars(stmt).unique().all()

    flag_counts = dict(
        db.execute(
            select(DataQualityFlag.action_item_id, func.count(DataQualityFlag.id))
            .where(DataQualityFlag.action_item_id.in_([i.id for i in items] or [0]))
            .group_by(DataQualityFlag.action_item_id)
        ).all()
    )

    return ActionItemListOut(
        items=[_row(i, flag_counts.get(i.id, 0)) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.get("/owners", response_model=list[str])
def list_owners(db: Session = Depends(get_db)) -> list[str]:
    """Distinct assignees, for the Assign Owner control."""
    rows = db.scalars(
        select(ActionItem.owner)
        .where(ActionItem.owner.is_not(None))
        .distinct()
        .order_by(ActionItem.owner)
    ).all()
    return [r for r in rows if r]


@router.get("/{item_id}", response_model=ActionItemDetailOut)
def get_action_item(item_id: int, db: Session = Depends(get_db)) -> ActionItem:
    item = db.scalar(
        select(ActionItem)
        .where(ActionItem.id == item_id)
        .options(selectinload(ActionItem.status_changes))
    )
    if item is None:
        raise HTTPException(status_code=404, detail=f"Action item {item_id} not found.")
    return item


@router.patch("/{item_id}", response_model=ActionItemDetailOut)
def update_action_item(
    item_id: int,
    payload: ActionItemUpdate,
    db: Session = Depends(get_db),
) -> ActionItem:
    """Partial update: change status, assign an owner, reprioritise, or reschedule.

    Only `status` runs through the transition guard. An illegal transition returns
    409 rather than 400: the request is well-formed, it conflicts with the item's
    current state. That distinction matters to the client, which retries
    differently in each case.
    """
    item = db.scalar(
        select(ActionItem)
        .where(ActionItem.id == item_id)
        .options(selectinload(ActionItem.status_changes))
    )
    if item is None:
        raise HTTPException(status_code=404, detail=f"Action item {item_id} not found.")

    fields = payload.model_dump(exclude_unset=True)
    if not fields.keys() - {"changed_by", "note"}:
        raise HTTPException(
            status_code=422,
            detail="No changes supplied. Provide at least one of: status, owner, "
            "priority, due_date.",
        )

    if "status" in fields and payload.status is not None:
        current, target = item.status, payload.status
        if not is_allowed(current, target):
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "illegal_transition",
                    "from": current.value,
                    "to": target.value,
                    "message": rejection_reason(current, target),
                },
            )
        item.status = target
        db.add(
            StatusChange(
                action_item_id=item.id,
                from_status=current,
                to_status=target,
                changed_by=payload.changed_by,
                note=payload.note,
            )
        )

    if "owner" in fields:
        item.owner = payload.owner
    if "priority" in fields and payload.priority is not None:
        item.priority = payload.priority
    if "due_date" in fields:
        item.due_date = payload.due_date

    db.commit()
    db.refresh(item)
    return item
