import { useState, useEffect } from 'react'
import { fetchAchievements } from '../utils/api'
import './Achievements.css'

/**
 * Achievements — Phase 5 component for displaying the user's achievement progress.
 *
 * Shows a summary of earned vs. total achievements, grouped by category.
 * Locked achievements display their description as a hint; earned ones
 * show the achievement name and when it was unlocked.
 *
 * This component is wired up and ready — just uncomment the fetch call
 * and the JSX blocks below as you implement the backend check functions
 * in achievements.py.
 *
 * TODO (Evan): Some ideas for what to build out here:
 *   - Summary line: "X / Y achievements earned"
 *   - Category sections: Borough, Service, Line Completion, System
 *   - Locked achievements shown as "???" or greyed out with a hint
 *   - Earned achievements show the custom name + unlock date
 *   - Line completion: group all 26 line achievements into one collapsible section
 *
 * Props:
 *   stationsVisited  – current count (triggers a re-fetch when it changes)
 *   riddenServices   – current Set (triggers a re-fetch when it changes)
 */
export default function Achievements({ stationsVisited, riddenServices }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  // Re-fetch whenever the user's progress changes
  useEffect(() => {
    let cancelled = false

    async function loadAchievements() {
      try {
        // TODO: Uncomment this when the backend is ready!
        // const result = await fetchAchievements()
        // if (!cancelled) setData(result)

      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    loadAchievements()
    return () => { cancelled = true }
  }, [stationsVisited, riddenServices.size])

  // Don't render until there's data
  if (!data) return null

  // Group achievements by category for display
  // const byCategory = data.achievements.reduce((acc, a) => {
  //   acc[a.category] = acc[a.category] || []
  //   acc[a.category].push(a)
  //   return acc
  // }, {})

  return (
    <div className="achievements">
      {error && <div className="achievements-error">{error}</div>}

      {/* ── Summary ──────────────────────────────────────────────────── */}
      {/* TODO: Uncomment when backend is ready */}
      {/*
      <div className="achievements-summary">
        <span className="achievements-count">{data.total_unlocked}</span>
        <span className="achievements-total"> / {data.total}</span>
        <span className="achievements-label"> achievements</span>
      </div>
      */}

      {/* ── Borough & Service milestones ──────────────────────────────── */}
      {/* TODO: Uncomment and style when check functions are implemented */}
      {/*
      {byCategory.borough && (
        <AchievementRow achievement={byCategory.borough[0]} />
      )}
      {byCategory.service && (
        <AchievementRow achievement={byCategory.service[0]} />
      )}
      {byCategory.terminal && (
        <AchievementRow achievement={byCategory.terminal[0]} />
      )}
      {byCategory.system && (
        <AchievementRow achievement={byCategory.system[0]} />
      )}
      */}

      {/* ── Line completion ───────────────────────────────────────────── */}
      {/* TODO: Uncomment when line check functions are implemented */}
      {/* Consider collapsing this into a single "X / 26 lines complete" row */}
      {/*
      {byCategory.line && (
        <div className="achievements-lines">
          <div className="achievements-section-label">Lines Completed</div>
          <div className="achievements-line-count">
            {byCategory.line.filter(a => a.unlocked_at).length} / {byCategory.line.length}
          </div>
        </div>
      )}
      */}
    </div>
  )
}


// ── Sub-component ─────────────────────────────────────────────────────────
// TODO: Uncomment and style this when you're ready to show individual rows.

/*
function AchievementRow({ achievement }) {
  const earned = achievement.unlocked_at !== null

  return (
    <div className={`achievement-row ${earned ? 'earned' : 'locked'}`}>
      <div className="achievement-name">
        {earned ? achievement.name || achievement.id : '???'}
      </div>
      <div className="achievement-desc">
        {earned
          ? `Unlocked ${new Date(achievement.unlocked_at).toLocaleDateString()}`
          : achievement.description}
      </div>
    </div>
  )
}
*/
