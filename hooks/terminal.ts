// The terminal draws no theme and no SVG backdrop, so the dashboard draws the
// same scene into a Raster: every cell a glyph, a foreground and a background.
// The hooks module builds a DashView from its state; this file only paints it.

export type DashWin = { id: 'term' | 'map' | 'rss' | 'weather' | 'time'; isOn: boolean; x: number; y: number; w: number; h: number }
export type DashLine = { mark: string; markColor: number; tool: string; arg: string; time: string; isRunning: boolean }
export type DashView = {
  now: number
  bat: readonly string[]
  wins: DashWin[]
  clock: { hh: string; mm: string; ss: string; date: string; there: string; day: number }
  weather: { title: string; isReady: boolean; hint: string; glyph: string; temp: string; words: string; hi: string; lo: string; feels: string; line2: string; line3: string; line4: string; hours: { h: number; t: number }[] }
  map: { title: string; right: string; isReady: boolean; hint: string; major: string; minor: string }
  feed: { right: string; hint: string; items: { source: string; title: string; age: string }[] }
  term: { isActive: boolean; lines: DashLine[] }
}

const C = {
  bg: 0x08090a,
  panel: 0x050505,
  edge: 0x2e3236,
  grid: 0x1c1e21,
  sweep: 0x0e1012,
  dim: 0x4a5056,
  muted: 0x8a8f96,
  soft: 0xbfc5cc,
  text: 0xe8e8e8,
  steel: 0x9aa1a9,
  yellow: 0xffd400,
  red: 0xd9534f,
  green: 0x6fa86f,
}
export const colorOf = (hex: string) => parseInt(hex.replace('#', ''), 16)
const mix = (a: number, b: number, t: number) => {
  const k = Math.max(0, Math.min(1, t))
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

// shortcut: width-1 check by code-point ranges, not a full wcwidth table; anything else is drawn as '·'.
const isNarrow = (cp: number) =>
  (cp >= 0x20 && cp < 0x7f) ||
  (cp >= 0xa0 && cp < 0x0300) ||
  (cp >= 0x0370 && cp < 0x0530) ||
  (cp >= 0x2010 && cp <= 0x2027) ||
  (cp >= 0x2030 && cp <= 0x205e) ||
  (cp >= 0x20a0 && cp <= 0x20bf) ||
  (cp >= 0x2190 && cp <= 0x21ff) ||
  (cp >= 0x2200 && cp <= 0x22ff) ||
  (cp >= 0x2500 && cp <= 0x25ff) ||
  (cp >= 0x2800 && cp <= 0x28ff) ||
  [0x2600, 0x2601, 0x2602, 0x263e, 0x2713, 0x2717, 0x2744].includes(cp)

type Canvas = { cols: number; rows: number; cells: Uint32Array }
const put = (c: Canvas, x: number, y: number, cp: number, fg: number, bg?: number) => {
  if (x < 0 || y < 0 || x >= c.cols || y >= c.rows) {
    return
  }
  const i = (y * c.cols + x) * 3
  c.cells[i] = cp
  c.cells[i + 1] = fg
  if (bg !== undefined) {
    c.cells[i + 2] = bg
  }
}
// Writes text from (x, y), at most `max` cells; returns the cells used.
const text = (c: Canvas, x: number, y: number, s: string, fg: number, max = Infinity) => {
  let n = 0
  for (const ch of s) {
    if (n >= max) {
      break
    }
    const cp = ch.codePointAt(0) ?? 0x20
    put(c, x + n, y, isNarrow(cp) ? cp : cp < 0x20 ? 0x20 : 0xb7, fg)
    n++
  }
  return n
}
const width = (s: string) => [...s].length
const cut = (s: string, n: number) => (n <= 0 ? '' : width(s) > n ? [...s].slice(0, Math.max(0, n - 1)).join('') + '…' : s)

// ---------------------------------------------------------------- braille
type Dots = { w: number; h: number; v: Uint8Array }
const dotsOf = (w: number, h: number): Dots => ({ w, h, v: new Uint8Array(Math.max(0, w * h)) })
const dot = (d: Dots, x: number, y: number, value: number) => {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px >= 0 && py >= 0 && px < d.w && py < d.h) {
    const i = py * d.w + px
    d.v[i] = Math.max(d.v[i] ?? 0, value)
  }
}
const line = (d: Dots, x0: number, y0: number, x1: number, y1: number, value: number) => {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
  for (let s = 0; s <= steps; s++) {
    dot(d, x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps, value)
  }
}
const BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]
// Paints a dot field as braille from cell (cx, cy); a cell's colour comes from its strongest dot.
const paintDots = (c: Canvas, d: Dots, cx: number, cy: number, colour: (value: number, i: number, j: number) => number) => {
  for (let j = 0; j * 4 < d.h; j++) {
    for (let i = 0; i * 2 < d.w; i++) {
      let bits = 0
      let top = 0
      for (let r = 0; r < 4; r++) {
        for (let k = 0; k < 2; k++) {
          const x = i * 2 + k
          const y = j * 4 + r
          const value = x < d.w && y < d.h ? (d.v[y * d.w + x] ?? 0) : 0
          if (value > 0) {
            bits |= BITS[r]?.[k] ?? 0
            top = Math.max(top, value)
          }
        }
      }
      if (bits !== 0) {
        put(c, cx + i, cy + j, 0x2800 + bits, colour(top, i, j))
      }
    }
  }
}

// The bat bitmap at `pw` dots wide, squeezed sideways by `squeeze` (1 face on, near 0 edge on).
const batDots = (bat: readonly string[], pw: number, squeeze: number) => {
  const cols = Math.max(1, ...bat.map(row => row.length))
  const ph = Math.max(2, Math.round((pw * bat.length * 1.69) / cols))
  const d = dotsOf(pw, ph)
  const half = pw / 2
  const s = Math.max(0.04, squeeze)
  for (let py = 0; py < ph; py++) {
    const row = bat[Math.min(bat.length - 1, Math.floor(((py + 0.5) / ph) * bat.length))] ?? ''
    for (let px = 0; px < pw; px++) {
      const u = (px + 0.5 - half) / (half * s)
      if (Math.abs(u) <= 1 && row.charAt(Math.min(cols - 1, Math.floor(((u + 1) / 2) * cols))) === '#') {
        dot(d, px, py, 1)
      }
    }
  }
  return d
}

// ---------------------------------------------------------------- big digits
// 3x5 dots per digit, drawn with half blocks into 3 rows of cells.
const FONT: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  ':': ['0', '1', '0', '1', '0'],
}
const big = (c: Canvas, x: number, y: number, s: string, fg: number) => {
  let cx = x
  for (const ch of s) {
    const g = FONT[ch]
    if (g === undefined) {
      continue
    }
    const w = g[0]?.length ?? 0
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < w; k++) {
        const top = g[r * 2]?.charAt(k) === '1'
        const bottom = g[r * 2 + 1]?.charAt(k) === '1'
        if (top || bottom) {
          put(c, cx + k, y + r, top && bottom ? 0x2588 : top ? 0x2580 : 0x2584, fg)
        }
      }
    }
    cx += w + 1
  }
  return cx - x - 1
}
const bigWidth = (s: string) => [...s].reduce((n, ch) => n + (FONT[ch]?.[0]?.length ?? 0) + 1, -1)

// ---------------------------------------------------------------- panels
type Body = { x: number; y: number; w: number; h: number }
const panel = (c: Canvas, x: number, y: number, w: number, h: number, title: string, right: string): Body => {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      put(c, xx, yy, 0x20, C.text, C.panel)
    }
  }
  for (let xx = x + 1; xx < x + w - 1; xx++) {
    put(c, xx, y, 0x2500, C.edge)
    put(c, xx, y + h - 1, 0x2500, C.edge)
  }
  for (let yy = y + 1; yy < y + h - 1; yy++) {
    put(c, x, yy, 0x2502, C.edge)
    put(c, x + w - 1, yy, 0x2502, C.edge)
  }
  put(c, x, y, 0x256d, C.edge)
  put(c, x + w - 1, y, 0x256e, C.edge)
  put(c, x, y + h - 1, 0x2570, C.edge)
  put(c, x + w - 1, y + h - 1, 0x256f, C.edge)
  // The title comes first; the right label and the window dots only where they fit.
  const t0 = ` ${title} `
  const isDotted = w >= width(t0) + width(right) + 16
  const left = isDotted ? x + 8 : x + 2
  const r = right !== '' && left + width(t0) + width(right) + 3 <= x + w - 2 ? ` ${right} ` : ''
  const t = ` ${cut(title, Math.max(0, x + w - 2 - width(r) - left - 2))} `
  if (isDotted) {
    put(c, x + 2, y, 0x25cf, C.red)
    put(c, x + 4, y, 0x25cf, C.yellow)
    put(c, x + 6, y, 0x25cf, C.green)
  }
  const tx = Math.max(left, Math.min(x + Math.floor((w - width(t)) / 2), x + w - 2 - width(r) - width(t)))
  text(c, tx, y, t, C.muted)
  if (t.trimStart().startsWith('◆')) {
    put(c, tx + 1, y, 0x25c6, C.yellow)
  }
  if (r !== '') {
    text(c, x + w - 2 - width(r), y, r, C.muted)
  }
  return { x: x + 2, y: y + 1, w: w - 4, h: h - 2 }
}
const centre = (c: Canvas, b: Body, s: string, fg: number) => {
  const t = cut(s, b.w)
  text(c, b.x + Math.floor((b.w - width(t)) / 2), b.y + Math.floor((b.h - 1) / 2), t, fg)
}

const clockOf = (c: Canvas, b: Body, v: DashView['clock'], now: number) => {
  let y = b.y
  const time = `${v.hh}:${v.mm}`
  if (b.h >= 5 && b.w >= bigWidth(time)) {
    const used = big(c, b.x, y, time, C.text)
    if (b.w - used >= 4) {
      text(c, b.x + used + 1, y + 2, `:${v.ss}`, C.muted)
    }
    y += 3
  } else {
    text(c, b.x, y, `${time}:${v.ss}`, C.text, b.w)
    y += 1
  }
  if (y < b.y + b.h) {
    text(c, b.x, y++, v.date, C.muted, b.w)
  }
  if (v.there !== '' && y < b.y + b.h - (b.h >= 6 ? 1 : 0)) {
    put(c, b.x, y, 0x25c6, C.yellow)
    text(c, b.x + 2, y++, v.there, C.soft, b.w - 2)
  }
  if (b.h >= 6) {
    // The day so far, and a moving tick for the seconds.
    const filled = Math.round(b.w * v.day)
    for (let k = 0; k < b.w; k++) {
      put(c, b.x + k, b.y + b.h - 1, k < filled ? 0x2501 : 0x2500, k < filled ? C.yellow : C.grid)
    }
    put(c, b.x + Math.floor(((now % 60000) / 60000) * b.w), b.y + b.h - 1, 0x2502, C.text)
  }
}

const SPARK = '▁▂▃▄▅▆▇█'
const weatherOf = (c: Canvas, b: Body, v: DashView['weather']) => {
  if (!v.isReady) {
    centre(c, b, v.hint, C.muted)
    return
  }
  text(c, b.x, b.y, v.glyph, C.yellow)
  const n = text(c, b.x + 2, b.y, v.temp, C.text)
  text(c, b.x + 3 + n, b.y, v.words, C.soft, Math.max(0, b.w - 3 - n))
  if (b.h >= 2) {
    put(c, b.x, b.y + 1, 0x25b2, C.yellow)
    const hi = text(c, b.x + 1, b.y + 1, v.hi, C.text)
    put(c, b.x + 2 + hi, b.y + 1, 0x25bc, C.dim)
    const lo = text(c, b.x + 3 + hi, b.y + 1, v.lo, C.text)
    text(c, b.x + 4 + hi + lo, b.y + 1, `· ${v.feels}`, C.muted, Math.max(0, b.w - 4 - hi - lo))
  }
  if (b.h >= 3) {
    text(c, b.x, b.y + 2, v.line2, C.muted, b.w)
  }
  if (b.h >= 4) {
    text(c, b.x, b.y + 3, v.line3, C.muted, b.w)
  }
  if (b.h >= 5) {
    text(c, b.x, b.y + 4, v.line4, C.muted, b.w)
  }
  if (b.h >= 8 && v.hours.length >= 2) {
    const ts = v.hours.map(one => one.t)
    const lo = Math.min(...ts)
    const span = Math.max(1, Math.max(...ts) - lo)
    const row = b.y + b.h - 2
    for (let k = 0; k < b.w; k++) {
      const hour = v.hours[Math.min(v.hours.length - 1, Math.floor((k * v.hours.length) / b.w))]
      const level = Math.round((((hour?.t ?? lo) - lo) / span) * (SPARK.length - 1))
      put(c, b.x + k, row, SPARK.codePointAt(level) ?? 0x2581, C.yellow)
    }
    // Hour labels under the line, each only where it clears the one before.
    let free = b.x
    for (let i = 0; i < v.hours.length; i += 3) {
      const label = `${String(v.hours[i]?.h ?? 0).padStart(2, '0')}h`
      const lx = b.x + Math.floor((i * b.w) / v.hours.length)
      if (lx >= free && lx + width(label) <= b.x + b.w) {
        free = lx + text(c, lx, row + 1, label, C.muted) + 1
      }
    }
  }
}

// MapData paths are "M x y L x y …" in panel pixels, 140 px to 3.5 km.
const polylines = (d: string) => {
  const out: [number, number][][] = []
  for (const m of d.matchAll(/([ML])(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)) {
    const pt: [number, number] = [Number(m[2]), Number(m[3])]
    if (m[1] === 'M' || out.length === 0) {
      out.push([pt])
    } else {
      out[out.length - 1]?.push(pt)
    }
  }
  return out
}
const mapOf = (c: Canvas, b: Body, v: DashView['map'], now: number) => {
  if (!v.isReady) {
    centre(c, b, v.hint, C.muted)
    return
  }
  const pw = b.w * 2
  const ph = b.h * 4
  const d = dotsOf(pw, ph)
  const scale = (Math.min(pw, ph) / 2 / 140) * 1.1
  const draw = (path: string, value: number) => {
    for (const pts of polylines(path)) {
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1]
        const z = pts[k]
        if (a !== undefined && z !== undefined) {
          line(d, pw / 2 + a[0] * scale, ph / 2 + a[1] * scale, pw / 2 + z[0] * scale, ph / 2 + z[1] * scale, value)
        }
      }
    }
  }
  draw(v.minor, 1)
  draw(v.major, 2)
  // The radar: a sweep turning every 6 s, lighting the roads just behind it.
  const sweep = ((now % 6000) / 6000) * Math.PI * 2
  for (let r = 0; r < Math.min(pw, ph) / 2; r += 0.7) {
    dot(d, pw / 2 + Math.cos(sweep) * r, ph / 2 + Math.sin(sweep) * r, 3)
  }
  paintDots(c, d, b.x, b.y, (value, i, j) => {
    const angle = Math.atan2((j + 0.5) * 4 - ph / 2, (i + 0.5) * 2 - pw / 2)
    const behind = (sweep - angle + Math.PI * 4) % (Math.PI * 2)
    const base = value >= 3 ? 0x6b5a10 : value === 2 ? C.steel : C.dim
    return value < 3 && behind < 0.9 ? mix(C.yellow, base, behind / 0.9) : base
  })
  put(c, b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2), now % 1200 < 800 ? 0x25c9 : 0x25cf, C.yellow)
}

const feedOf = (c: Canvas, b: Body, v: DashView['feed']) => {
  if (v.items.length === 0) {
    centre(c, b, v.hint, C.muted)
    return
  }
  v.items.slice(0, b.h).forEach((one, k) => {
    const source = cut(one.source, 14)
    const n = text(c, b.x, b.y + k, source, C.yellow)
    text(c, b.x + n + 1, b.y + k, cut(one.title, b.w - n - 1 - width(one.age) - 1), C.text)
    text(c, b.x + b.w - width(one.age), b.y + k, one.age, C.muted)
  })
}

const termOf = (c: Canvas, b: Body, v: DashView['term'], now: number) => {
  const shown = v.lines.slice(-Math.max(0, b.h - 1))
  shown.forEach((one, k) => {
    const y = b.y + k
    put(c, b.x, y, one.mark.codePointAt(0) ?? 0x20, one.isRunning && now % 1100 > 550 ? C.dim : one.markColor)
    put(c, b.x + 2, y, 0x24, C.yellow)
    const n = text(c, b.x + 4, y, one.tool, C.text)
    text(c, b.x + 5 + n, y, cut(one.arg, b.w - 6 - n - width(one.time)), C.soft)
    text(c, b.x + b.w - width(one.time), y, one.time, C.muted)
  })
  const py = b.y + shown.length
  put(c, b.x, py, 0x24, C.yellow)
  if (now % 1100 < 550) {
    put(c, b.x + 2, py, 0x2588, C.text)
  }
}

const TITLES: Record<DashWin['id'], (v: DashView) => [string, string]> = {
  term: () => ['bat-term · tool calls', ''],
  map: v => [v.map.title, v.map.right],
  rss: v => ['◆ FEED', v.feed.right],
  weather: v => [v.weather.title, '°C'],
  time: () => ['◆ CLOCK', 'local'],
}

// The whole scene for a cols x rows Raster, as its `cells` string.
export const dashCells = (v: DashView, cols: number, rows: number): string => {
  const c: Canvas = { cols, rows, cells: new Uint32Array(cols * rows * 3) }
  const now = v.now
  const sweepRow = Math.floor((((now % 7000) / 7000) * (rows + 6)) - 3)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const isGrid = x % 8 === 0 && y % 4 === 0
      put(c, x, y, isGrid ? 0xb7 : 0x20, C.grid, Math.abs(y - sweepRow) <= 1 ? C.sweep : C.bg)
    }
  }
  text(c, 1, 0, '◆ TermiSSH // SSH workspace', C.muted)
  put(c, 1, 0, 0x25c6, C.yellow)
  text(c, 1, 1, 'uplink ........ secure', C.dim)
  const hud = 'GRID 07 // SECTOR 13'
  text(c, cols - width(hud) - 1, 0, hud, C.dim)

  // The bat turns every 8 s; face on it is brightest.
  const turn = Math.cos(((now % 8000) / 8000) * Math.PI * 2)
  const face = Math.abs(turn)
  const bw = Math.max(10, Math.round(cols * 0.34))
  const bd = batDots(v.bat, bw * 2, face)
  const bh = Math.ceil(bd.h / 4)
  paintDots(c, bd, Math.round(cols / 2 - bw / 2), Math.round(rows * 0.43 - bh / 2), () => mix(0x3a4046, 0xdfe3e8, face))

  const sx = cols / 1600
  const sy = rows / 1000
  for (const win of v.wins) {
    if (!win.isOn || (win.id === 'term' && !v.term.isActive)) {
      continue
    }
    const x = Math.round(win.x * sx)
    const y = Math.round(win.y * sy)
    const w = Math.min(cols - x, Math.max(12, Math.round(win.w * sx)))
    const h = Math.min(rows - y, Math.max(4, Math.round(win.h * sy)))
    if (w < 8 || h < 3) {
      continue
    }
    const [title, right] = TITLES[win.id](v)
    const b = panel(c, x, y, w, h, title, right)
    if (b.w < 4 || b.h < 1) {
      continue
    }
    if (win.id === 'time') {
      clockOf(c, b, v.clock, now)
    } else if (win.id === 'weather') {
      weatherOf(c, b, v.weather)
    } else if (win.id === 'map') {
      mapOf(c, b, v.map, now)
    } else if (win.id === 'rss') {
      feedOf(c, b, v.feed)
    } else {
      termOf(c, b, v.term, now)
    }
  }

  // The badge: a small bat in the corner with a heartbeat.
  const beat = now % 1600
  const pulse = beat < 160 ? beat / 160 : beat < 320 ? 1 - (beat - 160) / 160 : beat < 480 ? (beat - 320) / 320 : beat < 720 ? 0.5 - (beat - 480) / 480 : 0
  const badge = batDots(v.bat, 20, 1)
  paintDots(c, badge, cols - 12, rows - 3, () => mix(0x8a7400, C.yellow, 0.4 + pulse))

  return (new Uint8Array(c.cells.buffer) as Uint8Array & { toBase64: () => string }).toBase64()
}
