"""Unit tests for the ingest pipeline.

No database, no HTTP — normalize.py is pure functions over raw input, which is the
whole reason it was written that way.

Run with:  docker compose exec api pytest -q
"""

from datetime import date

import pytest

from app.models import (
    ActionItemStatus,
    DirectiveStatus,
    FlagIssue,
    FlagSeverity,
    Priority,
)
from app.normalize import (
    FindingCollector,
    check_date_order,
    check_reference_code,
    check_status_consistency,
    clean_text,
    coerce_action_status,
    coerce_directive_status,
    coerce_priority,
    parse_date,
)
from app.triage import is_allowed, rejection_reason


@pytest.fixture
def collector() -> FindingCollector:
    return FindingCollector()


def issues(collector: FindingCollector) -> set[FlagIssue]:
    return {f.issue for f in collector.findings}


# ------------------------------------------------------------------ dates ---


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("2024-02-14", date(2024, 2, 14)),
        ("March 3rd, 2024", date(2024, 3, 3)),
        ("14/02/2024", date(2024, 2, 14)),
        ("2024/02/14", date(2024, 2, 14)),
        ("20240214", date(2024, 2, 14)),
        (date(2024, 2, 14), date(2024, 2, 14)),
    ],
)
def test_coercible_dates_parse_without_a_flag(raw, expected, collector):
    assert parse_date(raw, "published_date", collector=collector) == expected
    assert collector.findings == []


@pytest.mark.parametrize("raw", ["2024-13-45", "sometime in Q1", "not a date at all"])
def test_unparseable_dates_become_null_and_critical(raw, collector):
    assert parse_date(raw, "effective_date", collector=collector) is None
    assert FlagIssue.UNPARSEABLE_DATE in issues(collector)
    assert collector.findings[0].severity == FlagSeverity.CRITICAL
    # The original value survives on the flag for the audit trail.
    assert collector.findings[0].raw_value == raw


@pytest.mark.parametrize("raw", [None, "", "N/A", "TBD", "awaiting publication"])
def test_missing_required_dates_are_flagged(raw, collector):
    assert parse_date(raw, "effective_date", collector=collector, required=True) is None
    assert FlagIssue.MISSING_REQUIRED_DATE in issues(collector)


def test_optional_missing_date_is_not_flagged(collector):
    assert parse_date(None, "due_date", collector=collector, required=False) is None
    assert collector.findings == []


def test_dates_outside_plausible_range_are_rejected(collector):
    assert parse_date("1823-01-01", "published_date", collector=collector) is None
    assert FlagIssue.UNPARSEABLE_DATE in issues(collector)


def test_effective_before_published_is_critical(collector):
    check_date_order(date(2024, 4, 18), date(2024, 1, 10), collector)
    assert FlagIssue.ILLOGICAL_DATE_ORDER in issues(collector)
    assert collector.findings[0].severity == FlagSeverity.CRITICAL


def test_correct_date_order_is_silent(collector):
    check_date_order(date(2024, 1, 10), date(2024, 4, 18), collector)
    assert collector.findings == []


# ------------------------------------------------------------------- text ---


def test_double_encoded_entities_are_decoded(collector):
    assert clean_text("Q&amp;amp;A on Nitrosamines", "title", collector=collector) == (
        "Q&A on Nitrosamines"
    )


def test_mojibake_is_repaired(collector):
    assert clean_text("Revision 18 â€” final", "title", collector=collector) == (
        "Revision 18 — final"
    )
    assert clean_text("qualitÃ©", "title", collector=collector) == "qualité"


def test_html_is_stripped_but_content_survives(collector):
    result = clean_text("<p>Updated <strong>limits</strong></p>", "summary", collector=collector)
    assert result == "Updated limits"
    assert FlagIssue.MALFORMED_TEXT in issues(collector)


def test_markup_only_text_becomes_none_and_is_flagged(collector):
    assert clean_text("<div class='t'>   </div>", "title", collector=collector) is None
    assert FlagIssue.MALFORMED_TEXT in issues(collector)


def test_truncation_marker_is_detected(collector):
    clean_text("Distributors must quarantine… [truncated]", "summary", collector=collector)
    assert FlagIssue.TRUNCATED_CONTENT in issues(collector)


def test_clean_text_raises_no_flag_on_clean_input(collector):
    assert clean_text("Perfectly ordinary title", "title", collector=collector) == (
        "Perfectly ordinary title"
    )
    assert collector.findings == []


# ------------------------------------------------------------------ enums ---


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Active", DirectiveStatus.ACTIVE),
        ("In Force", DirectiveStatus.ACTIVE),
        ("withdrawn", DirectiveStatus.CLOSED),
        ("Consultation", DirectiveStatus.DRAFT),
    ],
)
def test_known_directive_statuses_map_cleanly(raw, expected, collector):
    assert coerce_directive_status(raw, collector) == expected
    assert collector.findings == []


def test_unknown_directive_status_survives_as_unknown(collector):
    result = coerce_directive_status("PARTIALLY_RESCINDED_SEE_ANNEX_C", collector)
    assert result == DirectiveStatus.UNKNOWN
    assert FlagIssue.UNKNOWN_ENUM_VALUE in issues(collector)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("URGENT!!!", Priority.HIGH),
        ("P1", Priority.CRITICAL),
        ("p0", Priority.CRITICAL),
        ("med", Priority.MEDIUM),
    ],
)
def test_messy_priorities_are_coerced(raw, expected, collector):
    assert coerce_priority(raw, collector) == expected


def test_regression_pending_is_a_real_status_not_a_null(collector):
    """Guards the bug documented in NOTES.md.

    'pending' and 'unknown' are null-ish only in a DATE column. If they leak into
    the global null vocabulary, a correctly-supplied status gets a false
    'value was empty' flag — silently accepting corrupt logic.
    """
    assert coerce_action_status("Pending", collector) == ActionItemStatus.PENDING
    assert coerce_action_status("pending", collector) == ActionItemStatus.PENDING
    assert collector.findings == []

    assert coerce_directive_status("Unknown", collector) == DirectiveStatus.UNKNOWN
    # Flagged as an unrecognised vocabulary word, never as a missing value.
    assert FlagIssue.MISSING_REQUIRED_DATE not in issues(collector)


def test_genuinely_empty_action_status_defaults_to_pending(collector):
    assert coerce_action_status("", collector) == ActionItemStatus.PENDING
    assert FlagIssue.UNKNOWN_ENUM_VALUE in issues(collector)


def test_unrecognised_action_status_never_defaults_to_resolved(collector):
    """Failing open to RESOLVED would silently mark compliance work as done."""
    assert coerce_action_status("¯\\_(ツ)_/¯", collector) == ActionItemStatus.PENDING


# ----------------------------------------------------- cross-record checks --


def test_closed_directive_with_open_items_is_critical(collector):
    check_status_consistency(
        DirectiveStatus.CLOSED,
        [ActionItemStatus.PENDING, ActionItemStatus.BLOCKED, ActionItemStatus.RESOLVED],
        collector,
    )
    assert FlagIssue.CONFLICTING_STATUS in issues(collector)
    assert collector.findings[0].severity == FlagSeverity.CRITICAL


def test_closed_directive_with_all_work_done_is_consistent(collector):
    check_status_consistency(
        DirectiveStatus.CLOSED,
        [ActionItemStatus.RESOLVED, ActionItemStatus.DISMISSED],
        collector,
    )
    assert collector.findings == []


def test_draft_directive_with_resolved_work_is_flagged(collector):
    check_status_consistency(
        DirectiveStatus.DRAFT, [ActionItemStatus.RESOLVED], collector
    )
    assert FlagIssue.CONFLICTING_STATUS in issues(collector)


def test_duplicate_reference_code_keeps_both_and_flags(collector):
    seen: dict[str, int] = {}
    check_reference_code("FDA-2024-N-0117", seen, collector)
    assert collector.findings == []

    check_reference_code("fda-2024-n-0117", seen, collector)  # case-insensitive
    assert FlagIssue.DUPLICATE_REFERENCE_CODE in issues(collector)


def test_missing_reference_code_is_flagged(collector):
    check_reference_code(None, {}, collector)
    assert FlagIssue.MISSING_REFERENCE_CODE in issues(collector)


# --------------------------------------------------------- triage workflow --


def test_pending_to_resolved_is_allowed():
    assert is_allowed(ActionItemStatus.PENDING, ActionItemStatus.RESOLVED)


def test_blocked_cannot_be_resolved_directly():
    assert not is_allowed(ActionItemStatus.BLOCKED, ActionItemStatus.RESOLVED)
    reason = rejection_reason(ActionItemStatus.BLOCKED, ActionItemStatus.RESOLVED)
    assert "blocked" in reason.lower()


def test_resolved_reopens_only_into_review():
    assert is_allowed(ActionItemStatus.RESOLVED, ActionItemStatus.IN_REVIEW)
    assert not is_allowed(ActionItemStatus.RESOLVED, ActionItemStatus.PENDING)


def test_rejection_reason_is_written_for_a_human():
    reason = rejection_reason(ActionItemStatus.RESOLVED, ActionItemStatus.RESOLVED)
    assert reason == "This item is already Resolved."
