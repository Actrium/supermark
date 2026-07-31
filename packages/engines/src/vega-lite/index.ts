import type { RenderOptions } from '../types.js';
import { DiagramRenderError } from '../types.js';

/** Render options for the Vega-Lite engine. */
export interface Options extends RenderOptions {
  /**
   * Input type: 'vega' or 'vega-lite'.
   * Defaults to 'vega-lite'; if set to 'vega', skips vegaLite.compile() and
   * renders the vega spec directly.
   */
  dialect?: 'vega' | 'vega-lite';
}

// Duck types for Vega/VegaLite (zero hard dependency).
interface VegaRuntime {
  parse: (spec: Record<string, unknown>) => unknown;
  View: new (runtime: unknown, opts: Record<string, unknown>) => VegaView;
}
interface VegaView {
  toSVG: () => Promise<string>;
  finalize: () => void;
}
interface VegaLiteCompiler {
  compile: (spec: Record<string, unknown>) => { spec: Record<string, unknown> };
}

function isVegaRuntime(value: unknown): value is VegaRuntime {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as VegaRuntime).parse === 'function' &&
    typeof (value as VegaRuntime).View === 'function'
  );
}
function isVegaLiteCompiler(value: unknown): value is VegaLiteCompiler {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as VegaLiteCompiler).compile === 'function'
  );
}

/**
 * Vega-Lite engine factory.
 *
 * The host injects two runtime modules via `modules`:
 * - `vega` (with `.parse` / `.View`) — required
 * - `vega-lite` (with `.compile`) — required if rendering vega-lite specs; can be omitted for plain vega specs
 *
 * @example
 * ```ts
 * import * as Vega     from 'vega';
 * import * as VegaLite from 'vega-lite';
 * import vegaLite      from '@supramark/engines/vega-lite';
 *
 * const render = vegaLite([Vega, VegaLite]);
 * const svg    = await render('{"mark":"bar","encoding":{...},"data":{...}}');
 * ```
 */
export default function vegaLite(modules?: unknown[]) {
  const items = modules ?? [];
  const vega = items.find(isVegaRuntime);
  const compiler = items.find(isVegaLiteCompiler);

  return async (code: string, options?: Options): Promise<string> => {
    options?.signal?.throwIfAborted();

    if (!vega) {
      throw new DiagramRenderError(
        'Vega runtime missing. Pass `import * as Vega from "vega"` in modules.',
        { engine: 'vega-lite', code: 'engine_unavailable' }
      );
    }

    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(code) as Record<string, unknown>;
    } catch (e) {
      throw new DiagramRenderError(
        `Spec JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
        { engine: 'vega-lite', code: 'parse_error', input: code.slice(0, 200), cause: e }
      );
    }

    const dialect = options?.dialect ?? 'vega-lite';
    let vegaSpec: Record<string, unknown>;
    if (dialect === 'vega') {
      vegaSpec = spec;
    } else {
      if (!compiler) {
        throw new DiagramRenderError(
          'Vega-Lite compiler missing. Pass `import * as VegaLite from "vega-lite"` in modules, or set options.dialect = "vega".',
          { engine: 'vega-lite', code: 'engine_unavailable' }
        );
      }
      vegaSpec = compiler.compile(spec).spec;
    }

    const view = new vega.View(vega.parse(vegaSpec), { renderer: 'none' });
    try {
      return await view.toSVG();
    } catch (e) {
      throw new DiagramRenderError(
        `Vega render failed: ${e instanceof Error ? e.message : String(e)}`,
        { engine: 'vega-lite', code: 'render_error', input: code.slice(0, 200), cause: e }
      );
    } finally {
      view.finalize();
    }
  };
}
