import { useState, useEffect, useCallback } from 'react'
import MapView from './components/MapView'
import StatsPanel from './components/StatsPanel'
import Toast, { useToast } from './components/Toast'
import { TOTAL_SERVICES } from './data/services'
import {
  loadVisitedStations,
  saveVisitedStations,
  loadRiddenServices,
  saveRiddenServices,
} from './utils/cookies'

/**
 * App — root component for the NYC Subway Tracker.
 *
 * State management approach:
 * We keep two Sets in React state: visitedStations and riddenServices.
 * When either changes, we persist to cookies (Phase 1) and later to the
 * FastAPI backend (Phase 3). The MapView is mostly imperative (DOM
 * manipulation for performance), so it receives the visitedStations set
 * and a toggle callback, and handles its own SVG rendering internally.
 */

const TOTAL_STATIONS = 446

export default function App() {
  const [loading, setLoading] = useState(true)
  const [stationData, setStationData] = useState({})
  const [visitedStations, setVisitedStations] = useState(() => loadVisitedStations())
  const [riddenServices, setRiddenServices] = useState(() => loadRiddenServices())
  const { toastMsg, toastVisible, showToast } = useToast()

  // Load station data on mount
  useEffect(() => {
    fetch('/subway_station_mapping_2026-01-31.json')
      .then(res => res.json())
      .then(data => setStationData(data.stations))
      .catch(err => console.error('Failed to load station data:', err))
  }, [])

  // Persist visited stations to cookie whenever the set changes
  useEffect(() => {
    saveVisitedStations(visitedStations)
  }, [visitedStations])

  // Persist ridden services to cookie whenever the set changes
  useEffect(() => {
    saveRiddenServices(riddenServices)
  }, [riddenServices])

  // Station toggle handler — called by MapView on station click
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

  // Service toggle handler — called by bullet buttons in StatsPanel
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

  // Reset all progress
  const handleReset = useCallback(() => {
    if (!window.confirm('Reset all visited stations?')) return
    setVisitedStations(new Set())
    setRiddenServices(new Set())
  }, [])

  // Share — copy text summary to clipboard
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

  // Called by MapView when it finishes loading
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

      {Object.keys(stationData).length > 0 && (
        <MapView
          stationData={stationData}
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
