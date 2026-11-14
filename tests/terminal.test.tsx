import { expect, test } from 'claude-code/testing'

declare const atob: (s: string) => string
declare const setTimeout: (f: () => void, ms: number) => unknown

const DASH = {
  plugin: 'bat-cave',
  component: 'Pane',
  requestId: 'bat-cave-dash',
  surface: 'terminal',
  props: { title: 'bat-cave', isFocused: false, bodyColumns: 140, placement: 'dock', scroll: { offset: 0, bodyRows: 48 }, view: {} },
} as const

const OVERPASS = JSON.stringify({
  elements: [
    { tags: { highway: 'primary' }, geometry: [{ lat: 48.84, lon: 2.32 }, { lat: 48.87, lon: 2.38 }] },
    { tags: { highway: 'tertiary' }, geometry: [{ lat: 48.87, lon: 2.32 }, { lat: 48.84, lon: 2.38 }] },
  ],
})
const METEO = JSON.stringify({
  utc_offset_seconds: 3600,
  current: { time: '2026-11-14T09:30', temperature_2m: 18.4, apparent_temperature: 16.9, relative_humidity_2m: 61, weather_code: 2, wind_speed_10m: 14.2, wind_direction_10m: 225, is_day: 1 },
  hourly: {
    time: Array.from({ length: 24 }, (_, h) => `2026-11-14T${String(h).padStart(2, '0')}:00`),
    temperature_2m: Array.from({ length: 24 }, (_, h) => 10 + h / 2),
    weather_code: Array.from({ length: 24 }, () => 2),
  },
  daily: { temperature_2m_max: [21.2], temperature_2m_min: [11.8], sunrise: ['2026-11-14T08:01'], sunset: ['2026-11-14T17:09'] },
})
// A title with an emoji: two cells wide in a terminal, so the dashboard swaps it for a dot.
const RSS = `<rss><channel><item><title><![CDATA[Bats 🦇 & <b>caves</b> report]]></title><pubDate>Sat, 14 Nov 2026 08:00:00 GMT</pubDate></item></channel></rss>`

// A Raster's cells read back as lines of text.
const linesOf = (cells: string, cols: number) => {
  const bin = atob(cells)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i)
  }
  const words = new Uint32Array(bytes.buffer)
  const out: string[] = []
  for (let y = 0; (y + 1) * cols * 3 <= words.length; y++) {
    let row = ''
    for (let x = 0; x < cols; x++) {
      row += String.fromCodePoint(words[(y * cols + x) * 3] ?? 0x20)
    }
    out.push(row)
  }
  return out
}

test('a terminal session gets the dashboard: the whole scene drawn in a Raster', async ($, on) => {
  const opened: string[] = []
  const closed: string[] = []
  const store = new Map<string, unknown>([
    [
      'layout',
      {
        isOn: true,
        map: { isOn: true, place: { label: 'Paris, Île-de-France, France', lat: 48.8566, lon: 2.3522 } },
        rss: { isOn: true, feeds: ['https://bats.test/feed.xml'] },
      },
    ],
  ])
  on('command.register', () => ({ value: { command: 'bat-cave' } }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('theme.set', () => ({ value: { isDrawn: false, reason: 'this terminal draws no theme', requestId: 't' } }))
  on('theme.clear', () => ({ value: { isDrawn: false, reason: 'this terminal draws no theme', requestId: 't' } }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.open', (_, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.close', (_, e) => (closed.push(e.id), { value: undefined }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('http.fetch', (_, e) => {
    const text = e.url.includes('interpreter') ? OVERPASS : e.url.includes('open-meteo') ? METEO : RSS
    return { value: { status: 200, ok: true, headers: {}, text } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual(['bat-cave-dash'])
  await new Promise<void>(r => setTimeout(r, 100))
  await $.tool.call({ tool: 'Bash', command: 'claude plugin test .' })

  const ui = await $.ui.mount(DASH)
  const raster = (await ui.find({ type: 'Raster' }))?.props as { columns: number; rows: number; cells: string }
  expect(raster.columns).toBe(140)
  expect(raster.rows).toBe(47)
  const scene = linesOf(raster.cells, raster.columns).join('\n')
  expect(scene).toContain('CLOCK')
  expect(scene).toContain('WEATHER // PARIS')
  expect(scene).toContain('18°C')
  expect(scene).toContain('feels 17°')
  expect(scene).toContain('GRID // PARIS')
  expect(scene).toContain('Bats · & caves report')
  expect(scene).toContain('wind 14 km/h SW')
  expect(scene).toContain('↑ 08:01  ↓ 17:09')
  expect(scene).toContain('Bash')
  expect(scene).toContain('claude plugin test .')
  // The bat and the map are braille.
  expect(scene).toMatch(/[⠁-⣿]/)

  // Manage opens from the dashboard; the theme switch closes the dashboard.
  await ui.press({ key: 'dash-manage' })
  expect(opened).toContain('bat-cave-manage')
  await ui.unmount()
  const manage = await $.ui.mount({ ...DASH, requestId: 'bat-cave-manage' })
  await manage.press({ key: 'theme' })
  expect(closed).toEqual(['bat-cave-dash'])
  await manage.unmount()
})
