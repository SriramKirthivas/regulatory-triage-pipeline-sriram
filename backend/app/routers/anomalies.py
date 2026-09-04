from collections import Counter
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import ActionItem, Directive
from ..schemas import AnomalySummary
from ..serializers import action_item_out, directive_lite, duplicate_index

router = APIRouter(prefix="/api/anomalies", tags=["anomalies"])


@router.get("", response_model=AnomalySummary)
def anomaly_summary(db: Session = Depends(get_db)):
    today = date.today()
    directives = list(db.scalars(select(Directive).options(selectinload(Directive.authority), selectinload(Directive.action_items))).all())
    dups = duplicate_index(directives)
    d_out = [directive_lite(d, dups) for d in directives]
    items = list(
        db.scalars(
            select(ActionItem).options(
                selectinload(ActionItem.directive).selectinload(Directive.authority),
                selectinload(ActionItem.directive).selectinload(Directive.action_items),
            )
        ).all()
    )
    i_out = [action_item_out(i, today, dups) for i in items]

    codes: Counter[str] = Counter()
    for o in d_out:
        codes.update(f.code for f in o.flags)
    for o in i_out:
        codes.update(f.code for f in o.flags)
    statuses = Counter(o.status.value for o in i_out)

    return AnomalySummary(
        total_items=len(i_out),
        total_directives=len(d_out),
        items_with_errors=sum(1 for o in i_out if o.has_errors or o.directive.has_errors),
        items_with_warnings=sum(1 for o in i_out if (o.flags or o.directive.flags) and not (o.has_errors or o.directive.has_errors)),
        directives_with_errors=sum(1 for o in d_out if o.has_errors),
        by_code=dict(codes.most_common()),
        by_status=dict(statuses),
    )
