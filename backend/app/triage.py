"""
The triage layer. Every record read from the DB passes through here before it
reaches the API response. It never raises on bad data: it repairs what is
safely repairable, quarantines what is not, and attaches a list of flags so
the UI can show exactly what was wrong and what the backend did about it.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum


class ItemStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    RESOLVED = "resolved"
    UNKNOWN = "unknown"  # quarantine bucket; never accepted on write


class DirectiveStatus(StrEnum):
    DRAFT = "draft"
    OPEN_FOR_COMMENT = "open_for_comment"
    FINAL = "final"
    WITHDRAWN = "withdrawn"
    UNKNOWN = "unknown"


class Severity(StrEnum):
    CRITICAL = "critical"
    MAJOR = "major"
    MINOR = "minor"
    INFO = "info"
    UNKNOWN = "unknown"


WRITABLE_ITEM_STATUSES = [s for s in ItemStatus if s is not ItemStatus.UNKNOWN]

# Legacy / typo aliases seen in real feeds. Keys are already normalised
# (lowercase, non-alphanumerics collapsed to a single underscore).
_ITEM_ALIASES: dict[str, ItemStatus] = {
    "pending": ItemStatus.PENDING,
    "open": ItemStatus.PENDING,
    "todo": ItemStatus.PENDING,
    "new": ItemStatus.PENDING,
    "in_progress": ItemStatus.IN_PROGRESS,
    "inprogress": ItemStatus.IN_PROGRESS,
    "wip": ItemStatus.IN_PROGRESS,
    "started": ItemStatus.IN_PROGRESS,
    "blocked": ItemStatus.BLOCKED,
    "on_hold": ItemStatus.BLOCKED,
    "hold": ItemStatus.BLOCKED,
    "resolved": ItemStatus.RESOLVED,
    "resolvd": ItemStatus.RESOLVED,
    "done": ItemStatus.RESOLVED,
    "closed": ItemStatus.RESOLVED,
    "complete": ItemStatus.RESOLVED,
    "completed": ItemStatus.RESOLVED,
}

_DIRECTIVE_ALIASES: dict[str, DirectiveStatus] = {
    "draft": DirectiveStatus.DRAFT,
    "proposed": DirectiveStatus.DRAFT,
    "open_for_comment": DirectiveStatus.OPEN_FOR_COMMENT,
    "consultation": DirectiveStatus.OPEN_FOR_COMMENT,
    "open": DirectiveStatus.OPEN_FOR_COMMENT,
    "final": DirectiveStatus.FINAL,
    "adopted": DirectiveStatus.FINAL,
    "in_force": DirectiveStatus.FINAL,
    "published": DirectiveStatus.FINAL,
    "withdrawn": DirectiveStatus.WITHDRAWN,
    "revoked": DirectiveStatus.WITHDRAWN,
    "superseded": DirectiveStatus.WITHDRAWN,
}

_SEVERITY_ALIASES: dict[str, Severity] = {
    "critical": Severity.CRITICAL,
    "crit": Severity.CRITICAL,
    "high": Severity.CRITICAL,
    "major": Severity.MAJOR,
    "medium": Severity.MAJOR,
    "med": Severity.MAJOR,
    "minor": Severity.MINOR,
    "low": Severity.MINOR,
    "info": Severity.INFO,
    "informational": Severity.INFO,
}


@dataclass
class Flag:
    code: str
    field: str
    message: str
    level: str = "warn"  # "warn" = repaired, "error" = quarantined / needs human
    raw: str | None = None


@dataclass
class Cleaned:
    value: object
    flags: list[Flag] = field(default_factory=list)


_HTML_TAG = re.compile(r"<[^>]+>")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_WS = re.compile(r"\s+")
_PLACEHOLDERS = {"", "n/a", "na", "null", "none", "tbd", "-", "--", "???", "todo"}


def _key(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).strip().lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def clean_text(raw: str | None, field_name: str, *, required: bool) -> Cleaned:
    flags: list[Flag] = []
    if raw is None:
        if required:
            flags.append(Flag("missing_required", field_name, "Required text is missing", "error"))
        return Cleaned(None, flags)

    value = raw
    if _CONTROL.search(value):
        value = _CONTROL.sub("", value)
        flags.append(Flag("control_chars", field_name, "Control characters removed", "warn", raw))
    if _HTML_TAG.search(value):
        value = _HTML_TAG.sub("", value)
        flags.append(Flag("html_stripped", field_name, "HTML markup stripped", "warn", raw))
    if "\ufffd" in value:
        value = value.replace("\ufffd", "")
        flags.append(Flag("bad_encoding", field_name, "Replacement characters (mojibake) removed", "warn", raw))
    collapsed = _WS.sub(" ", value).strip()
    if collapsed != value:
        value = collapsed
        if raw != value and not flags:
            flags.append(Flag("whitespace", field_name, "Whitespace normalised", "warn", raw))

    if value.lower() in _PLACEHOLDERS:
        flags.append(
            Flag(
                "placeholder_text",
                field_name,
                f"Placeholder value '{raw}' treated as missing",
                "error" if required else "warn",
                raw,
            )
        )
        return Cleaned(None, flags)
    return Cleaned(value, flags)


def _clean_enum(raw: str | None, field_name: str, aliases: dict, unknown, canonical) -> Cleaned:
    if raw is None:
        return Cleaned(unknown, [Flag("missing_status", field_name, "Status missing; quarantined", "error")])
    key = _key(raw)
    mapped = aliases.get(key)
    if mapped is None:
        return Cleaned(
            unknown,
            [Flag("unknown_code", field_name, f"Unrecognised code '{raw}'; quarantined as unknown", "error", raw)],
        )
    if raw != mapped.value:
        return Cleaned(mapped, [Flag("code_normalised", field_name, f"'{raw}' mapped to '{mapped.value}'", "warn", raw)])
    return Cleaned(mapped, [])


def clean_item_status(raw: str | None) -> Cleaned:
    return _clean_enum(raw, "status", _ITEM_ALIASES, ItemStatus.UNKNOWN, ItemStatus)


def clean_directive_status(raw: str | None) -> Cleaned:
    return _clean_enum(raw, "status", _DIRECTIVE_ALIASES, DirectiveStatus.UNKNOWN, DirectiveStatus)


def clean_severity(raw: str | None) -> Cleaned:
    return _clean_enum(raw, "severity", _SEVERITY_ALIASES, Severity.UNKNOWN, Severity)


def clean_priority(raw: int | None) -> Cleaned:
    if raw is None:
        return Cleaned(3, [Flag("missing_priority", "priority", "Priority missing; defaulted to 3", "warn")])
    if raw < 1 or raw > 5:
        clamped = min(5, max(1, raw))
        return Cleaned(
            clamped,
            [Flag("priority_out_of_range", "priority", f"Priority {raw} outside 1-5; clamped to {clamped}", "warn", str(raw))],
        )
    return Cleaned(raw, [])


def check_directive_dates(published: date | None, effective: date | None, deadline: date | None) -> list[Flag]:
    flags: list[Flag] = []
    if published is None:
        flags.append(Flag("missing_date", "published_at", "Publication date missing", "error"))
    if effective is None:
        flags.append(Flag("missing_date", "effective_date", "Effective date missing; cannot plan compliance window", "error"))
    if published and effective and effective < published:
        flags.append(
            Flag("date_conflict", "effective_date", f"Effective {effective} precedes publication {published}", "error")
        )
    if deadline and published and deadline < published:
        flags.append(Flag("date_conflict", "comment_deadline", "Comment deadline precedes publication", "error"))
    if published and published.year < 1990:
        flags.append(Flag("implausible_date", "published_at", f"Publication year {published.year} is implausible", "warn"))
    return flags


def check_item_dates(due: date | None, status: ItemStatus, today: date) -> list[Flag]:
    flags: list[Flag] = []
    if due is None:
        if status not in (ItemStatus.RESOLVED,):
            flags.append(Flag("missing_date", "due_date", "Open item has no due date", "warn"))
        return flags
    if due < today and status not in (ItemStatus.RESOLVED, ItemStatus.UNKNOWN):
        flags.append(Flag("overdue", "due_date", f"Overdue by {(today - due).days} days", "warn"))
    if due.year > today.year + 10:
        flags.append(Flag("implausible_date", "due_date", f"Due year {due.year} looks like a data entry error", "warn"))
    return flags


def check_directive_vs_items(d_status: DirectiveStatus, item_statuses: list[ItemStatus]) -> list[Flag]:
    """Cross-entity conflict: a withdrawn directive should not have open work."""
    if d_status is DirectiveStatus.WITHDRAWN and any(
        s in (ItemStatus.PENDING, ItemStatus.IN_PROGRESS, ItemStatus.BLOCKED) for s in item_statuses
    ):
        return [Flag("status_conflict", "status", "Directive is withdrawn but still has open action items", "error")]
    return []
