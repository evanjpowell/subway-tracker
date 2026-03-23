/**
 * NYC Subway service definitions.
 *
 * Each service has:
 *   id     – unique key (matches what we store in cookies / DB)
 *   label  – display text inside the bullet
 *   color  – background color of the bullet (official MTA colors)
 *   text   – text color for contrast (white or black)
 *   group  – grouping for display layout
 *
 * The official MTA "bullet" colors come from the MTA Style Guide.
 * Services that share a trunk line share a color:
 *   Red    (#EE352E) — 1 2 3
 *   Green  (#00933C) — 4 5 6
 *   Purple (#B933AD) — 7
 *   Blue   (#2850AD) — A C E
 *   Orange (#FF6319) — B D F M
 *   Lime   (#6CBE45) — G
 *   Brown  (#996633) — J Z
 *   Grey   (#A7A9AC) — L
 *   Yellow (#FCCC0A) — N Q R W  (black text)
 *   Grey   (#808183) — S (shuttles)
 *   Blue   (#003DA5) — SIR (unofficial, commonly used)
 */

const SERVICES = [
  // ── Numbered lines ──
  { id: '1', label: '1', color: '#EE352E', text: '#fff', group: 'numbered' },
  { id: '2', label: '2', color: '#EE352E', text: '#fff', group: 'numbered' },
  { id: '3', label: '3', color: '#EE352E', text: '#fff', group: 'numbered' },
  { id: '4', label: '4', color: '#00933C', text: '#fff', group: 'numbered' },
  { id: '5', label: '5', color: '#00933C', text: '#fff', group: 'numbered' },
  { id: '6', label: '6', color: '#00933C', text: '#fff', group: 'numbered' },
  { id: '7', label: '7', color: '#B933AD', text: '#fff', group: 'numbered' },

  // ── Lettered lines ──
  { id: 'A', label: 'A', color: '#2850AD', text: '#fff', group: 'lettered' },
  { id: 'C', label: 'C', color: '#2850AD', text: '#fff', group: 'lettered' },
  { id: 'E', label: 'E', color: '#2850AD', text: '#fff', group: 'lettered' },
  { id: 'B', label: 'B', color: '#FF6319', text: '#fff', group: 'lettered' },
  { id: 'D', label: 'D', color: '#FF6319', text: '#fff', group: 'lettered' },
  { id: 'F', label: 'F', color: '#FF6319', text: '#fff', group: 'lettered' },
  { id: 'M', label: 'M', color: '#FF6319', text: '#fff', group: 'lettered' },
  { id: 'G', label: 'G', color: '#6CBE45', text: '#fff', group: 'lettered' },
  { id: 'J', label: 'J', color: '#996633', text: '#fff', group: 'lettered' },
  { id: 'Z', label: 'Z', color: '#996633', text: '#fff', group: 'lettered' },
  { id: 'L', label: 'L', color: '#A7A9AC', text: '#fff', group: 'lettered' },
  { id: 'N', label: 'N', color: '#FCCC0A', text: '#1a1a1a', group: 'lettered' },
  { id: 'Q', label: 'Q', color: '#FCCC0A', text: '#1a1a1a', group: 'lettered' },
  { id: 'R', label: 'R', color: '#FCCC0A', text: '#1a1a1a', group: 'lettered' },
  { id: 'W', label: 'W', color: '#FCCC0A', text: '#1a1a1a', group: 'lettered' },

  // ── Shuttles ──
  // 42 St gets plain "S"; Franklin and Rockaway get superscript letters (S^F, S^R)
  { id: 'S-42', label: 'S', color: '#808183', text: '#fff', group: 'shuttle', fullName: '42 St Shuttle' },
  { id: 'S-FR', label: 'S', sup: 'F', color: '#808183', text: '#fff', group: 'shuttle', fullName: 'Franklin Av Shuttle' },
  { id: 'S-RK', label: 'S', sup: 'R', color: '#808183', text: '#fff', group: 'shuttle', fullName: 'Rockaway Park Shuttle' },

  // ── Staten Island Railway ──
  // Smaller font to fit 3 chars in a circle, matching official signage
  { id: 'SIR', label: 'SIR', color: '#003DA5', text: '#fff', group: 'sir', small: true },
]

export default SERVICES
export const TOTAL_SERVICES = SERVICES.length // 27
