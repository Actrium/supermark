import React, {
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { View, StyleSheet } from 'react-native';
import type { DiagramRenderResult, DiagramRenderFormat } from '@supramark/diagram-engine';
import type { BridgeEngine } from './bridges/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingRequest {
  readonly engine: string;
  readonly resolve: (result: DiagramRenderResult) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export interface DiagramWebViewBridgeHandle {
  render: (params: {
    engine: string;
    code: string;
    options?: Record<string, unknown>;
  }) => Promise<DiagramRenderResult>;
  readonly ready: boolean;
  /** 当前已注册的 engine 名称列表 */
  readonly engines: readonly string[];
}

interface WebViewMessage {
  readonly nativeEvent: { readonly data: string };
}

// ---------------------------------------------------------------------------
// HTML template builder
// ---------------------------------------------------------------------------

function buildHtml(engines: readonly BridgeEngine[]): string {
  // Collect all CDN scripts (deduplicated)
  const seen = new Set<string>();
  const scriptTags = engines
    .flatMap(e => e.cdnScripts)
    .filter(url => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map(url => `<script src="${url}"><\/script>`)
    .join('\n');

  // Build per-engine handler functions and the dispatch map
  const handlerBodies = engines.map(e => e.handleRenderJs).join('\n');

  // The function name convention: handleECharts, handleVega, handleVegaLite
  // We build a dispatch table from engine name → function name
  const dispatchEntries = engines
    .map(e => {
      const fnName = 'handle' + e.name.charAt(0).toUpperCase()
        + e.name.slice(1).replace(/[^a-zA-Z0-9]/g, '');
      return `'${e.name}': typeof ${fnName} === 'function' ? ${fnName} : null`;
    })
    .join(',\n    ');

  // Collect headExtra fragments (e.g. <script type="module"> for ESM imports)
  const headExtras = engines
    .map(e => e.headExtra ?? '')
    .filter(Boolean)
    .join('\n');

  const bootstrapScript = `<script>
function send(msg) {
  window.ReactNativeWebView.postMessage(JSON.stringify(msg));
}

// Forward WebView console & errors to RN for debugging.
// This must run before any engine-specific headExtra scripts so early load
// failures are surfaced to RN instead of degrading into silent timeouts.
window.onerror = function(msg, src, line, col, err) {
  send({ type: 'console', level: 'error', text: '[onerror] ' + msg + ' at ' + src + ':' + line + ':' + col });
};
window.addEventListener('unhandledrejection', function(e) {
  send({ type: 'console', level: 'error', text: '[unhandledrejection] ' + (e.reason || e) });
});
var _origConsole = { log: console.log, warn: console.warn, error: console.error };
['log','warn','error'].forEach(function(level) {
  console[level] = function() {
    _origConsole[level].apply(console, arguments);
    try {
      send({ type: 'console', level: level, text: Array.prototype.slice.call(arguments).join(' ') });
    } catch(_e) {}
  };
});
<\/script>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>html,body{margin:0;padding:0;background:transparent;}</style>
${bootstrapScript}
${scriptTags}
${headExtras}
<script>
${handlerBodies}

var _handlers = {
    ${dispatchEntries}
};

window.addEventListener('load', function() {
  send({ type: 'ready' });
});

window.addEventListener('message', handleMessage);
document.addEventListener('message', handleMessage);

function handleMessage(e) {
  var msg;
  try { msg = JSON.parse(e.data); } catch(_) { return; }
  if (msg.type !== 'render') return;
  var handler = _handlers[msg.engine];
  if (!handler) {
    send({ type: 'result', id: msg.id, success: false,
           error: 'No WebView handler for engine: ' + msg.engine });
    return;
  }
  handler(msg, send);
}
<\/script></head><body></body></html>`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface DiagramWebViewBridgeProps {
  engines: readonly BridgeEngine[];
  timeoutMs?: number;
}

/**
 * 通用无头 WebView bridge。
 *
 * 接收一组 BridgeEngine 配置，将所有 CDN 脚本和渲染函数合并到
 * 同一个 HTML 模板中。render() 时通过 engine 字段路由到对应处理函数。
 *
 * 挂载一次即可服务所有已注册的 engine。
 */
export const DiagramWebViewBridge = forwardRef<
  DiagramWebViewBridgeHandle,
  DiagramWebViewBridgeProps
>(function DiagramWebViewBridge({ engines, timeoutMs }, ref) {
  const webViewRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  const queueRef = useRef<Array<{ id: string; message: string; pending: PendingRequest }>>([]);
  const seqRef = useRef(0);
  const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const engineNames = engines.map(e => e.name);

  const flushQueue = useCallback(() => {
    const q = queueRef.current;
    queueRef.current = [];
    for (const item of q) {
      pendingRef.current.set(item.id, item.pending);
      webViewRef.current?.postMessage(item.message);
    }
  }, []);

  const onMessage = useCallback((event: WebViewMessage) => {
    let msg: any;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (msg.type === 'console') {
      const prefix = '[DiagramWebView]';
      if (msg.level === 'error') {
        console.error(prefix, msg.text);
      } else if (msg.level === 'warn') {
        console.warn(prefix, msg.text);
      } else {
        console.log(prefix, msg.text);
      }
      return;
    }

    if (msg.type === 'ready') {
      setIsReady(true);
      flushQueue();
      return;
    }

    if (msg.type === 'result' && typeof msg.id === 'string') {
      const entry = pendingRef.current.get(msg.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pendingRef.current.delete(msg.id);

      const result: DiagramRenderResult = msg.success
        ? {
            id: msg.id,
            engine: entry.engine,
            success: true,
            format: (msg.format ?? 'svg') as DiagramRenderFormat,
            payload: msg.payload ?? '',
          }
        : {
            id: msg.id,
            engine: entry.engine,
            success: false,
            format: 'error',
            payload: msg.error ?? 'Unknown WebView render error',
            error: {
              code: 'render_error',
              message: `${entry.engine} WebView render failed`,
              details: msg.error,
            },
          };
      entry.resolve(result);
    }
  }, [flushQueue]);

  const render = useCallback(
    (params: {
      engine: string;
      code: string;
      options?: Record<string, unknown>;
    }): Promise<DiagramRenderResult> => {
      const id = `dwvb_${Date.now()}_${seqRef.current++}`;
      const message = JSON.stringify({
        type: 'render',
        id,
        engine: params.engine,
        code: params.code,
        options: params.options,
      });

      return new Promise<DiagramRenderResult>((resolve) => {
        const timer = setTimeout(() => {
          pendingRef.current.delete(id);
          resolve({
            id,
            engine: params.engine,
            success: false,
            format: 'error',
            payload: `${params.engine} WebView render timed out after ${effectiveTimeout}ms`,
            error: {
              code: 'timeout',
              message: `${params.engine} WebView render timed out`,
            },
          });
        }, effectiveTimeout);

        const pending: PendingRequest = { engine: params.engine, resolve, timer };

        if (isReady && webViewRef.current) {
          pendingRef.current.set(id, pending);
          webViewRef.current.postMessage(message);
        } else {
          queueRef.current.push({ id, message, pending });
        }
      });
    },
    [isReady, effectiveTimeout],
  );

  useImperativeHandle(
    ref,
    () => ({ render, ready: isReady, engines: engineNames }),
    [render, isReady, engineNames],
  );

  // Lazy-load react-native-webview
  let WebView: any;
  try {
    WebView = require('react-native-webview').default;
  } catch {
    return null;
  }

  const html = buildHtml(engines);

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: 'https://cdn.jsdelivr.net/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={onMessage}
        style={styles.webview}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    // 1×1 而非 0×0：iOS WKWebView 在零尺寸容器中不执行 JS
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
  webview: {
    width: 800,
    height: 600,
  },
});
