import type { BridgeEngine } from './types';
import { BEAUTIFUL_MERMAID_BUNDLE } from '../vendor/beautifulMermaidBundle';

/**
 * beautiful-mermaid 的浏览器入口需要是“已经打平依赖的普通脚本”。
 *
 * npm 包自带的 dist/index.js 仍然是 ESM，并且包含对 entities / elkjs 的裸 import，
 * 不适合直接在 RN WebView 里作为普通 <script src> 使用。
 *
 * 默认改为内置单文件 IIFE bundle；如果调用方显式传入 cdnUrl，则它也必须指向
 * 同类的自包含普通脚本，并在全局暴露 BeautifulMermaid。
 *
 * beautiful-mermaid 是纯 TS 实现，零 DOM 依赖，生成标准 SVG <text> 元素
 * （不使用 foreignObject），react-native-svg 可以正确显示文字。
 */
const BEAUTIFUL_MERMAID_GLOBAL = 'BeautifulMermaid';

/**
 * WebView 内 Mermaid 渲染逻辑。
 *
 * 流程：等待 window.BeautifulMermaid 就绪 → renderMermaidSVG(code) → 回传 SVG
 */
const handleRenderJs = `
function parseColor(value) {
  if (!value) return null;
  value = String(value).trim();
  if (!value) return null;
  var hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    var raw = hex[1];
    if (raw.length === 3) {
      return {
        r: parseInt(raw.charAt(0) + raw.charAt(0), 16),
        g: parseInt(raw.charAt(1) + raw.charAt(1), 16),
        b: parseInt(raw.charAt(2) + raw.charAt(2), 16),
      };
    }
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }
  var rgb = value.match(/^rgba?\\(([^)]+)\\)$/i);
  if (rgb) {
    var parts = rgb[1].split(',').map(function(part) { return parseFloat(part.trim()); });
    if (parts.length >= 3) {
      return { r: parts[0], g: parts[1], b: parts[2] };
    }
  }
  return null;
}

function colorToString(color) {
  if (!color) return '';
  function toHex(n) {
    var clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, '0');
  }
  return '#' + toHex(color.r) + toHex(color.g) + toHex(color.b);
}

function mixColors(fg, bg, fgPercent) {
  return {
    r: fg.r * fgPercent + bg.r * (1 - fgPercent),
    g: fg.g * fgPercent + bg.g * (1 - fgPercent),
    b: fg.b * fgPercent + bg.b * (1 - fgPercent),
  };
}

function getSvgVarMap(svg) {
  var styleText = svg.getAttribute('style') || '';
  var vars = {};
  styleText.split(';').forEach(function(part) {
    var idx = part.indexOf(':');
    if (idx <= 0) return;
    var key = part.slice(0, idx).trim();
    var value = part.slice(idx + 1).trim();
    if (key.indexOf('--') !== 0 || !value) return;
    vars[key] = value;
  });

  var bg = parseColor(vars['--bg'] || '#ffffff');
  var fg = parseColor(vars['--fg'] || '#27272a');
  var line = parseColor(vars['--line'] || '');
  var accent = parseColor(vars['--accent'] || '');
  var muted = parseColor(vars['--muted'] || '');
  var surface = parseColor(vars['--surface'] || '');
  var border = parseColor(vars['--border'] || '');

  if (!bg || !fg) return vars;

  vars['--_text'] = vars['--fg'] || colorToString(fg);
  vars['--_text-sec'] = colorToString(muted || mixColors(fg, bg, 0.6));
  vars['--_text-muted'] = colorToString(muted || mixColors(fg, bg, 0.4));
  vars['--_text-faint'] = colorToString(mixColors(fg, bg, 0.25));
  vars['--_line'] = colorToString(line || mixColors(fg, bg, 0.5));
  vars['--_arrow'] = colorToString(accent || mixColors(fg, bg, 0.85));
  vars['--_node-fill'] = colorToString(surface || mixColors(fg, bg, 0.03));
  vars['--_node-stroke'] = colorToString(border || mixColors(fg, bg, 0.2));
  vars['--_group-fill'] = vars['--bg'] || colorToString(bg);
  vars['--_group-hdr'] = colorToString(mixColors(fg, bg, 0.05));
  vars['--_inner-stroke'] = colorToString(mixColors(fg, bg, 0.12));
  vars['--_key-badge'] = colorToString(mixColors(fg, bg, 0.10));
  return vars;
}

function resolveCssVarValue(value, vars) {
  if (!value || value.indexOf('var(') < 0) return value;
  return value.replace(/var\\((--[\\w-]+)(?:,[^)]+)?\\)/g, function(_m, name) {
    return vars[name] || '';
  }).trim();
}

function inlineMermaidSvg(svgText) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(svgText, 'image/svg+xml');
  var svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') {
    throw new Error('beautiful-mermaid did not return a valid SVG document');
  }

  var host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '-10000px';
  host.style.top = '-10000px';
  host.style.width = '0';
  host.style.height = '0';
  host.style.overflow = 'hidden';
  host.appendChild(document.importNode(svg, true));
  document.body.appendChild(host);

  try {
    var mountedSvg = host.querySelector('svg');
    if (!mountedSvg) {
      throw new Error('Failed to mount mermaid SVG for style inlining');
    }
    var svgVars = getSvgVarMap(mountedSvg);

    var props = [
      'fill',
      'fill-opacity',
      'stroke',
      'stroke-opacity',
      'stroke-width',
      'stroke-dasharray',
      'stroke-dashoffset',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-miterlimit',
      'opacity',
      'color',
      'font-family',
      'font-size',
      'font-weight',
      'font-style',
      'letter-spacing',
      'text-anchor',
      'dominant-baseline',
      'visibility',
      'display',
    ];

    var all = mountedSvg.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var computed = window.getComputedStyle(el);

      var attrNames = ['fill', 'stroke', 'color', 'stop-color'];
      for (var ai = 0; ai < attrNames.length; ai++) {
        var attrName = attrNames[ai];
        var attrValue = el.getAttribute(attrName);
        if (attrValue && attrValue.indexOf('var(') >= 0) {
          var resolvedAttr = resolveCssVarValue(attrValue, svgVars);
          if (resolvedAttr) {
            el.setAttribute(attrName, resolvedAttr);
          }
        }
      }

      var styleParts = [];
      for (var j = 0; j < props.length; j++) {
        var prop = props[j];
        var value = computed.getPropertyValue(prop);
        if (!value) continue;
        value = String(value).trim();
        if (!value) continue;
        if (value === 'none' && (prop === 'fill' || prop === 'stroke')) {
          el.setAttribute(prop, 'none');
          continue;
        }
        if (value.indexOf('var(') >= 0) {
          value = resolveCssVarValue(value, svgVars);
        }
        if (value.indexOf('color-mix(') >= 0) continue;
        if (!value) continue;
        if (value === 'normal' && (prop === 'letter-spacing' || prop === 'font-style')) continue;
        if (value === 'auto' && prop === 'dominant-baseline') continue;
        styleParts.push(prop + ':' + value);
      }
      if (styleParts.length > 0) {
        el.setAttribute('style', styleParts.join(';'));
      } else {
        el.removeAttribute('style');
      }
    }

    var styleNodes = mountedSvg.querySelectorAll('style');
    for (var si = 0; si < styleNodes.length; si++) {
      styleNodes[si].remove();
    }

    // Remove CSS custom properties after computed styles are inlined.
    mountedSvg.removeAttribute('class');
    mountedSvg.removeAttribute('style');

    var width = mountedSvg.getAttribute('width');
    var height = mountedSvg.getAttribute('height');
    if (!mountedSvg.getAttribute('viewBox') && width && height) {
      var svgW = parseFloat(width);
      var svgH = parseFloat(height);
      if (svgW > 0 && svgH > 0) {
        mountedSvg.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);
      }
    }
    mountedSvg.removeAttribute('width');
    mountedSvg.removeAttribute('height');

    return new XMLSerializer().serializeToString(mountedSvg);
  } finally {
    host.remove();
  }
}

function handleMermaid(msg, send) {
  var id = msg.id;

  function doRender() {
    try {
      var bm = window.BeautifulMermaid || window.__bm;
      if (!bm) {
        send({ type: 'result', id: id, success: false,
               error: 'beautiful-mermaid not loaded yet' });
        return;
      }

      var renderFn = bm.renderMermaidSVG || bm.renderMermaidSync;
      if (!renderFn) {
        send({ type: 'result', id: id, success: false,
               error: 'beautiful-mermaid: no render function found' });
        return;
      }

      var options = {};
      if (msg.options && msg.options.bg) options.bg = msg.options.bg;
      if (msg.options && msg.options.fg) options.fg = msg.options.fg;

      var svgStr = renderFn(msg.code, options);
      Promise.resolve(svgStr).then(function(svg) {
        try {
          var inlined = inlineMermaidSvg(svg);
          send({ type: 'result', id: id, success: true, format: 'svg', payload: inlined });
        } catch (inlineErr) {
          send({ type: 'result', id: id, success: false, error: String(inlineErr) });
        }
      }).catch(function(err) {
        send({ type: 'result', id: id, success: false, error: String(err) });
      });
    } catch(err) {
      send({ type: 'result', id: id, success: false, error: String(err) });
    }
  }

  if (window.BeautifulMermaid || window.__bm) {
    doRender();
  } else {
    var attempts = 0;
    var poll = setInterval(function() {
      attempts++;
      if (window.BeautifulMermaid || window.__bm) {
        clearInterval(poll);
        doRender();
      } else if (attempts > 100) {
        clearInterval(poll);
        send({ type: 'result', id: id, success: false,
               error: 'beautiful-mermaid failed to load from CDN' });
      }
    }, 100);
  }
}
`;

/**
 * 默认把内置 IIFE bundle 直接注入到 <head>，避免额外网络请求和 ESM 二级 import。
 */
function buildInlineScript(): string {
  return `<script>
try {
${BEAUTIFUL_MERMAID_BUNDLE}
window.__bm = window.${BEAUTIFUL_MERMAID_GLOBAL};
} catch (e) {
  console.error('beautiful-mermaid inline bundle load failed:', e);
}
<\/script>`;
}

export function createMermaidBridge(cdnUrl?: string): BridgeEngine {
  return {
    name: 'mermaid',
    cdnScripts: cdnUrl ? [cdnUrl] : [],
    handleRenderJs,
    headExtra: cdnUrl ? undefined : buildInlineScript(),
  };
}
