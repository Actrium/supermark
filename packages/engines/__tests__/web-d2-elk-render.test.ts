import { describe, expect, it, mock } from 'bun:test';

// Validates the elkjs bridge orchestration in `renderD2ViaElk`:
// - a flat `layout-engine: elk` source goes prepare → elkjs.layout → render
//   and produces the render output (issue #34: elk now renders, not errors).
// - an unsupported elk source (sequence diagram) makes `prepare` flag it,
//   so `renderD2ViaElk` returns null and the caller falls back to dagre.
//
// The orchestration is unit-tested directly with fake d2 + fake elk objects
// and the `_setElkLoaderForTest` hook, so it does NOT depend on `mock.module`
// intercepting the dynamic `elkjs` / `@actrium/d2-little-web` imports (which
// is flaky across environments). The dagre-passthrough case exercises the
// full `createWebDiagramEngine` path with a convert-only d2 mock.

mock.module('../src/host-bridge.js', () => ({
  __esModule: true,
  installHostMetricsBridge: () => {},
}));

// Convert-only d2 mock for the dagre-passthrough test (the elk tests build a
// fake d2 object inline, so they don't touch this module).
mock.module('@actrium/d2-little-web', () => ({
  __esModule: true,
  default: async () => {},
  convert: (code: string) => `<svg data-dagre>${code}</svg>`,
}));

const { renderD2ViaElk, _setElkLoaderForTest, createWebDiagramEngine } = await import('../src/web');
import type { WasmRenderModule } from '../src/web';

/** Fake d2 wasm module: echoes a flat ELK graph back via `prepare`. */
function fakeD2(opts: { hasSequence?: boolean } = {}): WasmRenderModule {
  return {
    convert: (code: string) => `<svg data-dagre>${code}</svg>`,
    prepare: () => {
      const request = {
        multi_board: false,
        has_sequence: Boolean(opts.hasSequence),
        has_grid: false,
        has_near: false,
        elk_graph: {
          id: '',
          layoutOptions: { 'elk.algorithm': 'layered' },
          children: [
            { id: 'a', width: 40, height: 20 },
            { id: 'b', width: 40, height: 20 },
          ],
          edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
        },
      };
      return { handle: 777, request: JSON.stringify(request) };
    },
    render: () => '<svg data-elk><rect/></svg>',
    drop_prepared: () => {},
  } as unknown as WasmRenderModule;
}

/** Fake elk loader: places both children and routes a straight edge. */
function fakeElkLoader() {
  return async () => ({
    layout: async (graph: unknown) => {
      const input = graph as { children: { id: string }[]; edges: { id: string }[] };
      return {
        id: 'root',
        children: input.children.map((c, i) => ({
          id: c.id,
          x: i * 100,
          y: 0,
          width: 40,
          height: 20,
        })),
        edges: input.edges.map(e => ({
          id: e.id,
          sections: [{ startPoint: { x: 40, y: 10 }, endPoint: { x: 100, y: 10 } }],
        })),
      };
    },
  });
}

const ELK_CODE = 'vars: {\n  d2-config: {\n    layout-engine: elk\n  }\n}\n\na -> b';

describe('renderD2ViaElk', () => {
  it('renders a flat elk source through prepare → elkjs → render', async () => {
    _setElkLoaderForTest(fakeElkLoader());
    try {
      const svg = await renderD2ViaElk(fakeD2(), ELK_CODE);
      expect(svg).not.toBeNull();
      expect(svg!).toContain('data-elk');
    } finally {
      _setElkLoaderForTest(null);
    }
  });

  it('returns null for an unsupported elk source (sequence diagram)', async () => {
    _setElkLoaderForTest(fakeElkLoader());
    try {
      const svg = await renderD2ViaElk(
        fakeD2({ hasSequence: true }),
        ELK_CODE.replace('a -> b', 'shape: sequence_diagram\na -> b'),
      );
      expect(svg).toBeNull();
    } finally {
      _setElkLoaderForTest(null);
    }
  });
});

describe('createWebDiagramEngine dagre passthrough', () => {
  it('routes non-elk d2 through dagre convert', async () => {
    const engine = createWebDiagramEngine();
    const result = await engine.render({ engine: 'd2', code: 'a -> b' });
    expect(result.success).toBe(true);
    expect(result.payload).toContain('data-dagre');
  });
});
