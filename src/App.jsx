import { useState, useEffect, useCallback, useRef } from 'react'
import MapView from './components/MapView'
import StatsPanel from './components/StatsPanel'
import Toast, { useToast } from './components/Toast'
import { TOTAL_SERVICES } from './data/services'
import { fetchProgress, saveProgress } from './utils/api'
import {
  loadVisitedStations,
  saveVisitedStations,
  loadRiddenServices,
  saveRiddenServices,
} from './utils/cookies'

/**
 * App — root component for the NYC Subway Tracker.
 *
 * Persistence strategy:
 *   On mount, we try to load progress from the API (server-side, IP-based).
 *   If the server is unreachable, we fall back to cookies.
 *
 *   On every change, we save to both cookies (instant, offline-safe) and
 *   the API (debounced, server-side). This means:
 *     - If the server goes down, your progress is safe in cookies.
 *     - If you clear cookies, your progress is safe on the server.
 *     - If you switch networks (new IP), you lose server-side data but
 *       cookies still work. (Sign-in will fix this in a future phase.)
 *
 *   The API save is debounced: we wait 1 second after the last change
 *   before sending, so rapid clicking doesn't spam the server.
 */

const TOTAL_STATIONS = 446

export default function App() {
  const [loading, setLoading] = useState(true)
  const [stationData, setStationData] = useState({})
  const [visitedStations, setVisitedStations] = useState(() => loadVisitedStations())
  const [riddenServices, setRiddenServices] = useState(() => loadRiddenServices())
  const { toastMsg, toastVisible, showToast } = useToast()

  // Track whether the API is available
  const apiAvailable = useRef(false)
  // Debounce timer for API saves
  const saveTimer = useRef(null)
  // Skip the first save-on-mount (we just loaded the data)
  const initialLoadDone = useRef(false)

  const [vintageStationData, setVintageStationData] = useState({})

  // ── Load station data on mount ──────────────────────────────────────
  useEffect(() => {
    fetch('/subway_station_mapping_2026-01-31.json')
      .then(res => res.json())
      .then(data => setStationData(data.stations))
      .catch(err => console.error('Failed to load station data:', err))
    fetch('/vintage_station_mapping_2026-03-25.json')
      .then(res => res.json())
      .then(data => setVintageStationData(data.stations))
      .catch(err => console.error('Failed to load vintage station data:', err))
  }, [])

  // ── Load progress from API (with cookie fallback) ───────────────────
  useEffect(() => {
    async function loadProgress() {
      try {
        const data = await fetchProgress()
        apiAvailable.current = true
        // Only override local state if server has data
        if (data.visited_stations.length > 0 || data.ridden_services.length > 0) {
          setVisitedStations(new Set(data.visited_stations))
          setRiddenServices(new Set(data.ridden_services))
        } else {
          // Server has no data — check if cookies have data to push up
          const cookieStations = loadVisitedStations()
          const cookieServices = loadRiddenServices()
          if (cookieStations.size > 0 || cookieServices.size > 0) {
            // Push cookie data to server (one-time migration)
            await saveProgress(cookieStations, cookieServices)
          }
        }
      } catch (err) {
        console.warn('API unavailable, using cookies:', err.message)
        apiAvailable.current = false
      }
      initialLoadDone.current = true
    }
    loadProgress()
  }, [])

  // ── Persist on every change ─────────────────────────────────────────
  // Always save to cookies immediately. Debounce API saves by 1 second.
  useEffect(() => {
    if (!initialLoadDone.current) return

    // Cookies: immediate
    saveVisitedStations(visitedStations)
    saveRiddenServices(riddenServices)

    // API: debounced
    if (apiAvailable.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveProgress(visitedStations, riddenServices).catch(err => {
          console.warn('Failed to save to API:', err.message)
        })
      }, 1000)
    }
  }, [visitedStations, riddenServices])

  // Cleanup debounce timer on unmount
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  // ── Station toggle ──────────────────────────────────────────────────
  const handleStationToggle = useCallback((stationId) => {
    setVisitedStations(prev => {
      const next = new Set(prev)
      if (next.has(stationId)) {
        next.delete(stationId)
        showToast(`Removed: ${stationData[stationId]?.name || stationId}`)
      } else {
        next.add(stationId)
        showToast(`Visited: ${stationData[stationId]?.name || stationId}`)
      }
      return next
    })
  }, [stationData, showToast])

  // ── Service toggle ──────────────────────────────────────────────────
  const handleServiceToggle = useCallback((serviceId) => {
    setRiddenServices(prev => {
      const next = new Set(prev)
      if (next.has(serviceId)) {
        next.delete(serviceId)
      } else {
        next.add(serviceId)
      }
      return next
    })
  }, [])

  // ── Reset ───────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (!window.confirm('Reset all visited stations?')) return
    setVisitedStations(new Set())
    setRiddenServices(new Set())
  }, [])

  // ── Share ───────────────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    const v = visitedStations.size
    const s = riddenServices.size
    const pct = TOTAL_STATIONS > 0 ? Math.round(v / TOTAL_STATIONS * 100) : 0
    const text = `I've visited ${v}/${TOTAL_STATIONS} NYC subway stations (${pct}%) and ridden ${s}/${TOTAL_SERVICES} services! 🚇`
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard!')
    }).catch(() => {
      showToast('Could not copy to clipboard')
    })
  }, [visitedStations, riddenServices, showToast])

  // ── Map ready ───────────────────────────────────────────────────────
  const handleMapReady = useCallback(() => {
    setLoading(false)
  }, [])

  return (
    <>
      {loading && (
        <div className="loading-overlay">
          <h1>NYC Subway Tracker</h1>
          <p>Loading map…</p>
        </div>
      )}

      {Object.keys(stationData).length > 0 && Object.keys(vintageStationData).length > 0 && (
        <MapView
          stationData={stationData}
          vintageStationData={vintageStationData}
          visitedStations={visitedStations}
          onStationToggle={handleStationToggle}
          onReady={handleMapReady}
        />
      )}

      <StatsPanel
        stationsVisited={visitedStations.size}
        stationsTotal={TOTAL_STATIONS}
        riddenServices={riddenServices}
        servicesTotal={TOTAL_SERVICES}
        onServiceToggle={handleServiceToggle}
        onReset={handleReset}
        onShare={handleShare}
      />

      <Toast message={toastMsg} visible={toastVisible} />
    </>
  )
}
