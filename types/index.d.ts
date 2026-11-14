export type TermLine = { id: string; tool: string; arg: string; state: 'run' | 'ok' | 'err' | 'deny'; ms: number }
export type Corner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
// Where a widget sits in the backdrop's 1600x1000 scene, its panel's width and
// height before scaling, and its scale (text and all).
export type Widget = { isOn: boolean; x: number; y: number; k: number; w: number; h: number }
export type Place = { label: string; lat: number; lon: number }
export type Layout = {
  isOn: boolean
  term: Widget
  map: Widget & { place: Place | null }
  rss: Widget & { feeds: string[] }
  weather: Widget
  time: Widget
}
// A place's main roads as two SVG paths centred on it, in panel pixels.
export type MapData = { key: string; major: string; minor: string }
// Weather at the map's place, from Open-Meteo; offset is the place's UTC offset in seconds.
export type Weather = {
  key: string
  temp: number
  feels: number
  code: number
  isDay: boolean
  wind: number
  windDir: number
  humidity: number
  hi: number
  lo: number
  // Local HH:MM at the place.
  sunrise: string
  sunset: string
  // The next 12 hours: hour of day, temperature, WMO code.
  hours: { h: number; t: number; code: number }[]
  offset: number
  at: number
}
export type FeedItem = { source: string; title: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'bat-cave': {
      lines: Shaped<TermLine[]>
      isActive: boolean
      layout: Shaped<Layout>
      map: Shaped<MapData | null>
      mapStatus: string
      feed: Shaped<FeedItem[]>
      feedStatus: string
      places: Shaped<Place[]>
      weather: Shaped<Weather | null>
      weatherStatus: string
      tick: number
    }
  }
}
