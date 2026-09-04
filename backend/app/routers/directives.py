from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Authority, Directive
from ..schemas import AuthorityOut, DirectiveLite, DirectiveOut
from ..serializers import directive_lite, directive_out, duplicate_index

router = APIRouter(prefix="/api", tags=["directives"])


@router.get("/authorities", response_model=list[AuthorityOut])
def list_authorities(db: Session = Depends(get_db)):
    return list(db.scalars(select(Authority).order_by(Authority.acronym)).all())


@router.get("/directives", response_model=list[DirectiveLite])
def list_directives(db: Session = Depends(get_db), authority_id: int | None = None, flagged: bool | None = Query(None)):
    stmt = select(Directive).options(selectinload(Directive.authority), selectinload(Directive.action_items)).order_by(Directive.id)
    if authority_id is not None:
        stmt = stmt.where(Directive.authority_id == authority_id)
    rows = list(db.scalars(stmt).all())
    dups = duplicate_index(rows)
    out = [directive_lite(d, dups) for d in rows]
    if flagged is True:
        out = [o for o in out if o.flags]
    elif flagged is False:
        out = [o for o in out if not o.flags]
    return out


@router.get("/directives/{directive_id}", response_model=DirectiveOut)
def get_directive(directive_id: int, db: Session = Depends(get_db)):
    d = db.scalar(
        select(Directive)
        .options(selectinload(Directive.authority), selectinload(Directive.action_items))
        .where(Directive.id == directive_id)
    )
    if d is None:
        raise HTTPException(404, f"Directive {directive_id} not found")
    dups = duplicate_index(list(db.scalars(select(Directive)).all()))
    return directive_out(d, date.today(), dups)
