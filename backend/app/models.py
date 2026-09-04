"""
Relational model: Authority 1..n Directive 1..n ActionItem.

Deliberate choice: `status` columns are plain TEXT, not Postgres enums.
Real regulatory feeds arrive with inconsistent status codes ("RESOLVD",
"pending ", "In-Progress"). A DB enum would make the seed fail before the
application ever sees the bad value. Instead the DB accepts what the source
sent, and the API's triage layer (app/triage.py) normalises + flags it on read
and only ever writes canonical values.
"""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Authority(Base):
    __tablename__ = "authorities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    acronym: Mapped[str] = mapped_column(String(16), nullable=False, unique=True)
    jurisdiction: Mapped[str] = mapped_column(String(80), nullable=False)
    region: Mapped[str] = mapped_column(String(40), nullable=False)

    directives: Mapped[list["Directive"]] = relationship(back_populates="authority")


class Directive(Base):
    __tablename__ = "directives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    authority_id: Mapped[int] = mapped_column(ForeignKey("authorities.id"), nullable=False, index=True)
    reference_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    published_at: Mapped[date | None] = mapped_column(Date)
    effective_date: Mapped[date | None] = mapped_column(Date)
    comment_deadline: Mapped[date | None] = mapped_column(Date)

    authority: Mapped[Authority] = relationship(back_populates="directives")
    action_items: Mapped[list["ActionItem"]] = relationship(back_populates="directive")


class ActionItem(Base):
    __tablename__ = "action_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    directive_id: Mapped[int] = mapped_column(ForeignKey("directives.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    owner: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    directive: Mapped[Directive] = relationship(back_populates="action_items")
