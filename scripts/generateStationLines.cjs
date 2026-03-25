#!/usr/bin/env node
/**
 * Generate static station-to-line-colors mapping from MTA open data.
 *
 * Run once to create src/data/stationLines.js
 * The MTA isn't building infrastructure fast enough for this to need to be dynamic.
 */

const fs = require('fs')
const path = require('path')

// Official MTA line colors (same as services.js, but grouped by trunk line)
const LINE_COLORS = {
  // Red line
  '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
  // Green line
  '4': '#00933C', '5': '#00933C', '6': '#00933C',
  // Purple line
  '7': '#B933AD',
  // Blue line (8th Ave)
  'A': '#2850AD', 'C': '#2850AD', 'E': '#2850AD',
  // Orange line (6th Ave)
  'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
  // Lime line (Crosstown)
  'G': '#6CBE45',
  // Brown line (Nassau)
  'J': '#996633', 'Z': '#996633',
  // Grey L line (Canarsie)
  'L': '#A7A9AC',
  // Yellow line (Broadway)
  'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
  // Grey shuttles
  'S': '#808183',
  // Staten Island Railway
  'SIR': '#003DA5',
}

// Read MTA data
const mtaData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/data/mta_stations_raw.json'), 'utf8')
)

// Group stations by complex_id
const complexes = {}
for (const station of mtaData) {
  const cid = station.complex_id
  if (!complexes[cid]) {
    complexes[cid] = { routes: new Set(), names: [] }
  }
  // Add all routes from this station
  const routes = station.daytime_routes.split(' ')
  for (const r of routes) {
    complexes[cid].routes.add(r)
  }
  complexes[cid].names.push(station.stop_name)
}

// Special case: Times Sq-42 St (611) should NOT include PABT (A C E)
// Station 163 (42 St-Port Authority Bus Terminal) shares complex 611 in MTA data
// but the app treats them as separate stations
const PABT_ROUTES = new Set(['A', 'C', 'E'])
const TIMES_SQ_COMPLEX = '611'

// Build the mapping: station ID (complex_id) -> array of unique line colors
const stationLines = {}

for (const [complexId, data] of Object.entries(complexes)) {
  let routes = data.routes

  // Handle Times Sq / PABT split
  if (complexId === TIMES_SQ_COMPLEX) {
    // Remove A C E from Times Sq (they belong to PABT, station 163)
    routes = new Set([...routes].filter(r => !PABT_ROUTES.has(r)))
  }

  // Get unique colors for these routes
  const colors = new Set()
  for (const route of routes) {
    const color = LINE_COLORS[route]
    if (color) colors.add(color)
  }

  stationLines[complexId] = [...colors]
}

// Add PABT separately (it's in the app as station 163)
// In MTA data, it's part of complex 611, but app separates it
stationLines['163'] = [LINE_COLORS['A']] // Blue line only

// Handle app stations with non-numeric IDs (manually assigned in station mapping)
// These are edge cases where the app uses a different ID scheme
// "203 St" - Rockaway Park-Beach 116 St (MTA complex_id 203, routes: A S)
stationLines['203 St'] = [LINE_COLORS['A'], LINE_COLORS['S']]
// "Jackson Hts-Roosevelt Av / 74 St" - (MTA complex_id 616, routes: E F M R + 7)
stationLines['Jackson Hts-Roosevelt Av / 74 St'] = [
  LINE_COLORS['E'], // Blue
  LINE_COLORS['F'], // Orange (will dedupe with M)
  LINE_COLORS['R'], // Yellow (will dedupe with others)
  LINE_COLORS['7'], // Purple
]

// Generate the output file
const output = `/**
 * Station to line colors mapping.
 *
 * Generated from MTA open data (https://data.ny.gov/resource/39hk-dx4f.json)
 * Station IDs correspond to MTA complex_id values.
 *
 * Special case: Station 163 (42 St-Port Authority Bus Terminal) is treated
 * separately from complex 611 (Times Sq-42 St), even though MTA groups them.
 *
 * Each station maps to an array of unique line colors (hex strings).
 * For single-line stations, the array has one color.
 * For transfer stations, the array has multiple colors to blend.
 */

const STATION_LINES = ${JSON.stringify(stationLines, null, 2)}

export default STATION_LINES
`

fs.writeFileSync(
  path.join(__dirname, '../src/data/stationLines.js'),
  output,
  'utf8'
)

console.log(`Generated stationLines.js with ${Object.keys(stationLines).length} stations`)

// Summary stats
const singleColor = Object.values(stationLines).filter(c => c.length === 1).length
const multiColor = Object.values(stationLines).filter(c => c.length > 1).length
console.log(`  Single-line stations: ${singleColor}`)
console.log(`  Transfer stations: ${multiColor}`)
