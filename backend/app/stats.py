"""
Phase 4: Statistics computation functions.

This is YOUR playground, Evan! Each function below is a stub waiting for you
to implement. They're called by the API routes in stats_routes.py.

All functions receive an async SQLAlchemy session (`db`) so you can run
queries against the database. Here's a quick cheat sheet:

    # Run a SELECT and get all rows:
    result = await db.execute(select(VisitedStation).where(...))
    rows = result.all()

    # Scalar (single value):
    result = await db.execute(select(func.count(User.id)))
    count = result.scalar()

    # Subquery pattern (e.g. count per user, then average):
    per_user = (
        select(VisitedStation.user_id, func.count().label("cnt"))
        .group_by(VisitedStation.user_id)
        .subquery()
    )
    avg_result = await db.execute(select(func.avg(per_user.c.cnt)))

Available models (imported below):
    User             — id, ip_hash, created_at, last_active
    VisitedStation   — id, user_id, station_id, visited_at
    RiddenService    — id, user_id, service_id, added_at

Useful SQLAlchemy functions:
    from sqlalchemy import select, func, case, distinct, and_, or_

Tips:
    - Start with the simplest function and test it via the API
    - Use `echo=True` in database.py's create_async_engine() to see the
      generated SQL — great for learning!
    - The station_id values match the keys in subway_station_mapping JSON
    - Service IDs match the ids in src/data/services.js (e.g. "1", "A", "S-42")
"""

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from .models import User, VisitedStation, RiddenService


# ── Constants ────────────────────────────────────────────────────────────

TOTAL_STATIONS = 446
TOTAL_SERVICES = 27

# TODO: You'll need station-to-borough and station-to-service mappings
# for the borough and line-completion stats. A few options:
#   1. Load from the station mapping JSON at startup
#   2. Define as a Python dict here
#   3. Add a new table to the database
#
# For now, here are empty placeholders you can fill in:

STATION_TO_BOROUGH: dict[str, str] = {
    # "1": "Manhattan",
    # "2": "Manhattan",
    # ...
}

STATION_TO_SERVICES: dict[str, list[str]] = {
    # "1": ["1", "2", "3"],   ← services that stop at station 1
    # ...
}

# Which stations belong to each service (for line completion)
SERVICE_TO_STATIONS: dict[str, list[str]] = {
    # "1": ["1", "2", "5", ...],   ← all stations on the 1 train
    # ...
}

BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"]


# ── Stat functions ───────────────────────────────────────────────────────
# Each function computes one stat. They're called from stats_routes.py.
# Implement them one at a time, test via the API, then move to the next!


async def compute_percentile(db: AsyncSession, user_station_count: int) -> float:
    """What percentile is this user in for stations visited?

    Example: if a user has visited more stations than 80% of all users,
    return 80.0.

    Approach hint:
        1. Get the count of stations per user (subquery)
        2. Count how many users have fewer stations than `user_station_count`
        3. Divide by total users → percentile

    Returns:
        A float from 0.0 to 100.0
    """
    # TODO: Implement this
    return 0.0


async def compute_borough_counts(db: AsyncSession, user_id: int) -> dict[str, dict]:
    """How many stations has this user visited in each borough?

    Returns a dict like:
        {
            "Manhattan": {"visited": 42, "total": 151},
            "Brooklyn":  {"visited": 10, "total": 93},
            ...
        }

    You'll need the STATION_TO_BOROUGH mapping filled in first.
    """
    # TODO: Implement this
    return {b: {"visited": 0, "total": 0} for b in BOROUGHS}


async def compute_line_completion(db: AsyncSession, user_id: int) -> list[dict]:
    """For each subway service, how many of its stations has the user visited?

    Returns a list like:
        [
            {"service": "1", "visited": 12, "total": 38, "complete": False},
            {"service": "A", "visited": 44, "total": 44, "complete": True},
            ...
        ]

    You'll need the SERVICE_TO_STATIONS mapping filled in first.
    """
    # TODO: Implement this
    return []


async def compute_global_comparison(db: AsyncSession, user_station_count: int) -> dict:
    """Compare this user's station count to global averages.

    Returns something like:
        {
            "user_count": 42,
            "global_avg": 28.3,
            "global_median": 18,
            "percentile": 72.5,
            "total_users": 150,
        }

    Hint: median is trickier than average in SQL. You might want to:
        - Pull all counts into Python and use statistics.median()
        - Or use a SQL window function (PERCENT_CONT) if on PostgreSQL
        - SQLite doesn't have PERCENT_CONT, so the Python approach is safer
    """
    # TODO: Implement this
    return {
        "user_count": user_station_count,
        "global_avg": 0.0,
        "global_median": 0,
        "percentile": 0.0,
        "total_users": 0,
    }
