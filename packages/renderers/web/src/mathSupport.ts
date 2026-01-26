/**
 * Math 支持脚本（KaTeX）
 *
 * 本模块用于在 Web / SSR 场景下为 supramark 的 math 节点
 * 注入必要的 CSS 与脚本，使浏览器在加载后自动将占位元素
 * （data-suprimark-math="inline|block"）渲染为真正的公式。
 *
 * 设计与 diagram 支持类似：由宿主在 HTML 中插入脚本片段，
 * 业务侧只关心 <Supramark /> 的使用。
 */

export function buildMathSupportScripts(): string {
  // 使用 KaTeX 官方 CDN（0.16.x），提供 CSS 与 UMD 脚本。
  // 在 DOMContentLoaded 时扫描 math 占位元素并调用 katex.render。
  return `
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
      integrity="sha384-4+oP3paP9VJd5/IYJ7DyZt4wnWTak51DoOc3kjte+NK4cA3T4KNOM2XzU2B31wSc"
      crossorigin="anonymous"
    />
    <script
      src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"
      integrity="sha384-u/XxFnqUATbX4iG3E5sfxLHxF1VH3yQqQp7ByVdg1e4hh9HNCqjV3uVcT6A/+8A4"
      crossorigin="anonymous"
    ></script>
    <script>
      (function () {
        function renderSupramarkMath() {
          if (typeof window.katex === 'undefined') {
            // KaTeX 未加载成功，直接返回；占位文本仍然可读
            return;
          }

          var katex = window.katex;

          function renderElements(selector, displayMode) {
            var nodes = document.querySelectorAll(selector);
            nodes.forEach(function (node) {
              // 跳过已经渲染过的节点
              if (node.getAttribute('data-suprimark-math-rendered') === 'true') {
                return;
              }

              var tex = node.textContent || node.innerText || '';
              tex = tex.trim();
              if (!tex) return;

              try {
                katex.render(tex, node, {
                  displayMode: !!displayMode,
                  throwOnError: false,
                });
                node.setAttribute('data-suprimark-math-rendered', 'true');
              } catch (e) {
                // 渲染失败时，保留原始 TeX 文本，避免破坏页面
                // 可按需在此处添加错误提示
                console.error('[supramark][math] KaTeX render error:', e);
              }
            });
          }

          renderElements('[data-suprimark-math="inline"]', false);
          renderElements('[data-suprimark-math="block"]', true);
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', renderSupramarkMath);
        } else {
          renderSupramarkMath();
        }
      })();
    </script>
  `;
}

