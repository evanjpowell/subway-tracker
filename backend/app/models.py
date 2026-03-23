"""
SQLAlchemy ORM models — the database schema.

Tables:
  users              — one row per anonymous user, identified by IP hash
  visited_stations   — junction table: which stations each user has visited
  ridden_services    — junction table: which services each user has ridden

Design notes:

  IP hashing:
    We store a SHA-256 hash of the user's IP address, not the raw IP.
    This lets us identify returning users without storing personally
    identifiable information. The hash is computed server-side from the
    request's client IP (or X-Forwarded-For behind nginx).

  Why junction tables instead of a JSON column?
    Storing visited stations as a JSON array (e.g. ["1", "42", "305"])
    would be simpler, but it makes global stats queries very hard.
    With a junction table, computing "average number of stations visited
    across all users" is just:
        SELECT AVG(cnt) FROM (
            SELECT COUNT(*) as cnt FROM visited_stations GROUP BY user_id
        )
    With a JSON column you'd need to parse every row. Junction tables
    also give us timestamps per station visit, which could be useful
    for "first visited" stats or activity timelines later.

  Timestamps:
    Every row records when it was created. This lets us build features
    like "stations visited this week" or "most recently visited" later.
"""

from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ip_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_active: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships — lets us do user.visited_stations to get all rows
    visited_stations: Mapped[list["VisitedStation"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    ridden_services: Mapped[list["RiddenService"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class VisitedStation(Base):
    __tablename__ = "visited_stations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    station_id: Mapped[str] = mapped_column(String(10), nullable=False)
    visited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="visited_stations")

    # Each user can only visit a station once (no duplicate rows)
    __table_args__ = (
        UniqueConstraint("user_id", "station_id", name="uq_user_station"),
    )


class RiddenService(Base):
    __tablename__ = "ridden_services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    service_id: Mapped[str] = mapped_column(String(10), nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="ridden_services")

    __table_args__ = (
        UniqueConstraint("user_id", "service_id", name="uq_user_service"),
    )
