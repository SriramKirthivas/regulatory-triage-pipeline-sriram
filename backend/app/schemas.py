from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .triage import WRITABLE_ITEM_STATUSES, DirectiveStatus, ItemStatus, Severity


class FlagOut(BaseModel):
    code: str
    field: str
    message: str
    level: Literal["warn", "error"]
    raw: str | None = None


class AuthorityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    acronym: str
    jurisdiction: str
    region: str


class DirectiveLite(BaseModel):
    id: int
    reference_code: str
    title: str | None
    category: str
    severity: Severity
    status: DirectiveStatus
    published_at: date | None
    effective_date: date | None
    comment_deadline: date | None
    authority: AuthorityOut
    flags: list[FlagOut]
    has_errors: bool
    duplicate_of: int | None = None


class ActionItemOut(BaseModel):
    id: int
    directive_id: int
    title: str | None
    owner: str | None
    status: ItemStatus
    status_raw: str
    priority: int
    due_date: date | None
    created_at: datetime
    updated_at: datetime
    flags: list[FlagOut]
    has_errors: bool
    directive: DirectiveLite


class DirectiveOut(DirectiveLite):
    summary: str | None
    action_items: list["ActionItemLite"]


class ActionItemLite(BaseModel):
    id: int
    title: str | None
    owner: str | None
    status: ItemStatus
    priority: int
    due_date: date | None
    flags: list[FlagOut]
    has_errors: bool


class Page(BaseModel):
    items: list[ActionItemOut]
    total: int
    limit: int
    offset: int


class StatusUpdate(BaseModel):
    """Strict write contract. Extra keys are rejected, values must be canonical."""

    model_config = ConfigDict(extra="forbid")
    status: ItemStatus = Field(description="One of: " + ", ".join(s.value for s in WRITABLE_ITEM_STATUSES))

    @field_validator("status")
    @classmethod
    def not_unknown(cls, v: ItemStatus) -> ItemStatus:
        if v is ItemStatus.UNKNOWN:
            raise ValueError("'unknown' is a quarantine bucket and cannot be set by clients")
        return v


class ActionItemPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: ItemStatus | None = None
    owner: str | None = Field(default=None, max_length=80)
    priority: int | None = Field(default=None, ge=1, le=5)
    due_date: date | None = None

    @field_validator("status")
    @classmethod
    def not_unknown(cls, v: ItemStatus | None) -> ItemStatus | None:
        if v is ItemStatus.UNKNOWN:
            raise ValueError("'unknown' cannot be set by clients")
        return v

    @field_validator("owner")
    @classmethod
    def owner_clean(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("owner cannot be blank")
        if "<" in v or ">" in v:
            raise ValueError("owner cannot contain markup")
        return v


class AnomalySummary(BaseModel):
    total_items: int
    total_directives: int
    items_with_errors: int
    items_with_warnings: int
    directives_with_errors: int
    by_code: dict[str, int]
    by_status: dict[str, int]
