"""
Phase 5: Achievement API routes.

Endpoints:
    GET /api/achievements   — list all achievements with the user's unlock status

How achievements get checked:
    When the user saves progress (PUT /api/progress), routes.py calls
    trigger_achievement_check() below. That function runs all the check
    functions from achievements.py against the user's current progress,
    saves any newly earned ones to the DB, and returns their IDs so the
    frontend can fire toast notifications.

    The GET endpoint is for loading the full achievements list — e.g.
    to display a progress panel or a "how many have I earned?" summary.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .models import User, VisitedStation, RiddenService, UserAchievement
from .routes import get_client_ip, hash_ip
from .achievements import ACHIEVEMENTS, ACHIEVEMENT_BY_ID, check_all_achievements


achievements_router = APIRouter(prefix="/api/achievements")


# ── Response schemas ──────────────────────────────────────────────────────

class AchievementInfo(BaseModel):
    """Shape of a single achievement in the API response."""
    id: str
    name: str
    description: str
    category: str
    unlocked_at: datetime | None  # None = still locked


class AchievementsResponse(BaseModel):
    """Full achievements list for the current user."""
    achievements: list[AchievementInfo]
    total_unlocked: int
    total: int


# ── Routes ────────────────────────────────────────────────────────────────

@achievements_router.get("", response_model=AchievementsResponse)
async def get_achievements(request: Request, db: AsyncSession = Depends(get_db)):
    """Return every achievement with the user's unlock status.

    Unlocked achievements include the timestamp they were earned.
    Locked achievements are included with unlocked_at=None — the
    frontend decides whether to show or hide them.
    """
    ip_h = hash_ip(get_client_ip(request))
    result = await db.execute(select(User).where(User.ip_hash == ip_h))
    user = result.scalar_one_or_none()

    # Build a map of achievement_id → unlocked_at from the DB
    unlocked: dict[str, datetime] = {}
    if user is not None:
        rows = await db.execute(
            select(UserAchievement).where(UserAchievement.user_id == user.id)
        )
        for row in rows.scalars():
            unlocked[row.achievement_id] = row.unlocked_at

    achievements = [
        AchievementInfo(
            id=a.id,
            name=a.name,
            description=a.description,
            category=a.category,
            unlocked_at=unlocked.get(a.id),
        )
        for a in ACHIEVEMENTS
    ]

    return AchievementsResponse(
        achievements=achievements,
        total_unlocked=len(unlocked),
        total=len(ACHIEVEMENTS),
    )


# ── Trigger (called from routes.py) ──────────────────────────────────────

async def trigger_achievement_check(db: AsyncSession, user_id: int) -> list[str]:
    """Check all achievements for the given user and save any new unlocks.

    Called from routes.py immediately after PUT /api/progress commits.
    Returns a list of newly-unlocked achievement IDs so the frontend
    can display toast notifications for each one.

    Args:
        db:      the active database session
        user_id: the user's database ID (not ip_hash)

    Returns:
        List of achievement IDs that were newly earned this request.
        Empty list if nothing new was unlocked.
    """
    # Load the user's current progress
    stations_result = await db.execute(
        select(VisitedStation.station_id).where(VisitedStation.user_id == user_id)
    )
    visited = set(stations_result.scalars().all())

    services_result = await db.execute(
        select(RiddenService.service_id).where(RiddenService.user_id == user_id)
    )
    ridden = set(services_result.scalars().all())

    # Run all check functions
    earned_ids = check_all_achievements(visited, ridden)

    # Find which achievements are already saved for this user
    existing_result = await db.execute(
        select(UserAchievement.achievement_id).where(UserAchievement.user_id == user_id)
    )
    already_saved = set(existing_result.scalars().all())

    # Persist any newly earned ones
    newly_unlocked = []
    for ach_id in earned_ids:
        if ach_id not in already_saved:
            db.add(UserAchievement(user_id=user_id, achievement_id=ach_id))
            newly_unlocked.append(ach_id)

    if newly_unlocked:
        await db.commit()

    return newly_unlocked
