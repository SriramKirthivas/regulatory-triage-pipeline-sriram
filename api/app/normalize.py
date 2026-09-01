"""The ingestion normalisation layer.

The contract every function here obeys:

    Never crash. Never silently accept. Never drop the row.

A messy value produces a *best-effort* clean value plus a `Finding` describing
exactly what was wrong. The caller persists the clean value on the record and the
Finding as a DataQualityFlag, so the defect stays visible to the end user instead
of being swallowed by a try/except.

Nothing in this module touches the database — it is pure functions over raw input,
which is what makes it directly unit-testable.
"""

from __future__ import annotations

import html
import re
import unicodedata
from dataclasses import dataclass, field as dc_field
from datetime import date, datetime
from typing import Any

from dateutil import parser as date_parser

from .models import (
    ActionItemStatus,
    DirectiveStatus,
    FlagIssue,
    FlagSeverity,
    Priority,
)

# --------------------------------------------------------------------------- #
# Findings
# --------------------------------------------------------------------------- #


@dataclass
class Finding:
    """One defect, ready to become a DataQualityFlag row."""

    field: str
    issue: FlagIssue
    severity: FlagSeverity
    message: str
    raw_value: str | None = None


@dataclass
class FindingCollector:
    """Accumulates findings for a single record being ingested."""

    findings: list[Finding] = dc_field(default_factory=list)

    def add(
        self,
        field: str,
        issue: FlagIssue,
        severity: FlagSeverity,
        message: str,
        raw_value: Any = None,
    ) -> None:
        self.findings.append(
            Finding(
                field=field,
                issue=issue,
                severity=severity,
                message=message,
                raw_value=None if raw_value is None else str(raw_value)[:2000],
            )
        )

    def extend(self, other: list[Finding]) -> None:
        self.findings.extend(other)


# --------------------------------------------------------------------------- #
# Text sanitisation
# --------------------------------------------------------------------------- #

# Mojibake: UTF-8 bytes that were decoded as cp1252 somewhere upstream. These are
# the sequences that actually show up in scraped regulatory feeds.
_MOJIBAKE = {
    "â€™": "'",
    "â€˜": "'",
    "â€œ": '"',
    "â€\x9d": '"',
    "â€”": "—",
    "â€“": "–",
    "â€¦": "…",
    "Â ": " ",
    "Â": "",
    "Ã©": "é",
    "Ã¨": "è",
    "Ã¶": "ö",
    "Ã¼": "ü",
    "Ã±": "ñ",
}

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ZERO_WIDTH = re.compile(r"[\u200b-\u200f\u2060\ufeff]")
_WHITESPACE = re.compile(r"\s+")
_HTML_TAG = re.compile(r"<[^>]+>")

# Markers that indicate the upstream extractor gave up mid-document.
_TRUNCATION_MARKERS = ("[truncated]", "[...]", "…", "read more", "continued on")

# Tokens that mean "absent" in ANY column.
_NULLISH = {
    "",
    "n/a",
    "na",
    "none",
    "null",
    "nil",
    "-",
    "--",
    "?",
    "not specified",
    "not provided",
}

# Tokens that mean "absent" only in a DATE column. Kept separate on purpose:
# "pending" and "unknown" are real, meaningful values for a status column, and
# folding them into the global set would make coerce_*_status() report a missing
# value for a status that was actually supplied.
_DATE_NULLISH = _NULLISH | {
    "tbd",
    "tba",
    "unknown",
    "pending",
    "to be determined",
    "to be confirmed",
    "not announced",
    "awaiting publication",
}


def is_nullish(value: Any, extra: set[str] | None = None) -> bool:
    """True for the many ways a source system spells 'no value here'."""
    if value is None:
        return True
    if isinstance(value, str):
        vocabulary = extra if extra is not None else _NULLISH
        return value.strip().lower() in vocabulary
    return False


def clean_text(
    value: Any,
    field: str,
    *,
    collector: FindingCollector | None = None,
    max_length: int | None = None,
) -> str | None:
    """Sanitise free text, reporting whether it had to be repaired.

    Handles: HTML entities (including double-encoded), embedded HTML tags,
    cp1252 mojibake, control and zero-width characters, and runaway whitespace.
    """
    if is_nullish(value):
        return None

    raw = str(value)
    working = raw

    # Double-unescape: feeds frequently ship "&amp;#8212;" rather than "&#8212;".
    for _ in range(2):
        unescaped = html.unescape(working)
        if unescaped == working:
            break
        working = unescaped

    for bad, good in _MOJIBAKE.items():
        working = working.replace(bad, good)

    had_tags = bool(_HTML_TAG.search(working))
    working = _HTML_TAG.sub(" ", working)

    working = _CONTROL_CHARS.sub(" ", working)
    working = _ZERO_WIDTH.sub("", working)
    working = unicodedata.normalize("NFKC", working)
    working = _WHITESPACE.sub(" ", working).strip()

    if not working:
        if collector:
            collector.add(
                field,
                FlagIssue.MALFORMED_TEXT,
                FlagSeverity.WARNING,
                f"'{field}' contained only markup or control characters and "
                "normalised to an empty string.",
                raw,
            )
        return None

    if collector and working != raw.strip():
        detail = "embedded HTML" if had_tags else "encoding artefacts"
        collector.add(
            field,
            FlagIssue.MALFORMED_TEXT,
            FlagSeverity.INFO,
            f"'{field}' was sanitised on ingest ({detail} removed).",
            raw,
        )

    lowered = working.lower()
    if collector and any(marker in lowered for marker in _TRUNCATION_MARKERS):
        collector.add(
            field,
            FlagIssue.TRUNCATED_CONTENT,
            FlagSeverity.WARNING,
            f"'{field}' appears truncated upstream — the full text was never delivered.",
            raw,
        )

    if max_length and len(working) > max_length:
        working = working[: max_length - 1].rstrip() + "…"
        if collector:
            collector.add(
                field,
                FlagIssue.TRUNCATED_CONTENT,
                FlagSeverity.INFO,
                f"'{field}' exceeded {max_length} characters and was stored truncated.",
                raw,
            )

    return working


# --------------------------------------------------------------------------- #
# Date parsing
# --------------------------------------------------------------------------- #

# Tried in order before falling back to dateutil. Explicit formats first so that
# unambiguous input is never at the mercy of a heuristic parser.
_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d %B %Y",
    "%d %b %Y",
    "%B %d, %Y",
    "%b %d, %Y",
    "%Y/%m/%d",
    "%Y%m%d",
)

_MIN_PLAUSIBLE = date(1990, 1, 1)
_MAX_PLAUSIBLE = date(2100, 1, 1)


def parse_date(
    value: Any,
    field: str,
    *,
    collector: FindingCollector | None = None,
    required: bool = False,
    severity_if_missing: FlagSeverity = FlagSeverity.WARNING,
) -> date | None:
    """Coerce a messy date value to a real date, or to None with a finding.

    Deliberately conservative: a value we cannot parse becomes NULL and a
    CRITICAL flag. Guessing would be worse than admitting we do not know, because
    downstream someone schedules real compliance work off this field.
    """
    if is_nullish(value, extra=_DATE_NULLISH):
        if collector and required:
            collector.add(
                field,
                FlagIssue.MISSING_REQUIRED_DATE,
                severity_if_missing,
                f"'{field}' is required for triage but arrived empty.",
                value,
            )
        return None

    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    raw = str(value).strip()
    # Strip ordinal suffixes ("March 3rd, 2024" -> "March 3, 2024").
    candidate = re.sub(r"(\d+)(st|nd|rd|th)\b", r"\1", raw, flags=re.IGNORECASE)
    candidate = _WHITESPACE.sub(" ", candidate).strip()

    parsed: date | None = None
    for fmt in _DATE_FORMATS:
        try:
            parsed = datetime.strptime(candidate, fmt).date()
            break
        except ValueError:
            continue

    if parsed is None:
        try:
            # dayfirst=True: these feeds are predominantly EU-sourced.
            parsed = date_parser.parse(candidate, dayfirst=True, fuzzy=False).date()
        except (ValueError, OverflowError, TypeError):
            parsed = None

    if parsed is None:
        if collector:
            collector.add(
                field,
                FlagIssue.UNPARSEABLE_DATE,
                FlagSeverity.CRITICAL,
                f"'{field}' could not be parsed as a date and was stored as NULL "
                "rather than guessed.",
                raw,
            )
        return None

    if not (_MIN_PLAUSIBLE <= parsed <= _MAX_PLAUSIBLE):
        if collector:
            collector.add(
                field,
                FlagIssue.UNPARSEABLE_DATE,
                FlagSeverity.CRITICAL,
                f"'{field}' parsed to {parsed.isoformat()}, outside the plausible "
                "range for a regulatory date. Stored as NULL.",
                raw,
            )
        return None

    return parsed


def check_date_order(
    published: date | None,
    effective: date | None,
    collector: FindingCollector,
) -> None:
    """A directive cannot take effect before it was published."""
    if published and effective and effective < published:
        collector.add(
            "effective_date",
            FlagIssue.ILLOGICAL_DATE_ORDER,
            FlagSeverity.CRITICAL,
            f"Effective date ({effective.isoformat()}) precedes the published date "
            f"({published.isoformat()}).",
            f"published={published.isoformat()}, effective={effective.isoformat()}",
        )


# --------------------------------------------------------------------------- #
# Enum coercion
# --------------------------------------------------------------------------- #

_DIRECTIVE_STATUS_ALIASES = {
    "draft": DirectiveStatus.DRAFT,
    "proposed": DirectiveStatus.DRAFT,
    "consultation": DirectiveStatus.DRAFT,
    "active": DirectiveStatus.ACTIVE,
    "in force": DirectiveStatus.ACTIVE,
    "in-force": DirectiveStatus.ACTIVE,
    "effective": DirectiveStatus.ACTIVE,
    "published": DirectiveStatus.ACTIVE,
    "final": DirectiveStatus.ACTIVE,
    "superseded": DirectiveStatus.SUPERSEDED,
    "replaced": DirectiveStatus.SUPERSEDED,
    "revised": DirectiveStatus.SUPERSEDED,
    "closed": DirectiveStatus.CLOSED,
    "withdrawn": DirectiveStatus.CLOSED,
    "archived": DirectiveStatus.CLOSED,
    "rescinded": DirectiveStatus.CLOSED,
}

_ACTION_STATUS_ALIASES = {
    "pending": ActionItemStatus.PENDING,
    "open": ActionItemStatus.PENDING,
    "new": ActionItemStatus.PENDING,
    "todo": ActionItemStatus.PENDING,
    "in review": ActionItemStatus.IN_REVIEW,
    "in-review": ActionItemStatus.IN_REVIEW,
    "review": ActionItemStatus.IN_REVIEW,
    "wip": ActionItemStatus.IN_REVIEW,
    "in progress": ActionItemStatus.IN_REVIEW,
    "blocked": ActionItemStatus.BLOCKED,
    "on hold": ActionItemStatus.BLOCKED,
    "waiting": ActionItemStatus.BLOCKED,
    "resolved": ActionItemStatus.RESOLVED,
    "done": ActionItemStatus.RESOLVED,
    "complete": ActionItemStatus.RESOLVED,
    "completed": ActionItemStatus.RESOLVED,
    "closed": ActionItemStatus.RESOLVED,
    "dismissed": ActionItemStatus.DISMISSED,
    "n/a": ActionItemStatus.DISMISSED,
    "not applicable": ActionItemStatus.DISMISSED,
}

_PRIORITY_ALIASES = {
    "low": Priority.LOW,
    "p4": Priority.LOW,
    "minor": Priority.LOW,
    "medium": Priority.MEDIUM,
    "med": Priority.MEDIUM,
    "normal": Priority.MEDIUM,
    "moderate": Priority.MEDIUM,
    "p3": Priority.MEDIUM,
    "high": Priority.HIGH,
    "p2": Priority.HIGH,
    "major": Priority.HIGH,
    "urgent": Priority.HIGH,
    "critical": Priority.CRITICAL,
    "p1": Priority.CRITICAL,
    "p0": Priority.CRITICAL,
    "blocker": Priority.CRITICAL,
    "severe": Priority.CRITICAL,
}


def _normalise_key(value: Any) -> str:
    """Lowercase, de-punctuate, collapse — so 'URGENT!!!' matches 'urgent'."""
    text = _WHITESPACE.sub(" ", str(value).strip().lower())
    return re.sub(r"[!.*_]+", "", text).strip()


def coerce_directive_status(
    value: Any, collector: FindingCollector, field: str = "status"
) -> DirectiveStatus:
    if is_nullish(value):
        collector.add(
            field,
            FlagIssue.UNKNOWN_ENUM_VALUE,
            FlagSeverity.WARNING,
            "Directive status was empty; stored as UNKNOWN pending review.",
            value,
        )
        return DirectiveStatus.UNKNOWN

    key = _normalise_key(value)
    if key in _DIRECTIVE_STATUS_ALIASES:
        return _DIRECTIVE_STATUS_ALIASES[key]

    collector.add(
        field,
        FlagIssue.UNKNOWN_ENUM_VALUE,
        FlagSeverity.WARNING,
        f"Unrecognised directive status '{value}'. Stored as UNKNOWN so the record "
        "stays visible instead of being dropped.",
        value,
    )
    return DirectiveStatus.UNKNOWN


def coerce_action_status(
    value: Any, collector: FindingCollector, field: str = "action_item.status"
) -> ActionItemStatus:
    if is_nullish(value):
        collector.add(
            field,
            FlagIssue.UNKNOWN_ENUM_VALUE,
            FlagSeverity.INFO,
            "Action item status was empty; defaulted to PENDING.",
            value,
        )
        return ActionItemStatus.PENDING

    key = _normalise_key(value)
    if key in _ACTION_STATUS_ALIASES:
        return _ACTION_STATUS_ALIASES[key]

    collector.add(
        field,
        FlagIssue.UNKNOWN_ENUM_VALUE,
        FlagSeverity.WARNING,
        f"Unrecognised action item status '{value}'. Defaulted to PENDING — a human "
        "must confirm, so it is not marked done by accident.",
        value,
    )
    return ActionItemStatus.PENDING


def coerce_priority(
    value: Any, collector: FindingCollector, field: str = "action_item.priority"
) -> Priority:
    if is_nullish(value):
        return Priority.UNSPECIFIED

    key = _normalise_key(value)
    if key in _PRIORITY_ALIASES:
        return _PRIORITY_ALIASES[key]

    collector.add(
        field,
        FlagIssue.UNKNOWN_ENUM_VALUE,
        FlagSeverity.INFO,
        f"Unrecognised priority '{value}'. Stored as UNSPECIFIED.",
        value,
    )
    return Priority.UNSPECIFIED


# --------------------------------------------------------------------------- #
# Cross-record consistency
# --------------------------------------------------------------------------- #

# Statuses that mean "nobody is working this any more".
_TERMINAL_ACTION_STATUSES = {ActionItemStatus.RESOLVED, ActionItemStatus.DISMISSED}


def check_status_consistency(
    directive_status: DirectiveStatus,
    action_statuses: list[ActionItemStatus],
    collector: FindingCollector,
) -> None:
    """Catch the contradiction a single-record validator cannot see.

    A directive marked CLOSED while its action items are still open is the classic
    conflicting-status case: each row is individually valid, the combination is not.
    """
    if not action_statuses:
        return

    open_items = [s for s in action_statuses if s not in _TERMINAL_ACTION_STATUSES]

    if directive_status == DirectiveStatus.CLOSED and open_items:
        collector.add(
            "status",
            FlagIssue.CONFLICTING_STATUS,
            FlagSeverity.CRITICAL,
            f"Directive is CLOSED but {len(open_items)} action item(s) are still "
            "open. Closure is contradicted by outstanding work.",
            f"directive=CLOSED, open_items={len(open_items)}",
        )

    if directive_status == DirectiveStatus.DRAFT and any(
        s == ActionItemStatus.RESOLVED for s in action_statuses
    ):
        collector.add(
            "status",
            FlagIssue.CONFLICTING_STATUS,
            FlagSeverity.WARNING,
            "Directive is still in DRAFT but has action items already marked "
            "RESOLVED — work was completed against a non-final directive.",
            "directive=DRAFT, resolved_items>0",
        )


def check_reference_code(
    code: str | None,
    seen_codes: dict[str, int],
    collector: FindingCollector,
) -> None:
    """Reference codes should be unique. When they are not, say so loudly.

    `seen_codes` maps a normalised code to the count already ingested; the caller
    owns it across the whole batch.
    """
    if not code:
        collector.add(
            "reference_code",
            FlagIssue.MISSING_REFERENCE_CODE,
            FlagSeverity.WARNING,
            "Directive arrived with no reference code — it cannot be cross-linked "
            "to the source register.",
        )
        return

    key = code.strip().upper()
    if key in seen_codes:
        collector.add(
            "reference_code",
            FlagIssue.DUPLICATE_REFERENCE_CODE,
            FlagSeverity.WARNING,
            f"Reference code '{code}' has already been ingested in this batch. "
            "Both records were kept; one may be a redundant re-publication.",
            code,
        )
    seen_codes[key] = seen_codes.get(key, 0) + 1
