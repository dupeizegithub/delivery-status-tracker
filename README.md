# Delivery Status Tracker

A small end-to-end slice of a delivery-tracking product: a PostgreSQL
database seeded from the provided `shipments.csv`, a FastAPI backend that
enforces the shipment status lifecycle, and a React page to view shipments
and move them through it — all started with one command.

## Run the demo

**Prerequisites:**

- [Docker Desktop](https://www.docker.com/products/docker-desktop/).
  Install it, then **launch the Docker Desktop app and wait until it reports
  "Engine running"** (steady whale icon in the menu bar / system tray) —
  installed but not running is the most common trip-up.
- An internet connection that can reach Docker Hub, PyPI and npm
  (first start only; later starts are fully offline).

Nothing else is needed — no local Python, Node, or PostgreSQL.

```bash
git clone <this-repo>
cd delivery-tracker
docker compose up
```

Built in about 3.5 hours within the brief's timebox (see "What I'd do next"
for what was cut).

The first start downloads base images and installs dependencies — allow a few
minutes. Subsequent starts take seconds. When the log settles, open:

- **Web UI: http://localhost:5174**
- API docs (Swagger): http://localhost:8001/docs

You should see 20 shipments with colored status badges, status filter chips
above the table, a History button per row, and action buttons that move each
shipment through its lifecycle. Status changes apply instantly, without a
page reload; expanding History shows the append-only event timeline.

Run the tests (with the stack up):

```bash
docker compose exec api pytest
```

Reset the demo data back to the original CSV state:

```bash
docker compose down -v && docker compose up
```

### Troubleshooting

- **`unable to get image …: failed to connect to the docker API` /
  `Cannot connect to the Docker daemon`** — Docker Desktop isn't running.
  Start the app and wait for the whale icon to settle, then re-run
  `docker compose up`.
- **A port is already in use** — the demo uses 5174 (web), 8001 (API) and
  5433 (Postgres), chosen to avoid common dev ports. If one still clashes,
  change the left-hand side of the `ports:` mapping in `docker-compose.yml`.
- **First start looks stuck** — it is almost certainly downloading images /
  npm packages. Watch progress with `docker compose logs -f`.
- **Image pulls time out (`TLS handshake timeout`)** — your network cannot
  reach Docker Hub (common behind restrictive networks/firewalls). Connect
  via a network or VPN with unrestricted access and re-run
  `docker compose up`.

## The status lifecycle

```
created ──→ picked_up ──→ in_transit ──→ delivered   (terminal)
   │            │              │
   └────────────┴──────────────┴───→ failed          (terminal)
```

Anything else — skipping ahead, going backwards, leaving a terminal state,
or a same-status no-op — is rejected by the API with `409 Conflict` and an
error that names the allowed next statuses.

## API

- `GET /api/shipments` — all shipments with current status and
  `allowed_next` (the UI renders its buttons from this, so transition rules
  live in exactly one place). Optional `?status=` filters server-side.
- `GET /api/shipments/{reference}/events` — append-only status history for
  one shipment (`from_status` is null for the seeded "entered as" event).
- `PATCH /api/shipments/{reference}/status` with `{"status": "picked_up"}` —
  update a shipment's status.
  - `409` invalid transition (message includes what *is* allowed)
  - `404` unknown reference
  - `422` unknown status value

Try an invalid transition:

```bash
curl -i -X PATCH localhost:8001/api/shipments/TV-1002/status \
  -H 'Content-Type: application/json' -d '{"status":"delivered"}'
```

## Architecture

```
docker compose up
├── db   — postgres:16; schema + CSV seed auto-applied on first start
├── api  — FastAPI (python:3.12); waits for db healthy, exposes /api/health
└── web  — React + Vite; waits for api healthy, then proxies /api
```

## Key decisions

- **Docker Compose for everything.** The brief guarantees nothing about the
  reviewer's machine. All three services run in containers, so the only
  prerequisite is Docker itself. Image tags lock the major line
  (`postgres:16`, `python:3.12-slim`, `node:22-alpine`); patch releases can
  float. Dependency ranges are constrained in `requirements.txt` /
  `package.json` (lockfiles are on the "next" list).
- **Dev-mode containers, deliberately.** The API runs `uvicorn --reload` and
  the web container runs the Vite dev server with sources bind-mounted:
  this demo's stated purpose is to be extended live in the interview, so
  hot reload beats a production build. File watching uses polling
  (`WATCHFILES_FORCE_POLLING` / Vite `usePolling`) so bind-mount edits stay
  reliable under Docker Desktop. Productionizing (multi-stage build, nginx,
  no dev servers) is on the "next" list.
- **Schema owned by SQL, no ORM.** `db/init/*.sql` is the single source of
  truth, applied by the Postgres image's init mechanism; the API uses
  parameterized SQL via psycopg. Two endpoints and five queries don't
  justify an ORM, and the schema stays reviewable in one file.
- **Status is a Postgres `ENUM`**, so the database rejects unknown values
  regardless of application bugs.
- **Status history from day one.** `shipments.status` is the fast
  operational read; every status update also appends to
  `shipment_status_events` in the same transaction (the standard
  "current column + event log" pattern used by carrier tracking APIs).
  That dual-write covers the update path (create/delete are out of scope
  per the brief). Seeded rows get one honest "entered the system at this
  status" event — no invented history. There is no history UI yet, by
  choice: it is the natural next feature to build on this table.
- **Transitions validated in one place** (`backend/app/lifecycle.py`, a pure
  dict — trivially unit-testable). The status *vocabulary* is defended in
  two layers on purpose: a Postgres `ENUM` and the Python `STATUSES` list,
  kept in lockstep by a test. The UI only *renders* what the API says is
  allowed (`allowed_next`), and the update statement's
  `WHERE status = <expected>` doubles as an optimistic lock against
  concurrent updates.
- **Status filter + history (stretch goals).** The UI filters with chips
  (client-side, so counts stay live as rows change); the list API also
  accepts `?status=` for server-side filtering. History is a per-row
  expandable panel backed by `GET .../events` — the event table was written
  from day one, so this was mostly wiring.
- **Uncommon host ports** (5174 / 8001 / 5433) to avoid colliding with
  whatever the reviewer already runs.

### Assumptions (where the brief left room)

- Transitions advance one step at a time; no skipping, no going backwards.
- `delivered` and `failed` are terminal; a same-status update is rejected.
- Shipments are addressed by their business reference (`TV-1001`), not by
  internal ids.
- Invalid transitions are `409 Conflict` (request conflicts with resource
  state); unknown status words are `422`.
- Creating/deleting shipments, auth, and deployment are out of scope per
  the brief.

## Tests

`docker compose exec api pytest` runs (38 cases at last count):

- **Lifecycle unit tests (28)** — every valid transition and every invalid
  `(current, target)` pair by exhaustion, plus assertions that terminal
  states have no next step and that every status has a transitions entry
  (so a forgotten map entry cannot silently look terminal).
- **API tests (10)** — list endpoint; `?status=` filter; history endpoint;
  a valid update (checks the history row is written too); an invalid
  update (409, clear message, state untouched); unknown reference (404);
  unknown status (422); Python `STATUSES` matches the Postgres `ENUM`;
  OpenAPI documents 404/409 for the update endpoint. Tests create and
  clean up their own `TEST-…` shipments, so demo data stays pristine.

## What I'd do next

1. Pagination / search once data volume justifies it.
2. Production build path: multi-stage frontend build behind nginx, uvicorn
   without `--reload`, non-root containers.
3. Commit a `package-lock.json` (npm resolves within pinned ranges today).
4. DB-level guard (trigger) for transitions as defense-in-depth.
5. CI: run pytest + a compose smoke test on every push.

## AI-usage note

**Tools:** Cursor (agent mode) end to end — schema, API, UI, tests, and this
README were AI-generated under close review; I directed the architecture,
challenged designs, and verified everything by running it.

**What the AI got wrong (and how I caught it):**

1. **Its first schema silently lost history** — a single `status` column
   overwritten on every update. Reviewing the schema, I noticed only the
   latest status survived, had it research how carrier tracking systems
   model this, and we adopted the standard "current column + append-only
   event table, written in one transaction" pattern instead.
2. **Its generated tests didn't run** — `ModuleNotFoundError: No module
   named 'app'` at collection, because the container's pytest had no import
   path configured. Caught immediately by actually executing the suite;
   fixed with `pytest.ini` (`pythonpath = .`). Lesson: AI output that
   "looks right" means nothing until it runs.
3. **No timestamp sanity constraint** — nothing stopped `updated_at` from
   preceding `created_at`. I asked for a database-level guard; we added
   `CHECK (updated_at >= created_at)`.
4. **README drifted from reality** — it claimed lifecycle tests were
   "32 cases" (that was the whole suite), said versions were "pinned"
   (they are major-line tags, not digests), and left a CORS comment
   describing cross-origin browser traffic that the Vite proxy had already
   made same-origin. Caught by reading the README against `pytest` output
   and the request path in `api.js`; wording and comments were corrected.
5. **Swagger looked empty while README pointed reviewers at `/docs`** —
   no `response_model`, free-form `status` string, and no 404/409 in the
   OpenAPI surface. Caught by opening `/docs` after the first demo run;
   fixed with `Literal` statuses, response models, and explicit error
   responses.
6. **Startup race and live-edit fragility** — `web` only waited for the
   api *container*, not for uvicorn to accept traffic; `/api/health`
   existed but was unused. Hot reload relied on inotify, which Docker
   Desktop often drops on bind mounts. Caught when reasoning about cold
   start and interview-time edits; fixed with an api healthcheck +
   `service_healthy` dependency, plus polling-based file watchers.
7. **FK defaulted to `NO ACTION` and 409s left the UI stale** — history
   rows blocked a one-step delete (visible in the test fixture), and a
   concurrent 409 only showed an error banner telling the user to reload.
   Caught on review of the schema and the conflict path; switched to
   `ON DELETE CASCADE` and refetch-on-error so the table resyncs without
   a full page reload.
