// Ambient type declarations for optional/runtime-loaded dependencies.

// Diagram engine optional deps
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

// markdown-it ecosystem deps without @types
declare module 'markdown-it-container';
declare module 'markdown-it-texmath';
declare module 'markdown-it-footnote';
declare module 'markdown-it-deflist';

declare module 'pako';
