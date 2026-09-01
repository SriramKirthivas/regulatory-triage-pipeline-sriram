"""Action item write endpoints — where triage decisions actually happen."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import ActionItem, StatusChange
from ..schemas import ActionItemDetailOut, ActionItemStatusUpdate
from ..triage import is_allowed, rejection_reason

router = APIRouter(prefix="/api/action-items", tags=["action-items"])


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
def update_status(
    item_id: int,
    payload: ActionItemStatusUpdate,
    db: Session = Depends(get_db),
) -> ActionItem:
    """Move an action item to a new status, refusing moves the workflow forbids.

    Returns 409 rather than 400 for an illegal transition: the request is
    well-formed, it conflicts with the item's current state. That distinction
    matters to the client, which retries differently in each case.
    """
    item = db.scalar(
        select(ActionItem)
        .where(ActionItem.id == item_id)
        .options(selectinload(ActionItem.status_changes))
    )
    if item is None:
        raise HTTPException(status_code=404, detail=f"Action item {item_id} not found.")

    current = item.status
    target = payload.status

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
    db.commit()
    db.refresh(item)
    return item
