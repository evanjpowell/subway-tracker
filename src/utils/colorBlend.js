/**
 * Blend multiple hex colors with equal weight.
 *
 * For transfer stations with multiple lines, this produces a blended color
 * that represents all the lines serving that station.
 *
 * @param {string[]} colors - Array of hex color strings (e.g., ['#EE352E', '#2850AD'])
 * @returns {string} - Blended hex color string
 */
export function blendColors(colors) {
  if (!colors || colors.length === 0) return '#373737' // fallback grey
  if (colors.length === 1) return colors[0]

  // Parse hex colors to RGB
  const rgbs = colors.map(hex => {
    const h = hex.replace('#', '')
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    }
  })

  // Average each channel (equal weight per line)
  const avg = {
    r: Math.round(rgbs.reduce((sum, c) => sum + c.r, 0) / rgbs.length),
    g: Math.round(rgbs.reduce((sum, c) => sum + c.g, 0) / rgbs.length),
    b: Math.round(rgbs.reduce((sum, c) => sum + c.b, 0) / rgbs.length),
  }

  // Convert back to hex
  const toHex = n => n.toString(16).padStart(2, '0')
  return `#${toHex(avg.r)}${toHex(avg.g)}${toHex(avg.b)}`
}
