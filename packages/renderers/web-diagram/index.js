// 为 Web 端提供的图表渲染脚本片段。
// 当前主要集成：
// - Mermaid v9：将 data-suprimark-diagram=\"mermaid\" 的节点渲染为 SVG；
// - PlantUML：通过远端 PlantUML server 渲染 data-suprimark-diagram=\"plantuml\" 的节点为 SVG。
//
// 可选支持 SupramarkDiagramConfig（来自 @supramark/core）的子集，用于配置：
// - 默认渲染超时时间（defaultTimeoutMs）
// - 默认缓存策略（defaultCache.enabled / maxSize）
// - 各引擎的附加配置（engines[engine].timeoutMs / server / cache）

function buildDiagramSupportScripts(config) {
  let serializedConfig = 'null';
  if (config) {
    try {
      serializedConfig = JSON.stringify(config);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[supramark/web-diagram] Failed to serialize diagram config:', e);
    }
  }

  return `
    <script>
      // 在浏览器端暴露全局配置对象，供图表脚本使用。
      window.__SUPRAMARK_DIAGRAM_CONFIG__ = ${serializedConfig};
    </script>
    <script src="https://unpkg.com/mermaid@9/dist/mermaid.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
    <script>
      (function () {
        var globalConfig = (typeof window !== 'undefined' && window.__SUPRAMARK_DIAGRAM_CONFIG__) || {};
        var RENDER_TIMEOUT = (globalConfig && typeof globalConfig.defaultTimeoutMs === 'number')
          ? globalConfig.defaultTimeoutMs
          : 10000; // 10秒超时
        var CACHE_MAX_SIZE = (globalConfig && globalConfig.defaultCache && typeof globalConfig.defaultCache.maxSize === 'number')
          ? globalConfig.defaultCache.maxSize
          : 50; // 缓存最大容量
        var CACHE_ENABLED = !(globalConfig && globalConfig.defaultCache && globalConfig.defaultCache.enabled === false);
        var mermaidLoadFailed = false;

        // 简单的 LRU 缓存实现（使用 Map，保持插入顺序）
        var diagramCache = new Map();

        // 简单哈希函数
        function simpleHash(str) {
          var hash = 0;
          for (var i = 0; i < str.length; i++) {
            var char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          return Math.abs(hash).toString(36);
        }

        // 生成缓存键
        function getCacheKey(engine, code) {
          return engine + ':' + simpleHash(code);
        }

        // 添加到缓存（LRU：超过容量删除最旧的）
        function addToCache(key, value) {
          if (!CACHE_ENABLED) {
            return;
          }
          // 如果已存在，先删除（重新插入会移到最后）
          if (diagramCache.has(key)) {
            diagramCache.delete(key);
          }

          diagramCache.set(key, value);

          // 如果超过最大容量，删除最旧的（Map 的第一个）
          if (diagramCache.size > CACHE_MAX_SIZE) {
            var firstKey = diagramCache.keys().next().value;
            diagramCache.delete(firstKey);
          }
        }

        // 从缓存获取
        function getFromCache(key) {
          if (!CACHE_ENABLED) {
            return null;
          }
          if (!diagramCache.has(key)) {
            return null;
          }

          var value = diagramCache.get(key);
          // LRU：访问时移到最后
          diagramCache.delete(key);
          diagramCache.set(key, value);

          return value;
        }

        // 获取特定引擎的配置（如果存在）
        function getEngineConfig(engine) {
          if (!globalConfig || !globalConfig.engines || typeof globalConfig.engines !== 'object') {
            return null;
          }
          var cfg = globalConfig.engines[engine];
          if (!cfg || typeof cfg !== 'object') {
            return null;
          }
          return cfg;
        }

        function showError(block, errorType, errorMessage, originalCode) {
          var errorHtml = '<div style="border: 1px solid #ffccc7; background: #fff2f0; padding: 12px; border-radius: 4px; margin: 8px 0;">';
          errorHtml += '<div style="color: #cf1322; font-weight: 600; margin-bottom: 8px;">图表渲染失败</div>';
          errorHtml += '<div style="color: #8c8c8c; font-size: 13px; margin-bottom: 8px;">错误类型: ' + errorType + '</div>';
          errorHtml += '<div style="color: #595959; font-size: 13px; margin-bottom: 12px; white-space: pre-wrap;">' + errorMessage + '</div>';
          errorHtml += '<details style="margin-top: 8px;">';
          errorHtml += '<summary style="cursor: pointer; color: #1890ff; font-size: 13px;">查看原始代码</summary>';
          errorHtml += '<pre style="background: #fafafa; padding: 8px; border-radius: 4px; margin-top: 8px; overflow: auto;"><code>' + escapeHtml(originalCode) + '</code></pre>';
          errorHtml += '</details>';
          errorHtml += '</div>';
          block.innerHTML = errorHtml;
        }

        function escapeHtml(text) {
          var div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }

        function renderMermaidDiagrams() {
          var blocks = document.querySelectorAll('[data-suprimark-diagram="mermaid"]');
          var engineConfig = getEngineConfig('mermaid') || {};
          var timeoutMs = (typeof engineConfig.timeoutMs === 'number')
            ? engineConfig.timeoutMs
            : RENDER_TIMEOUT;

          // 检查 Mermaid 库是否加载成功
          if (typeof mermaid === 'undefined') {
            mermaidLoadFailed = true;
            blocks.forEach(function (block) {
              var codeEl = block.querySelector('pre > code');
              var code = codeEl ? (codeEl.textContent || codeEl.innerText || '') : '';
              showError(
                block,
                'script_load_failed',
                'Mermaid 库加载失败，请检查网络连接或 CDN 可用性。',
                code
              );
            });
            return;
          }

          try {
            mermaid.initialize({
              startOnLoad: false,
              theme: 'default',
              securityLevel: 'loose'
            });
          } catch (e) {
            // 可能已经初始化过，忽略错误
          }

          blocks.forEach(function (block, index) {
            var codeEl = block.querySelector('pre > code');
            if (!codeEl) return;
            var code = codeEl.textContent || codeEl.innerText || '';

            // 检查缓存
            var cacheKey = getCacheKey('mermaid', code);
            var cachedSvg = getFromCache(cacheKey);
            if (cachedSvg) {
              block.innerHTML = cachedSvg;
              return;
            }

            var renderId = 'mermaid_' + index + '_' + Date.now();
            var timeoutId;
            var rendered = false;

            // 设置超时处理
            timeoutId = setTimeout(function () {
              if (!rendered) {
                rendered = true;
                showError(
                  block,
                  'timeout',
                  '图表渲染超时（' + (timeoutMs / 1000) + '秒），可能是图表过于复杂或语法错误。',
                  code
                );
              }
            }, timeoutMs);

            try {
              mermaid.mermaidAPI.render(renderId, code, function (svgCode) {
                if (!rendered) {
                  clearTimeout(timeoutId);
                  rendered = true;
                  var svg = svgCode || '';
                  block.innerHTML = svg;
                  // 存入缓存
                  if (svg) {
                    addToCache(cacheKey, svg);
                  }
                }
              });
            } catch (e) {
              clearTimeout(timeoutId);
              if (!rendered) {
                rendered = true;
                var errorMsg = String(e);
                var errorType = 'render_error';

                // 识别语法错误
                if (errorMsg.indexOf('Parse error') !== -1 ||
                    errorMsg.indexOf('Syntax error') !== -1 ||
                    errorMsg.indexOf('syntax') !== -1) {
                  errorType = 'syntax_error';
                }

                showError(block, errorType, errorMsg, code);
              }
            }
          });
        }

        function renderPlantUmlDiagrams() {
          var blocks = document.querySelectorAll('[data-suprimark-diagram="plantuml"]');
          if (!blocks.length) return;

          blocks.forEach(function (block) {
            var codeEl = block.querySelector('pre > code');
            if (!codeEl) return;
            var code = codeEl.textContent || codeEl.innerText || '';

            var cacheKey = getCacheKey('plantuml', code);
            var cachedSvg = getFromCache(cacheKey);
            if (cachedSvg) {
              block.innerHTML = cachedSvg;
              return;
            }

            var engineConfig = getEngineConfig('plantuml') || {};
            var server = block.getAttribute('data-suprimark-plantuml-server') ||
              engineConfig.server ||
              'https://www.plantuml.com/plantuml/svg/';

            var controller = new AbortController();
            var timeoutMs = (typeof engineConfig.timeoutMs === 'number')
              ? engineConfig.timeoutMs
              : RENDER_TIMEOUT;
            var timeoutId = setTimeout(function () {
              controller.abort();
              showError(
                block,
                'timeout',
                'PlantUML 渲染超时（' + (timeoutMs / 1000) + '秒），请稍后重试或检查图表是否过于复杂。',
                code
              );
            }, timeoutMs);

            fetch(server, {
              method: 'POST',
              headers: {
                'Content-Type': 'text/plain; charset=utf-8'
              },
              body: code,
              signal: controller.signal
            }).then(function (res) {
              clearTimeout(timeoutId);
              if (!res.ok) {
                throw new Error('HTTP ' + res.status + ' ' + res.statusText);
              }
              return res.text();
            }).then(function (svg) {
              block.innerHTML = svg;
              addToCache(cacheKey, svg);
            }).catch(function (err) {
              clearTimeout(timeoutId);
              var msg = String(err && err.message ? err.message : err);
              var type = msg.indexOf('AbortError') !== -1 ? 'timeout' : 'render_error';
              showError(block, type, msg, code);
            });
          });
        }

        function renderVegaLiteDiagrams() {
          var selector = [
            '[data-suprimark-diagram="vega-lite"]',
            '[data-suprimark-diagram="vega"]',
            '[data-suprimark-diagram="chart"]',
            '[data-suprimark-diagram="chartjs"]'
          ].join(',');

          var blocks = document.querySelectorAll(selector);
          if (!blocks.length) return;

          if (typeof window.vegaEmbed === 'undefined') {
            blocks.forEach(function (block) {
              var codeEl = block.querySelector('pre > code');
              var code = codeEl ? (codeEl.textContent || codeEl.innerText || '') : '';
              showError(
                block,
                'script_load_failed',
                'Vega-Lite 库加载失败，请检查网络连接或 CDN 可用性。',
                code
              );
            });
            return;
          }

          blocks.forEach(function (block) {
            var codeEl = block.querySelector('pre > code');
            if (!codeEl) return;
            var code = codeEl.textContent || codeEl.innerText || '';

            var engine = block.getAttribute('data-suprimark-diagram') || 'vega-lite';
            var cacheKey = getCacheKey(engine, code);
            var cachedSvg = getFromCache(cacheKey);
            if (cachedSvg) {
              block.innerHTML = cachedSvg;
              return;
            }

            var spec;
            try {
              spec = JSON.parse(code);
            } catch (e) {
              showError(
                block,
                'parse_error',
                '无法解析 Vega-Lite JSON：' + String(e && e.message ? e.message : e),
                code
              );
              return;
            }

            var engineConfig = getEngineConfig(engine) || {};
            var timeoutMs = (typeof engineConfig.timeoutMs === 'number')
              ? engineConfig.timeoutMs
              : RENDER_TIMEOUT;

            var controller = new AbortController();
            var timeoutId = setTimeout(function () {
              controller.abort();
              showError(
                block,
                'timeout',
                'Vega-Lite 渲染超时（' + (timeoutMs / 1000) + '秒），请检查图表是否过于复杂。',
                code
              );
            }, timeoutMs);

            var target = block;
            target.innerHTML = '';

            window.vegaEmbed(target, spec, {
              renderer: 'svg',
              actions: false,
            }).then(function (result) {
              clearTimeout(timeoutId);
              // vega-embed 会直接在 target 内插入 <svg>，我们将其 innerHTML 缓存起来
              var svgHtml = target.innerHTML;
              if (svgHtml) {
                addToCache(cacheKey, svgHtml);
              }
            }).catch(function (err) {
              clearTimeout(timeoutId);
              var msg = String(err && err.message ? err.message : err);
              showError(block, 'render_error', msg, code);
            });
          });
        }

        function renderEChartsDiagrams() {
          var blocks = document.querySelectorAll('[data-suprimark-diagram="echarts"]');
          if (!blocks.length) return;

          if (typeof window.echarts === 'undefined') {
            blocks.forEach(function (block) {
              var codeEl = block.querySelector('pre > code');
              var code = codeEl ? (codeEl.textContent || codeEl.innerText || '') : '';
              showError(
                block,
                'script_load_failed',
                'ECharts 库加载失败，请检查网络连接或 CDN 可用性。',
                code
              );
            });
            return;
          }

          blocks.forEach(function (block) {
            var codeEl = block.querySelector('pre > code');
            if (!codeEl) return;
            var code = codeEl.textContent || codeEl.innerText || '';

            var cacheKey = getCacheKey('echarts', code);
            var cached = getFromCache(cacheKey);
            if (cached) {
              block.innerHTML = cached;
              return;
            }

            var option;
            try {
              option = JSON.parse(code);
            } catch (e) {
              showError(
                block,
                'parse_error',
                '无法解析 ECharts JSON：' + String(e && e.message ? e.message : e),
                code
              );
              return;
            }

            block.innerHTML = '';
            var chart = window.echarts.init(block, null, { renderer: 'svg' });
            try {
              chart.setOption(option);
            } catch (e) {
              var msg = String(e && e.message ? e.message : e);
              showError(block, 'render_error', msg, code);
              chart.dispose();
              return;
            }

            // 简单缓存：存储当前 DOM 的 innerHTML，方便下一次复用
            var svgHtml = block.innerHTML;
            if (svgHtml) {
              addToCache(cacheKey, svgHtml);
            }
          });
        }

        function renderAllDiagrams() {
          renderMermaidDiagrams();
          renderPlantUmlDiagrams();
          renderVegaLiteDiagrams();
          renderEChartsDiagrams();
        }

        // 尝试在 DOMContentLoaded 时渲染
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', renderAllDiagrams);
        } else {
          // DOM 已经加载完成，立即执行
          renderAllDiagrams();
        }

        // 检测 Mermaid 脚本加载错误（监听 script 标签的 error 事件）
        // 注意：这个检测是后置的，主要依赖 renderMermaidDiagrams 中的检查
        window.addEventListener('error', function (event) {
          if (event.target && event.target.tagName === 'SCRIPT' &&
              event.target.src && event.target.src.indexOf('mermaid') !== -1) {
            mermaidLoadFailed = true;
          }
        }, true);
      })();
    </script>
  `;
}

module.exports = {
  buildDiagramSupportScripts,
};
