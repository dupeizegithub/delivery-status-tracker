from datetime import datetime
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .db import get_pool
from .lifecycle import allowed_next, is_valid_transition

StatusLiteral = Literal[
    "created", "picked_up", "in_transit", "delivered", "failed"
]


class StatusUpdate(BaseModel):
    status: StatusLiteral = Field(description="Target lifecycle status")


class ShipmentOut(BaseModel):
    reference: str
    customer_name: str
    status: StatusLiteral
    created_at: datetime
    updated_at: datetime
    allowed_next: list[StatusLiteral]


class StatusEventOut(BaseModel):
    from_status: StatusLiteral | None
    to_status: StatusLiteral
    occurred_at: datetime


app = FastAPI(title="Delivery Status Tracker API")

# Browser traffic from the React app is same-origin via the Vite /api proxy,
# so CORS is not required for the demo UI path. It stays enabled for callers
# that hit the API on :8001 from another origin (e.g. a separately hosted
# frontend during live extension).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SHIPMENT_COLUMNS = "reference, customer_name, status, created_at, updated_at"


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/shipments", response_model=list[ShipmentOut])
def list_shipments(status: StatusLiteral | None = None):
    """List shipments. Optional `status` query filters server-side; the UI
    also filters client-side so chip counts stay live as rows change."""
    with get_pool().connection() as conn:
        if status is None:
            rows = conn.execute(
                f"SELECT {SHIPMENT_COLUMNS} FROM shipments ORDER BY reference"
            ).fetchall()
        else:
            rows = conn.execute(
                f"SELECT {SHIPMENT_COLUMNS} FROM shipments "
                "WHERE status = %s ORDER BY reference",
                (status,),
            ).fetchall()
    return [_serialize(r) for r in rows]


@app.get(
    "/api/shipments/{reference}/events",
    response_model=list[StatusEventOut],
    responses={404: {"description": "Shipment reference not found"}},
)
def list_status_events(reference: str):
    with get_pool().connection() as conn:
        row = conn.execute(
            "SELECT id FROM shipments WHERE reference = %s", (reference,)
        ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=404, detail=f"Shipment '{reference}' not found."
            )
        (shipment_id,) = row
        # Tie-break on id so seed rows that share the same now() stay ordered.
        events = conn.execute(
            """
            SELECT from_status, to_status, occurred_at
            FROM shipment_status_events
            WHERE shipment_id = %s
            ORDER BY occurred_at, id
            """,
            (shipment_id,),
        ).fetchall()
    return [
        {
            "from_status": from_status,
            "to_status": to_status,
            "occurred_at": occurred_at,
        }
        for from_status, to_status, occurred_at in events
    ]


@app.patch(
    "/api/shipments/{reference}/status",
    response_model=ShipmentOut,
    responses={
        404: {"description": "Shipment reference not found"},
        409: {
            "description": (
                "Invalid lifecycle transition, or a concurrent update "
                "changed the current status"
            )
        },
    },
)
def update_status(reference: str, body: StatusUpdate):
    target = body.status

    with get_pool().connection() as conn:
        row = conn.execute(
            "SELECT id, status FROM shipments WHERE reference = %s", (reference,)
        ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=404, detail=f"Shipment '{reference}' not found."
            )
        shipment_id, current = row

        if not is_valid_transition(current, target):
            raise HTTPException(status_code=409, detail=_transition_error(current, target))

        # The status predicate doubles as an optimistic lock: if a concurrent
        # request already moved this shipment on, we match zero rows instead
        # of silently overwriting its transition.
        updated = conn.execute(
            """
            UPDATE shipments
            SET status = %s, updated_at = now()
            WHERE id = %s AND status = %s
            RETURNING reference, customer_name, status, created_at, updated_at
            """,
            (target, shipment_id, current),
        ).fetchone()
        if updated is None:
            # Raising inside the `connection()` block rolls the transaction back.
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Shipment '{reference}' was updated concurrently. "
                    "Retry with the latest status."
                ),
            )

        # Same transaction as the UPDATE: on the status-update path, history
        # and current status cannot drift apart.
        conn.execute(
            """
            INSERT INTO shipment_status_events (shipment_id, from_status, to_status)
            VALUES (%s, %s, %s)
            """,
            (shipment_id, current, target),
        )

    return _serialize(updated)


def _transition_error(current: str, target: str) -> str:
    nexts = allowed_next(current)
    if not nexts:
        return (
            f"Cannot change status of a shipment that is '{current}': "
            "it is a terminal state."
        )
    return (
        f"Cannot transition from '{current}' to '{target}'. "
        f"Allowed next status(es): {', '.join(nexts)}."
    )


def _serialize(row) -> dict:
    reference, customer_name, status, created_at, updated_at = row
    return {
        "reference": reference,
        "customer_name": customer_name,
        "status": status,
        "created_at": created_at,
        "updated_at": updated_at,
        # The UI renders its action buttons from this, so the transition
        # rules live in exactly one place (this backend module).
        "allowed_next": allowed_next(status),
    }
