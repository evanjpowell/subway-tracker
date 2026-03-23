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
 */

export const CLUSTER_GAP  = 12  // merge paths this close (SVG units)
export const HIT_PAD      = 5   // extra padding on hit targets
export const MARK_PAD     = 2   // extra padding on visited markers
export const MIN_HIT_DIM  = 14  // minimum hit-target size
export const MIN_MARK_DIM = 10  // minimum marker size

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
 */
export function computeAllClusters(svgEl, stationData) {
  const clusters = {}
  for (const [stationId, station] of Object.entries(stationData)) {
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
