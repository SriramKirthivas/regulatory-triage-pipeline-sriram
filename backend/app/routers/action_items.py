from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import ActionItem, Directive
from ..schemas import ActionItemOut, ActionItemPatch, Page, StatusUpdate
from ..serializers import action_item_out, duplicate_index
from ..triage import ItemStatus, clean_item_status

router = APIRouter(prefix="/api/action-items", tags=["action-items"])

_SORTABLE = {
    "priority": ActionItem.priority,
    "due_date": ActionItem.due_date,
    "updated_at": ActionItem.updated_at,
    "id": ActionItem.id,
}


def _load(db: Session, item_id: int) -> ActionItem:
    item = db.scalar(
        select(ActionItem)
        .options(selectinload(ActionItem.directive).selectinload(Directive.authority),
                 selectinload(ActionItem.directive).selectinload(Directive.action_items))
        .where(ActionItem.id == item_id)
    )
    if item is None:
        raise HTTPException(404, f"Action item {item_id} not found")
    return item


@router.get("", response_model=Page)
def list_action_items(
    db: Session = Depends(get_db),
    q: str | None = Query(None, max_length=120),
    status: list[ItemStatus] | None = Query(None),
    authority_id: int | None = None,
    severity: str | None = None,
    priority_min: int = Query(1, ge=1, le=5),
    flagged: bool | None = Query(None, description="true = only rows with flags, false = only clean rows"),
    errors_only: bool = False,
    sort: str = Query("priority", pattern="^(priority|due_date|updated_at|id)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    today = date.today()
    stmt = (
        select(ActionItem)
        .join(ActionItem.directive)
        .options(selectinload(ActionItem.directive).selectinload(Directive.authority),
                 selectinload(ActionItem.directive).selectinload(Directive.action_items))
    )
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(ActionItem.title.ilike(like), Directive.title.ilike(like), Directive.reference_code.ilike(like), ActionItem.owner.ilike(like)))
    if authority_id is not None:
        stmt = stmt.where(Directive.authority_id == authority_id)
    if priority_min > 1:
        stmt = stmt.where(ActionItem.priority >= priority_min)

    col = _SORTABLE[sort]
    stmt = stmt.order_by(col.desc().nulls_last() if order == "desc" else col.asc().nulls_last(), ActionItem.id)

    rows = list(db.scalars(stmt).all())
    dups = duplicate_index(list(db.scalars(select(Directive)).all()))
    out = [action_item_out(r, today, dups) for r in rows]

    # Status / severity / flag filters run on the *cleaned* values, because the
    # raw DB values are not trustworthy (that is the whole point).
    if status:
        wanted = set(status)
        out = [o for o in out if o.status in wanted]
    if severity:
        out = [o for o in out if o.directive.severity == severity]
    if flagged is True:
        out = [o for o in out if o.flags or o.directive.flags]
    elif flagged is False:
        out = [o for o in out if not o.flags and not o.directive.flags]
    if errors_only:
        out = [o for o in out if o.has_errors or o.directive.has_errors]

    total = len(out)
    return Page(items=out[offset : offset + limit], total=total, limit=limit, offset=offset)


@router.get("/{item_id}", response_model=ActionItemOut)
def get_action_item(item_id: int, db: Session = Depends(get_db)):
    return action_item_out(_load(db, item_id), date.today())


_ALLOWED_TRANSITIONS: dict[ItemStatus, set[ItemStatus]] = {
    ItemStatus.PENDING: {ItemStatus.IN_PROGRESS, ItemStatus.BLOCKED, ItemStatus.RESOLVED},
    ItemStatus.IN_PROGRESS: {ItemStatus.PENDING, ItemStatus.BLOCKED, ItemStatus.RESOLVED},
    ItemStatus.BLOCKED: {ItemStatus.PENDING, ItemStatus.IN_PROGRESS},
    ItemStatus.RESOLVED: {ItemStatus.PENDING, ItemStatus.IN_PROGRESS},
    # quarantined rows can be moved anywhere: a human is explicitly repairing them
    ItemStatus.UNKNOWN: {ItemStatus.PENDING, ItemStatus.IN_PROGRESS, ItemStatus.BLOCKED, ItemStatus.RESOLVED},
}


@router.put("/{item_id}/status", response_model=ActionItemOut)
def set_status(item_id: int, body: StatusUpdate, db: Session = Depends(get_db)):
    item = _load(db, item_id)
    current = clean_item_status(item.status).value
    if body.status == current:
        return action_item_out(item, date.today())
    if body.status not in _ALLOWED_TRANSITIONS[current]:
        raise HTTPException(
            422,
            detail={"error": "invalid_transition", "from": current, "to": body.status,
                    "allowed": sorted(_ALLOWED_TRANSITIONS[current])},
        )
    item.status = body.status.value  # always write the canonical code
    db.commit()
    db.refresh(item)
    return action_item_out(_load(db, item_id), date.today())


@router.patch("/{item_id}", response_model=ActionItemOut)
def patch_action_item(item_id: int, body: ActionItemPatch, db: Session = Depends(get_db)):
    item = _load(db, item_id)
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(422, "No fields to update")
    if "status" in data and data["status"] is not None:
        data["status"] = data["status"].value
    for k, v in data.items():
        setattr(item, k, v)
    db.commit()
    return action_item_out(_load(db, item_id), date.today())


@router.get("/meta/counts")
def status_counts(db: Session = Depends(get_db)):
    rows = db.execute(select(ActionItem.status, func.count()).group_by(ActionItem.status)).all()
    cleaned: dict[str, int] = {}
    for raw, n in rows:
        cleaned[clean_item_status(raw).value.value] = cleaned.get(clean_item_status(raw).value.value, 0) + n
    return cleaned
