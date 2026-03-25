"""
API routes for the subway tracker.

Endpoints:
  GET  /api/progress         — get current user's visited stations + ridden services
  PUT  /api/progress         — replace current user's full progress (stations + services)
  GET  /api/stats/global     — aggregated stats across all users

User identification:
  Every request is tied to a user via their IP hash. The `get_or_create_user()`
  helper hashes the client IP with SHA-256 and either finds the existing user
  row or creates a new one. This means:
    - No sign-up required — just visit the site and your progress is saved.
    - Switching networks (e.g. home WiFi → phone data) creates a new "user."
    - This is the MVP approach. Phase 5+ will add optional sign-in for
      cross-device sync.

Why PUT instead of PATCH for progress?
  The frontend maintains the complete set of visited stations and ridden
  services in React state. On every toggle, it sends the entire set to the
  server. This is simpler than tracking individual add/remove operations
  and avoids sync issues. With 446 stations max, the payload is tiny
  (a few KB of JSON).
"""

import hashlib
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from .database import get_db
from .models import User, VisitedStation, RiddenService

router = APIRouter(prefix="/api")


# ── Pydantic schemas ─────────────────────────────────────────────────────
# These define the shape of request/response JSON bodies.
# FastAPI automatically validates incoming data against these schemas
# and generates OpenAPI docs from them.

class ProgressData(BaseModel):
    """What the frontend sends when saving progress."""
    visited_stations: list[str]
    ridden_services: list[str]


class ProgressResponse(BaseModel):
    """What the frontend receives when loading progress."""
    visited_stations: list[str]
    ridden_services: list[str]


class GlobalStats(BaseModel):
    """Aggregated stats across all users."""
    total_users: int
    avg_stations_visited: float
    avg_services_ridden: float
    # Distribution: how many users have visited N stations
    # e.g. {"0-10": 45, "11-50": 30, "51-100": 12, ...}
    stations_distribution: dict[str, int]


# ── Helpers ──────────────────────────────────────────────────────────────

def hash_ip(ip: str) -> str:
    """SHA-256 hash of the client IP.

    Why hash instead of storing raw?
    IP addresses are personal data under GDPR and similar regulations.
    Hashing lets us identify returning users without storing their actual
    IP. The hash is one-way — you can't reverse it to get the IP back.
    """
    return hashlib.sha256(ip.encode()).hexdigest()


def get_client_ip(request: Request) -> str:
    """Extract the real client IP from the request.

    Behind a reverse proxy (nginx), the actual client IP is in the
    X-Forwarded-For header. The `request.client.host` would just be
    127.0.0.1 (the proxy's IP). We check X-Forwarded-For first.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
        # The first one is the original client.
        return forwarded.split(",")[0].strip()
    return request.client.host


async def get_or_create_user(db: AsyncSession, ip_hash: str) -> User:
    """Find an existing user by IP hash, or create a new one.

    This is called on every API request. If the user already exists,
    we update their last_active timestamp.
    """
    result = await db.execute(select(User).where(User.ip_hash == ip_hash))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(ip_hash=ip_hash)
        db.add(user)
        await db.flush()  # assigns user.id without committing the transaction
    return user


# ── Routes ───────────────────────────────────────────────────────────────

@router.get("/progress", response_model=ProgressResponse)
async def get_progress(request: Request, db: AsyncSession = Depends(get_db)):
    """Load the current user's saved progress.

    Called by the frontend on page load to restore visited stations
    and ridden services from the server.
    """
    ip = get_client_ip(request)
    ip_h = hash_ip(ip)

    result = await db.execute(select(User).where(User.ip_hash == ip_h))
    user = result.scalar_one_or_none()

    if user is None:
        return ProgressResponse(visited_stations=[], ridden_services=[])

    # Fetch all visited station IDs for this user
    stations_result = await db.execute(
        select(VisitedStation.station_id).where(VisitedStation.user_id == user.id)
    )
    stations = [row[0] for row in stations_result.all()]

    # Fetch all ridden service IDs for this user
    services_result = await db.execute(
        select(RiddenService.service_id).where(RiddenService.user_id == user.id)
    )
    services = [row[0] for row in services_result.all()]

    return ProgressResponse(visited_stations=stations, ridden_services=services)


@router.put("/progress", response_model=ProgressResponse)
async def save_progress(
    request: Request,
    data: ProgressData,
    db: AsyncSession = Depends(get_db),
):
    """Save the current user's full progress.

    Strategy: delete all existing rows for this user and re-insert.
    This is simpler than diffing and means the server always matches
    exactly what the frontend has. With at most ~446 stations + 27
    services, this is fast even on SQLite.

    Why delete-and-reinsert instead of diffing?
      Diffing (figuring out which stations were added vs removed) adds
      complexity and potential for sync bugs. Since the total data per
      user is small (< 500 rows), replacing everything is fast and
      guarantees consistency.
    """
    ip = get_client_ip(request)
    ip_h = hash_ip(ip)

    user = await get_or_create_user(db, ip_h)

    # Clear existing progress
    await db.execute(
        delete(VisitedStation).where(VisitedStation.user_id == user.id)
    )
    await db.execute(
        delete(RiddenService).where(RiddenService.user_id == user.id)
    )

    # Insert new progress
    for station_id in data.visited_stations:
        db.add(VisitedStation(user_id=user.id, station_id=station_id))

    for service_id in data.ridden_services:
        db.add(RiddenService(user_id=user.id, service_id=service_id))

    await db.commit()

    # Phase 5: Check for newly unlocked achievements after every save.
    # Uncomment this when you're ready to implement achievement logic!
    # The returned list of IDs can be added to the response so the
    # frontend can fire a toast for each newly unlocked achievement.
    #
    # from .achievement_routes import trigger_achievement_check
    # newly_unlocked = await trigger_achievement_check(db, user.id)

    return ProgressResponse(
        visited_stations=data.visited_stations,
        ridden_services=data.ridden_services,
    )


@router.get("/stats/global", response_model=GlobalStats)
async def get_global_stats(db: AsyncSession = Depends(get_db)):
    """Aggregated statistics across all users.

    Used by the frontend to show "you've visited more stations than
    X% of users" comparisons.

    The SQL here demonstrates why we chose junction tables over JSON
    columns — these aggregations are simple SELECT queries, not
    application-level JSON parsing.
    """
    # Total users
    total_result = await db.execute(select(func.count(User.id)))
    total_users = total_result.scalar() or 0

    if total_users == 0:
        return GlobalStats(
            total_users=0,
            avg_stations_visited=0.0,
            avg_services_ridden=0.0,
            stations_distribution={},
        )

    # Average stations visited per user
    # Subquery: count of stations per user
    stations_per_user = (
        select(
            VisitedStation.user_id,
            func.count(VisitedStation.station_id).label("cnt"),
        )
        .group_by(VisitedStation.user_id)
        .subquery()
    )
    avg_stations_result = await db.execute(
        select(func.avg(stations_per_user.c.cnt))
    )
    avg_stations = avg_stations_result.scalar() or 0.0

    # Average services ridden per user
    services_per_user = (
        select(
            RiddenService.user_id,
            func.count(RiddenService.service_id).label("cnt"),
        )
        .group_by(RiddenService.user_id)
        .subquery()
    )
    avg_services_result = await db.execute(
        select(func.avg(services_per_user.c.cnt))
    )
    avg_services = avg_services_result.scalar() or 0.0

    # Distribution: bucket users by station count
    # Buckets: 0, 1-10, 11-50, 51-100, 101-200, 201-300, 301-400, 401-446
    all_counts_result = await db.execute(
        select(stations_per_user.c.cnt)
    )
    counts = [row[0] for row in all_counts_result.all()]

    # Include users with 0 stations (they exist in users table but not in visited_stations)
    users_with_stations = len(counts)
    zero_count = total_users - users_with_stations
    if zero_count > 0:
        counts.extend([0] * zero_count)

    buckets = {"0": 0, "1-10": 0, "11-50": 0, "51-100": 0,
               "101-200": 0, "201-300": 0, "301-400": 0, "401-446": 0}
    for c in counts:
        if c == 0:
            buckets["0"] += 1
        elif c <= 10:
            buckets["1-10"] += 1
        elif c <= 50:
            buckets["11-50"] += 1
        elif c <= 100:
            buckets["51-100"] += 1
        elif c <= 200:
            buckets["101-200"] += 1
        elif c <= 300:
            buckets["201-300"] += 1
        elif c <= 400:
            buckets["301-400"] += 1
        else:
            buckets["401-446"] += 1

    return GlobalStats(
        total_users=total_users,
        avg_stations_visited=round(avg_stations, 1),
        avg_services_ridden=round(avg_services, 1),
        stations_distribution=buckets,
    )
