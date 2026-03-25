import { useEffect, useRef, useCallback, useState } from 'react'
import {
  computeAllClusters,
  computeVintageAllClusters,
  HIT_PAD,
  MARK_PAD,
  MIN_HIT_DIM,
  MIN_MARK_DIM,
} from '../utils/geometry'
import { blendColors } from '../utils/colorBlend'
import STATION_LINES from '../data/stationLines'
import './MapView.css'

/**
 * MapView — the zoomable/pannable subway map with click-to-visit overlays.
 *
 * Architecture overview:
 *
 * The MTA subway map is a large SVG (2208×2688). Rendering it as an inline
 * SVG and panning/zooming would be very expensive because the browser would
 * have to re-layout and repaint thousands of paths on every frame.
 *
 * Instead, we use a trick:
 *   1. Fetch the SVG as raw text.
 *   2. Inject it into a hidden off-screen div so the browser can compute
 *      getBBox() and getCTM() for each station's path elements.
 *   3. Record those bounding boxes, then remove the off-screen SVG.
 *   4. Convert the SVG text into an Object URL and load it as an <img>.
 *      The browser rasterizes it once; all subsequent panning/zooming is
 *      a zero-cost GPU compositor operation (CSS transform on the img).
 *   5. A lightweight overlay <svg> sits on top of the image, sharing the
 *      same dimensions and transform. It contains only:
 *      - Hit-target rects (transparent, pointer-events: all) for clicks
 *      - Visited-marker rects (green outlines) for toggled stations
 *
 * This gives us smooth 60fps pan/zoom even on mobile, while still allowing
 * precise click detection on each station.
 *
 * Props:
 *   stationData       – the stations object from the JSON mapping
 *   visitedStations   – Set of visited station IDs
 *   onStationToggle   – callback(stationId) when a station is clicked
 *   onReady           – callback() when map has finished loading
 */

const MIN_SCALE = 0.12
const MAX_SCALE = 3.0
const NS        = 'http://www.w3.org/2000/svg'

const MAPS = [
  { url: '/subway_map.svg',   label: 'Diagram',    w: 2208, h: 2688, vintage: false },
  { url: '/vintage_map.svg',  label: 'Geographic', w: 1921, h: 2323, vintage: true  },
]

export default function MapView({ stationData, vintageStationData, visitedStations, onStationToggle, onReady }) {
  const [mapIndex, setMapIndex] = useState(0)

  // DOM refs
  const containerRef      = useRef(null)
  const viewportRef       = useRef(null)
  const overlaySvgRef     = useRef(null)
  const hitLayerRef       = useRef(null)
  const visitedLayerRef   = useRef(null)
  const outlineLayerRef   = useRef(null)
  const highlightLayerRef = useRef(null)
  const rippleLayerRef    = useRef(null)
  const mapImgRef         = useRef(null)

  // Mutable state for pan/zoom (not React state — we don't want re-renders
  // on every mouse move, we just mutate the CSS transform directly).
  const pan = useRef({
    scale: 0.3,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    pointerMoved: false,
    lastMouseX: 0,
    lastMouseY: 0,
    rafPending: false,
    ptrTimer: null,
  })

  // Station clusters computed from the SVG geometry
  const clustersRef = useRef({})
  // Whether the currently active map is the diagram (non-vintage) map
  const isDiagramRef = useRef(true)

  // ── Transform helpers ───────────────────────────────────────────────────

  const applyTransform = useCallback(() => {
    const p = pan.current
    if (p.rafPending) return
    p.rafPending = true
    requestAnimationFrame(() => {
      p.rafPending = false
      if (viewportRef.current) {
        viewportRef.current.style.transform =
          `translate3d(${p.translateX}px,${p.translateY}px,0) scale(${p.scale})`
      }
    })
  }, [])

  const suspendHitTest = useCallback(() => {
    const svg = overlaySvgRef.current
    if (!svg) return
    svg.style.pointerEvents = 'none'
    clearTimeout(pan.current.ptrTimer)
    pan.current.ptrTimer = setTimeout(() => {
      svg.style.pointerEvents = ''
    }, 150)
  }, [])

  // ── SVG rect helper ─────────────────────────────────────────────────────

  const makeRect = useCallback((x, y, w, h, rx) => {
    const r = document.createElementNS(NS, 'rect')
    r.setAttribute('x', x)
    r.setAttribute('y', y)
    r.setAttribute('width', w)
    r.setAttribute('height', h)
    r.setAttribute('rx', rx)
    r.setAttribute('ry', rx)
    return r
  }, [])

  // ── Ripple effect ───────────────────────────────────────────────────────

  const emitRipple = useCallback((svgX, svgY, color = '#373737') => {
    const layer = rippleLayerRef.current
    if (!layer) return

    const circle = document.createElementNS(NS, 'circle')
    circle.setAttribute('cx', svgX)
    circle.setAttribute('cy', svgY)
    circle.setAttribute('r', '1')
    circle.setAttribute('fill', 'none')
    circle.setAttribute('stroke', color)
    circle.setAttribute('stroke-width', '4')
    circle.setAttribute('opacity', '0.85')
    circle.style.pointerEvents = 'none'
    layer.appendChild(circle)

    const maxR    = 28
    const duration = 550
    const start   = performance.now()

    function frame(now) {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      circle.setAttribute('r', eased * maxR)
      circle.setAttribute('opacity', (1 - t) * 0.85)
      if (t < 1) requestAnimationFrame(frame)
      else circle.remove()
    }
    requestAnimationFrame(frame)
  }, [])

  // ── Build hit targets ───────────────────────────────────────────────────

  const buildHitTargets = useCallback(() => {
    const hitLayer = hitLayerRef.current
    if (!hitLayer) return
    hitLayer.innerHTML = ''
    for (const [stationId, clusters] of Object.entries(clustersRef.current)) {
      for (const c of clusters) {
        let el
        if (c.type === 'custom') {
          // Custom SVG path outline (e.g. L-shape for complex stations)
          el = document.createElementNS(NS, 'path')
          el.setAttribute('d', c.hitPath)
        } else {
          // Standard rectangular hit target
          const w  = Math.max((c.x2 - c.x) + 2 * HIT_PAD, MIN_HIT_DIM)
          const h  = Math.max((c.y2 - c.y) + 2 * HIT_PAD, MIN_HIT_DIM)
          const cx = c.x - HIT_PAD - Math.max(0, (MIN_HIT_DIM - ((c.x2 - c.x) + 2 * HIT_PAD)) / 2)
          const cy = c.y - HIT_PAD - Math.max(0, (MIN_HIT_DIM - ((c.y2 - c.y) + 2 * HIT_PAD)) / 2)
          el = makeRect(cx, cy, w, h, HIT_PAD + 2)
        }
        el.setAttribute('fill', 'transparent')
        el.setAttribute('pointer-events', 'all')
        el.style.cursor = 'pointer'
        el.dataset.stationId = stationId
        hitLayer.appendChild(el)
      }
    }
  }, [makeRect])

  // ── Visited markers ─────────────────────────────────────────────────────

  const addVisitedMarker = useCallback((stationId) => {
    const visitedLayer = visitedLayerRef.current
    const clusters = clustersRef.current[stationId]
    if (!visitedLayer || !clusters || clusters.length === 0) return
    // Don't duplicate
    if (document.getElementById(`vm-${stationId}`)) return

    const isDiagram = isDiagramRef.current
    const g = document.createElementNS(NS, 'g')
    g.id = `vm-${stationId}`

    for (const c of clusters) {
      // Label-only clusters (vintage map, path IDs ≥ 2000) are hit targets only —
      // don't include them in the visible marker box.
      if (c.hitOnly) continue

      if (c.type === 'custom' && !isDiagram) {
        // Vintage map only: L-shaped outline for complex stations.
        // Diagram mode uses the cloned highlight paths instead.
        const el = document.createElementNS(NS, 'path')
        el.setAttribute('d', c.markPath)
        el.classList.add('visited-marker')
        g.appendChild(el)
      } else if (!isDiagram) {
        // Vintage/geographic map: gray box + person icon (original behaviour)
        const w  = Math.max((c.x2 - c.x) + 2 * MARK_PAD, MIN_MARK_DIM)
        const h  = Math.max((c.y2 - c.y) + 2 * MARK_PAD, MIN_MARK_DIM)
        const cx = c.x - MARK_PAD - Math.max(0, (MIN_MARK_DIM - ((c.x2 - c.x) + 2 * MARK_PAD)) / 2)
        const cy = c.y - MARK_PAD - Math.max(0, (MIN_MARK_DIM - ((c.y2 - c.y) + 2 * MARK_PAD)) / 2)
        const rx = Math.min(MARK_PAD + 10, Math.min(w, h) / 2)
        const box = makeRect(cx, cy, w, h, rx)
        box.classList.add('visited-marker')
        g.appendChild(box)

        const iconCX   = cx + w / 2
        const iconBase = cy - 3

        const head = document.createElementNS(NS, 'circle')
        head.setAttribute('cx', iconCX)
        head.setAttribute('cy', iconBase - 7.5)
        head.setAttribute('r', '2.5')
        head.setAttribute('fill', '#373737')
        head.style.pointerEvents = 'none'
        g.appendChild(head)

        const body = document.createElementNS(NS, 'rect')
        body.setAttribute('x', iconCX - 3)
        body.setAttribute('y', iconBase - 5)
        body.setAttribute('width', '6')
        body.setAttribute('height', '5')
        body.setAttribute('rx', '1.5')
        body.setAttribute('fill', '#373737')
        body.style.pointerEvents = 'none'
        g.appendChild(body)
      }
    }

    if (isDiagram) {
      // Swap: hide outlines, show highlight paths for this station
      const hl = highlightLayerRef.current
      const ol = outlineLayerRef.current
      hl?.querySelectorAll(`[data-sid="${stationId}"]`).forEach(el => { el.style.display = '' })
      ol?.querySelectorAll(`[data-sid="${stationId}"]`).forEach(el => { el.style.display = 'none' })

      // Person icon above the first non-hitOnly, non-custom cluster
      const anchor = clusters.find(c => !c.hitOnly && c.type !== 'custom')
      if (anchor) {
        const w  = Math.max((anchor.x2 - anchor.x) + 2 * MARK_PAD, MIN_MARK_DIM)
        const cx = anchor.x - MARK_PAD - Math.max(0, (MIN_MARK_DIM - ((anchor.x2 - anchor.x) + 2 * MARK_PAD)) / 2)
        const cy = anchor.y - MARK_PAD - Math.max(0, (MIN_MARK_DIM - ((anchor.y2 - anchor.y) + 2 * MARK_PAD)) / 2)
        const iconCX   = cx + w / 2
        const iconBase = cy - 3

        const head = document.createElementNS(NS, 'circle')
        head.setAttribute('cx', iconCX)
        head.setAttribute('cy', iconBase - 7.5)
        head.setAttribute('r', '2.5')
        head.setAttribute('fill', '#373737')
        head.style.pointerEvents = 'none'
        g.appendChild(head)

        const body = document.createElementNS(NS, 'rect')
        body.setAttribute('x', iconCX - 3)
        body.setAttribute('y', iconBase - 5)
        body.setAttribute('width', '6')
        body.setAttribute('height', '5')
        body.setAttribute('rx', '1.5')
        body.setAttribute('fill', '#373737')
        body.style.pointerEvents = 'none'
        g.appendChild(body)
      }
    }

    visitedLayer.appendChild(g)
  }, [makeRect])

  const removeVisitedMarker = useCallback((stationId) => {
    const el = document.getElementById(`vm-${stationId}`)
    if (el) el.remove()
    // Swap back: hide highlight paths, show outlines
    const hl = highlightLayerRef.current
    const ol = outlineLayerRef.current
    hl?.querySelectorAll(`[data-sid="${stationId}"]`).forEach(el => { el.style.display = 'none' })
    ol?.querySelectorAll(`[data-sid="${stationId}"]`).forEach(el => { el.style.display = '' })
  }, [])

  // Sync visited markers whenever visitedStations set changes
  useEffect(() => {
    if (!clustersRef.current || Object.keys(clustersRef.current).length === 0) return
    // Add markers for newly visited
    for (const id of visitedStations) {
      addVisitedMarker(id)
    }
    // Remove markers no longer in set
    const visitedLayer = visitedLayerRef.current
    if (visitedLayer) {
      for (const g of [...visitedLayer.children]) {
        const id = g.id.replace('vm-', '')
        if (!visitedStations.has(id)) {
          removeVisitedMarker(id)
        }
      }
    }
  }, [visitedStations, addVisitedMarker, removeVisitedMarker])

  // ── Click handler (delegation) ──────────────────────────────────────────

  const handleOverlayClick = useCallback((e) => {
    if (pan.current.pointerMoved) return
    let el = e.target
    const svg = overlaySvgRef.current
    while (el && el !== svg) {
      const sid = el.dataset?.stationId
      if (sid) {
        // Convert screen coords → SVG coords and emit ripple
        const p = pan.current
        const rect = containerRef.current.getBoundingClientRect()
        const svgX = (e.clientX - rect.left - p.translateX) / p.scale
        const svgY = (e.clientY - rect.top  - p.translateY) / p.scale
        // Get line colors for this station and blend them
        const lineColors = STATION_LINES[sid] || ['#373737']
        const rippleColor = blendColors(lineColors)
        emitRipple(svgX, svgY, rippleColor)
        onStationToggle(sid)
        return
      }
      el = el.parentElement
    }
  }, [onStationToggle, emitRipple])

  // ── Initialization: fetch SVG, compute clusters, render map ─────────────

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { url, w: svgW, h: svgH, vintage } = MAPS[mapIndex]
      const activeStationData = vintage ? vintageStationData : stationData

      console.log('[MapView] init starting, map:', url, 'stations:', Object.keys(activeStationData).length)

      // 1. Fetch the SVG
      const svgRes = await fetch(url)
      const svgText = await svgRes.text()
      console.log('[MapView] SVG fetched, length:', svgText.length)

      if (cancelled) return

      // 2. Inject SVG off-screen to compute bounding boxes
      const tempDiv = document.createElement('div')
      tempDiv.style.cssText =
        `position:fixed;left:-9999px;top:0;width:${svgW}px;height:${svgH}px;overflow:hidden;opacity:0;pointer-events:none`
      tempDiv.innerHTML = svgText
      document.body.appendChild(tempDiv)
      const computeSVG = tempDiv.querySelector('svg')
      void computeSVG.getBoundingClientRect() // force layout
      isDiagramRef.current = !vintage
      clustersRef.current = vintage
        ? computeVintageAllClusters(computeSVG, activeStationData)
        : computeAllClusters(computeSVG, activeStationData)

      // For the diagram map, clone each station's paths into two overlay layers
      // while the SVG is still live in the DOM:
      //   outlineLayer   – 0.25px black outlines, visible by default
      //   highlightLayer – filled paths, hidden until the station is clicked
      // Paths are appended in SVG document order (not station order) so the
      // original z-ordering is preserved across station boundaries.
      const highlightLayer = highlightLayerRef.current
      const outlineLayer   = outlineLayerRef.current
      if (highlightLayer) highlightLayer.innerHTML = ''
      if (outlineLayer)   outlineLayer.innerHTML   = ''
      if (!vintage && highlightLayer && outlineLayer) {
        // Reverse map: pathId → stationId
        const pathToStation = {}
        for (const [stationId, station] of Object.entries(activeStationData)) {
          for (const pathId of (station.paths || [])) pathToStation[pathId] = stationId
        }
        // Walk all SVG elements in DOM order so clones inherit the correct stack
        for (const srcEl of computeSVG.querySelectorAll('[id]')) {
          const stationId = pathToStation[srcEl.getAttribute('id')]
          if (!stationId) continue
          const d = srcEl.getAttribute('d')
          if (!d) continue
          try {
            const ctm = srcEl.getCTM()
            if (!ctm) continue
            const transform = `matrix(${ctm.a},${ctm.b},${ctm.c},${ctm.d},${ctm.e},${ctm.f})`
            // Highlight clone — original style, hidden until clicked
            const hlClone = document.createElementNS(NS, 'path')
            hlClone.setAttribute('d', d)
            hlClone.setAttribute('transform', transform)
            hlClone.setAttribute('data-sid', stationId)
            const styleAttr = srcEl.getAttribute('style')
            if (styleAttr) hlClone.setAttribute('style', styleAttr)
            hlClone.style.display = 'none'
            hlClone.style.pointerEvents = 'none'
            highlightLayer.appendChild(hlClone)
            // Outline clone — 0.25px black stroke, visible by default
            const olClone = document.createElementNS(NS, 'path')
            olClone.setAttribute('d', d)
            olClone.setAttribute('transform', transform)
            olClone.setAttribute('data-sid', stationId)
            olClone.setAttribute('fill', 'none')
            olClone.setAttribute('stroke', '#000000')
            olClone.setAttribute('stroke-width', '0.25')
            olClone.style.pointerEvents = 'none'
            outlineLayer.appendChild(olClone)
          } catch (_) { /* skip unrenderable paths */ }
        }
      }

      // Strip station paths from the SVG — outlines live in the overlay now.
      if (!vintage) {
        for (const station of Object.values(activeStationData)) {
          for (const pathId of (station.paths || [])) {
            computeSVG.querySelector(`#${pathId}`)?.remove()
          }
        }
      }
      const cleanSvgText = vintage ? svgText : new XMLSerializer().serializeToString(computeSVG)

      document.body.removeChild(tempDiv)

      if (cancelled) return

      // 3. Display map as a GPU-composited image
      const blob   = new Blob([cleanSvgText], { type: 'image/svg+xml' })
      const imgUrl = URL.createObjectURL(blob)
      const mapImg = mapImgRef.current
      await new Promise((resolve, reject) => {
        mapImg.onload  = resolve
        mapImg.onerror = () => reject(new Error('SVG image failed to load'))
        mapImg.src = imgUrl
      })

      if (cancelled) return

      // 4. Build overlay hit targets + clear any stale visited markers
      buildHitTargets()
      if (visitedLayerRef.current) visitedLayerRef.current.innerHTML = ''

      // 5. Fit map to container
      const container = containerRef.current
      const cw = container.offsetWidth
      const ch = container.offsetHeight
      const p = pan.current
      p.scale      = Math.min(cw / svgW, ch / svgH) * 0.97
      p.translateX = (cw - svgW * p.scale) / 2
      p.translateY = (ch - svgH * p.scale) / 2
      applyTransform()

      // 6. Render saved visited markers
      for (const id of visitedStations) {
        addVisitedMarker(id)
      }

      if (onReady) onReady()
    }

    init().catch(err => {
      console.error('MapView init error:', err)
      // Still dismiss loading overlay so the UI isn't stuck
      if (onReady) onReady()
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapIndex]) // Re-run when the active map changes

  // ── Mouse pan ───────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function onMouseDown(e) {
      if (e.button !== 0) return
      const p = pan.current
      p.isDragging = true
      p.pointerMoved = false
      p.lastMouseX = e.clientX
      p.lastMouseY = e.clientY
      container.classList.add('dragging')
      document.body.style.cursor = 'grabbing'
      e.preventDefault()
    }

    function onMouseMove(e) {
      const p = pan.current
      if (!p.isDragging) return
      const dx = e.clientX - p.lastMouseX
      const dy = e.clientY - p.lastMouseY
      if (Math.abs(dx) + Math.abs(dy) > 4) p.pointerMoved = true
      p.translateX += dx
      p.translateY += dy
      p.lastMouseX = e.clientX
      p.lastMouseY = e.clientY
      suspendHitTest()
      applyTransform()
    }

    function onMouseUp() {
      const p = pan.current
      if (!p.isDragging) return
      p.isDragging = false
      container.classList.remove('dragging')
      document.body.style.cursor = ''
      setTimeout(() => { p.pointerMoved = false }, 50)
    }

    function onWheel(e) {
      e.preventDefault()
      const p = pan.current
      const factor   = e.deltaY < 0 ? 1.08 : 1 / 1.08
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.scale * factor))
      if (newScale === p.scale) return
      const rect   = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      p.translateX = mouseX - (mouseX - p.translateX) * (newScale / p.scale)
      p.translateY = mouseY - (mouseY - p.translateY) * (newScale / p.scale)
      p.scale = newScale
      suspendHitTest()
      applyTransform()
    }

    // ── Touch ──
    let lastTouchDist = null
    let lastTouchMidX = 0
    let lastTouchMidY = 0

    function onTouchStart(e) {
      const p = pan.current
      if (e.touches.length === 1) {
        p.isDragging = true
        p.pointerMoved = false
        p.lastMouseX = e.touches[0].clientX
        p.lastMouseY = e.touches[0].clientY
      } else if (e.touches.length === 2) {
        p.isDragging = false
        const dx = e.touches[1].clientX - e.touches[0].clientX
        const dy = e.touches[1].clientY - e.touches[0].clientY
        lastTouchDist = Math.hypot(dx, dy)
        lastTouchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2
        lastTouchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      }
      e.preventDefault()
    }

    function onTouchMove(e) {
      const p = pan.current
      if (e.touches.length === 1 && p.isDragging) {
        const dx = e.touches[0].clientX - p.lastMouseX
        const dy = e.touches[0].clientY - p.lastMouseY
        if (Math.abs(dx) + Math.abs(dy) > 4) p.pointerMoved = true
        p.translateX += dx
        p.translateY += dy
        p.lastMouseX = e.touches[0].clientX
        p.lastMouseY = e.touches[0].clientY
        suspendHitTest()
        applyTransform()
      } else if (e.touches.length === 2 && lastTouchDist !== null) {
        const dx   = e.touches[1].clientX - e.touches[0].clientX
        const dy   = e.touches[1].clientY - e.touches[0].clientY
        const dist = Math.hypot(dx, dy)
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
        const factor   = dist / lastTouchDist
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.scale * factor))
        const rect = container.getBoundingClientRect()
        const relX = midX - rect.left
        const relY = midY - rect.top
        p.translateX = relX - (relX - p.translateX) * (newScale / p.scale) + (midX - lastTouchMidX)
        p.translateY = relY - (relY - p.translateY) * (newScale / p.scale) + (midY - lastTouchMidY)
        p.scale = newScale
        lastTouchDist = dist
        lastTouchMidX = midX
        lastTouchMidY = midY
        suspendHitTest()
        applyTransform()
      }
      e.preventDefault()
    }

    function onTouchEnd(e) {
      if (e.touches.length < 2) lastTouchDist = null
      if (e.touches.length === 0) {
        pan.current.isDragging = false
        setTimeout(() => { pan.current.pointerMoved = false }, 50)
      }
    }

    container.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    container.addEventListener('wheel', onWheel, { passive: false })
    container.addEventListener('touchstart', onTouchStart, { passive: false })
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd)

    return () => {
      container.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
    }
  }, [applyTransform, suspendHitTest])

  const nextMap    = MAPS[1 - mapIndex]
  const activeMap  = MAPS[mapIndex]

  return (
    <div className="map-container tile-bg" ref={containerRef}>
      <button
        className="map-toggle-btn"
        onClick={() => setMapIndex(i => 1 - i)}
        title={`Switch to ${nextMap.label} map`}
      >
        {nextMap.label}
      </button>
      <div className="map-viewport" ref={viewportRef}>
        <img
          ref={mapImgRef}
          className="map-img"
          width={activeMap.w}
          height={activeMap.h}
          alt="NYC Subway Map"
        />
        <svg
          ref={overlaySvgRef}
          className="overlay-svg"
          viewBox={`0 0 ${activeMap.w} ${activeMap.h}`}
          width={activeMap.w}
          height={activeMap.h}
          onClick={handleOverlayClick}
        >
          <g ref={outlineLayerRef}   style={{ pointerEvents: 'none' }} />
          <g ref={highlightLayerRef} style={{ pointerEvents: 'none' }} />
          <g ref={visitedLayerRef}   style={{ pointerEvents: 'none' }} />
          <g ref={rippleLayerRef}    style={{ pointerEvents: 'none' }} />
          <g ref={hitLayerRef}       style={{ pointerEvents: 'all' }} />
        </svg>
      </div>
    </div>
  )
}
