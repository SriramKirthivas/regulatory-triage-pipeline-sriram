"""Triage business rules.

Kept out of the router so the rules are testable without HTTP, and so there is one
obvious place to read "what is a legal move?" during review.
"""

from __future__ import annotations

from .models import ActionItemStatus as S

# A deliberately non-total transition graph. The point of a decision layer is that
# not every move is allowed — an API that accepts any status for any item is a
# spreadsheet with extra steps.
#
# The rule worth defending: BLOCKED work cannot jump straight to RESOLVED. Whatever
# was blocking it has to be cleared first, which means an explicit move back into
# PENDING or IN_REVIEW. Terminal states can be reopened, but only to a state that
# implies someone looks at them again.
ALLOWED_TRANSITIONS: dict[S, set[S]] = {
    S.PENDING: {S.IN_REVIEW, S.BLOCKED, S.RESOLVED, S.DISMISSED},
    S.IN_REVIEW: {S.PENDING, S.BLOCKED, S.RESOLVED, S.DISMISSED},
    S.BLOCKED: {S.PENDING, S.IN_REVIEW, S.DISMISSED},
    S.RESOLVED: {S.IN_REVIEW},
    S.DISMISSED: {S.PENDING},
}

_REASONS: dict[tuple[S, S], str] = {
    (S.BLOCKED, S.RESOLVED): (
        "A blocked item cannot be resolved directly. Move it back to Pending or "
        "In Review first, so the blocker is explicitly cleared."
    ),
    (S.RESOLVED, S.PENDING): (
        "Reopen a resolved item into In Review rather than Pending, so the reopening "
        "is reviewed rather than silently re-queued."
    ),
    (S.DISMISSED, S.RESOLVED): (
        "A dismissed item was judged not applicable; it cannot become resolved. "
        "Reinstate it to Pending first if that judgement was wrong."
    ),
}


def is_allowed(current: S, target: S) -> bool:
    return target in ALLOWED_TRANSITIONS.get(current, set())


def rejection_reason(current: S, target: S) -> str:
    """Human-readable explanation for a refused transition.

    The frontend surfaces this verbatim, so it is written for a compliance officer
    rather than for a developer reading a stack trace.
    """
    if current == target:
        return f"This item is already {target.value.replace('_', ' ').title()}."

    specific = _REASONS.get((current, target))
    if specific:
        return specific

    allowed = sorted(s.value for s in ALLOWED_TRANSITIONS.get(current, set()))
    allowed_text = ", ".join(a.replace("_", " ").title() for a in allowed) or "nothing"
    return (
        f"{current.value.replace('_', ' ').title()} items can only move to: "
        f"{allowed_text}."
    )
