-- Load the provided sample data. Runs once, on first start with a fresh
-- volume, right after 01_schema.sql — so seeding is idempotent by
-- construction (re-running the stack never duplicates rows; a full reset is
-- `docker compose down -v`).
COPY shipments (reference, customer_name, status)
FROM '/seed/shipments.csv'
WITH (FORMAT csv, HEADER true);

-- The CSV gives each shipment mid-lifecycle with no history, so record one
-- honest "entered the system at this status" event per shipment
-- (from_status NULL marks it as the initial state, not a transition).
INSERT INTO shipment_status_events (shipment_id, from_status, to_status, occurred_at)
SELECT id, NULL, status, created_at
FROM shipments;
