/**
 * SVG geometry utilities for computing station hit-target bounding boxes.
 *
 * The MTA subway SVG uses a coordinate transform on each path element:
 *   matrix(1.333, 0, 0, -1.333, X, Y)
 * This scales by 1.333× and flips the Y axis, then translates.
 *
 * To find where a station's dots actually appear in the 2208×2688 root
 * coordinate space, we:
 *   1. Call getBBox() on each <path> to get its local bounding box.
 *   2. Call getCTM() to get the Cumulative Transformation Matrix.
 *   3. Transform all 4 corners through the CTM and take min/max — this
 *      gives us the axis-aligned bounding box in root SVG coordinates.
 *
 * Since a single "station" may consist of multiple SVG paths (e.g. the
 * dot + the accessible icon + a transfer indicator), we then cluster
 * nearby bboxes into groups. Paths within CLUSTER_GAP SVG-units of each
 * other merge into one rectangle, so the user gets a single click target
 * even if the station is drawn with several elements.
 *
 * Custom outlines:
 * Some station complexes (e.g. "Chambers St / WTC / Park Pl / Cortlandt St")
 * span such a large area that a rectangular cluster would cover neighboring
 * stations. For these, we define a custom SVG path outline (e.g. an L-shape)
 * that traces the actual station layout without overlapping neighbors.
 */

export const CLUSTER_GAP  = 12  // merge paths this close (SVG units)
export const HIT_PAD      = 5   // extra padding on hit targets
export const MARK_PAD     = 2   // extra padding on visited markers
export const MIN_HIT_DIM  = 14  // minimum hit-target size
export const MIN_MARK_DIM = 10  // minimum marker size

/**
 * Custom SVG path outlines for stations that can't use simple rectangles.
 *
 * Each entry maps a station ID to an object with:
 *   hitPath  – SVG path `d` attribute for the (slightly larger) hit target
 *   markPath – SVG path `d` attribute for the (snugger) visited marker
 *
 * Station 624: "Chambers St / WTC / Park Pl / Cortlandt St"
 * This complex forms an L-shape on the map:
 *   - A/C dots at top-left (x ~410–433, y ~1672–1683)
 *   - Park Pl / WTC-E dots in the middle (x ~446–457, y ~1706–1778)
 *   - Connecting corridor running diagonally (path5: x 432–537, y 1677–1814)
 *   - R/W Cortlandt St dots at bottom-right (x ~532–555, y ~1808–1819)
 *
 * The L-shape avoids overlapping the nearby City Hall (R/W) station (id 20)
 * which sits to the upper-right of this complex.
 *
 *   TL ──── TR                    TL = (405, 1667)
 *   │        │                    TR = (462, 1667)
 *   │        │                    EI = (462, 1800) inner elbow
 *   │       EI ──── ER            ER = (560, 1800)
 *   │                │            BR = (560, 1824)
 *   BL ───────────  BR            BL = (405, 1824)
 */
function makeRoundedLPath(pad) {
  // L-shape vertices with padding applied
  const tl_x = 405 - pad, tl_y = 1667 - pad
  const tr_x = 462 + pad, tr_y = 1667 - pad
  const ei_x = 462 + pad, ei_y = 1800          // inner elbow
  const er_x = 560 + pad, er_y = 1800
  const br_x = 560 + pad, br_y = 1824 + pad
  const bl_x = 405 - pad, bl_y = 1824 + pad
  const r = 5 // corner radius

  return [
    `M ${tl_x + r} ${tl_y}`,                            // start after TL corner
    `L ${tr_x - r} ${tr_y}`,                             // top edge
    `A ${r} ${r} 0 0 1 ${tr_x} ${tr_y + r}`,            // TR corner (convex)
    `L ${ei_x} ${ei_y - r}`,                             // right edge of narrow section
    `A ${r} ${r} 0 0 0 ${ei_x + r} ${ei_y}`,            // inner elbow (concave → sweep=0)
    `L ${er_x - r} ${er_y}`,                             // elbow horizontal edge
    `A ${r} ${r} 0 0 1 ${er_x} ${er_y + r}`,            // ER corner (convex)
    `L ${br_x} ${br_y - r}`,                             // right edge of wide section
    `A ${r} ${r} 0 0 1 ${br_x - r} ${br_y}`,            // BR corner (convex)
    `L ${bl_x + r} ${bl_y}`,                             // bottom edge
    `A ${r} ${r} 0 0 1 ${bl_x} ${bl_y - r}`,            // BL corner (convex)
    `L ${tl_x} ${tl_y + r}`,                             // left edge
    `A ${r} ${r} 0 0 1 ${tl_x + r} ${tl_y}`,            // TL corner (convex)
    'Z',
  ].join(' ')
}

export const CUSTOM_OUTLINES = {
  '624': {
    hitPath:  makeRoundedLPath(HIT_PAD),
    markPath: makeRoundedLPath(MARK_PAD),
  },
}

/**
 * Get the bounding box of a <path> element in SVG root coordinates.
 */
export function pathBBoxInRoot(el, svgEl) {
  const bb = el.getBBox()
  if (bb.width === 0 && bb.height === 0) return null
  const ctm = el.getCTM()
  if (!ctm) return null
  const corners = [
    [bb.x,            bb.y            ],
    [bb.x + bb.width, bb.y            ],
    [bb.x,            bb.y + bb.height],
    [bb.x + bb.width, bb.y + bb.height],
  ].map(([px, py]) => {
    const p = svgEl.createSVGPoint()
    p.x = px
    p.y = py
    return p.matrixTransform(ctm)
  })
  return {
    x:  Math.min(...corners.map(c => c.x)),
    y:  Math.min(...corners.map(c => c.y)),
    x2: Math.max(...corners.map(c => c.x)),
    y2: Math.max(...corners.map(c => c.y)),
  }
}

/**
 * Greedy clustering: merge bboxes whose nearest edges are ≤ `gap` apart.
 *
 * Algorithm: iterate pairs; when two overlap (with gap tolerance), merge
 * them and restart. O(n²·k) in the worst case, but n is small per station
 * (typically 2–6 paths).
 */
export function clusterBBoxes(bboxes, gap = CLUSTER_GAP) {
  if (bboxes.length === 0) return []
  const out = bboxes.map(b => ({ ...b }))
  let changed = true
  while (changed) {
    changed = false
    outer:
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j]
        if (
          a.x2 + gap >= b.x && b.x2 + gap >= a.x &&
          a.y2 + gap >= b.y && b.y2 + gap >= a.y
        ) {
          a.x  = Math.min(a.x,  b.x)
          a.y  = Math.min(a.y,  b.y)
          a.x2 = Math.max(a.x2, b.x2)
          a.y2 = Math.max(a.y2, b.y2)
          out.splice(j, 1)
          changed = true
          break outer
        }
      }
    }
  }
  return out
}

/**
 * Compute clustered bounding boxes for every station.
 * Requires a rendered (but possibly off-screen) SVG element in the DOM.
 *
 * Returns: { [stationId]: [{x, y, x2, y2}, …], … }
 * Stations with custom outlines get: { type: 'custom', hitPath, markPath }
 */
export function computeAllClusters(svgEl, stationData) {
  const clusters = {}
  for (const [stationId, station] of Object.entries(stationData)) {
    // Use custom outline if one exists for this station
    if (CUSTOM_OUTLINES[stationId]) {
      clusters[stationId] = [{ type: 'custom', ...CUSTOM_OUTLINES[stationId] }]
      continue
    }

    const bboxes = []
    for (const pathId of station.paths) {
      const el = svgEl.querySelector(`#${pathId}`)
      if (!el) continue
      try {
        const bb = pathBBoxInRoot(el, svgEl)
        if (bb) bboxes.push(bb)
      } catch (_) { /* skip unrenderable paths */ }
    }
    clusters[stationId] = clusterBBoxes(bboxes)
  }
  return clusters
}
