import type { ClientModule, ClientPointerEvent } from 'claude-code'

// The layout pane: the backdrop's 1600x1000 scene in miniature, each widget a
// box you drag from anywhere on it. Its right edge sets the width, its bottom
// edge the height, its corner both, ✕ hides it. A drop posts the
// widget's new place and size in scene units; the hooks module saves it and the
// backdrop redraws. Hidden widgets come back from the ＋ entries on top.

// w and h are the panel's size before scaling by k; minW and minH its smallest.
export type LayoutWin = { id: 'term' | 'map' | 'rss' | 'weather' | 'time'; isOn: boolean; x: number; y: number; k: number; w: number; h: number; minW: number; minH: number; label: string }
export type LayoutProps = { cols: number; rows: number; wins: LayoutWin[] }
// 'right' sets the width, 'bottom' the height, 'corner' both.
type Drag = { id: LayoutWin['id']; mode: 'move' | 'right' | 'bottom' | 'corner'; px: number; py: number; from: LayoutWin }
type State = { drag: Drag | null; live: LayoutWin | null }

const TOP = 2 // toolbar and rule
const MIN_K = 0.5
const MAX_K = 1.8
const cut = (t: string, n: number) => (n <= 0 ? '' : t.length > n ? t.slice(0, Math.max(0, n - 1)) + '…' : t)

const Layout: ClientModule<LayoutProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state: State = surface.state ?? { drag: null, live: null }
  const columns = surface.columns > 0 ? surface.columns : props.cols
  // The pane's own size: a region measured by what it draws reports too few rows.
  const rows = props.rows
  const sx = columns / 1600
  const sy = (rows - TOP) / 1000
  const keep = (win: LayoutWin): LayoutWin => {
    const k = Math.max(MIN_K, Math.min(MAX_K, win.k))
    const w = Math.max(win.minW, Math.min(win.w, 1600 / k))
    const h = Math.max(win.minH, Math.min(win.h, 1000 / k))
    return { ...win, k, w, h, x: Math.max(0, Math.min(win.x, 1600 - w * k)), y: Math.max(0, Math.min(win.y, 1000 - h * k)) }
  }
  const box = (win: LayoutWin) => ({
    left: Math.round(win.x * sx),
    top: Math.round(win.y * sy),
    width: Math.max(10, Math.round(win.w * win.k * sx)),
    height: Math.max(4, Math.round(win.h * win.k * sy)),
  })
  const wins = props.wins.map(w => (state.live?.id === w.id ? { ...w, x: state.live.x, y: state.live.y, k: state.live.k, w: state.live.w, h: state.live.h } : w))
  const shown = wins.filter(w => w.isOn)
  const hidden = wins.filter(w => !w.isOn)
  const menu = hidden.map(w => `＋ ${w.label}`)
  const menuText = menu.join('  ')
  const menuX = Math.max(0, columns - menuText.length - 1)
  const spots = menu.map((m, i) => {
    const x0 = menuX + menu.slice(0, i).reduce((n, s) => n + s.length + 2, 0)
    return { id: hidden[i]?.id, x0, x1: x0 + m.length }
  })

  surface.onPointer((e: ClientPointerEvent) => {
    const s: State = surface.state ?? { drag: null, live: null }
    if (e.type === 'down' && e.button === 'left') {
      if (e.y === 0) {
        const hit = spots.find(m => e.x >= m.x0 && e.x < m.x1)
        if (hit?.id !== undefined) {
          surface.post({ type: 'open', id: hit.id })
          surface.setState({ drag: null, live: null })
        }
        return
      }
      const win = [...shown].reverse().find(w => {
        const b = box(w)
        return e.x >= b.left && e.x < b.left + b.width && e.y - TOP >= b.top && e.y - TOP < b.top + b.height
      })
      if (win === undefined) {
        return
      }
      const b = box(win)
      const lx = e.x - b.left
      const ly = e.y - TOP - b.top
      // ✕: the top two rows' last five columns, so a near miss still closes.
      if (ly <= 1 && lx >= b.width - 5) {
        surface.post({ type: 'close', id: win.id })
        surface.setState({ drag: null, live: null })
        return
      }
      // The right edge, the bottom edge and the corner where they meet resize; anywhere else moves.
      const atRight = lx >= b.width - 2
      const atBottom = ly >= b.height - 2
      const mode = atRight && atBottom ? 'corner' : atRight ? 'right' : atBottom ? 'bottom' : 'move'
      surface.setState({ drag: { id: win.id, mode, px: e.x, py: e.y, from: win }, live: win })
    } else if (e.type === 'move' && s.drag !== null) {
      const d = s.drag
      const dx = e.x - d.px
      const dy = e.y - d.py
      const next =
        d.mode === 'move'
          ? { ...d.from, x: d.from.x + dx / sx, y: d.from.y + dy / sy }
          : d.mode === 'right'
            ? { ...d.from, w: d.from.w + dx / sx / d.from.k }
            : d.mode === 'bottom'
              ? { ...d.from, h: d.from.h + dy / sy / d.from.k }
              : { ...d.from, w: d.from.w + dx / sx / d.from.k, h: d.from.h + dy / sy / d.from.k }
      surface.setState({ drag: d, live: keep(next) })
    } else if (e.type === 'up' && s.drag !== null && s.live !== null) {
      const l = s.live
      surface.post({ type: 'place', id: l.id, x: Math.round(l.x), y: Math.round(l.y), k: Math.round(l.k * 100) / 100, w: Math.round(l.w), h: Math.round(l.h) })
      surface.setState({ drag: null, live: l })
    }
  })

  const batLeft = Math.round(800 * sx) - 3
  const batTop = Math.round(430 * sy)
  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box flexDirection="row" height={1}>
        <Text color="#ffd400" bold>◆ </Text>
        <Text color="#e8e8e8" bold>BACKDROP </Text>
        <Text color="#8a8f96" wrap="truncate">{cut('drag a box · drag its edges to resize · ✕ hides', Math.max(0, menuX - 10))}</Text>
        <Box flexGrow={1} />
        <Text color="#ffd400">{menuText} </Text>
      </Box>
      <Text color="#2e3236" wrap="truncate">{'─'.repeat(Math.max(0, columns))}</Text>
      {/* relative: the desktop places absolute boxes against the nearest positioned Box, as CSS does */}
      <Box flexGrow={1} position="relative" overflow="hidden">
        <Box position="absolute" left={batLeft} top={batTop}>
          <Text color="#2e3236">▚▞ bat ▚▞</Text>
        </Box>
        <Box position="absolute" left={Math.round(1545 * sx) - 1} top={Math.round(915 * sy)}>
          <Text color="#ffd400">▚▞</Text>
        </Box>
        {shown.map(win => {
          const b = box(win)
          const isLive = state.drag?.id === win.id
          return (
            <Box
              key={`win-${win.id}`}
              position="absolute"
              left={b.left}
              top={b.top}
              width={b.width}
              height={b.height}
              flexDirection="column"
              borderStyle="round"
              borderColor={isLive ? '#ffd400' : '#7e848c'}
              backgroundColor="#050505"
            >
              <Box flexDirection="row" height={1}>
                <Text color="#ffd400">≡ </Text>
                <Text color="#e8e8e8" bold wrap="truncate">{cut(win.label, b.width - 7)}</Text>
                <Box flexGrow={1} />
                <Text color="#d9534f" bold> ✕</Text>
              </Box>
              <Box flexGrow={1} />
              <Box flexDirection="row" height={1}>
                <Text color="#8a8f96" wrap="truncate">{cut(`${Math.round(win.w * win.k)}×${Math.round(win.h * win.k)}`, b.width - 4)}</Text>
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

export default Layout
