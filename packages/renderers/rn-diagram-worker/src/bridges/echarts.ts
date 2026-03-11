import type { BridgeEngine } from './types';

const ECHARTS_CDN = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js';

/**
 * WebView 内 ECharts 渲染逻辑。
 *
 * 流程：JSON.parse(code) → echarts.init(container, null, { renderer:'svg' })
 *       → setOption → 50ms 后捕获 SVG → 内联 CSS class → 注入 viewBox → 回传
 */
const handleRenderJs = `
var _echart = null;

function handleEcharts(msg, send) {
  var id = msg.id;
  try {
    var option = JSON.parse(msg.code);
    var w = (msg.options && msg.options.width) || 600;
    var h = (msg.options && msg.options.height) || 400;

    // Disable animation — we capture the SVG immediately after render,
    // so animated elements would be at their initial (invisible) state.
    option.animation = false;

    if (_echart) { _echart.dispose(); _echart = null; }

    var container = document.getElementById('c_echarts');
    if (!container) {
      container = document.createElement('div');
      container.id = 'c_echarts';
      document.body.appendChild(container);
    }
    container.style.width = w + 'px';
    container.style.height = h + 'px';

    _echart = echarts.init(container, null, { renderer: 'svg', width: w, height: h });
    _echart.setOption(option);

    // Use setTimeout instead of requestAnimationFrame — rAF may not fire
    // reliably in a near-zero-size hidden WebView on some platforms.
    setTimeout(function() {
      var svg = container.querySelector('svg');
      if (!svg) {
        send({ type: 'result', id: id, success: false, error: 'No SVG element found after render' });
        return;
      }

      // Inline all CSS class styles into element style attributes.
      // react-native-svg does not support <style> blocks.
      var styleEl = svg.querySelector('style');
      if (styleEl) {
        var rules;
        try { rules = styleEl.sheet && styleEl.sheet.cssRules; } catch(_e) { rules = null; }
        if (rules) {
          for (var ri = 0; ri < rules.length; ri++) {
            var rule = rules[ri];
            if (!rule.selectorText || !rule.style) continue;
            try {
              var els = svg.querySelectorAll(rule.selectorText);
              for (var ei = 0; ei < els.length; ei++) {
                for (var si = 0; si < rule.style.length; si++) {
                  var prop = rule.style[si];
                  if (!els[ei].style.getPropertyValue(prop)) {
                    els[ei].style.setProperty(prop, rule.style.getPropertyValue(prop));
                  }
                }
              }
            } catch(_e2) { /* selector may be unsupported, skip */ }
          }
        }
        styleEl.remove();
      }

      // Ensure the SVG has a viewBox so RN can scale it properly.
      var svgW = svg.getAttribute('width') || String(w);
      var svgH = svg.getAttribute('height') || String(h);
      if (!svg.getAttribute('viewBox')) {
        svg.setAttribute('viewBox', '0 0 ' + parseFloat(svgW) + ' ' + parseFloat(svgH));
      }
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      var svgStr = new XMLSerializer().serializeToString(svg);
      send({ type: 'result', id: id, success: true, format: 'svg', payload: svgStr });
    }, 50);
  } catch(err) {
    send({ type: 'result', id: id, success: false, error: String(err) });
  }
}
`;

export function createEChartsBridge(cdnUrl?: string): BridgeEngine {
  return {
    name: 'echarts',
    cdnScripts: [cdnUrl ?? ECHARTS_CDN],
    handleRenderJs,
  };
}
