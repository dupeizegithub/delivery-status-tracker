"""Shipment status lifecycle.

created -> picked_up -> in_transit -> delivered, and `failed` is reachable
from any non-terminal state. `delivered` and `failed` are terminal.

Kept as a pure module (no DB, no framework) so the rules are unit-testable
and reusable by both the API layer and anything else that needs them.
"""

STATUSES = ["created", "picked_up", "in_transit", "delivered", "failed"]

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "created": {"picked_up", "failed"},
    "picked_up": {"in_transit", "failed"},
    "in_transit": {"delivered", "failed"},
    "delivered": set(),
    "failed": set(),
}


def is_valid_transition(current: str, target: str) -> bool:
    return target in ALLOWED_TRANSITIONS.get(current, set())


def allowed_next(current: str) -> list[str]:
    """Valid target statuses from `current`, in lifecycle order."""
    return [s for s in STATUSES if s in ALLOWED_TRANSITIONS.get(current, set())]
