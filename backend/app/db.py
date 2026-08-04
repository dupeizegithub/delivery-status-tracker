import os

from psycopg_pool import ConnectionPool

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    # Default matches docker-compose; host port 5433 for running outside Docker.
    "postgresql://tracker:tracker@localhost:5433/tracker",
)

# open=False: the pool connects lazily on first use, so importing the app
# (e.g. during test collection) never requires a live database.
pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=10, open=False)


def get_pool() -> ConnectionPool:
    if pool.closed:
        pool.open()
    return pool
