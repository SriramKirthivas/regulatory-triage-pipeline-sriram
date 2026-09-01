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
    FlagSource,
    Priority,
    TriageStatus,
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
    directive_id: int
    action_item_id: int | None
    field: str
    issue: FlagIssue
    severity: FlagSeverity
    message: str
    raw_value: str | None
    source: FlagSource
    detected_at: datetime
    resolved_at: datetime | None
    resolved_by: str | None
    resolution_note: str | None


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
    open: int = 0
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

    # Derived in the router; not columns. See app/rollup.py for the definitions.
    flag_summary: FlagSummary = FlagSummary()
    open_item_count: int = 0
    triage_status: TriageStatus = TriageStatus.NO_ITEMS
    primary_owner: str | None = None
    owner_count: int = 0
    next_due_date: date | None = None
    overdue: bool = False


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


class ActionItemUpdate(BaseModel):
    """Partial update for a triage decision.

    Every field is optional so one endpoint serves "change status", "assign owner"
    and "reprioritise" without three near-identical routes. Omitted fields are left
    alone; only `status` runs through the transition guard.

    `note` is length-capped rather than unbounded text: this is an audit record,
    and audit records that accept arbitrary payloads become a storage problem.
    """

    model_config = ConfigDict(extra="forbid")

    status: ActionItemStatus | None = None
    owner: str | None = Field(default=None, max_length=120)
    priority: Priority | None = None
    due_date: date | None = None
    note: str | None = Field(default=None, max_length=400)
    changed_by: str = Field(default="compliance.officer", max_length=120)

    @field_validator("note", "owner")
    @classmethod
    def blank_is_none(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        return cleaned or None


class ActionItemCreate(BaseModel):
    """Create work against a directive.

    Note the asymmetry with ingestion: data arriving from a *feed* is coerced and
    flagged, but data a human types here is validated strictly and rejected. We
    cannot go back and ask a regulator what they meant; we can ask the officer.
    """

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=3, max_length=390)
    description: str | None = Field(default=None, max_length=4000)
    owner: str | None = Field(default=None, max_length=120)
    priority: Priority = Priority.MEDIUM
    due_date: date | None = None

    @field_validator("title")
    @classmethod
    def title_must_have_content(cls, v: str) -> str:
        cleaned = " ".join(v.split())
        if len(cleaned) < 3:
            raise ValueError("Title must contain at least 3 non-whitespace characters.")
        return cleaned


class FlagCreate(BaseModel):
    """An officer raising a defect the pipeline could not detect."""

    model_config = ConfigDict(extra="forbid")

    field: str = Field(default="record", max_length=80)
    issue: FlagIssue
    severity: FlagSeverity = FlagSeverity.WARNING
    message: str = Field(min_length=3, max_length=400)
    action_item_id: int | None = None
    raised_by: str = Field(default="compliance.officer", max_length=120)


class FlagResolve(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resolution_note: str | None = Field(default=None, max_length=400)
    resolved_by: str = Field(default="compliance.officer", max_length=120)


class RevalidateResult(BaseModel):
    """Outcome of re-running the ingest pipeline over a stored raw payload."""

    directive_id: int
    previous_flag_count: int
    current_flag_count: int
    added: int
    cleared: int
    manual_preserved: int
    message: str


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
    due_date = "due_date"


# --------------------------------------------------------------------------- #
# Cross-directive list views (Action Items and Data Quality screens)
# --------------------------------------------------------------------------- #


class DirectiveRef(ORMModel):
    """Just enough directive context to render a row without a second request."""

    id: int
    reference_code: str | None
    title: str
    authority_code: str


class ActionItemRow(ActionItemOut):
    directive: DirectiveRef
    overdue: bool = False
    flag_count: int = 0


class ActionItemListOut(BaseModel):
    items: list[ActionItemRow]
    total: int
    page: int
    page_size: int
    pages: int


class FlagRow(FlagOut):
    directive: DirectiveRef
    action_item_title: str | None = None


class FlagListOut(BaseModel):
    items: list[FlagRow]
    total: int
    page: int
    page_size: int
    pages: int


class AuthorityRow(AuthorityOut):
    """Authority with the portfolio stats the Authorities screen ranks by."""

    directive_count: int = 0
    action_item_count: int = 0
    open_action_items: int = 0
    flag_count: int = 0
    critical_flag_count: int = 0
    latest_published: date | None = None


# --------------------------------------------------------------------------- #
# Operational health
# --------------------------------------------------------------------------- #


class TableStat(BaseModel):
    table: str
    rows: int


class HealthOut(BaseModel):
    status: str
    database: str
    latency_ms: float | None = None
    version: str
    checked_at: datetime
    tables: list[TableStat] = []
    ingest: dict[str, int] = {}
