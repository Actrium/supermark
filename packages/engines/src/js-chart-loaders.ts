import echartsFactory from './echarts';
import type { DiagramRenderFn } from './types';
import vegaLiteFactory from './vega-lite';

/**
 * Minimal surfaces of the dynamically-imported `echarts/*` subpath modules.
 *
 * Only the named exports the factory wiring touches are typed; each is an
 * opaque echarts module token consumed by `core.use(...)`, so `unknown` is the
 * right element type (the factory receives `unknown[]`).
 */
interface EchartsCoreModule {
  [key: string]: unknown;
}
interface EchartsRenderersModule {
  SVGRenderer: unknown;
}
interface EchartsChartsModule {
  LineChart: unknown;
  BarChart: unknown;
  PieChart: unknown;
  ScatterChart: unknown;
}
interface EchartsComponentsModule {
  GridComponent: unknown;
  TooltipComponent: unknown;
  TitleComponent: unknown;
  LegendComponent: unknown;
}

/** The two vega runtime modules are passed opaquely into the factory. */
type VegaModule = Record<string, unknown>;

/**
 * Shared JS SVG loaders for browser-like hosts.
 *
 * These loaders do not depend on browser DOM rendering. ECharts uses its SVG
 * SSR path and Vega/Vega-Lite use headless SVG export, so Web and RN can share
 * the same output contract: source in, SVG string out.
 */
export async function loadEchartsSvgRender(): Promise<DiagramRenderFn> {
  // `as string` keeps the specifier unresolved so TS does not require the
  // optional `echarts` peer dependency to be installed at type-check time.
  //
  // The specifier MUST stay a string literal — never hoist it into a variable.
  // Vite/Rollup can only statically analyze `import('echarts/core')`: they
  // split it into a dynamic chunk and rewrite the runtime import to a relative
  // URL. A `import(variable)` form cannot be analyzed, survives the build as a
  // bare specifier, and the browser throws
  // `Failed to resolve module specifier "echarts/core"` on the deployed static
  // preview site (issues #80 / #79).
  const [core, renderers, charts, components] = await Promise.all([
    import('echarts/core' as string) as Promise<EchartsCoreModule>,
    import('echarts/renderers' as string) as Promise<EchartsRenderersModule>,
    import('echarts/charts' as string) as Promise<EchartsChartsModule>,
    import('echarts/components' as string) as Promise<EchartsComponentsModule>,
  ]);

  return echartsFactory([
    core,
    renderers.SVGRenderer,
    charts.LineChart,
    charts.BarChart,
    charts.PieChart,
    charts.ScatterChart,
    components.GridComponent,
    components.TooltipComponent,
    components.TitleComponent,
    components.LegendComponent,
  ]) as DiagramRenderFn;
}

export async function loadVegaLiteSvgRender(): Promise<DiagramRenderFn> {
  // See loadEchartsSvgRender: the specifier must stay a string literal so
  // Vite/Rollup can split it into a chunk; a `import(variable)` form regresses
  // to a bare specifier on the deployed static site (issue #79).
  const [Vega, VegaLite] = await Promise.all([
    import('vega' as string) as Promise<VegaModule>,
    import('vega-lite' as string) as Promise<VegaModule>,
  ]);

  return vegaLiteFactory([Vega, VegaLite]) as DiagramRenderFn;
}
