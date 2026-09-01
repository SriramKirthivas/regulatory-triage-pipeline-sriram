"""SQLAlchemy models for the regulatory triage pipeline.

Design notes (the short version — the long version lives in the README):

* Three domain entities model the real hierarchy: an Authority issues Directives,
  and each Directive spawns the Action Items a compliance team actually works.
* A fourth entity, DataQualityFlag, makes "this record is dirty" a first-class,
  queryable fact rather than a log line. Ingestion never drops a bad row and never
  silently repairs one — it stores what it could parse and files a flag describing
  what it could not.
* A fifth entity, StatusChange, gives every triage decision an audit trail, which is
  what makes this a decision layer instead of a CRUD table.

Nullability is deliberate: published_date, effective_date and due_date are nullable
because in the real world those fields genuinely arrive missing. The schema refuses
to lie about that by inventing a default.
"""

from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #


class DirectiveStatus(str, enum.Enum):
    """Lifecycle of a regulatory directive.

    UNKNOWN is not a bug — it is the landing zone for source values we could not
    map to a known state. The row survives, and a flag records the original text.
    """

    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    SUPERSEDED = "SUPERSEDED"
    CLOSED = "CLOSED"
    UNKNOWN = "UNKNOWN"


class ActionItemStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_REVIEW = "IN_REVIEW"
    BLOCKED = "BLOCKED"
    RESOLVED = "RESOLVED"
    DISMISSED = "DISMISSED"


class Priority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"
    UNSPECIFIED = "UNSPECIFIED"


class FlagIssue(str, enum.Enum):
    MISSING_REQUIRED_DATE = "MISSING_REQUIRED_DATE"
    UNPARSEABLE_DATE = "UNPARSEABLE_DATE"
    ILLOGICAL_DATE_ORDER = "ILLOGICAL_DATE_ORDER"
    MALFORMED_TEXT = "MALFORMED_TEXT"
    UNKNOWN_ENUM_VALUE = "UNKNOWN_ENUM_VALUE"
    DUPLICATE_REFERENCE_CODE = "DUPLICATE_REFERENCE_CODE"
    MISSING_REFERENCE_CODE = "MISSING_REFERENCE_CODE"
    CONFLICTING_STATUS = "CONFLICTING_STATUS"
    TRUNCATED_CONTENT = "TRUNCATED_CONTENT"


class FlagSeverity(str, enum.Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class FlagSource(str, enum.Enum):
    """Who raised the flag.

    SYSTEM flags are re-derivable — revalidation deletes and recomputes them.
    MANUAL flags were raised by an officer who spotted something the pipeline
    could not, so revalidation must never discard them.
    """

    SYSTEM = "SYSTEM"
    MANUAL = "MANUAL"


class TriageStatus(str, enum.Enum):
    """Directive-level rollup of its action items. Derived, never stored."""

    NO_ITEMS = "NO_ITEMS"
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"


# Shared column types. Each Postgres ENUM must be represented by ONE type object,
# otherwise create_all() emits CREATE TYPE once per column that uses it.
DirectiveStatusType = SQLEnum(DirectiveStatus, name="directive_status")
ActionItemStatusType = SQLEnum(ActionItemStatus, name="action_item_status")
PriorityType = SQLEnum(Priority, name="priority")
FlagIssueType = SQLEnum(FlagIssue, name="flag_issue")
FlagSeverityType = SQLEnum(FlagSeverity, name="flag_severity")
FlagSourceType = SQLEnum(FlagSource, name="flag_source")


# --------------------------------------------------------------------------- #
# Tables
# --------------------------------------------------------------------------- #


class RegulatoryAuthority(Base):
    """The body that issues a directive (FDA, EMA, MHRA, ...)."""

    __tablename__ = "regulatory_authority"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    jurisdiction: Mapped[str] = mapped_column(String(120))
    region: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    directives: Mapped[list[ComplianceDirective]] = relationship(
        back_populates="authority", cascade="all, delete-orphan"
    )


class ComplianceDirective(Base):
    """A single regulatory update that a compliance team must triage."""

    __tablename__ = "compliance_directive"

    id: Mapped[int] = mapped_column(primary_key=True)
    authority_id: Mapped[int] = mapped_column(
        ForeignKey("regulatory_authority.id", ondelete="CASCADE"), index=True
    )

    # Intentionally NOT unique: source systems really do emit collisions, and we
    # want to ingest both and flag the conflict rather than lose the second row.
    reference_code: Mapped[str | None] = mapped_column(String(64), index=True)

    title: Mapped[str] = mapped_column(String(500))
    summary: Mapped[str | None] = mapped_column(Text)
    status: Mapped[DirectiveStatus] = mapped_column(
        DirectiveStatusType,
        default=DirectiveStatus.UNKNOWN,
        index=True,
    )
    document_type: Mapped[str | None] = mapped_column(String(80))
    therapeutic_area: Mapped[str | None] = mapped_column(String(120))
    source_url: Mapped[str | None] = mapped_column(String(500))

    published_date: Mapped[date | None] = mapped_column(Date, index=True)
    effective_date: Mapped[date | None] = mapped_column(Date, index=True)

    # The untouched source record. Keeping it means a flagged field can always be
    # traced back to exactly what arrived, which is the difference between
    # "we cleaned it" and "we can prove what we cleaned".
    raw_payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    authority: Mapped[RegulatoryAuthority] = relationship(back_populates="directives")
    action_items: Mapped[list[ActionItem]] = relationship(
        back_populates="directive",
        cascade="all, delete-orphan",
        order_by="ActionItem.id",
    )
    flags: Mapped[list[DataQualityFlag]] = relationship(
        back_populates="directive", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_directive_authority_status", "authority_id", "status"),
    )

    @property
    def authority_code(self) -> str:
        """Flattened for list serialisation.

        Rows in the Action Items and Data Quality screens need the authority code
        but not the whole authority object; exposing it here lets Pydantic's
        from_attributes reach it without every router hand-building a nested DTO.
        """
        return self.authority.code


class ActionItem(Base):
    """The unit of work a compliance officer moves through triage."""

    __tablename__ = "action_item"

    id: Mapped[int] = mapped_column(primary_key=True)
    directive_id: Mapped[int] = mapped_column(
        ForeignKey("compliance_directive.id", ondelete="CASCADE"), index=True
    )

    title: Mapped[str] = mapped_column(String(400))
    description: Mapped[str | None] = mapped_column(Text)
    owner: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[ActionItemStatus] = mapped_column(
        ActionItemStatusType,
        default=ActionItemStatus.PENDING,
        index=True,
    )
    priority: Mapped[Priority] = mapped_column(
        PriorityType, default=Priority.UNSPECIFIED
    )
    due_date: Mapped[date | None] = mapped_column(Date)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    directive: Mapped[ComplianceDirective] = relationship(back_populates="action_items")
    status_changes: Mapped[list[StatusChange]] = relationship(
        back_populates="action_item",
        cascade="all, delete-orphan",
        order_by="StatusChange.changed_at",
    )


class DataQualityFlag(Base):
    """One defect found in one field of one record.

    Always attached to a directive; optionally narrowed to a specific action item.
    This is what lets the UI say "the backend caught this" with a citation.
    """

    __tablename__ = "data_quality_flag"

    id: Mapped[int] = mapped_column(primary_key=True)
    directive_id: Mapped[int] = mapped_column(
        ForeignKey("compliance_directive.id", ondelete="CASCADE"), index=True
    )
    action_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("action_item.id", ondelete="CASCADE"), index=True
    )

    field: Mapped[str] = mapped_column(String(80))
    issue: Mapped[FlagIssue] = mapped_column(
        FlagIssueType, index=True
    )
    severity: Mapped[FlagSeverity] = mapped_column(
        FlagSeverityType, index=True
    )
    message: Mapped[str] = mapped_column(String(400))

    # What the source actually sent, stringified. Null when the defect is an
    # absence rather than a bad value.
    raw_value: Mapped[str | None] = mapped_column(Text)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    source: Mapped[FlagSource] = mapped_column(
        FlagSourceType, default=FlagSource.SYSTEM, index=True
    )

    # Acknowledged flags stay on the record — a defect that was reviewed is part of
    # the history, so it is closed rather than deleted.
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[str | None] = mapped_column(String(120))
    resolution_note: Mapped[str | None] = mapped_column(String(400))

    directive: Mapped[ComplianceDirective] = relationship(back_populates="flags")


class StatusChange(Base):
    """Audit trail for every action-item transition made through the API."""

    __tablename__ = "status_change"

    id: Mapped[int] = mapped_column(primary_key=True)
    action_item_id: Mapped[int] = mapped_column(
        ForeignKey("action_item.id", ondelete="CASCADE"), index=True
    )
    from_status: Mapped[ActionItemStatus] = mapped_column(ActionItemStatusType)
    to_status: Mapped[ActionItemStatus] = mapped_column(ActionItemStatusType)
    changed_by: Mapped[str] = mapped_column(String(120), default="system")
    note: Mapped[str | None] = mapped_column(String(400))
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    action_item: Mapped[ActionItem] = relationship(back_populates="status_changes")
