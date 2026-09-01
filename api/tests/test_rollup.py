"""Rollup tests, including SQL/Python parity.

`triage_status` is defined twice — once in Python (app/rollup.py, used to render the
badge) and once in SQL (app/routers/directives.py, used to filter the queue). Two
definitions of the same concept is a bug waiting to happen: if they drift, a
directive can be filtered into a bucket whose badge says something else.

These tests enumerate every combination of action-item statuses up to length 3 and
assert both definitions agree on all of them.
"""

from __future__ import annotations

import itertools
from datetime import date

import pytest
from sqlalchemy import select

from app.db import SessionLocal, engine
from app.models import (
    ActionItem,
    ActionItemStatus,
    Base,
    ComplianceDirective,
    RegulatoryAuthority,
    TriageStatus,
)
from app.rollup import is_overdue, next_due_date, primary_owner, triage_status
from app.routers.directives import _triage_condition


def item(status: ActionItemStatus, **kwargs) -> ActionItem:
    return ActionItem(title="t", status=status, **kwargs)


# ------------------------------------------------------- pure Python rollups --


def test_no_items_is_its_own_state():
    assert triage_status([]) == TriageStatus.NO_ITEMS


def test_all_pending_is_pending():
    assert triage_status([item(ActionItemStatus.PENDING)] * 3) == TriageStatus.PENDING


def test_all_terminal_is_resolved():
    assert (
        triage_status([item(ActionItemStatus.RESOLVED), item(ActionItemStatus.DISMISSED)])
        == TriageStatus.RESOLVED
    )


@pytest.mark.parametrize(
    "statuses",
    [
        [ActionItemStatus.PENDING, ActionItemStatus.IN_REVIEW],
        [ActionItemStatus.PENDING, ActionItemStatus.RESOLVED],
        [ActionItemStatus.BLOCKED],
        [ActionItemStatus.IN_REVIEW, ActionItemStatus.RESOLVED],
    ],
)
def test_mixed_work_is_in_progress(statuses):
    assert triage_status([item(s) for s in statuses]) == TriageStatus.IN_PROGRESS


def test_primary_owner_prefers_the_person_with_open_work():
    items = [
        item(ActionItemStatus.RESOLVED, owner="Closed Carla"),
        item(ActionItemStatus.RESOLVED, owner="Closed Carla"),
        item(ActionItemStatus.PENDING, owner="Open Otto"),
    ]
    assert primary_owner(items) == "Open Otto"


def test_primary_owner_falls_back_when_nothing_is_open():
    items = [item(ActionItemStatus.RESOLVED, owner="Closed Carla")]
    assert primary_owner(items) == "Closed Carla"


def test_primary_owner_is_none_when_unassigned():
    assert primary_owner([item(ActionItemStatus.PENDING)]) is None


def test_next_due_date_ignores_closed_work():
    items = [
        item(ActionItemStatus.RESOLVED, due_date=date(2020, 1, 1)),
        item(ActionItemStatus.PENDING, due_date=date(2030, 1, 1)),
    ]
    assert next_due_date(items) == date(2030, 1, 1)


def test_overdue_only_counts_open_work():
    closed_late = [item(ActionItemStatus.RESOLVED, due_date=date(2020, 1, 1))]
    assert is_overdue(closed_late, today=date(2026, 1, 1)) is False

    open_late = [item(ActionItemStatus.PENDING, due_date=date(2020, 1, 1))]
    assert is_overdue(open_late, today=date(2026, 1, 1)) is True


# --------------------------------------------------------- SQL/Python parity --

ALL_STATUSES = list(ActionItemStatus)

# Every combination of up to three action items, plus the empty case.
COMBINATIONS: list[tuple[ActionItemStatus, ...]] = [()]
for length in (1, 2, 3):
    COMBINATIONS.extend(itertools.combinations_with_replacement(ALL_STATUSES, length))


@pytest.fixture(scope="module")
def seeded_combinations():
    """Build one directive per status combination in an isolated schema."""
    Base.metadata.create_all(engine)
    session = SessionLocal()

    authority = RegulatoryAuthority(
        code="PARITY", name="Parity Test Authority", jurisdiction="Test", region="Test"
    )
    session.add(authority)
    session.flush()

    mapping: dict[int, tuple[ActionItemStatus, ...]] = {}
    for combination in COMBINATIONS:
        directive = ComplianceDirective(
            authority_id=authority.id,
            title=f"parity {combination}",
            raw_payload={},
        )
        session.add(directive)
        session.flush()
        for status in combination:
            session.add(ActionItem(directive_id=directive.id, title="t", status=status))
        mapping[directive.id] = combination

    session.commit()
    yield session, mapping

    # Cascades clean up directives, items and the authority together.
    session.delete(session.get(RegulatoryAuthority, authority.id))
    session.commit()
    session.close()


@pytest.mark.parametrize("target", list(TriageStatus))
def test_sql_filter_matches_python_rollup(seeded_combinations, target):
    session, mapping = seeded_combinations

    matched_in_sql = set(
        session.scalars(
            select(ComplianceDirective.id)
            .where(ComplianceDirective.id.in_(mapping.keys()))
            .where(_triage_condition(target))
        ).all()
    )

    expected_in_python = {
        directive_id
        for directive_id, combination in mapping.items()
        if triage_status([item(s) for s in combination]) == target
    }

    assert matched_in_sql == expected_in_python, (
        f"SQL and Python disagree for {target.value}. "
        f"Only SQL: {matched_in_sql - expected_in_python}. "
        f"Only Python: {expected_in_python - matched_in_sql}."
    )


def test_every_combination_lands_in_exactly_one_bucket(seeded_combinations):
    """The four buckets must partition the space — no gaps, no overlaps."""
    session, mapping = seeded_combinations

    seen: dict[int, list[str]] = {directive_id: [] for directive_id in mapping}
    for target in TriageStatus:
        for directive_id in session.scalars(
            select(ComplianceDirective.id)
            .where(ComplianceDirective.id.in_(mapping.keys()))
            .where(_triage_condition(target))
        ).all():
            seen[directive_id].append(target.value)

    wrong = {k: v for k, v in seen.items() if len(v) != 1}
    assert not wrong, f"Directives matching zero or multiple buckets: {wrong}"
