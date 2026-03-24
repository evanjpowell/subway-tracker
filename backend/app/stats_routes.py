"""
Phase 4: Statistics API routes.

These endpoints call the computation functions in stats.py and return
the results as JSON. The existing /api/stats/global in routes.py still
works — these are additional, more detailed stats endpoints.

New endpoints to implement:
    GET /api/stats/me          — personalized stats for the current user
    GET /api/stats/boroughs    — borough breakdown for the current user
    GET /api/stats/lines       — line completion for the current user

All endpoints identify the user by IP hash (same pattern as routes.py).
"""

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .models import User, VisitedStation, RiddenService
from .routes import get_client_ip, hash_ip
from .stats import (
    compute_percentile,
    compute_borough_counts,
    compute_line_completion,
    compute_global_comparison,
    TOTAL_STATIONS,
    TOTAL_SERVICES,
)

stats_router = APIRouter(prefix="/api/stats")


# ── Response schemas ─────────────────────────────────────────────────────
# Define the shape of each endpoint's JSON response here.
# FastAPI uses these for validation and auto-generated docs at /docs.

class MyStatsResponse(BaseModel):
    """Personalized stats for the current user."""
    stations_visited: int
    stations_total: int
    services_ridden: int
    services_total: int
    percentile: float
    global_avg: float
    global_median: int
    total_users: int
    # TODO: Add more fields as you implement more stats


class BoroughStatsResponse(BaseModel):
    """Per-borough station counts for the current user."""
    boroughs: dict[str, dict]
    # e.g. {"Manhattan": {"visited": 42, "total": 151}, ...}


class LineStatsResponse(BaseModel):
    """Per-service line completion for the current user."""
    lines: list[dict]
    # e.g. [{"service": "1", "visited": 12, "total": 38, "complete": false}, ...]
    lines_completed: int


# ── Helper ───────────────────────────────────────────────────────────────

async def get_user_counts(db: AsyncSession, ip_hash: str) -> tuple[int | None, int, int]:
    """Get the user's ID, station count, and service count.

    Returns (user_id, station_count, service_count).
    user_id is None if the user doesn't exist yet.
    """
    result = await db.execute(select(User).where(User.ip_hash == ip_hash))
    user = result.scalar_one_or_none()

    if user is None:
        return None, 0, 0

    stations_result = await db.execute(
        select(func.count()).where(VisitedStation.user_id == user.id)
    )
    station_count = stations_result.scalar() or 0

    services_result = await db.execute(
        select(func.count()).where(RiddenService.user_id == user.id)
    )
    service_count = services_result.scalar() or 0

    return user.id, station_count, service_count


# ── Routes ───────────────────────────────────────────────────────────────

@stats_router.get("/me", response_model=MyStatsResponse)
async def get_my_stats(request: Request, db: AsyncSession = Depends(get_db)):
    """Personalized stats dashboard for the current user.

    This is the main stats endpoint — it returns everything the frontend
    needs to show the user how they compare to everyone else.
    """
    ip_h = hash_ip(get_client_ip(request))
    user_id, station_count, service_count = await get_user_counts(db, ip_h)

    # TODO: Call your stats functions here!
    comparison = await compute_global_comparison(db, station_count)

    return MyStatsResponse(
        stations_visited=station_count,
        stations_total=TOTAL_STATIONS,
        services_ridden=service_count,
        services_total=TOTAL_SERVICES,
        percentile=comparison["percentile"],
        global_avg=comparison["global_avg"],
        global_median=comparison["global_median"],
        total_users=comparison["total_users"],
    )


@stats_router.get("/boroughs", response_model=BoroughStatsResponse)
async def get_borough_stats(request: Request, db: AsyncSession = Depends(get_db)):
    """Per-borough breakdown for the current user."""
    ip_h = hash_ip(get_client_ip(request))
    user_id, _, _ = await get_user_counts(db, ip_h)

    if user_id is None:
        boroughs = await compute_borough_counts(db, -1)
    else:
        boroughs = await compute_borough_counts(db, user_id)

    return BoroughStatsResponse(boroughs=boroughs)


@stats_router.get("/lines", response_model=LineStatsResponse)
async def get_line_stats(request: Request, db: AsyncSession = Depends(get_db)):
    """Per-service line completion for the current user."""
    ip_h = hash_ip(get_client_ip(request))
    user_id, _, _ = await get_user_counts(db, ip_h)

    if user_id is None:
        lines = await compute_line_completion(db, -1)
    else:
        lines = await compute_line_completion(db, user_id)

    lines_completed = sum(1 for line in lines if line.get("complete", False))

    return LineStatsResponse(lines=lines, lines_completed=lines_completed)
