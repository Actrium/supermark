// Ambient type declarations for optional diagram engine peer dependencies.
// These modules may not be installed — runtime errors are handled by
// try/catch in the lazy-loading wrappers within @supramark/diagram-engine.

declare module 'echarts' {
  export function init(
    dom: null,
    theme: null,
    opts: { renderer: string; ssr: boolean; width: number; height: number }
  ): {
    setOption(option: Record<string, unknown>): void;
    renderToSVGString(): string;
    dispose(): void;
  };
}

declare module 'vega' {
  export function parse(spec: any): any;
  export class View {
    constructor(runtime: any, options?: { renderer?: string });
    toSVG(): Promise<string>;
    finalize(): void;
  }
}

declare module 'vega-lite' {
  export function compile(spec: any): { spec: any };
}
