import { describe, expect, it, mock } from 'bun:test';

// Validates the elkjs bridge wiring in `loadWebD2Render`:
// - a flat `layout-engine: elk` source goes prepare → elkjs.layout → render
//   and produces an SVG (issue #34: elk now renders, not errors).
// - an unsupported elk source (sequence diagram) falls back to dagre
//   (`convert`), so users always get a diagram.

mock.module('../src/host-bridge.js', () => ({
  __esModule: true,
  installHostMetricsBridge: () => {},
}));

// Track which wasm entries get exercised per render call.
const wasmCalls: string[] = [];

mock.module('@actrium/d2-little-web', () => ({
  __esModule: true,
  default: async () => {},
  // dagre path
  convert: (code: string) => {
    wasmCalls.push('convert');
    return `<svg data-dagre>${code}</svg>`;
  },
  // elk bridge path
  prepare: (code: string) => {
    wasmCalls.push('prepare');
    // Sequence-diagram scripts carry `shape: sequence_diagram`; flag it so
    // the engines layer falls back to dagre. Otherwise emit a flat ELK graph.
    const hasSequence = /shape:\s*sequence_diagram/.test(code);
    const request = {
      multi_board: false,
      has_sequence: hasSequence,
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
  render: (_handle: number, _layoutJson: string) => {
    wasmCalls.push('render');
    return '<svg data-elk><rect/></svg>';
  },
  drop_prepared: () => {
    wasmCalls.push('drop_prepared');
  },
}));

mock.module('elkjs/lib/elk.bundled.js', () => ({
  __esModule: true,
  default: class {
    async layout(graph: unknown) {
      wasmCalls.push('elk.layout');
      // Echo a minimal valid elk output shape: place both children and
      // route a straight edge between them.
      const input = graph as { children: { id: string }[]; edges: { id: string; sources: string[]; targets: string[] }[] };
      return {
        id: 'root',
        children: input.children.map((c, i) => ({
          id: c.id,
          position: { x: i * 100, y: 0 },
          width: 40,
          height: 20,
        })),
        edges: input.edges.map(e => ({
          id: e.id,
          sections: [
            {
              startPoint: { x: 40, y: 10 },
              endPoint: { x: 100, y: 10 },
            },
          ],
        })),
      };
    }
  },
}));

const { createWebDiagramEngine } = await import('../src/web');

describe('d2 elk bridge', () => {
  it('renders a flat elk source through prepare → elkjs → render', async () => {
    wasmCalls.length = 0;
    const engine = createWebDiagramEngine();
    const result = await engine.render({
      engine: 'd2',
      code: 'vars: {\n  d2-config: {\n    layout-engine: elk\n  }\n}\n\na -> b',
    });

    expect(result.success).toBe(true);
    expect(result.format).toBe('svg');
    expect(result.payload).toContain('data-elk');
    expect(wasmCalls).toContain('prepare');
    expect(wasmCalls).toContain('elk.layout');
    expect(wasmCalls).toContain('render');
    expect(wasmCalls).not.toContain('convert');
  });

  it('falls back to dagre for an unsupported elk source (sequence diagram)', async () => {
    wasmCalls.length = 0;
    const engine = createWebDiagramEngine();
    const result = await engine.render({
      engine: 'd2',
      code:
        'vars: {\n  d2-config: {\n    layout-engine: elk\n  }\n}\n\nshape: sequence_diagram\na -> b',
    });

    expect(result.success).toBe(true);
    expect(result.payload).toContain('data-dagre');
    expect(wasmCalls).toContain('convert');
    // The prepared handle is dropped after the fallback decision.
    expect(wasmCalls).toContain('drop_prepared');
    expect(wasmCalls).not.toContain('render');
  });

  it('routes non-elk d2 through dagre convert', async () => {
    wasmCalls.length = 0;
    const engine = createWebDiagramEngine();
    const result = await engine.render({ engine: 'd2', code: 'a -> b' });

    expect(result.success).toBe(true);
    expect(result.payload).toContain('data-dagre');
    expect(wasmCalls).toEqual(['convert']);
  });
});
