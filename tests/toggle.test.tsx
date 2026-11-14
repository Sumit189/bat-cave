import { expect, test } from 'claude-code/testing'

const run = { command: 'bat-cave', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const MANAGE = {
  plugin: 'bat-cave',
  component: 'Pane',
  requestId: 'bat-cave-manage',
  surface: 'desktop',
  props: { title: 'Manage', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 50 }, view: {} },
} as const
const BACKDROP = {
  plugin: 'bat-cave',
  component: 'Backdrop',
  requestId: 'b',
  surface: 'desktop',
  props: { scene: 'bat-signal', plugin: 'bat-cave', glass: { blur: 10, opacity: 0.62 } },
} as const

const NOMINATIM = JSON.stringify([
  { lat: '48.8566', lon: '2.3522', display_name: 'Paris, Île-de-France, France' },
  { lat: '33.6609', lon: '-95.5555', display_name: 'Paris, Texas, United States' },
])
const OVERPASS = JSON.stringify({
  elements: [{ tags: { highway: 'primary' }, geometry: [{ lat: 48.8566, lon: 2.3522 }, { lat: 48.86, lon: 2.36 }] }],
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
const RSS = `<rss><channel><item><title><![CDATA[Bats & <b>caves</b> report]]></title><pubDate>Sat, 14 Nov 2026 08:00:00 GMT</pubDate></item></channel></rss>`

test('Manage holds everything: place search, feed sources and the theme switch', async ($, on) => {
  const calls: string[] = []
  const store = new Map<string, unknown>()
  on('command.register', () => ({ value: { command: 'bat-cave' } }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('theme.set', () => (calls.push('set'), { value: { isDrawn: true, requestId: 't' } }))
  on('theme.clear', () => (calls.push('clear'), { value: { isDrawn: true, requestId: 't' } }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('http.fetch', (_, e) => {
    const text = e.url.includes('nominatim') ? NOMINATIM : e.url.includes('interpreter') ? OVERPASS : e.url.includes('open-meteo') ? METEO : RSS
    return { value: { status: 200, ok: true, headers: {}, text } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const backdrop = async () => {
    const ui = await $.ui.mount(BACKDROP)
    const text = String((await ui.find({ type: 'Svg' }))?.props.source)
    await ui.unmount()
    return text
  }

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(calls).toEqual(['set'])
  // The command only opens Manage; options are gone.
  expect((await $.command.run(run)).text).toBe('Manage opened.')
  const first = await backdrop()
  expect(first).toContain('class="beat"')
  expect(first).not.toContain('--term')

  const ui = await $.ui.mount(MANAGE)

  // Map: search, pick a result, the street grid loads into the backdrop.
  await ui.input({ key: 'map-search', text: 'Paris' })
  expect((await ui.find({ key: 'place-1' }))?.props.label).toBe('Paris, Texas, United States')
  await ui.press({ key: 'place-0' })
  expect(await ui.find({ key: 'place-0' })).toBeUndefined()
  const withMap = await backdrop()
  expect(withMap).toContain('GRID // PARIS')
  expect(withMap).toContain('M0 0L')
  // Once the streets are in, Manage no longer says it is fetching them.
  expect(JSON.stringify(await ui.drawn())).not.toContain('acquiring street grid')
  // The same place gives the weather and the clock its local time there.
  expect(withMap).toContain('WEATHER // PARIS')
  expect(withMap).toContain('>18°</text>')
  expect(withMap).toContain('partly cloudy')
  expect(withMap).toContain('feels 17°')
  expect(withMap).toContain('SW')
  expect(withMap).toContain('sunrise 08:01')
  // The sparkline starts at the current hour, 09h, and labels every third hour.
  expect(withMap).toContain('>09h<')
  expect(withMap).toContain('>18h<')
  expect(withMap).toContain('◆ CLOCK')
  expect(withMap).toMatch(/PARIS<\/tspan> <tspan[^>]*>\d\d:\d\d<\/tspan>/)
  await ui.press({ key: 'show-weather' })
  expect(await backdrop()).not.toContain('WEATHER //')
  await ui.press({ key: 'show-weather' })

  // Feed: add several sources at once, remove one with ✕.
  await ui.input({ key: 'rss-add', text: 'https://bats.test/feed.xml https://x.test/rss not-a-url' })
  expect((store.get('layout') as { rss: { feeds: string[] } }).rss.feeds).toEqual(['https://bats.test/feed.xml', 'https://x.test/rss'])
  expect(await backdrop()).toContain('Bats &amp; caves report')
  await ui.press({ key: 'feed-x-1' })
  expect((store.get('layout') as { rss: { feeds: string[] } }).rss.feeds).toEqual(['https://bats.test/feed.xml'])

  // Show or hide a widget from the Widgets row; Reset layout keeps place and feeds.
  const lay = () => store.get('layout') as { map: { isOn: boolean; x: number; place: unknown }; rss: { feeds: string[] } }
  await ui.press({ key: 'show-map' })
  expect(lay().map.isOn).toBe(false)
  expect(await backdrop()).not.toContain('GRID //')
  await ui.press({ key: 'show-map' })
  expect(lay().map.isOn).toBe(true)
  await ui.press({ key: 'reset' })
  expect(lay().map.x).toBe(1130)
  expect(lay().map.place).not.toBeNull()
  expect(lay().rss.feeds).toEqual(['https://bats.test/feed.xml'])

  // Theme off from Manage, remembered by the next session.
  await ui.press({ key: 'theme' })
  expect(calls).toEqual(['set', 'clear'])
  await ui.unmount()
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(calls).toEqual(['set', 'clear'])
})
