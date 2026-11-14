import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Corner, FeedItem, Layout, MapData, Place, TermLine, Weather, Widget } from '../types'

import type { LayoutProps, LayoutWin } from './layout'
import { colorOf, dashCells, type DashView } from './terminal'

const MANAGE = 'bat-cave-manage'
// The terminal's stand-in for the backdrop: the same scene drawn in a Raster.
const DASH = 'bat-cave-dash'


import { makeColors } from './make-colors.js'

// TermiSSH's "Dark Knight" palette: black and steel grey do the work, bat
// yellow is rationed to the accent.
const { theme, problems } = makeColors({
  label: 'Bat terminal',
  only: 'dark',
  roles: { accent: '#ffd400', danger: '#d9534f', success: '#6fa86f', warning: '#e0a030', pro: '#a09aab' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#08090a',
        'surface-1': '#0e0f11',
        'surface-2': '#121316',
        'surface-3': '#1c1e21',
        'text-primary': '#e8e8e8',
        'text-secondary': '#bfc5cc',
        'text-muted': '#8a8f96',
      },
    },
  },
})

// The mod's own bat emblem, rasterized to block cells (121 x 22) and drawn the
// way TermiSSH draws its backdrop: one shade for the whole plate, from █ face-on
// to ░ edge-on, while scaleX fakes a constant-speed Y-axis turn.
const BAT = [
  ' ###                                                                                                                 ### ',
  '  ##########                                                                                                 ##########  ',
  '   ################                                                                                   ################   ',
  '   ######################                               #       #                               ######################   ',
  '    ###########################                         #       #                         ###########################    ',
  '     ###############################                    #       #                    ###############################     ',
  '     ####################################              ###     ###              ####################################     ',
  '      #########################################        ###     ###        #########################################      ',
  '      ############################################### ############# ###############################################      ',
  '      #############################################################################################################      ',
  '      #############################################################################################################      ',
  '      #############################################################################################################      ',
  '      #############################################################################################################      ',
  '     ###############################################################################################################     ',
  '     ###          ##########  #############################################################  ##########          ###     ',
  '                     ##            ###################################################            ##                     ',
  '                                     ####    ###############################    ####                                     ',
  '                                                #########################                                                ',
  '                                                  #####################                                                  ',
  '                                                   #    #########    #                                                   ',
  '                                                           ###                                                           ',
  '                                                            #                                                            ',
]
// The same bat as a solid path, for the small badge: one rectangle per run of cells.
const BADGE = BAT.map((row, y) =>
  [...row.matchAll(/#+/g)].map(m => `M${m.index ?? 0} ${(y * 1.69).toFixed(2)}h${m[0].length}v1.75h-${m[0].length}Z`).join(''),
).join('')
const COLW = 600 / 121
const ROWH = 184 / 22
const plate = (glyph: string, cls: string) =>
  `<g class="sh ${cls}">` +
  BAT.map(
    (row, i) =>
      `<text x="-300" y="${(-92 + (i + 0.5) * ROWH + 2.9).toFixed(1)}" textLength="${(121 * COLW).toFixed(0)}" lengthAdjust="spacingAndGlyphs">${row.replaceAll('#', glyph).replaceAll(' ', '\u00a0')}</text>`,
  ).join('') +
  '</g>'


// The scene, redrawn on every tool call. The phases (seconds into each loop,
// from the wall clock) keep the bat turning smoothly across redraws.
const sceneOf = (widgets: string, p8: number, p7: number, p60: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
<defs>
  <radialGradient id="vig" cx="50%" cy="45%" r="75%">
    <stop offset="0" stop-color="#101114"/><stop offset="0.55" stop-color="#08090a"/><stop offset="1" stop-color="#000"/>
  </radialGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#bfc5cc" stop-opacity="0.16"/><stop offset="1" stop-color="#7e848c" stop-opacity="0"/>
  </radialGradient>
  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
    <path d="M40 0H0V40" fill="none" stroke="#2e3236" stroke-opacity="0.35" stroke-width="1"/>
  </pattern>
  <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
    <rect width="4" height="1.4" fill="#000" fill-opacity="0.45"/>
  </pattern>
  <filter id="glow" x="-30%" y="-60%" width="160%" height="220%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b"/><feFlood flood-color="#ffd400" flood-opacity=".45"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<style>
  .spin{transform-box:fill-box;transform-origin:center;animation:spin 8s linear infinite}
  .plate text{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:8.4px;fill:#9aa1a9;fill-opacity:1;letter-spacing:0}
  .sh{opacity:0;animation:8s step-end infinite} .s0{opacity:1;animation-name:s0} .s1{animation-name:s1} .s2{animation-name:s2} .s3{animation-name:s3}
  .halo{animation:breathe 6s ease-in-out infinite alternate}
  .scan{animation:roll 1.2s linear infinite}
  .sweep{animation:sweep 7s linear infinite}
  .cur{animation:blink 1.1s steps(1) infinite}
  .spin,.sh{animation-delay:-${p8.toFixed(2)}s} .sweep{animation-delay:-${p7.toFixed(2)}s} .secs{animation-delay:-${p60.toFixed(2)}s}
  text{font-family:ui-monospace,Menlo,Consolas,monospace;fill:#8a8f96;fill-opacity:.6;font-size:15px;letter-spacing:1px}
  @keyframes spin{
    0%{transform:scaleX(1)} 25%{transform:scaleX(0)} 50%{transform:scaleX(-1)} 75%{transform:scaleX(0)} 100%{transform:scaleX(1)}}
  @keyframes s0{0%{opacity:1}6.25%{opacity:0}43.75%{opacity:1}56.25%{opacity:0}93.75%{opacity:1}100%{opacity:1}}
  @keyframes s1{0%{opacity:0}6.25%{opacity:1}12.5%{opacity:0}37.5%{opacity:1}43.75%{opacity:0}56.25%{opacity:1}62.5%{opacity:0}87.5%{opacity:1}93.75%{opacity:0}100%{opacity:0}}
  @keyframes s2{0%{opacity:0}12.5%{opacity:1}18.75%{opacity:0}31.25%{opacity:1}37.5%{opacity:0}62.5%{opacity:1}68.75%{opacity:0}81.25%{opacity:1}87.5%{opacity:0}100%{opacity:0}}
  @keyframes s3{0%{opacity:0}18.75%{opacity:1}31.25%{opacity:0}68.75%{opacity:1}81.25%{opacity:0}100%{opacity:0}}
  @keyframes breathe{from{opacity:.6}to{opacity:1}}
  @keyframes roll{from{transform:translateY(0)}to{transform:translateY(4px)}}
  @keyframes sweep{from{transform:translateY(-120px)}to{transform:translateY(1100px)}}
  @keyframes blink{0%{opacity:1}50%{opacity:0}}
  .tl{font-size:14px;fill-opacity:1;letter-spacing:0} .tt{font-size:12px;fill:#8a8f96;fill-opacity:1;letter-spacing:0}
  .fresh{animation:fresh .6s ease-out}
  .radar{transform-box:fill-box;transform-origin:center;animation:radar 6s linear infinite}
  .secs{transform-box:fill-box;transform-origin:center;animation-name:radar;animation-duration:60s;animation-timing-function:linear;animation-iteration-count:infinite}
  .big{font-size:52px;fill:#e8e8e8;fill-opacity:1;font-weight:bold;letter-spacing:2px} .glyph{font-size:44px;fill:#ffd400;fill-opacity:1;letter-spacing:0}
  @keyframes radar{to{transform:rotate(360deg)}}
  .beat{transform-box:fill-box;transform-origin:center;animation:beat 1.6s ease-in-out infinite}
  @keyframes beat{0%,100%{transform:scale(1)}15%{transform:scale(1.14)}30%{transform:scale(1)}45%{transform:scale(1.08)}}
  .ping{transform-box:fill-box;transform-origin:center;animation:ping 2.4s ease-out infinite}
  @keyframes ping{from{transform:scale(.3);opacity:1}to{transform:scale(3);opacity:0}}
  @keyframes fresh{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion: reduce){*{animation:none!important}}
</style>
<rect width="1600" height="1000" fill="url(#vig)"/>
<rect width="1600" height="1000" fill="url(#grid)"/>
<ellipse class="halo" cx="800" cy="430" rx="520" ry="300" fill="url(#halo)"/>
<g transform="translate(800 430) scale(1.15)">
  <g class="spin" filter="url(#glow)">
    <g class="plate">${plate('█', 's0')}${plate('▓', 's1')}${plate('▒', 's2')}${plate('░', 's3')}</g>
  </g>
</g>
<text x="40" y="60"><tspan fill="#ffd400" fill-opacity="1">◆</tspan> TermiSSH  //  SSH workspace</text>
<text x="40" y="84">uplink ........ secure</text>
<text x="1560" y="60" text-anchor="end">GRID 07 // SECTOR 13</text>
${widgets}
<g transform="translate(1545 915)">
  <circle class="ping" r="32" fill="none" stroke="#ffd400" stroke-opacity=".6"/>
  <g class="beat">
    <ellipse rx="32" ry="32" fill="#050505" fill-opacity=".92" stroke="#ffd400" stroke-width="2.5"/>
    <path d="${BADGE}" fill="#ffd400" transform="scale(.42) translate(-60.5 -18.6)"/>
  </g>
</g>
<rect class="sweep" x="0" y="0" width="1600" height="90" fill="#7e848c" fill-opacity="0.025"/>
<rect class="scan" x="0" y="-4" width="1600" height="1008" fill="url(#scan)" pointer-events="none"/>
</svg>`

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'bat-signal', glass: { blur: 10, tint: '#08090a', opacity: 0.62 } },
}


// ---------------------------------------------------------------- state
const DEFAULT_LAYOUT: Layout = {
  isOn: true,
  term: { isOn: true, x: 50, y: 560, k: 1, w: 560, h: 350 },
  map: { isOn: true, x: 1130, y: 110, k: 1, w: 420, h: 300, place: null },
  rss: { isOn: true, x: 1090, y: 560, k: 1, w: 460, h: 300, feeds: [] },
  weather: { isOn: true, x: 50, y: 300, k: 1, w: 320, h: 250 },
  time: { isOn: true, x: 50, y: 110, k: 1, w: 320, h: 170 },
}
const lines = atom({ plugin: 'bat-cave', key: 'lines' } as const, [], { shape: 'lines-1' })
// Shown from a turn's first tool call until the main turn ends; hidden otherwise.
const isActive = atom({ plugin: 'bat-cave', key: 'isActive' } as const, false)
const layout = atom({ plugin: 'bat-cave', key: 'layout' } as const, DEFAULT_LAYOUT, { shape: 'layout-5' })
const mapData = atom({ plugin: 'bat-cave', key: 'map' } as const, null as MapData | null, { shape: 'map-2' })
const mapStatus = atom({ plugin: 'bat-cave', key: 'mapStatus' } as const, '')
const feed = atom({ plugin: 'bat-cave', key: 'feed' } as const, [] as FeedItem[], { shape: 'feed-1' })
const feedStatus = atom({ plugin: 'bat-cave', key: 'feedStatus' } as const, '')
const places = atom({ plugin: 'bat-cave', key: 'places' } as const, [] as Place[], { shape: 'places-1' })
const weather = atom({ plugin: 'bat-cave', key: 'weather' } as const, null as Weather | null, { shape: 'weather-2' })
const weatherStatus = atom({ plugin: 'bat-cave', key: 'weatherStatus' } as const, '')
// Bumped every 15 s while the clock shows, so the backdrop redraws its minutes.
const tick = atom({ plugin: 'bat-cave', key: 'tick' } as const, 0)
const CORNERS: readonly Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const isCorner = (v: unknown): v is Corner => typeof v === 'string' && (CORNERS as readonly string[]).includes(v)
const SIZE_K: Record<string, number> = { s: 0.8, small: 0.8, m: 1, medium: 1, l: 1.25, large: 1.25 }
const WIDGETS = ['term', 'map', 'rss', 'weather', 'time'] as const
type WidgetName = (typeof WIDGETS)[number]
const isWidget = (v: unknown): v is WidgetName => (WIDGETS as readonly unknown[]).includes(v)
// Each widget's drawn size in the scene at scale 1.
const BASE: Record<WidgetName, [number, number]> = { term: [560, 350], map: [420, 300], rss: [460, 300], weather: [320, 250], time: [320, 170] }
// The smallest panel each widget still reads at, before scaling.
const MIN: Record<WidgetName, [number, number]> = { term: [300, 150], map: [220, 160], rss: [260, 150], weather: [240, 200], time: [260, 160] }
const LABELS: Record<WidgetName, string> = { term: 'bat-term', map: 'grid', rss: 'feed', weather: 'weather', time: 'clock' }
// A corner's place for a widget at scale k, inside the scene's margins.
const cornerAt = (name: WidgetName, at: Corner, k: number) => ({
  x: at.endsWith('left') ? 50 : 1550 - BASE[name][0] * k,
  y: at.startsWith('top') ? 110 : 910 - BASE[name][1] * k,
})
const clampK = (k: number) => Math.max(0.5, Math.min(1.8, k))
// Keeps a widget inside the scene at a sane scale and size.
const placed = <W extends Widget>(name: WidgetName, w: W): W => {
  const k = clampK(w.k)
  const width = Math.round(Math.max(MIN[name][0], Math.min(w.w, 1600 / k)))
  const height = Math.round(Math.max(MIN[name][1], Math.min(w.h, 1000 / k)))
  return {
    ...w,
    k,
    w: width,
    h: height,
    x: Math.round(Math.max(0, Math.min(w.x, 1600 - width * k))),
    y: Math.round(Math.max(0, Math.min(w.y, 1000 - height * k))),
  }
}

// A saved layout from any earlier version, filled out to the current shape.
// 0.4 kept a corner (at) and a size word (size) in place of x, y and k.
const widgetFrom = (name: WidgetName, saved: unknown): Widget => {
  const o = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>
  const d = DEFAULT_LAYOUT[name]
  const k = typeof o.k === 'number' ? o.k : typeof o.size === 'string' ? (SIZE_K[o.size] ?? 1) : d.k
  const at = typeof o.x === 'number' && typeof o.y === 'number' ? { x: o.x, y: o.y } : isCorner(o.at) ? cornerAt(name, o.at, k) : { x: d.x, y: d.y }
  const w = typeof o.w === 'number' ? o.w : BASE[name][0]
  const h = typeof o.h === 'number' ? o.h : BASE[name][1]
  return placed(name, { isOn: typeof o.isOn === 'boolean' ? o.isOn : d.isOn, k, w, h, ...at })
}
const layoutFrom = (saved: unknown): Layout => {
  const s = (typeof saved === 'object' && saved !== null ? saved : {}) as Partial<Layout>
  return {
    isOn: s.isOn !== false,
    term: widgetFrom('term', s.term),
    map: { ...widgetFrom('map', s.map), place: s.map?.place ?? null },
    rss: { ...widgetFrom('rss', s.rss), feeds: Array.isArray(s.rss?.feeds) ? s.rss.feeds : [] },
    weather: widgetFrom('weather', s.weather),
    time: widgetFrom('time', s.time),
  }
}

// ---------------------------------------------------------------- drawing
const ARG_KEYS = ['command', 'file_path', 'pattern', 'url', 'query', 'path', 'description', 'prompt', 'skill']
const argOf = (input: Record<string, unknown>) => {
  const key = ARG_KEYS.find(k => typeof input[k] === 'string' && input[k] !== '')
  return key === undefined ? '' : String(input[key]).replace(/\s+/g, ' ').slice(0, 160)
}
const MARK = { run: '…', ok: '✓', err: '✗', deny: '⊘' } as const
const MARK_COLOR = { run: '#ffd400', ok: '#6fa86f', err: '#d9534f', deny: '#8a8f96' } as const
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const took = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)
const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

// The widget's panel at its place in the 1600x1000 scene, at its scale.
const panel = (w: Widget, title: string, right: string, body: string) => {
  const width = w.w
  const height = w.h
  return (
    `<g transform="translate(${w.x.toFixed(0)} ${w.y.toFixed(0)}) scale(${w.k})">` +
    `<rect width="${width}" height="${height}" rx="8" fill="#050505" fill-opacity=".88" stroke="#2e3236"/>` +
    `<path d="M0 30V8a8 8 0 0 1 8-8h${width - 16}a8 8 0 0 1 8 8V30Z" fill="#111214"/>` +
    '<circle cx="22" cy="15" r="5" fill="#d9534f"/><circle cx="40" cy="15" r="5" fill="#ffd400"/><circle cx="58" cy="15" r="5" fill="#6fa86f"/>' +
    `<text class="tt" x="${width / 2}" y="20" text-anchor="middle">${esc(title)}</text>` +
    `<text class="tt" x="${width - 14}" y="20" text-anchor="end">${esc(right)}</text>` +
    body +
    '</g>'
  )
}

// About 9 px per character of the 15 px mono text.
const charsIn = (px: number) => Math.max(10, Math.floor(px / 9))
const termOf = (list: TermLine[], w: Widget) => {
  const shown = list.slice(-Math.max(1, Math.floor((w.h - 86) / 24)))
  const rows = shown
    .map((one, i) => {
      const y = 60 + i * 24
      const time = one.state === 'run' ? '' : took(one.ms)
      const arg = cut(one.arg, Math.max(8, charsIn(w.w - 34) - one.tool.length - time.length))
      const mark = `<tspan class="${one.state === 'run' ? 'cur' : ''}" fill="${MARK_COLOR[one.state]}">${MARK[one.state]}</tspan>`
      const body = `${mark} <tspan fill="#ffd400">$</tspan> <tspan fill="#e8e8e8" font-weight="bold">${esc(one.tool)}</tspan> <tspan fill="#bfc5cc">${esc(arg)}</tspan>`
      const fresh = one.state === 'run' && i === shown.length - 1 ? ' fresh' : ''
      return `<text class="tl${fresh}" x="20" y="${y}">${body}</text>` + (time === '' ? '' : `<text class="tt" x="${w.w - 14}" y="${y}" text-anchor="end">${time}</text>`)
    })
    .join('')
  const prompt = `<text class="tl" x="20" y="${60 + shown.length * 24}"><tspan fill="#ffd400">$</tspan> <tspan class="cur" fill="#e8e8e8">█</tspan></text>`
  return panel(w, 'bat-term — tool calls', '', rows + prompt)
}

const mapOf = (w: Layout['map'], data: MapData | null, status: string) => {
  const place = w.place
  const right = place === null ? '' : `${Math.abs(place.lat).toFixed(2)}${place.lat >= 0 ? 'N' : 'S'} ${Math.abs(place.lon).toFixed(2)}${place.lon >= 0 ? 'E' : 'W'}`
  const title = `◆ GRID // ${place === null ? 'NO TARGET' : cut(place.label.split(',')[0] ?? '', 22).toUpperCase()}`
  const isReady = place !== null && data !== null && data.key === mapKey(place)
  const body = isReady
    ? `<clipPath id="mapclip"><rect x="1" y="30" width="${w.w - 2}" height="${w.h - 31}" rx="7"/></clipPath>` +
      `<g clip-path="url(#mapclip)"><g transform="translate(${w.w / 2} ${15 + w.h / 2})">` +
      `<path d="${data.minor}" fill="none" stroke="#3a4046" stroke-width="1"/>` +
      `<path d="${data.major}" fill="none" stroke="#9aa1a9" stroke-width="1.6"/>` +
      '<g class="radar"><circle r="200" fill="none"/><path d="M0 0L200 0A200 200 0 0 0 141 -141Z" fill="#ffd400" fill-opacity=".07"/></g>' +
      '<circle class="ping" r="6" fill="none" stroke="#ffd400" stroke-width="1.5"/><circle r="4" fill="#ffd400"/>' +
      '</g></g>'
    : `<text class="tt" x="${w.w / 2}" y="${20 + w.h / 2}" text-anchor="middle">${esc(status || 'search a place in /bat-cave')}</text>`
  return panel(w, title, right, body)
}

const ago = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / 60000))
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}
const rssOf = (w: Layout['rss'], items: FeedItem[], status: string, now: number) => {
  const rows = items.slice(0, Math.max(1, Math.floor((w.h - 84) / 24) + 1)).map((one, i) => {
    const y = 60 + i * 24
    return (
      `<text class="tl" x="20" y="${y}"><tspan fill="#ffd400">${esc(cut(one.source, 14))}</tspan> <tspan fill="#e8e8e8">${esc(cut(one.title, charsIn(w.w - 64) - Math.min(14, one.source.length)))}</tspan></text>` +
      `<text class="tt" x="${w.w - 14}" y="${y}" text-anchor="end">${one.at === 0 ? '' : ago(one.at, now)}</text>`
    )
  })
  const body =
    rows.length > 0
      ? rows.join('')
      : `<text class="tt" x="${w.w / 2}" y="${20 + w.h / 2}" text-anchor="middle">${esc(status || 'add feeds in /bat-cave')}</text>`
  return panel(w, '◆ FEED', `${w.feeds.length} source${w.feeds.length === 1 ? '' : 's'}`, body)
}

const two = (n: number) => String(n).padStart(2, '0')
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const cityOf = (p: Place) => cut(p.label.split(',')[0] ?? '', 16).toUpperCase()
const offsetOf = (sec: number) => {
  const m = Math.round(Math.abs(sec) / 60)
  return `${sec < 0 ? '−' : '+'}${Math.floor(m / 60)}${m % 60 === 0 ? '' : `:${two(m % 60)}`}`
}
// Local time large with an analog dial, the date and UTC offset, the time at
// the map's place once the weather has its offset, and a bar for the day gone.
const timeOf = (w: Widget, now: number, place: Place | null, data: Weather | null) => {
  const d = new Date(now)
  const local = -d.getTimezoneOffset() * 60
  const r = Math.max(24, Math.min(46, (w.h - 56) / 2))
  const cx = w.w - 22 - r
  const cy = 30 + (w.h - 44) / 2
  const there = place !== null && data !== null && data.key === mapKey(place) ? new Date(now + data.offset * 1000) : null
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const isQuarter = i % 3 === 0
    return `<path d="M0 -${r - (isQuarter ? 9 : 6)}V-${r - 2}" stroke="${i === 0 ? '#ffd400' : isQuarter ? '#bfc5cc' : '#4a5056'}" stroke-width="${isQuarter ? 2.5 : 1.5}" transform="rotate(${i * 30})"/>`
  }).join('')
  const hourDeg = ((d.getHours() % 12) + d.getMinutes() / 60) * 30
  const minDeg = (d.getMinutes() + d.getSeconds() / 60) * 6
  const dial =
    `<g transform="translate(${cx} ${cy})">` +
    `<circle r="${r}" fill="#0b0c0e" stroke="#2e3236" stroke-width="2"/>${ticks}` +
    `<path d="M0 6V-${(r * 0.5).toFixed(1)}" stroke="#e8e8e8" stroke-width="3.5" stroke-linecap="round" transform="rotate(${hourDeg.toFixed(1)})"/>` +
    `<path d="M0 8V-${(r * 0.78).toFixed(1)}" stroke="#bfc5cc" stroke-width="2" stroke-linecap="round" transform="rotate(${minDeg.toFixed(1)})"/>` +
    `<g class="secs"><circle r="${r}" fill="none"/><path d="M0 ${(r * 0.22).toFixed(1)}V-${r - 5}" stroke="#ffd400" stroke-width="1.2" stroke-linecap="round"/></g>` +
    '<circle r="3.5" fill="#ffd400"/><circle r="1.4" fill="#050505"/></g>'
  const left = cx - r - 16
  const day = (d.getHours() * 60 + d.getMinutes()) / 1440
  const body =
    `<text class="big" x="20" y="${cy + 6}">${two(d.getHours())}:${two(d.getMinutes())}</text>` +
    `<text class="tt" x="22" y="${cy + 30}">${DAYS[d.getDay()]} ${two(d.getDate())} ${MONTHS[d.getMonth()]} · UTC${offsetOf(local)}</text>` +
    (there === null
      ? ''
      : `<text class="tl" x="22" y="${cy + 54}"><tspan fill="#ffd400">◆</tspan> <tspan fill="#e8e8e8">${esc(cut(cityOf(place as Place), Math.max(4, Math.floor((left - 110) / 8.5))))}</tspan> <tspan fill="#bfc5cc">${two(there.getUTCHours())}:${two(there.getUTCMinutes())}</tspan> <tspan fill="#7e848c">${offsetOf((data as Weather).offset - local)}h</tspan></text>`) +
    dial +
    // The day so far, midnight to midnight.
    `<rect x="20" y="${w.h - 16}" width="${w.w - 40}" height="3" rx="1.5" fill="#1c1e21"/>` +
    `<rect x="20" y="${w.h - 16}" width="${((w.w - 40) * day).toFixed(1)}" height="3" rx="1.5" fill="#ffd400" fill-opacity=".7"/>`
  return panel(w, '◆ CLOCK', 'local', body)
}

// WMO weather codes: the highest code each sky covers, its glyph and words.
const SKIES: [number, string, string][] = [
  [0, '☀', 'clear'],
  [1, '☀', 'mainly clear'],
  [2, '⛅', 'partly cloudy'],
  [3, '☁', 'overcast'],
  [48, '≋', 'fog'],
  [57, '☂', 'drizzle'],
  [67, '☂', 'rain'],
  [77, '❄', 'snow'],
  [82, '☂', 'showers'],
  [86, '❄', 'snow showers'],
  [99, '⚡', 'thunderstorm'],
]
const skyOf = (code: number, isDay: boolean) => {
  const sky = SKIES.find(([max]) => code <= max) ?? ([99, '⚡', 'thunderstorm'] as const)
  return !isDay && code <= 1 ? (['☾', code === 0 ? 'clear night' : 'mainly clear'] as const) : ([sky[1], sky[2]] as const)
}
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
// The next hours' temperatures as a line with every third hour labelled.
const sparkOf = (hours: Weather['hours'], x0: number, x1: number, y0: number, y1: number) => {
  if (hours.length < 2) {
    return ''
  }
  const ts = hours.map(one => one.t)
  const lo = Math.min(...ts)
  const span = Math.max(1, Math.max(...ts) - lo)
  const pts = hours.map((one, i) => [x0 + ((x1 - x0) * i) / (hours.length - 1), y1 - ((one.t - lo) / span) * (y1 - y0)] as const)
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
  const marks = pts
    .map(([x, y], i) =>
      i % 3 !== 0
        ? ''
        : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="#ffd400"/>` +
          `<text class="tt" x="${x.toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle"><tspan fill="#e8e8e8">${Math.round(hours[i]?.t ?? 0)}°</tspan></text>` +
          `<text class="tt" x="${x.toFixed(1)}" y="${y1 + 18}" text-anchor="middle">${two(hours[i]?.h ?? 0)}h</text>`,
    )
    .join('')
  return (
    `<path d="${line}L${x1} ${y1 + 4}L${x0} ${y1 + 4}Z" fill="#ffd400" fill-opacity=".07"/>` +
    `<path d="${line}" fill="none" stroke="#ffd400" stroke-opacity=".8" stroke-width="1.5" stroke-linejoin="round"/>` +
    marks
  )
}
const weatherOf = (w: Widget, place: Place | null, data: Weather | null, status: string) => {
  const isReady = place !== null && data !== null && data.key === mapKey(place)
  const title = `◆ WEATHER // ${place === null ? 'NO TARGET' : cityOf(place)}`
  if (!isReady) {
    const hint = place === null ? 'search a place in /bat-cave' : status || 'reading the sky…'
    return panel(w, title, '', `<text class="tt" x="${w.w / 2}" y="${20 + w.h / 2}" text-anchor="middle">${esc(hint)}</text>`)
  }
  const [glyph, words] = skyOf(data.code, data.isDay)
  const right = w.w - 20
  const sparkTop = 182
  const sparkBottom = w.h - 34
  const body =
    `<text class="glyph" x="20" y="96">${glyph}</text>` +
    `<text class="big" x="74" y="96">${Math.round(data.temp)}°</text>` +
    `<text class="tl" x="${right}" y="64" text-anchor="end"><tspan fill="#e8e8e8">${esc(words)}</tspan></text>` +
    `<text class="tt" x="${right}" y="84" text-anchor="end">feels ${Math.round(data.feels)}°</text>` +
    `<text class="tl" x="${right}" y="106" text-anchor="end"><tspan fill="#ffd400">▲</tspan><tspan fill="#e8e8e8">${Math.round(data.hi)}°</tspan> <tspan fill="#7e848c">▼</tspan><tspan fill="#e8e8e8">${Math.round(data.lo)}°</tspan></text>` +
    `<text class="tt" x="22" y="134">wind ${Math.round(data.wind)} km/h ${COMPASS[Math.round(data.windDir / 45) % 8] ?? ''} · humidity ${Math.round(data.humidity)}%</text>` +
    `<text class="tt" x="22" y="156"><tspan fill="#ffd400">↑</tspan> sunrise ${data.sunrise}  <tspan fill="#7e848c">↓</tspan> sunset ${data.sunset}</text>` +
    (sparkBottom - sparkTop >= 22 ? sparkOf(data.hours, 32, w.w - 32, sparkTop, sparkBottom) : '')
  return panel(w, title, '°C', body)
}

// ---------------------------------------------------------------- data
const UA = { 'User-Agent': 'bat-cave/0.12 (Claude Code mod)' }
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
type Way = { tags?: { highway?: string }; geometry?: { lat: number; lon: number }[] }
const mapKey = (p: Place) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`
// 3.5 km around the place fills the panel's 135 px half-height.
const roadsOf = (ways: Way[], kinds: string[], p: Place) => {
  const k = Math.cos((p.lat * Math.PI) / 180)
  const px = 140 / 3500
  return ways
    .filter(w => kinds.includes(w.tags?.highway ?? ''))
    .map(w => {
      let last = ''
      let d = ''
      for (const g of w.geometry ?? []) {
        const pt = `${Math.round((g.lon - p.lon) * k * 111320 * px)} ${Math.round(-(g.lat - p.lat) * 110540 * px)}`
        if (pt !== last) {
          d += (d === '' ? 'M' : 'L') + pt
          last = pt
        }
      }
      return d.includes('L') ? d : ''
    })
    .join('')
}

const decode = (t: string) =>
  t
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
// RSS <item> and Atom <entry>, read with patterns: the module has no XML parser.
const itemsOf = (xml: string, source: string): FeedItem[] =>
  [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m => {
    const one = m[0]
    const title = decode(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(one)?.[1] ?? '')
    const when = /<(pubDate|updated|published|dc:date)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(one)?.[2] ?? ''
    const at = Date.parse(decode(when))
    return { source, title, at: Number.isNaN(at) ? 0 : at }
  })
const sourceOf = (url: string) => /^https?:\/\/(?:www\.)?([^/:]+)/i.exec(url)?.[1] ?? url

// ---------------------------------------------------------------- hooks
// Map: fetch the place's main roads once, keep them in the store.
const loadMap = async ($: EngineInterface, p: Place) => {
  const key = mapKey(p)
  const cached = await $.store.get(`map:${key}`)
  if (typeof cached === 'object' && cached !== null && (cached as MapData).key === key) {
    await update($, mapData, () => cached as MapData)
    await update($, mapStatus, () => '')
    return
  }
  await update($, mapStatus, () => `acquiring street grid for ${cut(p.label, 30)}…`)
  const q = `[out:json][timeout:25];way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](around:3500,${p.lat},${p.lon});out geom;`
  let ways: Way[] | null = null
  for (const host of OVERPASS) {
    const r = await $.http.fetch(host, {
      method: 'POST',
      headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(q)}`,
    }).catch(() => null)
    if (r?.ok === true) {
      ways = (JSON.parse(r.text) as { elements: Way[] }).elements
      break
    }
  }
  if (ways === null) {
    await update($, mapStatus, () => 'map servers busy — pick the place again to retry')
    return
  }
  const data: MapData = { key, major: roadsOf(ways, ['motorway', 'trunk', 'primary'], p), minor: roadsOf(ways, ['secondary', 'tertiary'], p) }
  await $.store.set(`map:${key}`, data)
  await update($, mapData, () => data)
  await update($, mapStatus, () => '')
}

const searchPlaces = async ($: EngineInterface, query: string) => {
  await update($, mapStatus, () => `searching ${cut(query, 30)}…`)
  const r = await $.http
    .fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`, { headers: UA })
    .catch(() => null)
  const found = r?.ok === true ? (JSON.parse(r.text) as { lat: string; lon: string; display_name: string }[]) : []
  const list = found.map(f => ({ label: f.display_name, lat: Number(f.lat), lon: Number(f.lon) }))
  await update($, places, () => list)
  await update($, mapStatus, () => (list.length === 0 ? `nothing found for ${cut(query, 30)}` : ''))
  return list
}

// Weather at the map's place from Open-Meteo (no key needed); also gives the place's UTC offset.
type Meteo = {
  utc_offset_seconds: number
  current: {
    time: string
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    weather_code: number
    wind_speed_10m: number
    wind_direction_10m: number
    is_day: number
  }
  hourly?: { time: string[]; temperature_2m: number[]; weather_code: number[] }
  daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; sunrise?: string[]; sunset?: string[] }
}
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const weatherFrom = (j: Meteo, key: string): Weather | null => {
  const c = j.current
  const core = [c.temperature_2m, c.apparent_temperature, c.relative_humidity_2m, c.weather_code, c.wind_speed_10m, c.wind_direction_10m, j.utc_offset_seconds]
  if (!core.every(isNum)) {
    return null
  }
  // The next 12 hours from the current one, by the place's own clock.
  const times = j.hourly?.time ?? []
  const from = times.findIndex(t => t.slice(0, 13) >= String(c.time).slice(0, 13))
  const hours = (from < 0 ? [] : times.slice(from, from + 12))
    .map((t, i) => ({ h: Number(t.slice(11, 13)), t: j.hourly?.temperature_2m[from + i] as number, code: j.hourly?.weather_code[from + i] as number }))
    .filter(one => isNum(one.h) && isNum(one.t) && isNum(one.code))
  const hi = j.daily.temperature_2m_max[0]
  const lo = j.daily.temperature_2m_min[0]
  return {
    key,
    temp: c.temperature_2m,
    feels: c.apparent_temperature,
    code: c.weather_code,
    isDay: c.is_day === 1,
    wind: c.wind_speed_10m,
    windDir: c.wind_direction_10m,
    humidity: c.relative_humidity_2m,
    hi: isNum(hi) ? hi : c.temperature_2m,
    lo: isNum(lo) ? lo : c.temperature_2m,
    sunrise: String(j.daily.sunrise?.[0] ?? '').slice(11, 16) || '--:--',
    sunset: String(j.daily.sunset?.[0] ?? '').slice(11, 16) || '--:--',
    hours,
    offset: j.utc_offset_seconds,
    at: Date.now(),
  }
}
const loadWeather = async ($: EngineInterface) => {
  const place = (await read($, layout)).map.place
  if (place === null) {
    await update($, weather, () => null)
    return
  }
  await update($, weatherStatus, () => 'reading the sky…')
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day' +
    '&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=2'
  const r = await $.http.fetch(url, { headers: UA }).catch(() => null)
  let data: Weather | null = null
  try {
    data = r?.ok === true ? weatherFrom(JSON.parse(r.text) as Meteo, mapKey(place)) : null
  } catch {
    data = null
  }
  if (data === null) {
    await update($, weatherStatus, () => 'weather service busy, trying again in 15 minutes')
    return
  }
  const got = data
  await update($, weather, () => got)
  await update($, weatherStatus, () => '')
}

const loadFeeds = async ($: EngineInterface) => {
  const urls = (await read($, layout)).rss.feeds
  if (urls.length === 0) {
    await update($, feed, () => [])
    return
  }
  await update($, feedStatus, () => 'syncing feeds…')
  const all = await Promise.all(
    urls.map(async url => {
      const r = await $.http.fetch(url, { headers: UA }).catch(() => null)
      return r?.ok === true ? itemsOf(r.text, sourceOf(url)) : []
    }),
  )
  const items = all.flat().filter(one => one.title !== '').sort((a, b) => b.at - a.at).slice(0, 40)
  await update($, feed, () => items)
  await update($, feedStatus, () => (items.length === 0 ? 'no items: check the feed URLs' : ''))
}

// Every change goes through here: saved, redrawn, and data fetched as needed.
const setLayout = async ($: EngineInterface, change: (now: Layout) => Layout) => {
  const before = await read($, layout)
  const after = await update($, layout, change)
  await $.store.set('layout', after)
  if (after.isOn !== before.isOn) {
    await (after.isOn ? $.theme.set(LOOK) : $.theme.clear())
    await showDash($, after.isOn)
  }
  const place = after.map.place
  if (after.map.isOn && place !== null && (await read($, mapData))?.key !== mapKey(place)) {
    void loadMap($, place).catch(() => undefined)
  }
  if (after.rss.isOn && after.rss.feeds.join() !== before.rss.feeds.join()) {
    void loadFeeds($).catch(() => undefined)
  }
  if ((after.weather.isOn || after.time.isOn) && place !== null && (await read($, weather))?.key !== mapKey(place)) {
    void loadWeather($).catch(() => undefined)
  }
  return after
}

// ---------------------------------------------------------------- terminal dashboard
// Glyphs some terminals draw two cells wide, swapped for narrow ones.
const NARROW_SKY: Record<string, string> = { '⛅': '☁', '⚡': 'ϟ' }
const dashViewOf = async ($: EngineInterface, now: number): Promise<DashView> => {
  const l = await read($, layout)
  const list = await read($, lines)
  const wx = await read($, weather)
  const md = await read($, mapData)
  const items = await read($, feed)
  const place = l.map.place
  const d = new Date(now)
  const local = -d.getTimezoneOffset() * 60
  const ready = place !== null && wx !== null && wx.key === mapKey(place) ? wx : null
  const there = ready === null ? null : new Date(now + ready.offset * 1000)
  const [glyph, words] = ready === null ? ['', ''] : skyOf(ready.code, ready.isDay)
  const city = place === null ? 'NO TARGET' : cityOf(place)
  return {
    now,
    bat: BAT,
    wins: WIDGETS.map(id => ({ id, isOn: l[id].isOn, x: l[id].x, y: l[id].y, w: l[id].w * l[id].k, h: l[id].h * l[id].k })),
    clock: {
      hh: two(d.getHours()),
      mm: two(d.getMinutes()),
      ss: two(d.getSeconds()),
      date: `${DAYS[d.getDay()]} ${two(d.getDate())} ${MONTHS[d.getMonth()]} · UTC${offsetOf(local)}`,
      there: there === null || ready === null ? '' : `${city} ${two(there.getUTCHours())}:${two(there.getUTCMinutes())} ${offsetOf(ready.offset - local)}h`,
      day: (d.getHours() * 60 + d.getMinutes()) / 1440,
    },
    weather: {
      title: `◆ WEATHER // ${city}`,
      isReady: ready !== null,
      hint: place === null ? 'search a place in /bat-cave' : (await read($, weatherStatus)) || 'reading the sky…',
      glyph: NARROW_SKY[glyph] ?? glyph,
      temp: ready === null ? '' : `${Math.round(ready.temp)}°C`,
      words,
      hi: ready === null ? '' : `${Math.round(ready.hi)}°`,
      lo: ready === null ? '' : `${Math.round(ready.lo)}°`,
      feels: ready === null ? '' : `feels ${Math.round(ready.feels)}°`,
      line2: ready === null ? '' : `wind ${Math.round(ready.wind)} km/h ${COMPASS[Math.round(ready.windDir / 45) % 8] ?? ''}`,
      line3: ready === null ? '' : `humidity ${Math.round(ready.humidity)}%`,
      line4: ready === null ? '' : `↑ ${ready.sunrise}  ↓ ${ready.sunset}`,
      hours: ready === null ? [] : ready.hours.map(one => ({ h: one.h, t: one.t })),
    },
    map: {
      title: `◆ GRID // ${place === null ? 'NO TARGET' : cut(place.label.split(',')[0] ?? '', 22).toUpperCase()}`,
      right:
        place === null ? '' : `${Math.abs(place.lat).toFixed(2)}${place.lat >= 0 ? 'N' : 'S'} ${Math.abs(place.lon).toFixed(2)}${place.lon >= 0 ? 'E' : 'W'}`,
      isReady: place !== null && md !== null && md.key === mapKey(place),
      hint: (await read($, mapStatus)) || 'search a place in /bat-cave',
      major: md?.major ?? '',
      minor: md?.minor ?? '',
    },
    feed: {
      right: `${l.rss.feeds.length} source${l.rss.feeds.length === 1 ? '' : 's'}`,
      hint: (await read($, feedStatus)) || 'add feeds in /bat-cave',
      items: items.slice(0, 40).map(one => ({ source: one.source, title: one.title, age: one.at === 0 ? '' : ago(one.at, now) })),
    },
    term: {
      isActive: await read($, isActive),
      lines: list.slice(-60).map(one => ({
        mark: MARK[one.state],
        markColor: colorOf(MARK_COLOR[one.state]),
        tool: one.tool,
        arg: one.arg,
        time: one.state === 'run' ? '' : took(one.ms),
        isRunning: one.state === 'run',
      })),
    },
  }
}
// The open dashboard's Raster size, set as it draws; null while none is shown.
let dashSize: { cols: number; rows: number } | null = null
const blitDash = async ($: EngineInterface) => {
  const size = dashSize
  if (size === null) {
    return
  }
  const r = await $.ui.blit({ requestId: DASH, key: 'dash', cells: dashCells(await dashViewOf($, Date.now()), size.cols, size.rows) })
  if (r.deny !== undefined) {
    dashSize = null
  }
}
const showDash = async ($: EngineInterface, isOn: boolean) => {
  const surfaces = await $.session.surfaces().catch(() => [] as readonly string[])
  if (surfaces.includes('terminal')) {
    await (isOn ? $.ui.open({ id: DASH, title: 'bat-cave' }) : $.ui.close({ id: DASH }))
  }
}

const where = (w: Widget) => `at ${w.x},${w.y} ${Math.round(w.w * w.k)}×${Math.round(w.h * w.k)}`
const summary = (l: Layout) =>
  `bat-cave theme ${l.isOn ? 'on' : 'off'} · terminal ${l.term.isOn ? `on ${where(l.term)}` : 'off'} · map ${
    l.map.isOn ? `on ${where(l.map)}${l.map.place === null ? ' (no place)' : ` — ${cut(l.map.place.label, 40)}`}` : 'off'
  } · rss ${l.rss.isOn ? `on ${where(l.rss)}, ${l.rss.feeds.length} feeds` : 'off'} · weather ${l.weather.isOn ? `on ${where(l.weather)}` : 'off'} · clock ${
    l.time.isOn ? `on ${where(l.time)}` : 'off'
  }`

// What the layout pane draws: each widget's place, scale and size in the scene.
const layoutPropsOf = (l: Layout, cols: number, rows: number): LayoutProps => ({
  cols,
  rows,
  wins: WIDGETS.map(
    (id): LayoutWin => ({
      id,
      isOn: l[id].isOn,
      x: l[id].x,
      y: l[id].y,
      k: l[id].k,
      w: l[id].w,
      h: l[id].h,
      minW: MIN[id][0],
      minH: MIN[id][1],
      label: id === 'map' && l.map.place !== null ? `grid // ${cut(l.map.place.label.split(',')[0] ?? '', 18)}` : LABELS[id],
    }),
  ),
})

// A drop, hide or show from the layout pane.
const layoutChange = async ($: EngineInterface, data: unknown) => {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const id = d.id
  if (!isWidget(id)) {
    return
  }
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  await setLayout($, x => {
    const w = x[id]
    const next =
      d.type === 'close' ? { ...w, isOn: false } : d.type === 'open' ? { ...w, isOn: true } : d.type === 'place' ? placed(id, { ...w, x: num(d.x, w.x), y: num(d.y, w.y), k: num(d.k, w.k), w: num(d.w, w.w), h: num(d.h, w.h) }) : w
    return { ...x, [id]: next }
  })
}


export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    await update($, isActive, () => true)
    const started = Date.now()
    const line: TermLine = { id: e.tool_use_id, tool: e.tool, arg: argOf(e as unknown as Record<string, unknown>), state: 'run', ms: 0 }
    await update($, lines, list => [...list, line].slice(-300))
    const ran = await next(e)
    const state: TermLine['state'] = ran.deny !== undefined ? 'deny' : ran.isError === true ? 'err' : 'ok'
    await update($, lines, list => list.map(one => (one.id === line.id ? { ...one, state, ms: Date.now() - started } : one)))
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    // A subagent finishing is not the main turn ending.
    if (e.agentId === undefined) {
      await update($, isActive, () => false)
    }
    return done
  })

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    await $.command.register({ name: 'bat-cave', description: 'Manage the bat-cave theme and its widgets' })
    const saved = layoutFrom(await $.store.get('layout'))
    // 0.3 kept the on/off choice under its own key.
    if ((await $.store.get('enabled')) === false) {
      saved.isOn = false
    }
    await update($, layout, () => saved)
    if (saved.isOn) {
      const set = await $.theme.set(LOOK)
      // A terminal draws no theme; it gets the dashboard pane instead.
      if (e.surface === 'terminal') {
        void $.ui.open({ id: DASH, title: 'bat-cave' }).catch(() => undefined)
      } else if (!set.isDrawn) {
        $.ui.status(set.reason)
      }
    }
    if (saved.map.isOn && saved.map.place !== null) {
      void loadMap($, saved.map.place).catch(() => undefined)
    }
    void loadFeeds($).catch(() => undefined)
    void loadWeather($).catch(() => undefined)
    $.clock.every(15 * 60 * 1000, () => {
      void loadFeeds($).catch(() => undefined)
      void loadWeather($).catch(() => undefined)
    })
    // About 6 frames a second for the dashboard; nothing while it is closed.
    $.clock.every(160, () => {
      void blitDash($).catch(() => {
        dashSize = null
      })
    })
    $.clock.every(15 * 1000, () => {
      void (async () => {
        const l = await read($, layout)
        if (l.isOn && l.time.isOn) {
          await update($, tick, () => Date.now())
        }
      })().catch(() => undefined)
    })
    return next(e)
  })

  on('command.run', { command: 'bat-cave' }, async $ => {
    await $.ui.open({ id: MANAGE, title: 'Manage', focus: true })
    return { text: 'Manage opened.' }
  })

  // Manage: a header with the theme switch, the backdrop in miniature to drag
  // widgets in, a row to show or hide each widget, then the Map and Feed cards.
  on('ui.render', { component: 'Pane', requestId: MANAGE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const l = await read($, layout)
    const found = await read($, places)
    const status = await read($, mapStatus)
    const fstatus = await read($, feedStatus)
    const items = await read($, feed)
    const cols = e.props.bodyColumns
    // Side by side when there is room for two cards of 44 columns.
    const isWide = cols >= 90
    const cardCols = isWide ? Math.floor((cols - 1) / 2) : cols
    // Leave about 16 rows below the miniature for the controls.
    const editorRows = Math.max(14, e.props.scroll.bodyRows - (isWide ? 16 : 28))
    // Only the desktop app and the terminal run the draggable miniature.
    let editor = null
    if (e.surface === 'desktop' || e.surface === 'terminal') {
      const { Client } = $.ui.resolve(e)
      editor = <Client key="manage" module="./layout.tsx" props={layoutPropsOf(l, cols, editorRows)} width={cols} height={editorRows} />
    }
    const place = l.map.place
    const where =
      place === null
        ? 'no place yet: search one for the map, weather and clock'
        : `${Math.abs(place.lat).toFixed(3)}°${place.lat >= 0 ? 'N' : 'S'} ${Math.abs(place.lon).toFixed(3)}°${place.lon >= 0 ? 'E' : 'W'}`
    const toggle = (id: WidgetName, label: string) => (
      <Button
        key={`show-${id}`}
        label={`${l[id].isOn ? '●' : '○'} ${label}`}
        variant={l[id].isOn ? 'primary' : 'secondary'}
        onPress={() => void setLayout($, x => ({ ...x, [id]: { ...x[id], isOn: !x[id].isOn } }))}
      />
    )
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text bold color="#ffd400">◆</Text>
          <Text bold color="#e8e8e8">BAT-CAVE</Text>
          <Text color="#8a8f96" wrap="truncate-end">{l.isOn ? 'theme on · drag widgets in the miniature' : 'theme off · the backdrop is hidden'}</Text>
          <Box flexGrow={1} />
          {e.surface === 'terminal' && (
            <Button key="open-dash" label="Dashboard" variant="secondary" onPress={() => void $.ui.open({ id: DASH, title: 'bat-cave' })} />
          )}
          <Text color="#8a8f96">Theme</Text>
          <Button key="theme" label={l.isOn ? '● On' : '○ Off'} variant={l.isOn ? 'primary' : 'secondary'} onPress={() => void setLayout($, x => ({ ...x, isOn: !x.isOn }))} />
        </Box>
        {editor}
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={1}>
          <Text bold color="#e8e8e8">Widgets</Text>
          {toggle('term', 'Terminal')}
          {toggle('map', 'Map')}
          {toggle('rss', 'Feed')}
          {toggle('weather', 'Weather')}
          {toggle('time', 'Time')}
          <Box flexGrow={1} />
          <Button
            key="reset"
            label="Reset layout"
            variant="secondary"
            onPress={() =>
              void setLayout($, x => ({
                ...x,
                term: { ...DEFAULT_LAYOUT.term, isOn: x.term.isOn },
                map: { ...DEFAULT_LAYOUT.map, isOn: x.map.isOn, place: x.map.place },
                rss: { ...DEFAULT_LAYOUT.rss, isOn: x.rss.isOn, feeds: x.rss.feeds },
                weather: { ...DEFAULT_LAYOUT.weather, isOn: x.weather.isOn },
                time: { ...DEFAULT_LAYOUT.time, isOn: x.time.isOn },
              }))
            }
          />
        </Box>
        <Box flexDirection={isWide ? 'row' : 'column'} gap={1} alignItems="flex-start">
          <Box flexDirection="column" width={cardCols} borderStyle="round" borderColor="#2e3236" paddingX={1} gap={1}>
            <Box flexDirection="row" gap={1}>
              <Text bold color="#ffd400">◆ PLACE</Text>
              <Text bold color="#e8e8e8" wrap="truncate-end">{place === null ? '' : cut(place.label.split(',')[0] ?? '', 30)}</Text>
            </Box>
            <Text color="#8a8f96" wrap="truncate-end">{where}</Text>
            <Input key="map-search" placeholder="Search a city or place" submitLabel="Search" onSubmit={value => void searchPlaces($, value).catch(() => undefined)} />
            {status !== '' && <Text color="#8a8f96">{status}</Text>}
            {found.length > 0 && (
              <Box flexDirection="column">
                {found.map((one, i) => (
                  <Button
                    key={`place-${i}`}
                    label={cut(one.label, Math.max(20, cardCols - 8))}
                    variant="secondary"
                    onPress={() => {
                      void update($, places, () => [])
                      void setLayout($, x => ({ ...x, map: { ...x.map, isOn: true, place: one } }))
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>
          <Box flexDirection="column" width={cardCols} borderStyle="round" borderColor="#2e3236" paddingX={1} gap={1}>
            <Box flexDirection="row" gap={1} alignItems="center">
              <Text bold color="#ffd400">◆ FEED</Text>
              <Text color="#8a8f96">{`${l.rss.feeds.length} source${l.rss.feeds.length === 1 ? '' : 's'} · ${items.length} item${items.length === 1 ? '' : 's'}`}</Text>
              <Box flexGrow={1} />
              {l.rss.feeds.length > 0 && <Button key="rss-refresh" label="↻ Refresh" variant="secondary" onPress={() => void loadFeeds($).catch(() => undefined)} />}
            </Box>
            <Input
              key="rss-add"
              placeholder="Feed URLs: one, or several separated by spaces"
              submitLabel="Add"
              onSubmit={value => {
                const urls = value.split(/[\s,]+/).filter(u => /^https?:\/\//i.test(u))
                void setLayout($, x => ({ ...x, rss: { ...x.rss, isOn: true, feeds: [...new Set([...x.rss.feeds, ...urls])] } }))
              }}
            />
            {fstatus !== '' && <Text color="#8a8f96">{fstatus}</Text>}
            {l.rss.feeds.length === 0 && <Text color="#8a8f96">No sources yet. Paste an RSS or Atom URL above.</Text>}
            {l.rss.feeds.length > 0 && (
              <Box flexDirection="column">
                {l.rss.feeds.map((url, i) => (
                  <Box key={`feed-${i}`} flexDirection="row" gap={1} alignItems="center">
                    <Button key={`feed-x-${i}`} label="✕" variant="secondary" onPress={() => void setLayout($, x => ({ ...x, rss: { ...x.rss, feeds: x.rss.feeds.filter(f => f !== url) } }))} />
                    <Text color="#bfc5cc" wrap="truncate-end">{url.replace(/^https?:\/\//i, '')}</Text>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    )
  })

  // The terminal dashboard: the whole scene in one Raster, repainted by blitDash.
  on('ui.render', { component: 'Pane', requestId: DASH }, async ($, e) => {
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text color="#8a8f96">The bat-cave dashboard is for the terminal. Here the theme draws it as the background.</Text>
    }
    const { Box, Button, Raster } = $.ui.resolve(e)
    const cols = Math.max(20, Math.min(512, e.props.bodyColumns))
    const rows = Math.max(12, Math.min(256, e.props.scroll.bodyRows - 1))
    dashSize = { cols, rows }
    const cells = dashCells(await dashViewOf($, Date.now()), cols, rows)
    return (
      <Box flexDirection="column">
        <Raster key="dash" columns={cols} rows={rows} cells={cells} />
        <Box flexDirection="row" gap={1}>
          <Button key="dash-manage" label="Manage" onPress={() => void $.ui.open({ id: MANAGE, title: 'Manage', focus: true })} />
          <Button key="dash-hide" label="Hide" variant="secondary" onPress={() => void $.ui.close({ id: DASH })} />
        </Box>
      </Box>
    )
  })

  on('ui.message', async ($, e, next) => {
    if (e.requestId !== MANAGE) {
      return next(e)
    }
    await layoutChange($, e.data)
    return {}
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.plugin !== 'bat-cave') {
      return next(e)
    }
    const l = await read($, layout)
    const list = await read($, lines)
    await read($, tick)
    const now = Date.now()
    const { Svg } = $.ui.resolve(e)
    const wx = await read($, weather)
    const widgets =
      (l.time.isOn ? timeOf(l.time, now, l.map.place, wx) : '') +
      (l.weather.isOn ? weatherOf(l.weather, l.map.place, wx, await read($, weatherStatus)) : '') +
      (l.map.isOn ? mapOf(l.map, await read($, mapData), await read($, mapStatus)) : '') +
      (l.rss.isOn ? rssOf(l.rss, await read($, feed), await read($, feedStatus), now) : '') +
      (l.term.isOn && (await read($, isActive)) ? termOf(list, l.term) : '')
    return (
      <Svg
        source={sceneOf(widgets, (now % 8000) / 1000, (now % 7000) / 1000, (now % 60000) / 1000)}
        alt={`A steel-grey block-character bat spinning over a black terminal grid. ${summary(l)}`}
        isInteractive
      />
    )
  })
}
