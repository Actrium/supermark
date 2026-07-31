import { describe, expect, it, mock } from 'bun:test';

// The d2 wasm module measures glyph width via globalThis.supramark.measureText
// as soon as it loads. Historical bug: loadWebD2Render forgot to call
// installHostMetricsBridge(), so a standalone d2 render fell back to the
// size*0.6 heuristic, while the mermaid->d2 path (where mermaid had already
// installed the bridge and used real measurement) produced different output —
// the two paths were inconsistent.
// This test guards the invariant "the d2 loader must install the bridge first."

const installMock = mock(() => {});

mock.module('../src/host-bridge.js', () => ({
  __esModule: true,
  installHostMetricsBridge: installMock,
}));

mock.module('@actrium/d2-little-web', () => ({
  __esModule: true,
  default: async () => {},
  convert: (code: string) => `<svg data-stub>${code}</svg>`,
}));

const { loadWebD2Render } = await import('../src/web');

describe('loadWebD2Render', () => {
  it('installs host metrics bridge before invoking d2 wasm', async () => {
    installMock.mockClear();
    await loadWebD2Render();
    expect(installMock).toHaveBeenCalledTimes(1);
  });

  it('still returns a working render fn after bridge install', async () => {
    const render = await loadWebD2Render();
    const svg = await render('a -> b');
    expect(svg).toContain('<svg');
  });
});
