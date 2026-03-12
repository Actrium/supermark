import type { BridgeEngine } from './types';

const MATHJAX_CDN = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';

const handleMathJs = `
function handleMath(msg, send) {
  var id = msg.id;
  var code = typeof msg.code === 'string' ? msg.code : '';
  var options = msg.options || {};
  var displayMode = options.displayMode !== false;
  var output = options.output === 'png' ? 'png' : 'svg';
  var pixelRatio = typeof options.pixelRatio === 'number' && options.pixelRatio > 0
    ? options.pixelRatio
    : 2;

  if (typeof MathJax === 'undefined' || !MathJax || typeof MathJax.tex2svgPromise !== 'function') {
    send({ type: 'result', id: id, success: false, error: 'MathJax SVG runtime is not available in WebView' });
    return;
  }

  var startup = MathJax.startup && MathJax.startup.promise
    ? MathJax.startup.promise
    : Promise.resolve();

  startup
    .then(function() {
      if (typeof MathJax.texReset === 'function') {
        try { MathJax.texReset(); } catch (_) {}
      }
      return MathJax.tex2svgPromise(code, { display: !!displayMode });
    })
    .then(function(node) {
      try {
        var svgEl = node && typeof node.querySelector === 'function'
          ? node.querySelector('svg')
          : null;
        if (!svgEl && node && node.nodeName && String(node.nodeName).toLowerCase() === 'svg') {
          svgEl = node;
        }
        if (!svgEl) {
          throw new Error('MathJax did not return an SVG element');
        }

        var width = svgEl.getAttribute('width');
        var height = svgEl.getAttribute('height');
        if (!svgEl.getAttribute('viewBox') && width && height) {
          var svgW = parseFloat(width);
          var svgH = parseFloat(height);
          if (svgW > 0 && svgH > 0) {
            svgEl.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);
          }
        }
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');

        var svgStr = new XMLSerializer().serializeToString(svgEl);
        if (output !== 'png') {
          send({ type: 'result', id: id, success: true, format: 'svg', payload: svgStr });
          return;
        }

        var svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        var objectUrl = URL.createObjectURL(svgBlob);
        var img = new Image();
        img.onload = function() {
          try {
            var naturalWidth = img.naturalWidth || img.width || 1;
            var naturalHeight = img.naturalHeight || img.height || 1;
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.ceil(naturalWidth * pixelRatio));
            canvas.height = Math.max(1, Math.ceil(naturalHeight * pixelRatio));
            var ctx = canvas.getContext('2d');
            if (!ctx) {
              throw new Error('Canvas 2D context is not available');
            }
            ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            ctx.clearRect(0, 0, naturalWidth, naturalHeight);
            ctx.drawImage(img, 0, 0, naturalWidth, naturalHeight);
            var pngDataUrl = canvas.toDataURL('image/png');
            send({ type: 'result', id: id, success: true, format: 'png', payload: pngDataUrl });
          } catch (pngErr) {
            send({ type: 'result', id: id, success: false, error: String(pngErr) });
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        };
        img.onerror = function() {
          URL.revokeObjectURL(objectUrl);
          send({ type: 'result', id: id, success: false, error: 'Failed to rasterize MathJax SVG to PNG' });
        };
        img.src = objectUrl;
      } catch (err) {
        send({ type: 'result', id: id, success: false, error: String(err) });
      }
    })
    .catch(function(err) {
      send({ type: 'result', id: id, success: false, error: String(err) });
    });
}
`;

export function createMathBridge(cdnUrl?: string): BridgeEngine {
  return {
    name: 'math',
    cdnScripts: [cdnUrl ?? MATHJAX_CDN],
    handleRenderJs: handleMathJs,
  };
}
