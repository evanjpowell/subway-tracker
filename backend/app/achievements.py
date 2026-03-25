"""
Phase 5: Achievement definitions and check functions.

Achievements are defined as a list of Achievement objects below.
Each check function receives a user's set of visited station IDs and
ridden service IDs, and returns True if the achievement is earned.

Achievement categories:
  - borough   : Visit at least one station in each borough
  - service   : Ride every subway service
  - terminal  : Reach every terminal (end-of-line) station
  - line      : Complete every station on a specific service line
  - system    : Visit every single station in the system

TODO (Evan): Implement the check_* functions below!

You'll need the mapping constants from stats.py:
    STATION_TO_BOROUGH  — maps station_id → borough name
    SERVICE_TO_STATIONS — maps service_id → list of station_ids

Tips:
  - Start with check_all_services (simplest — it's just a set comparison)
  - Then check_all_boroughs (fill in STATION_TO_BOROUGH in stats.py first)
  - Then the line-completion ones (fill in SERVICE_TO_STATIONS in stats.py first)
  - check_all_terminals requires defining TERMINAL_STATION_IDS below
  - check_all_stations is trivially easy once you're ready for it
"""

from dataclasses import dataclass
from datetime import datetime


BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"]

# All 27 service IDs — matches the ids in src/data/services.js
ALL_SERVICE_IDS = [
    "1", "2", "3", "4", "5", "6", "7",
    "A", "B", "C", "D", "E", "F", "G", "J", "L", "M", "N", "Q", "R", "W", "Z",
    "S-42", "S-FR", "S-RK",
    "SIR",
]


@dataclass(frozen=True)
class Achievement:
    id: str           # Unique slug, e.g. "line-7" or "all-boroughs"
    name: str         # Display name — TBD for most line achievements
    description: str  # Shown as a hint while locked
    category: str     # "borough" | "service" | "terminal" | "line" | "system"


# ── Achievement Registry ──────────────────────────────────────────────────
# All achievements in one place. IDs must be unique — they're stored in the DB.
#
# Line-completion names from SubwayTracker/Achievements/Line-Completion-Achievements.md:
#   7    → International Express  ✓
#   G    → Crosstown              ✓
#   All others → TBD (fill in your names as you decide them!)

ACHIEVEMENTS: list[Achievement] = [

    # ── Milestone achievements ─────────────────────────────────────────────

    Achievement(
        id="all-boroughs",
        name="",  # TODO: pick a name
        description="Visit at least one station in all five boroughs.",
        category="borough",
    ),
    Achievement(
        id="all-services",
        name="",  # TODO: pick a name
        description="Ride all 27 subway services.",
        category="service",
    ),
    Achievement(
        id="all-terminals",
        name="",  # TODO: pick a name
        description="Reach every terminal (end-of-line) station in the system.",
        category="terminal",
    ),
    Achievement(
        id="all-stations",
        name="",  # TODO: pick a name
        description="Visit all 446 stations in the NYC subway system.",
        category="system",
    ),

    # ── Line-completion achievements (one per service) ─────────────────────

    Achievement(id="line-1",    name="", description="Visit every station on the 1 train.",                  category="line"),
    Achievement(id="line-2",    name="", description="Visit every station on the 2 train.",                  category="line"),
    Achievement(id="line-3",    name="", description="Visit every station on the 3 train.",                  category="line"),
    Achievement(id="line-4",    name="", description="Visit every station on the 4 train.",                  category="line"),
    Achievement(id="line-5",    name="", description="Visit every station on the 5 train.",                  category="line"),
    Achievement(id="line-6",    name="", description="Visit every station on the 6 train.",                  category="line"),
    Achievement(id="line-7",    name="International Express", description="Visit every station on the 7 train.", category="line"),
    Achievement(id="line-A",    name="", description="Visit every station on the A train.",                  category="line"),
    Achievement(id="line-B",    name="", description="Visit every station on the B train.",                  category="line"),
    Achievement(id="line-C",    name="", description="Visit every station on the C train.",                  category="line"),
    Achievement(id="line-D",    name="", description="Visit every station on the D train.",                  category="line"),
    Achievement(id="line-E",    name="", description="Visit every station on the E train.",                  category="line"),
    Achievement(id="line-F",    name="", description="Visit every station on the F train.",                  category="line"),
    Achievement(id="line-G",    name="Crosstown",            description="Visit every station on the G train.", category="line"),
    Achievement(id="line-J",    name="", description="Visit every station on the J train.",                  category="line"),
    Achievement(id="line-L",    name="", description="Visit every station on the L train.",                  category="line"),
    Achievement(id="line-M",    name="", description="Visit every station on the M train.",                  category="line"),
    Achievement(id="line-N",    name="", description="Visit every station on the N train.",                  category="line"),
    Achievement(id="line-Q",    name="", description="Visit every station on the Q train.",                  category="line"),
    Achievement(id="line-R",    name="", description="Visit every station on the R train.",                  category="line"),
    Achievement(id="line-W",    name="", description="Visit every station on the W train.",                  category="line"),
    Achievement(id="line-Z",    name="", description="Visit every station on the Z train.",                  category="line"),
    Achievement(id="line-S-42", name="", description="Visit every station on the 42 St Shuttle.",           category="line"),
    Achievement(id="line-S-FR", name="", description="Visit every station on the Franklin Av Shuttle.",     category="line"),
    Achievement(id="line-S-RK", name="", description="Visit every station on the Rockaway Park Shuttle.",   category="line"),
    Achievement(id="line-SIR",  name="", description="Visit every station on the Staten Island Railway.",   category="line"),
]

# Quick lookup by ID — used in achievement_routes.py
ACHIEVEMENT_BY_ID: dict[str, Achievement] = {a.id: a for a in ACHIEVEMENTS}


# ── Terminal station IDs ──────────────────────────────────────────────────
# TODO: Fill in the station IDs of every terminal (end-of-line) station.
# You can find these in subway_station_mapping_2026-01-31.json — look for
# stations that are the first or last stop on a given service.
# Example format: {"123", "456", ...}

TERMINAL_STATION_IDS: set[str] = set()


# ── Check functions ───────────────────────────────────────────────────────
# Each function takes the user's progress and returns True if earned.
# `visited` is a set of station_id strings.
# `ridden`  is a set of service_id strings.
#
# Implement them one at a time, then test via GET /api/achievements.


def check_all_boroughs(visited: set[str]) -> bool:
    """Has the user visited at least one station in each of the 5 boroughs?

    You'll need STATION_TO_BOROUGH from stats.py.
    Hint: for each station the user has visited, look up its borough.
    Build a set of boroughs covered, then check if it has all 5.

    Returns:
        True if all 5 boroughs have at least one visited station.
    """
    # TODO: import STATION_TO_BOROUGH from stats.py and implement this
    return False


def check_all_services(ridden: set[str]) -> bool:
    """Has the user ridden all 27 subway services?

    Hint: this is the simplest check — does `ridden` contain every ID
    in ALL_SERVICE_IDS? One line with set operations.

    Returns:
        True if every service ID appears in `ridden`.
    """
    # TODO: Implement this
    return False


def check_all_terminals(visited: set[str]) -> bool:
    """Has the user visited every terminal (end-of-line) station?

    Fill in TERMINAL_STATION_IDS above first, then check whether
    every ID in that set appears in `visited`.

    Returns:
        True if every terminal station has been visited.
    """
    # TODO: Fill in TERMINAL_STATION_IDS and implement this
    return False


def check_line_complete(service_id: str, visited: set[str]) -> bool:
    """Has the user visited every station on the given service line?

    You'll need SERVICE_TO_STATIONS from stats.py.
    Hint: look up the list of station IDs for `service_id`, then check
    whether all of them are in `visited`.

    Args:
        service_id: e.g. "1", "A", "S-42", "SIR"
        visited:    the user's visited station IDs

    Returns:
        True if every station on the line has been visited.
    """
    # TODO: import SERVICE_TO_STATIONS from stats.py and implement this
    return False


def check_all_stations(visited: set[str], total: int = 446) -> bool:
    """Has the user visited every station in the system?

    Hint: TOTAL_STATIONS in stats.py is 446. Check len(visited) == total.

    Returns:
        True if the user has visited all 446 stations.
    """
    # TODO: Implement this
    return False


# ── Master checker ────────────────────────────────────────────────────────

def check_all_achievements(
    visited: set[str],
    ridden: set[str],
) -> list[str]:
    """Run every achievement check and return the IDs of earned achievements.

    Called by trigger_achievement_check() in achievement_routes.py after
    every progress save. The route compares the result against what's
    already in the DB and records any new unlocks.

    Args:
        visited: set of station_id strings the user has visited
        ridden:  set of service_id strings the user has ridden

    Returns:
        List of achievement IDs that are currently earned. This is the
        full earned set — the caller filters down to newly unlocked ones.
    """
    earned = []

    if check_all_boroughs(visited):
        earned.append("all-boroughs")

    if check_all_services(ridden):
        earned.append("all-services")

    if check_all_terminals(visited):
        earned.append("all-terminals")

    if check_all_stations(visited):
        earned.append("all-stations")

    for svc_id in ALL_SERVICE_IDS:
        if check_line_complete(svc_id, visited):
            earned.append(f"line-{svc_id}")

    return earned
