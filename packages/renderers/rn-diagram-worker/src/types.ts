export type DiagramEngine =
  | 'mermaid'
  | 'plantuml'
  | 'math'
  | 'vega'
  | 'vega-lite'
  | 'echarts'
  | string;

export interface DiagramRenderRequest {
  id: string;
  engine: DiagramEngine;
  code: string;
  options?: Record<string, unknown>;
}

export type DiagramRenderFormat = 'svg' | 'png' | 'error';

export interface DiagramErrorInfo {
  code: 'syntax_error' | 'timeout' | 'render_error' | 'unknown';
  message: string;
  details?: string;
}

export interface DiagramRenderResult {
  id: string;
  engine: DiagramEngine;
  success: boolean;
  format: DiagramRenderFormat;
  /**
   * 当 format === 'svg' 时为 SVG XML 字符串；
   * 当 format === 'png' 时为 base64 编码的数据（不含 data: 头）；
   * 当 format === 'error' 时为错误消息。
   */
  payload: string;
  error?: DiagramErrorInfo;
  /**
   * 性能指标（可选）
   */
  performance?: {
    renderTime: number;  // 渲染耗时（毫秒）
    cacheHit: boolean;   // 是否命中缓存
  };
}
