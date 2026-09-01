"""Directive-level rollups derived from action items.

These are computed, never stored. Storing a rollup means every action-item write
has to remember to update it, and the day someone forgets, the queue lies about
what is outstanding. One function, one definition of "In Progress".
"""

from __future__ import annotations

from datetime import date

from .models import ActionItem, ActionItemStatus, TriageStatus

TERMINAL_STATUSES = {ActionItemStatus.RESOLVED, ActionItemStatus.DISMISSED}


def triage_status(items: list[ActionItem]) -> TriageStatus:
    """Roll a directive's action items up into a single queue status.

    PENDING     nothing has been picked up yet
    IN_PROGRESS someone has started, or some work is done and some is not
    RESOLVED    every item reached a terminal state
    """
    if not items:
        return TriageStatus.NO_ITEMS

    statuses = [item.status for item in items]

    if all(s in TERMINAL_STATUSES for s in statuses):
        return TriageStatus.RESOLVED
    if all(s == ActionItemStatus.PENDING for s in statuses):
        return TriageStatus.PENDING
    return TriageStatus.IN_PROGRESS


def primary_owner(items: list[ActionItem]) -> str | None:
    """The owner carrying the most open work, for the queue's Owner column.

    Ties break toward the first-created item so the column does not flicker
    between equally-loaded owners on refresh.
    """
    open_items = [i for i in items if i.status not in TERMINAL_STATUSES and i.owner]
    pool = open_items or [i for i in items if i.owner]
    if not pool:
        return None

    counts: dict[str, int] = {}
    for item in pool:
        assert item.owner is not None
        counts[item.owner] = counts.get(item.owner, 0) + 1
    return max(counts, key=lambda owner: counts[owner])


def owner_count(items: list[ActionItem]) -> int:
    return len({i.owner for i in items if i.owner})


def next_due_date(items: list[ActionItem]) -> date | None:
    """Earliest due date among OPEN items — the deadline that actually binds."""
    dates = [
        i.due_date
        for i in items
        if i.due_date and i.status not in TERMINAL_STATUSES
    ]
    return min(dates) if dates else None


def is_overdue(items: list[ActionItem], today: date | None = None) -> bool:
    due = next_due_date(items)
    return due is not None and due < (today or date.today())
