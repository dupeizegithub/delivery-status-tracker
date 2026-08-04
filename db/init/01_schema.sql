-- Delivery Status Tracker — PostgreSQL schema
-- Runs automatically on first container start (docker-entrypoint-initdb.d).

-- Status as a native enum: the database itself rejects unknown values,
-- independent of application code. Declaration order mirrors the lifecycle.
CREATE TYPE shipment_status AS ENUM (
    'created',
    'picked_up',
    'in_transit',
    'delivered',
    'failed'
);

CREATE TABLE shipments (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reference     TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    status        shipment_status NOT NULL DEFAULT 'created',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A row can never claim to have been updated before it was created.
    CONSTRAINT shipments_timestamps_ordered CHECK (updated_at >= created_at)
);

-- Append-only status history (industry-standard "current column + event log"
-- pattern, as used by carrier tracking APIs). shipments.status stays as the
-- fast operational read; every transition also inserts a row here, in the
-- same transaction, so the two can never drift apart.
CREATE TABLE shipment_status_events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id BIGINT NOT NULL REFERENCES shipments (id),
    from_status shipment_status,           -- NULL = initial state (seeded)
    to_status   shipment_status NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- History is always read per shipment, in order.
CREATE INDEX shipment_status_events_by_shipment
    ON shipment_status_events (shipment_id, occurred_at);

-- Transition rules (created -> picked_up -> in_transit -> delivered, failed
-- from any non-delivered state) are enforced in the API layer, where they can
-- return clear errors and be unit-tested. A DB-level trigger would duplicate
-- that logic and is listed under "what I'd do next".
