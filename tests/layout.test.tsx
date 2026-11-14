import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'bat-cave',
  component: 'Pane',
  requestId: 'bat-cave-manage',
  surface: 'desktop',
  // 68 rows leave 52 for the miniature above the controls.
  props: { title: 'Manage', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { offset: 0, bodyRows: 68 }, view: {} },
} as const
const BACKDROP = {
  plugin: 'bat-cave',
  component: 'Backdrop',
  requestId: 'b',
  surface: 'desktop',
  props: { scene: 'bat-signal', plugin: 'bat-cave', glass: { blur: 10, opacity: 0.62 } },
} as const

test('dragging, resizing and hiding a widget in Manage moves it in the backdrop', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('command.register', () => ({ value: { command: 'bat-cave' } }))
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 't' } }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // An earlier version's saved layout: a corner and a size word.
  store.set('layout', { isOn: true, map: { isOn: true, at: 'top-right', size: 'm', place: null } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await $.command.run({ command: 'bat-cave', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })).text).toBe('Manage opened.')

  const backdrop = async () => {
    const ui = await $.ui.mount(BACKDROP)
    const text = String((await ui.find({ type: 'Svg' }))?.props.source)
    await ui.unmount()
    return text
  }
  const map = () => (store.get('layout') as { map: { isOn: boolean; x: number; y: number; k: number; w: number; h: number } } | undefined)?.map
  expect(await backdrop()).toContain('translate(1130 110) scale(1)')

  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 160, rows: 52, in: 'manage' })
  // 160 columns and 50 rows of scene: 0.1 column and 0.05 row per scene unit.
  // The map box: left 113, top 6 (+2 toolbar rows), 42 x 15.
  await ui.pointer({ type: 'down', button: 'left', x: 120, y: 8, in: 'manage' })
  await ui.pointer({ type: 'move', button: 'left', x: 100, y: 13, in: 'manage' })
  await ui.pointer({ type: 'up', button: 'left', x: 100, y: 13, in: 'manage' })
  expect(map()).toMatchObject({ x: 930, y: 210, k: 1 })
  expect(await backdrop()).toContain('translate(930 210) scale(1)')

  // The corner sets width and height (box: left 93, top 11, 42 x 15): +21 columns, +7 rows.
  await ui.pointer({ type: 'down', button: 'left', x: 93 + 42 - 1, y: 2 + 11 + 14, in: 'manage' })
  await ui.pointer({ type: 'move', button: 'left', x: 93 + 42 - 1 + 21, y: 2 + 11 + 14 + 7, in: 'manage' })
  await ui.pointer({ type: 'up', button: 'left', x: 93 + 42 - 1 + 21, y: 2 + 11 + 14 + 7, in: 'manage' })
  expect(map()).toMatchObject({ x: 930, y: 210, k: 1, w: 630, h: 440 })

  // A drag from the middle of the box moves it too: back 10 columns and forward again.
  await ui.pointer({ type: 'down', button: 'left', x: 110, y: 20, in: 'manage' })
  await ui.pointer({ type: 'move', button: 'left', x: 100, y: 20, in: 'manage' })
  await ui.pointer({ type: 'up', button: 'left', x: 100, y: 20, in: 'manage' })
  expect(map()).toMatchObject({ x: 830, y: 210 })
  await ui.pointer({ type: 'down', button: 'left', x: 100, y: 20, in: 'manage' })
  await ui.pointer({ type: 'move', button: 'left', x: 110, y: 20, in: 'manage' })
  await ui.pointer({ type: 'up', button: 'left', x: 110, y: 20, in: 'manage' })
  expect(map()).toMatchObject({ x: 930, y: 210 })

  // The bottom edge sets the height alone (box now 63 x 22), grabbed left of the feed box.
  await ui.pointer({ type: 'down', button: 'left', x: 100, y: 2 + 11 + 21, in: 'manage' })
  await ui.pointer({ type: 'move', button: 'left', x: 100, y: 2 + 11 + 21 - 8, in: 'manage' })
  await ui.pointer({ type: 'up', button: 'left', x: 100, y: 2 + 11 + 21 - 8, in: 'manage' })
  expect(map()).toMatchObject({ k: 1, w: 630, h: 280 })
  // The right edge sets the width alone: 21 columns in.
  await ui.pointer({ type: 'down', button: 'left', x: 93 + 63 - 1, y: 18, in: 'manage' })
  await ui.pointer({ type: 'move', button: 'left', x: 93 + 63 - 1 - 21, y: 18, in: 'manage' })
  await ui.pointer({ type: 'up', button: 'left', x: 93 + 63 - 1 - 21, y: 18, in: 'manage' })
  expect(map()).toMatchObject({ x: 930, y: 210, k: 1, w: 420, h: 280 })
  const drawn = await backdrop()
  expect(drawn).toContain('translate(930 210) scale(1)')
  expect(drawn).toContain('<rect width="420" height="280"')

  // Hide with ✕ (42 wide again), then show again from the ＋ entry on the top row.
  await ui.pointer({ type: 'down', button: 'left', x: 93 + 42 - 2, y: 2 + 11 + 1, in: 'manage' })
  expect(map()?.isOn).toBe(false)
  expect(await backdrop()).not.toContain('GRID //')
  await ui.pointer({ type: 'down', button: 'left', x: 154, y: 0, in: 'manage' })
  expect(map()?.isOn).toBe(true)
  await ui.unmount()
})
