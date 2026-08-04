"""API tests against the real Postgres from docker-compose.

Each test works on its own throwaway shipment (TEST-... reference) so the
seeded demo data is never touched and tests can run repeatedly.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.db import get_pool
from app.lifecycle import STATUSES
from app.main import app

client = TestClient(app)


@pytest.fixture
def shipment():
    reference = f"TEST-{uuid.uuid4().hex[:8].upper()}"
    with get_pool().connection() as conn:
        conn.execute(
            "INSERT INTO shipments (reference, customer_name, status) "
            "VALUES (%s, 'Test Customer', 'created')",
            (reference,),
        )
    yield reference
    with get_pool().connection() as conn:
        conn.execute(
            "DELETE FROM shipment_status_events WHERE shipment_id = "
            "(SELECT id FROM shipments WHERE reference = %s)",
            (reference,),
        )
        conn.execute("DELETE FROM shipments WHERE reference = %s", (reference,))


def test_list_shipments_includes_status(shipment):
    resp = client.get("/api/shipments")
    assert resp.status_code == 200
    by_ref = {s["reference"]: s for s in resp.json()}
    assert by_ref[shipment]["status"] == "created"
    assert by_ref[shipment]["customer_name"] == "Test Customer"


def test_valid_transition_updates_status_and_history(shipment):
    resp = client.patch(
        f"/api/shipments/{shipment}/status", json={"status": "picked_up"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "picked_up"

    with get_pool().connection() as conn:
        events = conn.execute(
            "SELECT from_status, to_status FROM shipment_status_events e "
            "JOIN shipments s ON s.id = e.shipment_id "
            "WHERE s.reference = %s ORDER BY e.occurred_at",
            (shipment,),
        ).fetchall()
    assert ("created", "picked_up") in events


def test_invalid_transition_is_rejected_with_clear_error(shipment):
    resp = client.patch(
        f"/api/shipments/{shipment}/status", json={"status": "delivered"}
    )
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert "created" in detail and "delivered" in detail
    assert "picked_up" in detail  # the error should point at what IS allowed

    # And the shipment must be untouched.
    listed = {s["reference"]: s for s in client.get("/api/shipments").json()}
    assert listed[shipment]["status"] == "created"


def test_unknown_shipment_404():
    resp = client.patch("/api/shipments/NOPE-1/status", json={"status": "failed"})
    assert resp.status_code == 404


def test_unknown_status_422(shipment):
    resp = client.patch(f"/api/shipments/{shipment}/status", json={"status": "lost"})
    assert resp.status_code == 422


def test_python_statuses_match_postgres_enum():
    """The SQL ENUM and lifecycle.STATUSES must stay in lockstep — two
    layers of validation, one shared vocabulary."""
    with get_pool().connection() as conn:
        rows = conn.execute(
            """
            SELECT e.enumlabel
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'shipment_status'
            ORDER BY e.enumsortorder
            """
        ).fetchall()
    assert [r[0] for r in rows] == STATUSES


def test_openapi_documents_conflict_and_not_found():
    spec = client.get("/openapi.json").json()
    patch = spec["paths"]["/api/shipments/{reference}/status"]["patch"]
    assert "409" in patch["responses"]
    assert "404" in patch["responses"]
    # Status must not be an unconstrained free-form string in the docs.
    dumped = str(spec)
    assert "picked_up" in dumped
    assert '"type": "string"' in dumped or "'type': 'string'" in dumped
