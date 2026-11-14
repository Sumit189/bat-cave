import { expect, test } from 'claude-code/testing'

const BACKDROP = {
  plugin: 'bat-cave',
  component: 'Backdrop',
  requestId: 'b',
  props: { scene: 'bat-signal', plugin: 'bat-cave', glass: { blur: 10, opacity: 0.62 } },
} as const

test('a tool call is drawn into the backdrop terminal, escaped, with its result', async ($, on) => {
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'b' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'echo   <hi> && ls' })

  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BACKDROP, surface })
    const svg = await ui.find({ type: 'Svg' })
    const source = String(svg?.props.source)
    expect(source).toContain('>Bash</tspan>')
    expect(source).toContain('echo &lt;hi&gt; &amp;&amp; ls')
    expect(source).toContain('>✓</tspan>')
    await ui.unmount()
  }
})
