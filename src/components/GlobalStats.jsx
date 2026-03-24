import { useState, useEffect } from 'react'
import { fetchMyStats, fetchBoroughStats, fetchLineStats } from '../utils/api'
import './GlobalStats.css'

/**
 * GlobalStats — Phase 4 component for displaying detailed statistics.
 *
 * This component fetches personalized stats from the backend and renders
 * them below the existing station/service counts in the StatsPanel.
 *
 * TODO (Evan): This is your canvas! Some ideas for what to display:
 *   - Percentile rank ("You've visited more stations than 72% of users")
 *   - Borough breakdown with mini progress bars
 *   - Line completion checklist
 *   - Global average comparison
 *
 * The API calls are wired up and ready — just uncomment the ones you
 * need as you implement the backend functions in stats.py.
 *
 * Props:
 *   stationsVisited  – current count (from parent, for instant updates)
 *   riddenServices   – current Set (from parent, for instant updates)
 */
export default function GlobalStats({ stationsVisited, riddenServices }) {
  const [myStats, setMyStats] = useState(null)
  const [boroughs, setBoroughs] = useState(null)
  const [lines, setLines] = useState(null)
  const [error, setError] = useState(null)

  // Fetch stats when the component mounts or when progress changes
  useEffect(() => {
    let cancelled = false

    async function loadStats() {
      try {
        // TODO: Uncomment these as you implement the backend functions!

        // const stats = await fetchMyStats()
        // if (!cancelled) setMyStats(stats)

        // const boroughData = await fetchBoroughStats()
        // if (!cancelled) setBoroughs(boroughData.boroughs)

        // const lineData = await fetchLineStats()
        // if (!cancelled) setLines(lineData)

      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    loadStats()
    return () => { cancelled = true }
  }, [stationsVisited, riddenServices.size])

  // Don't render anything until you're ready
  if (!myStats && !boroughs && !lines) return null

  return (
    <div className="global-stats">
      {error && <div className="stats-error">{error}</div>}

      {/* ── Percentile ─────────────────────────────────────── */}
      {/* TODO: Uncomment and style when compute_percentile works */}
      {/*
      {myStats && (
        <div className="stats-percentile">
          More stations than <strong>{myStats.percentile}%</strong> of users
        </div>
      )}
      */}

      {/* ── Borough breakdown ──────────────────────────────── */}
      {/* TODO: Uncomment when compute_borough_counts works */}
      {/*
      {boroughs && (
        <div className="stats-boroughs">
          <div className="stats-section-label">Boroughs</div>
          {Object.entries(boroughs).map(([name, data]) => (
            <div key={name} className="borough-row">
              <span className="borough-name">{name}</span>
              <span className="borough-count">
                {data.visited}/{data.total}
              </span>
            </div>
          ))}
        </div>
      )}
      */}

      {/* ── Line completion ────────────────────────────────── */}
      {/* TODO: Uncomment when compute_line_completion works */}
      {/*
      {lines && (
        <div className="stats-lines">
          <div className="stats-section-label">
            Lines completed: {lines.lines_completed}
          </div>
        </div>
      )}
      */}
    </div>
  )
}
