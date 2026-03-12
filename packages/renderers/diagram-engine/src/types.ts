export type DiagramEngineType =
  | 'mermaid'
  | 'plantuml'
  | 'math'
  | 'dot'
  | 'graphviz'
  | 'vega'
  | 'vega-lite'
  | 'echarts'
  | string;

export interface DiagramRenderRequest {
  id: string;
  engine: DiagramEngineType;
  code: string;
  options?: Record<string, unknown>;
}

export type DiagramRenderFormat = 'svg' | 'png' | 'html' | 'error';

export interface DiagramErrorInfo {
  code: 'syntax_error' | 'timeout' | 'render_error' | 'engine_not_available' | 'unknown';
  message: string;
  details?: string;
}

export interface DiagramRenderResult {
  id: string;
  engine: DiagramEngineType;
  success: boolean;
  format: DiagramRenderFormat;
  payload: string;
  error?: DiagramErrorInfo;
  performance?: {
    renderTime: number;
    cacheHit: boolean;
  };
}

export interface DiagramRenderService {
  render: (params: {
    engine: DiagramEngineType;
    code: string;
    options?: Record<string, unknown>;
  }) => Promise<DiagramRenderResult>;
  clearCache: () => void;
  getCacheStats: () => {
    size: number;
    maxSize: number;
    totalSize: number;
  };
}

export interface DiagramEngineOptions {
  timeout?: number;
  cache?: {
    enabled?: boolean;
    maxSize?: number;
    ttl?: number;
  };
  plantumlServer?: string;
}
