"""
Database setup using SQLAlchemy 2.0 async engine.

Architecture notes:
- We use SQLAlchemy's async ORM so the FastAPI endpoints can `await`
  database calls without blocking the event loop.
- For development, the engine connects to a local SQLite file via
  aiosqlite. For production, swap the URL to a PostgreSQL connection
  string (e.g. "postgresql+asyncpg://user:pass@localhost/subwaytracker").
  That's the only change needed — all models and queries stay the same.
- `async_sessionmaker` creates sessions that are used as async context
  managers in the route handlers.

SQLite vs PostgreSQL:
  SQLite stores everything in a single file (subway_tracker.db). It's
  great for development but has limited concurrency — only one write at
  a time. PostgreSQL handles concurrent writes from many users, which
  is why we'll switch for production. The SQLAlchemy ORM abstracts this
  difference away entirely.
"""

import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

# Default to SQLite file in the backend directory.
# Override with DATABASE_URL env var for PostgreSQL in production.
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite+aiosqlite:///./subway_tracker.db"
)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Set True to log all SQL queries (useful for learning)
)

# async_sessionmaker creates a factory for AsyncSession instances.
# Each API request gets its own session via the get_db() dependency.
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base class for all ORM models. SQLAlchemy uses this to track
    which tables exist and generate CREATE TABLE statements."""
    pass


async def init_db():
    """Create all tables that don't exist yet.
    Called once at app startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    """FastAPI dependency that yields a database session.

    Usage in a route:
        @router.get("/example")
        async def example(db: AsyncSession = Depends(get_db)):
            result = await db.execute(select(User))
            ...

    The session is automatically closed after the request finishes,
    even if an error occurs (thanks to the try/finally pattern).
    """
    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
