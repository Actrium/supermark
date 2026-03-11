import type { BridgeEngine } from './types';

/**
 * Vega / Vega-Lite WebView bridge — 占位实现。
 *
 * TODO: 加载 vega + vega-lite CDN，在 WebView 内通过
 *       new vega.View(vega.parse(...)).toSVG() 渲染。
 */
const handleVegaJs = `
function handleVega(msg, send) {
  send({
    type: 'result',
    id: msg.id,
    success: false,
    error: 'Vega WebView bridge not yet implemented'
  });
}
`;

const handleVegaLiteJs = `
function handleVegalite(msg, send) {
  send({
    type: 'result',
    id: msg.id,
    success: false,
    error: 'Vega-Lite WebView bridge not yet implemented'
  });
}
`;

export function createVegaBridge(): BridgeEngine {
  return {
    name: 'vega',
    cdnScripts: [],
    handleRenderJs: handleVegaJs,
  };
}

export function createVegaLiteBridge(): BridgeEngine {
  return {
    name: 'vega-lite',
    cdnScripts: [],
    handleRenderJs: handleVegaLiteJs,
  };
}
