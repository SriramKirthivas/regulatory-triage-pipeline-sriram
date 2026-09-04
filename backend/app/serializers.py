"""Turns ORM rows into API objects via the triage layer."""

from __future__ import annotations

from datetime import date

from .models import ActionItem, Directive
from .schemas import ActionItemLite, ActionItemOut, DirectiveLite, DirectiveOut, FlagOut
from .triage import (
    Flag,
    ItemStatus,
    check_directive_dates,
    check_directive_vs_items,
    check_item_dates,
    clean_directive_status,
    clean_item_status,
    clean_priority,
    clean_severity,
    clean_text,
)


def _out(flags: list[Flag]) -> list[FlagOut]:
    return [FlagOut(code=f.code, field=f.field, message=f.message, level=f.level, raw=f.raw) for f in flags]


def _has_errors(flags: list[Flag]) -> bool:
    return any(f.level == "error" for f in flags)


def directive_lite(d: Directive, duplicates: dict[str, int] | None = None) -> DirectiveLite:
    flags: list[Flag] = []
    title = clean_text(d.title, "title", required=True)
    status = clean_directive_status(d.status)
    severity = clean_severity(d.severity)
    flags += title.flags + status.flags + severity.flags
    flags += check_directive_dates(d.published_at, d.effective_date, d.comment_deadline)
    flags += check_directive_vs_items(status.value, [clean_item_status(i.status).value for i in d.action_items])

    canonical_code = d.reference_code.strip().upper()
    if d.reference_code != canonical_code:
        flags.append(Flag("code_format", "reference_code", f"Reference code normalised to '{canonical_code}'", "warn", d.reference_code))

    dup_of = None
    if duplicates:
        first = duplicates.get(d.reference_code.strip().upper())
        if first is not None and first != d.id:
            dup_of = first
            flags.append(Flag("duplicate_reference", "reference_code", f"Same reference code as directive #{first}", "error", d.reference_code))

    return DirectiveLite(
        id=d.id,
        reference_code=canonical_code,
        title=title.value,
        category=d.category,
        severity=severity.value,
        status=status.value,
        published_at=d.published_at,
        effective_date=d.effective_date,
        comment_deadline=d.comment_deadline,
        authority=d.authority,
        flags=_out(flags),
        has_errors=_has_errors(flags),
        duplicate_of=dup_of,
    )


def _item_core(i: ActionItem, today: date) -> tuple[dict, list[Flag]]:
    flags: list[Flag] = []
    title = clean_text(i.title, "title", required=True)
    owner = clean_text(i.owner, "owner", required=False)
    status = clean_item_status(i.status)
    priority = clean_priority(i.priority)
    flags += title.flags + owner.flags + status.flags + priority.flags
    flags += check_item_dates(i.due_date, status.value, today)
    core = dict(
        id=i.id,
        title=title.value,
        owner=owner.value,
        status=status.value,
        priority=priority.value,
        due_date=i.due_date,
    )
    return core, flags


def action_item_lite(i: ActionItem, today: date) -> ActionItemLite:
    core, flags = _item_core(i, today)
    return ActionItemLite(**core, flags=_out(flags), has_errors=_has_errors(flags))


def action_item_out(i: ActionItem, today: date, duplicates: dict[str, int] | None = None) -> ActionItemOut:
    core, flags = _item_core(i, today)
    return ActionItemOut(
        **core,
        directive_id=i.directive_id,
        status_raw=i.status,
        created_at=i.created_at,
        updated_at=i.updated_at,
        flags=_out(flags),
        has_errors=_has_errors(flags),
        directive=directive_lite(i.directive, duplicates),
    )


def directive_out(d: Directive, today: date, duplicates: dict[str, int] | None = None) -> DirectiveOut:
    lite = directive_lite(d, duplicates)
    summary = clean_text(d.summary, "summary", required=False)
    return DirectiveOut(
        **lite.model_dump(),
        summary=summary.value,
        action_items=[action_item_lite(i, today) for i in d.action_items],
    )


def duplicate_index(directives: list[Directive]) -> dict[str, int]:
    """Map normalised reference code -> the directive that 'owns' it.

    Preference: a row whose stored code is already canonical wins; otherwise
    the lowest id. So a later, well-formed 'MHRA/LAB/2025/119' is the owner
    and the earlier ' mhra/lab/2025/119 ' row is the one flagged as duplicate.
    """
    index: dict[str, int] = {}
    ranked = sorted(directives, key=lambda x: (x.reference_code != x.reference_code.strip().upper(), x.id))
    for d in ranked:
        index.setdefault(d.reference_code.strip().upper(), d.id)
    return index
