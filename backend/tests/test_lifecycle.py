"""Unit tests for the status lifecycle rules (pure, no DB needed)."""

import pytest

from app.lifecycle import STATUSES, allowed_next, is_valid_transition

VALID = [
    ("created", "picked_up"),
    ("picked_up", "in_transit"),
    ("in_transit", "delivered"),
    ("created", "failed"),
    ("picked_up", "failed"),
    ("in_transit", "failed"),
]


@pytest.mark.parametrize("current,target", VALID)
def test_valid_transitions(current, target):
    assert is_valid_transition(current, target)


@pytest.mark.parametrize(
    "current,target",
    [
        # Every (current, target) pair that is not explicitly allowed must be
        # rejected: skipping ahead, going backwards, no-ops, out of terminals.
        (c, t)
        for c in STATUSES
        for t in STATUSES
        if (c, t) not in VALID
    ],
)
def test_invalid_transitions(current, target):
    assert not is_valid_transition(current, target)


def test_terminal_states_have_no_next():
    assert allowed_next("delivered") == []
    assert allowed_next("failed") == []


def test_allowed_next_from_created():
    assert allowed_next("created") == ["picked_up", "failed"]


def test_transition_table_covers_every_status():
    """Adding a status to STATUSES without a transitions entry would make
    that status silently look terminal (allowed_next → [])."""
    from app.lifecycle import ALLOWED_TRANSITIONS

    assert set(ALLOWED_TRANSITIONS) == set(STATUSES)
