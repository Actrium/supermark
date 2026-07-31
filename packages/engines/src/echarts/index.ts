import type { RenderOptions } from '../types.js';
import { DiagramRenderError } from '../types.js';

/** Render options for the ECharts engine. */
export interface Options extends RenderOptions {
  /** Canvas background color; use `"transparent"` for a transparent canvas. */
  backgroundColor?: string;
}

// Duck type for the ECharts core object (avoids a hard dependency on the `echarts` package).
interface EChartsCore {
  init(dom: unknown, theme: unknown, opts: Record<string, unknown>): EChartsInstance;
  use(modules: unknown[]): void;
}
interface EChartsInstance {
  setOption(option: Record<string, unknown>): void;
  renderToSVGString(): string;
  dispose(): void;
}

function isEchartsCore(value: unknown): value is EChartsCore {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as EChartsCore).init === 'function' &&
    typeof (value as EChartsCore).use === 'function'
  );
}

/**
 * ECharts engine factory.
 *
 * **The host must pass at least an ECharts core instance via `modules`**
 * (usually from `echarts/core`); the rest are ECharts modules such as chart
 * type / component / renderer, which get registered via `core.use(...)`.
 *
 * @example
 * ```ts
 * import * as core       from 'echarts/core';
 * import { SVGRenderer } from 'echarts/renderers';
 * import { LineChart }   from 'echarts/charts';
 * import { GridComponent, TooltipComponent } from 'echarts/components';
 * import echarts         from '@supramark/engines/echarts';
 *
 * const render = echarts([core, SVGRenderer, LineChart, GridComponent, TooltipComponent]);
 * const svg    = await render('{"xAxis":{"type":"category","data":["A","B"]}, ...}');
 * ```
 *
 * The pattern above lets the bundler's static analysis narrow the bundle to
 * "just LineChart + the three components + SVGRenderer" — every other chart
 * type gets tree-shaken away.
 */
export default function echarts(modules?: unknown[]) {
  const items = modules ?? [];
  const core = items.find(isEchartsCore);
  const rest = items.filter(m => m !== core);

  // Module registration only needs to happen once (echarts.use is idempotent); done outside the factory.
  if (core && rest.length > 0) {
    core.use(rest);
  }

  // RenderFn contract requires a Promise return; echarts SSR is synchronous so
  // there is no await inside, but the async signature must be kept.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (code: string, options?: Options): Promise<string> => {
    options?.signal?.throwIfAborted();

    if (!core) {
      throw new DiagramRenderError(
        'ECharts core instance missing. Pass `import * as core from "echarts/core"` in modules.',
        { engine: 'echarts', code: 'engine_unavailable' }
      );
    }

    let option: Record<string, unknown>;
    try {
      option = JSON.parse(code) as Record<string, unknown>;
    } catch (e) {
      throw new DiagramRenderError(
        `ECharts option JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
        { engine: 'echarts', code: 'parse_error', input: code.slice(0, 200), cause: e }
      );
    }

    const width = options?.width ?? 600;
    const height = options?.height ?? 400;

    const chart = core.init(null, null, {
      renderer: 'svg',
      ssr: true,
      width,
      height,
      backgroundColor: options?.backgroundColor,
    });

    try {
      chart.setOption(option);
      return chart.renderToSVGString().replace(/pointer-events="visible"/g, '');
    } catch (e) {
      throw new DiagramRenderError(
        `ECharts render failed: ${e instanceof Error ? e.message : String(e)}`,
        { engine: 'echarts', code: 'render_error', input: code.slice(0, 200), cause: e }
      );
    } finally {
      chart.dispose();
    }
  };
}
