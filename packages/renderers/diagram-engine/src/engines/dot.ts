const DEFAULT_DOT_SERVER = 'https://kroki.io';

let vizInstance: any = null;

async function ensureLoaded(): Promise<any> {
  if (vizInstance) return vizInstance;
  const mod = await import('@viz-js/viz');
  vizInstance = await mod.instance();
  return vizInstance;
}

async function renderDotRemote(
  code: string,
  options?: Record<string, unknown>
): Promise<string> {
  const server =
    (typeof options?.server === 'string' ? options.server : null) ??
    DEFAULT_DOT_SERVER;
  const url = `${server.replace(/\/+$/, '')}/graphviz/svg`;

  const timeout = typeof options?.timeout === 'number' ? options.timeout : 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: code,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Graphviz server error: HTTP ${res.status} ${res.statusText}`);
    }

    const body = await res.text();
    const trimmed = body.trimStart();
    if (!trimmed.startsWith('<svg') && !trimmed.startsWith('<?xml')) {
      throw new Error('Graphviz server returned non-SVG response.');
    }
    return body;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Graphviz rendering timeout after ${timeout}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function renderDot(
  code: string,
  options?: Record<string, unknown>
): Promise<string> {
  // 优先尝试本地 WASM 渲染（Web 环境）
  try {
    const viz = await ensureLoaded();
    return viz.renderString(code, { format: 'svg', engine: 'dot' });
  } catch {
    // WASM 不可用（如 RN/Hermes），回退到服务端渲染
  }
  return renderDotRemote(code, options);
}
