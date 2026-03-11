import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { LRUCache, createCacheKey, simpleHash } from '@supramark/core';
import type { SupramarkDiagramConfig } from '@supramark/core';
import type {
  DiagramRenderRequest,
  DiagramRenderResult,
  DiagramEngine,
} from './types';

export interface DiagramRenderService {
  render: (params: {
    engine: DiagramEngine;
    code: string;
    options?: Record<string, unknown>;
  }) => Promise<DiagramRenderResult>;
  /**
   * 清空缓存
   */
  clearCache: () => void;
  /**
   * 获取缓存统计信息
   */
  getCacheStats: () => {
    size: number;
    maxSize: number;
    totalSize: number;
  };
}

interface InternalPending {
  resolve: (value: DiagramRenderResult) => void;
  reject: (reason?: unknown) => void;
  timeoutId?: NodeJS.Timeout;
}

interface DiagramRenderProviderProps {
  children: React.ReactNode;
  /**
   * 可选：是否在 WebView 未就绪时排队请求，默认 true。
   */
  queueBeforeReady?: boolean;
  /**
   * 可选：渲染超时时间（毫秒），默认 10000ms (10秒)。
   */
  timeout?: number;
  /**
   * 可选：缓存配置
   */
  cacheOptions?: {
    /**
     * 缓存最大容量，默认 100
     */
    maxSize?: number;
    /**
     * 缓存 TTL（毫秒），默认 300000 (5分钟)
     */
    ttl?: number;
    /**
     * 是否启用缓存，默认 true
     */
    enabled?: boolean;
  };

  /**
   * 可选：图表子系统配置
   *
   * - 如果提供，则用于设置默认超时与缓存策略；
   * - 对于单个请求，`render()` 仍可以通过 options.timeout 覆盖超时；
   * - 仅作为上层配置的桥梁，不包含 Feature 启用/禁用逻辑。
   */
  diagramConfig?: SupramarkDiagramConfig;
}

const DiagramRenderContext = createContext<DiagramRenderService | null>(null);

const WORKER_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>supramark diagram worker</title>
    <style>
      html, body { margin: 0; padding: 0; }
    </style>
    <!-- Mermaid 从 CDN 加载，作为默认图表引擎实现（使用 v9，API 更稳定） -->
    <script src="https://unpkg.com/mermaid@9/dist/mermaid.min.js"></script>
    <!-- MathJax v3（SVG 输出），用于 Math → SVG 渲染 -->
    <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
    <!-- Vega / Vega-Lite / Vega-Embed，用于数据可视化图表 -->
    <script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
    <!-- ECharts（使用 SVG 渲染器），用于 ECharts 图表 -->
    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  </head>
  <body>
    <script>
      (function () {
        function safePost(message) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(message);
          }
        }

        function respond(result) {
          try {
            safePost(JSON.stringify(result));
          } catch (_) {
            // ignore
          }
        }

        function renderMermaid(req) {
          if (typeof mermaid === 'undefined') {
            respond({
              id: req.id,
              engine: req.engine,
              success: false,
              format: 'error',
              payload: 'Mermaid library not loaded',
              error: {
                code: 'render_error',
                message: 'Mermaid library is not available in worker',
              }
            });
            return;
          }

          try {
            // 配置 Mermaid 以生成更兼容 React Native SVG 的输出
            mermaid.initialize({
              startOnLoad: false,
              theme: 'default',
              themeVariables: {
                fontFamily: 'Arial, sans-serif',
                fontSize: '16px'
              },
              flowchart: {
                htmlLabels: false,  // 使用 SVG 文本而不是 HTML
                useMaxWidth: false
              }
            });
          } catch (_) {
            // 初始化可能已经完成，忽略错误
          }

          var id = 'diagram_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);

          try {
            mermaid.mermaidAPI.render(id, req.code, function (svgCode) {
              respond({
                id: req.id,
                engine: req.engine,
                success: true,
                format: 'svg',
                payload: String(svgCode || ''),
              });
            });
          } catch (err) {
            var errorMsg = String(err);
            var errorCode = 'render_error';

            // 检查是否是语法错误
            if (errorMsg.indexOf('Parse error') !== -1 ||
                errorMsg.indexOf('Syntax error') !== -1 ||
                errorMsg.indexOf('syntax') !== -1) {
              errorCode = 'syntax_error';
            }

            respond({
              id: req.id,
              engine: req.engine,
              success: false,
              format: 'error',
              payload: errorMsg,
              error: {
                code: errorCode,
                message: 'Mermaid rendering failed',
                details: errorMsg
              }
            });
          }
        }

        function renderPlantUml(req) {
          var server =
            (req.options && req.options.server) ||
            (req.options && req.options.plantumlServer) ||
            'https://www.plantuml.com/plantuml/svg/';

          try {
            var controller = new AbortController();
            var timeoutId = setTimeout(function () {
              controller.abort();
            }, (req.options && req.options.timeout) || 15000);

            fetch(server, {
              method: 'POST',
              headers: {
                'Content-Type': 'text/plain; charset=utf-8',
              },
              body: String(req.code || ''),
              signal: controller.signal,
            })
              .then(function (res) {
                clearTimeout(timeoutId);
                if (!res.ok) {
                  throw new Error('HTTP ' + res.status + ' ' + res.statusText);
                }
                return res.text();
              })
              .then(function (svg) {
                respond({
                  id: req.id,
                  engine: req.engine,
                  success: true,
                  format: 'svg',
                  payload: String(svg || ''),
                });
              })
              .catch(function (err) {
                var errorMsg = String(err && err.message ? err.message : err);
                var code = errorMsg.indexOf('AbortError') !== -1 ? 'timeout' : 'render_error';
                respond({
                  id: req.id,
                  engine: req.engine,
                  success: false,
                  format: 'error',
                  payload: errorMsg,
                  error: {
                    code: code,
                    message: 'PlantUML rendering failed',
                    details: errorMsg,
                  },
                });
              });
          } catch (err) {
            var errorMsg = String(err);
            respond({
              id: req.id,
              engine: req.engine,
              success: false,
              format: 'error',
              payload: errorMsg,
              error: {
                code: 'render_error',
                message: 'PlantUML rendering failed',
                details: errorMsg,
              },
            });
          }
        }

        function renderMath(req) {
          if (typeof MathJax === 'undefined' || !MathJax.tex2svgPromise) {
            respond({
              id: req.id,
              engine: req.engine,
              success: false,
              format: 'error',
              payload: 'MathJax library not loaded',
              error: {
                code: 'render_error',
                message: 'MathJax library is not available in worker',
              }
            });
            return;
          }

          var display = !!(req.options && req.options.displayMode);
          var tex = String(req.code || '');

          MathJax.tex2svgPromise(tex, { display: display }).then(function (node) {
            try {
              var svg = node.querySelector('svg');
              if (!svg) {
                throw new Error('No SVG element generated by MathJax');
              }
              var container = document.createElement('div');
              container.appendChild(svg.cloneNode(true));
              var svgHtml = container.innerHTML;

              respond({
                id: req.id,
                engine: req.engine,
                success: true,
                format: 'svg',
                payload: String(svgHtml || ''),
              });
            } catch (err) {
              var errorMsg = String(err);
              respond({
                id: req.id,
                engine: req.engine,
                success: false,
                format: 'error',
                payload: errorMsg,
                error: {
                  code: 'render_error',
                  message: 'MathJax rendering failed',
                  details: errorMsg,
                }
              });
            }
          }).catch(function (err) {
            var errorMsg = String(err);
            respond({
              id: req.id,
              engine: req.engine,
              success: false,
              format: 'error',
              payload: errorMsg,
              error: {
                code: 'render_error',
                message: 'MathJax rendering failed',
                details: errorMsg,
              }
            });
          });
        }

        function renderVegaLite(req) {
          if (typeof window.vegaEmbed === 'undefined') {
            respond({
              id: req.id,
              engine: req.engine,
              success: false,
              format: 'error',
              payload: 'vega-embed library not loaded',
              error: {
                code: 'render_error',
                message: 'vega-embed is not available in worker',
              }
            });
            return;
          }

          var spec;
          try {
            spec = JSON.parse(String(req.code || ''));
          } catch (err) {
            var parseMsg = String(err && err.message ? err.message : err);
            respond({
              id: req.id,
              engine: req.engine,
              success: false,
              format: 'error',
              payload: parseMsg,
              error: {
                code: 'render_error',
                message: 'Failed to parse Vega-Lite JSON',
                details: parseMsg,
              }
            });
            return;
          }

          var target = document.createElement('div');

          window.vegaEmbed(target, spec, {
            renderer: 'svg',
            actions: false,
          }).then(function (result) {
            return result.view.toSVG();
          }).then(function (svg) {
            respond({
              id: req.id,
              engine: req.engine,
              success: true,
              format: 'svg',
              payload: String(svg || ''),
            });
          }).catch(function (err) {
            var msg = String(err && err.message ? err.message : err);
            respond({
              id: req.id,
              engine: req.engine,
              success: false,
              format: 'error',
              payload: msg,
              error: {
                code: 'render_error',
                message: 'Vega-Lite rendering failed',
                details: msg,
              }
            });
          });
        }

        function renderECharts(req) {
          if (typeof echarts === 'undefined') {
            respond({
              id: req.id,
              engine: req.engine,
              success: false,
              format: 'error',
              payload: 'ECharts library not loaded',
              error: {
                code: 'render_error',
                message: 'ECharts is not available in worker',
              }
            });
            return;
          }

          var option;
          try {
            option = JSON.parse(String(req.code || ''));
          } catch (err) {
            var parseMsg = String(err && err.message ? err.message : err);
            respond({
              id: req.id,
              engine: req.engine,
              success: false,
              format: 'error',
              payload: parseMsg,
              error: {
                code: 'render_error',
                message: 'Failed to parse ECharts option JSON',
                details: parseMsg,
              }
            });
            return;
          }

          // 允许通过 options 指定宽高，否则使用默认值
          var width = 400;
          var height = 300;
          if (req.options) {
            if (typeof req.options.width === 'number') {
              width = req.options.width;
            }
            if (typeof req.options.height === 'number') {
              height = req.options.height;
            }
          }

          var container = document.createElement('div');
          container.style.position = 'absolute';
          container.style.left = '-9999px';
          container.style.top = '-9999px';
          container.style.width = String(width) + 'px';
          container.style.height = String(height) + 'px';
          document.body.appendChild(container);

          var chart = null;

          try {
            chart = echarts.init(container, null, {
              renderer: 'svg',
              width: width,
              height: height,
            });
            chart.setOption(option);
          } catch (err) {
            var initMsg = String(err && err.message ? err.message : err);
            if (chart && chart.dispose) {
              try { chart.dispose(); } catch (_) {}
            }
            if (container && container.parentNode) {
              container.parentNode.removeChild(container);
            }
            respond({
              id: req.id,
              engine: req.engine,
              success: false,
              format: 'error',
              payload: initMsg,
              error: {
                code: 'render_error',
                message: 'ECharts initialization failed',
                details: initMsg,
              }
            });
            return;
          }

          // ECharts 渲染是同步的，但 SVG 节点的挂载可能需要一帧，这里用 setTimeout(0)
          setTimeout(function () {
            try {
              var svg = container.querySelector('svg');
              if (!svg) {
                throw new Error('No SVG element generated by ECharts');
              }
              var wrapper = document.createElement('div');
              wrapper.appendChild(svg.cloneNode(true));
              var svgHtml = wrapper.innerHTML;

              respond({
                id: req.id,
                engine: req.engine,
                success: true,
                format: 'svg',
                payload: String(svgHtml || ''),
              });
            } catch (err) {
              var errorMsg = String(err && err.message ? err.message : err);
              respond({
                id: req.id,
                engine: req.engine,
                success: false,
                format: 'error',
                payload: errorMsg,
                error: {
                  code: 'render_error',
                  message: 'ECharts rendering failed',
                  details: errorMsg,
                }
              });
            } finally {
              if (chart && chart.dispose) {
                try { chart.dispose(); } catch (_) {}
              }
              if (container && container.parentNode) {
                container.parentNode.removeChild(container);
              }
            }
          }, 0);
        }

        function handleMessage(event) {
          try {
            var data = event.data || (event.nativeEvent && event.nativeEvent.data) || '';
            var req = JSON.parse(data);

            if (req.engine === 'mermaid') {
              renderMermaid(req);
              return;
            }

            if (req.engine === 'math') {
              renderMath(req);
              return;
            }

            if (req.engine === 'plantuml') {
              renderPlantUml(req);
              return;
            }

            if (req.engine === 'vega' || req.engine === 'vega-lite') {
              renderVegaLite(req);
              return;
            }

            if (req.engine === 'echarts') {
              renderECharts(req);
              return;
            }

            // 默认：其他引擎尚未实现
            respond({
              id: req.id,
              engine: req.engine,
              success: false,
              format: 'error',
              payload: 'Unsupported diagram engine: ' + String(req.engine),
              error: {
                code: 'render_error',
                message: 'Diagram engine not implemented',
                details: 'Engine "' + String(req.engine) + '" is not yet supported'
              }
            });
          } catch (err) {
            respond({
              id: 'error',
              engine: 'error',
              success: false,
              format: 'error',
              payload: String(err),
              error: {
                code: 'unknown',
                message: 'Unknown error in diagram worker',
                details: String(err)
              }
            });
          }
        }

        document.addEventListener('message', handleMessage);
        window.addEventListener('message', handleMessage);
      }());
    </script>
  </body>
</html>
`;

export const DiagramRenderProvider: React.FC<DiagramRenderProviderProps> = ({
  children,
  queueBeforeReady = true,
  timeout,
  cacheOptions = {},
  diagramConfig,
}) => {
  // 解析全局超时与缓存配置（diagramConfig 提供默认值，显式 props 优先）
  const effectiveTimeout = timeout ?? diagramConfig?.defaultTimeoutMs ?? 10000;
  const resolvedCacheOptions = {
    maxSize: cacheOptions.maxSize ?? diagramConfig?.defaultCache?.maxSize ?? 100,
    ttl: cacheOptions.ttl ?? diagramConfig?.defaultCache?.ttl ?? 300000,
    enabled: cacheOptions.enabled ?? diagramConfig?.defaultCache?.enabled ?? true,
  };

  const webViewRef = useRef<WebView | null>(null);
  const [ready, setReady] = useState(false);
  const pendingRef = useRef<Map<string, InternalPending>>(new Map());
  const queueRef = useRef<DiagramRenderRequest[]>([]);
  const requestIdRef = useRef(0);

  // 初始化缓存 - 临时使用Map替代LRUCache避免React Native兼容性问题
  const cacheRef = useRef(new Map<string, DiagramRenderResult>());
  const cacheEnabled = resolvedCacheOptions.enabled !== false;

  const sendRequest = useCallback(
    (req: DiagramRenderRequest) => {
      const webview = webViewRef.current;
      if (!webview) {
        return;
      }
      webview.postMessage(JSON.stringify(req));
    },
    [],
  );

  const flushQueue = useCallback(() => {
    if (!ready) return;
    const webview = webViewRef.current;
    if (!webview) return;
    const queue = queueRef.current;
    while (queue.length > 0) {
      const req = queue.shift();
      if (req) {
        sendRequest(req);
      }
    }
  }, [ready, sendRequest]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as DiagramRenderResult;
      const pending = pendingRef.current.get(data.id);
      if (pending) {
        // 清除超时定时器
        if (pending.timeoutId) {
          clearTimeout(pending.timeoutId);
        }
        pending.resolve(data);
        pendingRef.current.delete(data.id);
      }
    } catch {
      // 占位：忽略解析错误。
    }
  }, []);

  const service = useMemo<DiagramRenderService>(
    () => ({
      render: ({ engine, code, options }) => {
        // 性能监控：记录开始时间
        const startTime = Date.now();

        // 生成缓存键
        const cacheKey = createCacheKey(engine, simpleHash(code));

        // 查询缓存
        if (cacheEnabled) {
          const cached = cacheRef.current.get(cacheKey);
          if (cached) {
            // 缓存命中：添加性能指标
            return Promise.resolve({
              ...cached,
              performance: {
                renderTime: Date.now() - startTime,
                cacheHit: true,
              },
            });
          }
        }

        const id = `req_${Date.now()}_${requestIdRef.current++}`;
        const req: DiagramRenderRequest = { id, engine, code, options };

        return new Promise<DiagramRenderResult>((resolve, reject) => {
          // 单次请求超时：options.timeout 优先，其次使用全局 effectiveTimeout
          const perRequestTimeout =
            typeof (options as any)?.timeout === 'number'
              ? (options as any).timeout
              : effectiveTimeout;

          // 设置超时定时器
          const timeoutId = setTimeout(() => {
            const pending = pendingRef.current.get(id);
            if (pending) {
              pendingRef.current.delete(id);
              const errorResult: DiagramRenderResult = {
                id,
                engine,
                success: false,
                format: 'error',
                payload: 'Diagram rendering timeout',
                error: {
                  code: 'timeout',
                  message: `Diagram rendering exceeded ${perRequestTimeout}ms timeout`,
                },
              };
              resolve(errorResult);
            }
          }, perRequestTimeout);

          // 包装 resolve 以在成功时缓存结果并添加性能指标
          const wrappedResolve = (result: DiagramRenderResult) => {
            // 添加性能指标
            const resultWithPerformance: DiagramRenderResult = {
              ...result,
              performance: {
                renderTime: Date.now() - startTime,
                cacheHit: false,
              },
            };

            if (cacheEnabled && result.success) {
              cacheRef.current.set(cacheKey, resultWithPerformance);
            }
            resolve(resultWithPerformance);
          };

          pendingRef.current.set(id, { resolve: wrappedResolve, reject, timeoutId });

          if (ready) {
            sendRequest(req);
          } else if (queueBeforeReady) {
            queueRef.current.push(req);
          } else {
            clearTimeout(timeoutId);
            pendingRef.current.delete(id);
            reject(new Error('Diagram worker is not ready'));
          }
        });
      },
      clearCache: () => {
        cacheRef.current.clear();
      },
      getCacheStats: () => {
        // 临时实现 - 使用Map的简化统计信息
        return {
          size: cacheRef.current.size,
          maxSize: resolvedCacheOptions.maxSize,
          totalSize: cacheRef.current.size, // 简化实现
        };
      },
    }),
    [ready, queueBeforeReady, sendRequest, effectiveTimeout, cacheEnabled],
  );

  const handleReady = useCallback(() => {
    setReady(true);
    flushQueue();
  }, [flushQueue]);

  return (
    <DiagramRenderContext.Provider value={service}>
      {children}
      <View style={styles.hidden}>
        <WebView
          ref={ref => {
            webViewRef.current = ref;
          }}
          originWhitelist={['*']}
          source={{ html: WORKER_HTML }}
          onMessage={handleMessage}
          onLoadEnd={handleReady}
        />
      </View>
    </DiagramRenderContext.Provider>
  );
};

export function useDiagramRender(): DiagramRenderService {
  const ctx = useContext(DiagramRenderContext);
  if (!ctx) {
    throw new Error('useDiagramRender must be used within DiagramRenderProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
});
