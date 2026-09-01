"""Pydantic API contracts.

These are intentionally separate from the SQLAlchemy models: the wire format is a
product decision, the table layout is a storage decision, and letting one dictate
the other is how APIs end up leaking schema churn to the frontend.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import (
    ActionItemStatus,
    DirectiveStatus,
    FlagIssue,
    FlagSeverity,
    Priority,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# Read models
# --------------------------------------------------------------------------- #


class AuthorityOut(ORMModel):
    id: int
    code: str
    name: str
    jurisdiction: str
    region: str


class FlagOut(ORMModel):
    id: int
    action_item_id: int | None
    field: str
    issue: FlagIssue
    severity: FlagSeverity
    message: str
    raw_value: str | None


class StatusChangeOut(ORMModel):
    id: int
    from_status: ActionItemStatus
    to_status: ActionItemStatus
    changed_by: str
    note: str | None
    changed_at: datetime


class ActionItemOut(ORMModel):
    id: int
    directive_id: int
    title: str
    description: str | None
    owner: str | None
    status: ActionItemStatus
    priority: Priority
    due_date: date | None
    updated_at: datetime


class ActionItemDetailOut(ActionItemOut):
    status_changes: list[StatusChangeOut] = []


class FlagSummary(BaseModel):
    """Pre-aggregated per-directive counts so the table does not have to compute them."""

    total: int = 0
    critical: int = 0
    warning: int = 0
    info: int = 0
    max_severity: FlagSeverity | None = None


class DirectiveOut(ORMModel):
    id: int
    reference_code: str | None
    title: str
    summary: str | None
    status: DirectiveStatus
    document_type: str | None
    therapeutic_area: str | None
    source_url: str | None
    published_date: date | None
    effective_date: date | None
    authority: AuthorityOut
    action_items: list[ActionItemOut] = []
    flags: list[FlagOut] = []

    # Computed in the router; not columns.
    flag_summary: FlagSummary = FlagSummary()
    open_item_count: int = 0


class DirectiveDetailOut(DirectiveOut):
    """Detail view additionally exposes the untouched source record."""

    raw_payload: dict = {}
    ingested_at: datetime


class DirectiveListOut(BaseModel):
    items: list[DirectiveOut]
    total: int
    page: int
    page_size: int
    pages: int


# --------------------------------------------------------------------------- #
# Write models
# --------------------------------------------------------------------------- #


class ActionItemStatusUpdate(BaseModel):
    """Payload for a triage decision.

    `note` is length-capped rather than unbounded text: this is an audit record,
    and audit records that accept arbitrary payloads become a storage problem.
    """

    status: ActionItemStatus
    note: str | None = Field(default=None, max_length=400)
    changed_by: str = Field(default="compliance.officer", max_length=120)

    @field_validator("note")
    @classmethod
    def blank_note_is_none(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        return cleaned or None


# --------------------------------------------------------------------------- #
# Aggregates
# --------------------------------------------------------------------------- #


class CountBucket(BaseModel):
    key: str
    label: str
    count: int


class MetaCounts(BaseModel):
    """Counts that drive the filter rail. Deliberately terse — these render as
    inline chip badges, not as oversized dashboard tiles."""

    total_directives: int
    total_action_items: int
    open_action_items: int
    flagged_directives: int
    by_status: list[CountBucket]
    by_severity: list[CountBucket]
    by_authority: list[CountBucket]
    by_issue: list[CountBucket]


class SortKey(str, Enum):
    risk = "risk"
    published_date = "published_date"
    effective_date = "effective_date"
    title = "title"
    authority = "authority"
    status = "status"
