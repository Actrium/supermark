import { describe, expect, it } from 'bun:test';
import { createDiagramEngine } from '../src/engine';

// Issue #162: `engineConfig.timeoutMs` is forwarded as `options.timeout`, but
// no engine consumed it — a hung wasm render left the whole document's
// `Promise.all` pending forever. These tests guard that the engine now races
// the render against the configured timeout and surfaces a `render_error`
// instead of hanging.

const never = () => new Promise<string>(() => {});

describe('engine render timeout (options.timeout)', () => {
  it('returns render_error when an engine hangs past options.timeout', async () => {
    const engine = createDiagramEngine({
      d2: { render: never },
    });

    const result = await engine.render({
      engine: 'd2',
      code: 'a -> b',
      options: { timeout: 50 },
    });

    expect(result.success).toBe(false);
    expect(result.format).toBe('error');
    expect(result.error?.code).toBe('render_error');
    expect(result.payload).toMatch(/timed out/i);
    expect(result.engine).toBe('d2');
  });

  it('honors timeoutMs as an alias for timeout', async () => {
    const engine = createDiagramEngine({
      d2: { render: never },
    });

    const result = await engine.render({
      engine: 'd2',
      code: 'a -> b',
      options: { timeoutMs: 50 },
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('render_error');
  });

  it('still returns svg when render completes before options.timeout', async () => {
    const engine = createDiagramEngine({
      d2: { render: async () => '<svg></svg>' },
    });

    const result = await engine.render({
      engine: 'd2',
      code: 'a -> b',
      options: { timeout: 1000 },
    });

    expect(result.success).toBe(true);
    expect(result.format).toBe('svg');
    expect(result.payload).toContain('<svg');
  });

  it('does not apply a timeout when none is configured (hangs, no false error)', async () => {
    const engine = createDiagramEngine({
      d2: { render: () => new Promise<string>(resolve => setTimeout(() => resolve('<svg></svg>'), 20)) },
    });

    const result = await engine.render({ engine: 'd2', code: 'a -> b' });

    expect(result.success).toBe(true);
    expect(result.format).toBe('svg');
  });

  it('ignores non-positive timeout values', async () => {
    const engine = createDiagramEngine({
      d2: { render: async () => '<svg></svg>' },
    });

    for (const timeout of [0, -1, NaN]) {
      const result = await engine.render({
        engine: 'd2',
        code: 'a -> b',
        options: { timeout },
      });
      expect(result.success).toBe(true);
    }
  });

  it('treats a thrown render error normally even with a timeout set', async () => {
    const engine = createDiagramEngine({
      d2: { render: async () => {
        throw new Error('boom');
      } },
    });

    const result = await engine.render({
      engine: 'd2',
      code: 'a -> b',
      options: { timeout: 1000 },
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('render_error');
    expect(result.payload).toBe('boom');
  });
});
