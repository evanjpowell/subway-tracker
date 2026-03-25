"""
FastAPI application entry point.

Run in development:
    cd backend
    uvicorn app.main:app --reload --port 8000

The app does three things at startup:
  1. Creates database tables if they don't exist (init_db)
  2. Mounts the API routes at /api/*
  3. Configures CORS so the Vite dev server (localhost:5173) can
     make requests to the API (localhost:8000)

In production, nginx serves the React build and proxies /api/* to
uvicorn, so CORS isn't needed. But during development, the frontend
and backend run on different ports, which browsers block by default
unless the server explicitly allows it via CORS headers.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import init_db
from .routes import router
from .stats_routes import stats_router
from .achievement_routes import achievements_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs once at startup (before the yield) and once at shutdown (after).
    We use this to create database tables on first run."""
    await init_db()
    yield


app = FastAPI(
    title="NYC Subway Tracker API",
    description="Backend API for tracking visited subway stations and ridden services.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS: allow the Vite dev server to make API requests.
# In production behind nginx this isn't needed, but it doesn't hurt.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://127.0.0.1:5173",
        "http://localhost:3000",   # common alt port
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all /api/* routes
app.include_router(router)
app.include_router(stats_router)
app.include_router(achievements_router)
