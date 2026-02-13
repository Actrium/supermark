import { LRUCache, createCacheKey, simpleHash } from '@supramark/core';
import type {
  DiagramEngineType,
  DiagramRenderResult,
  DiagramRenderService,
  DiagramEngineOptions,
} from './types.js';

export class DiagramEngine implements DiagramRenderService {
  private cache: LRUCache<DiagramRenderResult>;
  private cacheEnabled: boolean;
  private defaultTimeout: number;
  private plantumlServer?: string;
  private requestId = 0;

  constructor(options: DiagramEngineOptions = {}) {
    this.defaultTimeout = options.timeout ?? 30000;
    this.plantumlServer = options.plantumlServer;
    this.cacheEnabled = options.cache?.enabled !== false;
    this.cache = new LRUCache<DiagramRenderResult>({
      maxSize: options.cache?.maxSize ?? 100,
      ttl: options.cache?.ttl ?? 300000,
    });
  }

  async render(params: {
    engine: DiagramEngineType;
    code: string;
    options?: Record<string, unknown>;
  }): Promise<DiagramRenderResult> {
    const { engine, code, options } = params;
    const startTime = Date.now();
    const id = `de_${Date.now()}_${this.requestId++}`;
    const cacheKey = createCacheKey(engine, simpleHash(code));

    // Check cache
    if (this.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return {
          ...cached,
          id,
          performance: {
            renderTime: Date.now() - startTime,
            cacheHit: true,
          },
        };
      }
    }

    try {
      const { payload, format } = await this.dispatchRender(engine, code, options);

      const result: DiagramRenderResult = {
        id,
        engine,
        success: true,
        format,
        payload,
        performance: {
          renderTime: Date.now() - startTime,
          cacheHit: false,
        },
      };

      if (this.cacheEnabled) {
        this.cache.set(cacheKey, result);
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.includes('timeout') || message.includes('Timeout');
      const isSyntax =
        message.includes('Parse error') ||
        message.includes('Syntax error') ||
        message.includes('syntax');
      const isNotAvailable = message.includes('Failed to load');

      return {
        id,
        engine,
        success: false,
        format: 'error',
        payload: message,
        error: {
          code: isNotAvailable
            ? 'engine_not_available'
            : isTimeout
              ? 'timeout'
              : isSyntax
                ? 'syntax_error'
                : 'render_error',
          message: `${engine} rendering failed`,
          details: message,
        },
        performance: {
          renderTime: Date.now() - startTime,
          cacheHit: false,
        },
      };
    }
  }

  private async dispatchRender(
    engine: DiagramEngineType,
    code: string,
    options?: Record<string, unknown>
  ): Promise<{ payload: string; format: 'svg' | 'html' }> {
    // Normalize engine aliases
    const normalizedEngine = engine === 'graphviz' ? 'dot' : engine;

    switch (normalizedEngine) {
      case 'mermaid': {
        const { renderMermaid } = await import('./engines/mermaid.js');
        return { payload: await renderMermaid(code), format: 'svg' };
      }
      case 'dot': {
        const { renderDot } = await import('./engines/dot.js');
        return { payload: await renderDot(code), format: 'svg' };
      }
      case 'echarts': {
        const { renderECharts } = await import('./engines/echarts.js');
        return { payload: await renderECharts(code, options), format: 'svg' };
      }
      case 'vega':
      case 'vega-lite': {
        const { renderVegaLite } = await import('./engines/vega-lite.js');
        return { payload: await renderVegaLite(code, normalizedEngine), format: 'svg' };
      }
      case 'math': {
        const { renderKatex } = await import('./engines/katex.js');
        return { payload: await renderKatex(code, options), format: 'html' };
      }
      case 'plantuml': {
        const { renderPlantUml } = await import('./engines/plantuml.js');
        const mergedOptions = {
          ...options,
          ...(this.plantumlServer ? { server: this.plantumlServer } : {}),
        };
        return await renderPlantUml(code, mergedOptions);
      }
      default:
        throw new Error(`Unsupported diagram engine: ${engine}`);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; maxSize: number; totalSize: number } {
    const stats = this.cache.getStats();
    return {
      size: stats.size,
      maxSize: stats.maxSize,
      totalSize: stats.totalSize,
    };
  }
}
