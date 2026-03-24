/**
 * API client for the subway tracker backend.
 *
 * How this works:
 * The frontend talks to a FastAPI backend that stores progress in a
 * database. The user is identified by their IP address (hashed server-
 * side), so no login is required.
 *
 * During development, the Vite dev server runs on :5173 and the FastAPI
 * server on :8000. Vite's proxy config (in vite.config.js) forwards
 * /api/* requests to the backend, so we can use relative URLs here.
 *
 * In production, nginx serves everything — static files and API — from
 * the same origin, so relative URLs work there too.
 *
 * Fallback:
 * If the API is unreachable (server down, offline, etc.), the caller
 * falls back to cookie-based storage. This is handled in App.jsx.
 */

const API_BASE = '/api'

/**
 * Load the current user's progress from the server.
 * Returns { visited_stations: string[], ridden_services: string[] }
 * Throws on network/server errors.
 */
export async function fetchProgress() {
  const res = await fetch(`${API_BASE}/progress`)
  if (!res.ok) {
    throw new Error(`Failed to fetch progress: ${res.status}`)
  }
  return res.json()
}

/**
 * Save the current user's full progress to the server.
 * Sends the complete set of visited stations and ridden services.
 * Returns the saved data as confirmation.
 * Throws on network/server errors.
 */
export async function saveProgress(visitedStations, riddenServices) {
  const res = await fetch(`${API_BASE}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visited_stations: [...visitedStations],
      ridden_services: [...riddenServices],
    }),
  })
  if (!res.ok) {
    throw new Error(`Failed to save progress: ${res.status}`)
  }
  return res.json()
}

/**
 * Fetch global stats for comparison.
 * Returns { total_users, avg_stations_visited, avg_services_ridden, stations_distribution }
 */
export async function fetchGlobalStats() {
  const res = await fetch(`${API_BASE}/stats/global`)
  if (!res.ok) {
    throw new Error(`Failed to fetch global stats: ${res.status}`)
  }
  return res.json()
}

/**
 * Fetch personalized stats for the current user.
 * Returns { stations_visited, stations_total, services_ridden, services_total,
 *           percentile, global_avg, global_median, total_users }
 */
export async function fetchMyStats() {
  const res = await fetch(`${API_BASE}/stats/me`)
  if (!res.ok) {
    throw new Error(`Failed to fetch my stats: ${res.status}`)
  }
  return res.json()
}

/**
 * Fetch per-borough station breakdown for the current user.
 * Returns { boroughs: { Manhattan: { visited, total }, ... } }
 */
export async function fetchBoroughStats() {
  const res = await fetch(`${API_BASE}/stats/boroughs`)
  if (!res.ok) {
    throw new Error(`Failed to fetch borough stats: ${res.status}`)
  }
  return res.json()
}

/**
 * Fetch per-service line completion for the current user.
 * Returns { lines: [{ service, visited, total, complete }], lines_completed }
 */
export async function fetchLineStats() {
  const res = await fetch(`${API_BASE}/stats/lines`)
  if (!res.ok) {
    throw new Error(`Failed to fetch line stats: ${res.status}`)
  }
  return res.json()
}
