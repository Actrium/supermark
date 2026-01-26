import type { SupramarkDiagramConfig } from '@supramark/core';

declare module '@supramark/web-diagram' {
  /**
   * 生成 Web 端所需的图表支持脚本片段。
   *
   * @param config 可选的图表配置（SupramarkDiagramConfig），用于控制超时、缓存和各引擎参数。
   */
  export function buildDiagramSupportScripts(config?: SupramarkDiagramConfig): string;
}
