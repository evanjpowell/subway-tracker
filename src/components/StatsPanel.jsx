import SERVICES from '../data/services'
import GlobalStats from './GlobalStats'
import './StatsPanel.css'

/**
 * StatsPanel — right-side panel showing station/service progress.
 *
 * The services section displays a grid of subway bullet buttons below the
 * progress bar. Each button looks like the MTA's iconic colored circle
 * (or pill for SIR). Clicking toggles that service as ridden/not ridden.
 * Ridden services show full color; un-ridden ones are greyed out.
 *
 * Props:
 *   stationsVisited   – number of visited stations
 *   stationsTotal     – total station count (446)
 *   riddenServices    – Set of ridden service IDs
 *   servicesTotal     – total service count (27)
 *   onServiceToggle   – callback(serviceId) when a bullet is clicked
 *   onReset           – callback when Reset button is clicked
 *   onShare           – callback when Share button is clicked
 */
export default function StatsPanel({
  stationsVisited,
  stationsTotal,
  riddenServices,
  servicesTotal,
  onServiceToggle,
  onReset,
  onShare,
}) {
  const stationPct = stationsTotal > 0
    ? (stationsVisited / stationsTotal * 100)
    : 0
  const servicePct = servicesTotal > 0
    ? (riddenServices.size / servicesTotal * 100)
    : 0

  return (
    <div className="panel">
      <div className="panel-title">NYC Subway Tracker</div>

      {/* Stations */}
      <div className="stat-block">
        <div className="stat-number">
          {stationsVisited}
          <span className="denom"> / {stationsTotal}</span>
          <div className="stat-icon-wrap">
            <img
              src="/station-icon.png"
              alt=""
              className="stat-icon"
            />
          </div>
        </div>
        <div className="stat-label">Stations Visited</div>
        <div className="progress-bar">
          <div
            className="progress-fill stations-fill"
            style={{ width: `${stationPct}%` }}
          />
        </div>
      </div>

      <hr className="stat-divider" />

      {/* Services */}
      <div className="stat-block small">
        <div className="stat-number">
          {riddenServices.size}
          <span className="denom"> / {servicesTotal}</span>
        </div>
        <div className="stat-label">Services Ridden</div>
        <div className="progress-bar">
          <div
            className="progress-fill services-fill"
            style={{ width: `${servicePct}%` }}
          />
        </div>
      </div>

      {/* Subway bullet grid */}
      <div className="bullet-grid">
        {SERVICES.map(svc => {
          const active = riddenServices.has(svc.id)
          return (
            <button
              key={svc.id}
              className={`bullet ${active ? 'active' : ''} ${svc.small ? 'bullet-small' : ''}`}
              style={{
                '--svc-bg': svc.color,
                '--svc-text': svc.text,
              }}
              onClick={() => onServiceToggle(svc.id)}
              title={svc.fullName || svc.label}
            >
              <span className="bullet-label">
                {svc.label}{svc.sup && <sup>{svc.sup}</sup>}
              </span>
            </button>
          )
        })}
      </div>

      {/* Phase 4: Detailed stats — uncomment when ready */}
      {/* <GlobalStats stationsVisited={stationsVisited} riddenServices={riddenServices} /> */}

      {/* Instructions */}
      <div className="instructions">
        Click a station on the map to mark it visited.<br /><br />
        Scroll to zoom &nbsp;&middot;&nbsp; Drag to pan
      </div>

      {/* Buttons */}
      <div className="panel-bottom">
        <button className="panel-btn btn-reset" onClick={onReset}>Reset</button>
        <button className="panel-btn btn-share" onClick={onShare}>Share</button>
      </div>
    </div>
  )
}
