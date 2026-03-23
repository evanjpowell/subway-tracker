/**
 * Cookie-based persistence for visited stations and ridden services.
 *
 * How it works:
 * - We store two cookies: `visitedStations` and `riddenServices`.
 * - Each cookie holds a JSON-encoded array of string IDs.
 * - Cookies expire after 1 year and are scoped to `/`.
 *
 * Why cookies (for now)?
 * This is the MVP persistence layer — the same approach the vanilla prototype
 * used. In Phase 3 we'll add a FastAPI backend and switch to server-side
 * storage keyed by IP hash, keeping cookies as an offline fallback.
 */

const ONE_YEAR_MS = 365 * 24 * 3600 * 1000

function setCookie(name, value) {
  const exp = new Date(Date.now() + ONE_YEAR_MS).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${exp};path=/`
}

function getCookie(name) {
  const match = document.cookie
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${name}=`))
  if (!match) return null
  return decodeURIComponent(match.split('=').slice(1).join('='))
}

// ── Visited Stations ────────────────────────────────────────────────────────

export function saveVisitedStations(stationIdSet) {
  setCookie('visitedStations', JSON.stringify([...stationIdSet]))
}

export function loadVisitedStations() {
  try {
    const raw = getCookie('visitedStations')
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch (e) {
    console.warn('Cookie parse error (visitedStations)', e)
    return new Set()
  }
}

// ── Ridden Services ─────────────────────────────────────────────────────────

export function saveRiddenServices(serviceIdSet) {
  setCookie('riddenServices', JSON.stringify([...serviceIdSet]))
}

export function loadRiddenServices() {
  try {
    const raw = getCookie('riddenServices')
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch (e) {
    console.warn('Cookie parse error (riddenServices)', e)
    return new Set()
  }
}
