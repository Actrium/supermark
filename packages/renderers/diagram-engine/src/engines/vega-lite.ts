const DEFAULT_VEGA_SERVER = 'https://kroki.io';

let vegaModule: any = null;
let vegaLiteModule: any = null;

function resolveVegaApi(mod: any): any {
  if (mod && typeof mod.parse === 'function' && typeof mod.View === 'function') return mod;
  if (mod?.default && typeof mod.default.parse === 'function' && typeof mod.default.View === 'function') {
    return mod.default;
  }
  if (
    mod?.default?.default &&
    typeof mod.default.default.parse === 'function' &&
    typeof mod.default.default.View === 'function'
  ) {
    return mod.default.default;
  }
  return mod;
}

function resolveVegaLiteApi(mod: any): any {
  if (mod && typeof mod.compile === 'function') return mod;
  if (mod?.default && typeof mod.default.compile === 'function') return mod.default;
  if (mod?.default?.default && typeof mod.default.default.compile === 'function') {
    return mod.default.default;
  }
  return mod;
}

async function ensureLoaded(): Promise<{ vega: any; vegaLite: any }> {
  if (vegaModule && vegaLiteModule) {
    return { vega: vegaModule, vegaLite: vegaLiteModule };
  }
  try {
    // Dynamic imports of optional peer dependencies
    const [vMod, vlMod] = await Promise.all([
      import(/* webpackIgnore: true */ 'vega'),
      import(/* webpackIgnore: true */ 'vega-lite'),
    ]);
    vegaModule = resolveVegaApi(vMod);
    vegaLiteModule = resolveVegaLiteApi(vlMod);
    return { vega: vegaModule, vegaLite: vegaLiteModule };
  } catch (err) {
    throw new Error(
      `Failed to load vega/vega-lite: ${err instanceof Error ? err.message : String(err)}. ` +
        'Install them with: npm install vega vega-lite'
    );
  }
}

// ── Local rendering (Web/Browser) ──────────────────────────────────────

async function renderVegaLiteLocal(code: string, engine: string): Promise<string> {
  const { vega, vegaLite } = await ensureLoaded();
  if (!vega || typeof vega.parse !== 'function' || typeof vega.View !== 'function') {
    throw new Error('Vega API is not available in this runtime (vega.parse/View missing).');
  }

  let spec: any;
  try {
    spec = JSON.parse(code);
  } catch (err) {
    throw new Error(
      `Failed to parse ${engine} JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // If it's a vega-lite spec, compile to full vega spec first
  let vegaSpec: any;
  if (engine === 'vega') {
    vegaSpec = spec;
  } else {
    if (!vegaLite || typeof vegaLite.compile !== 'function') {
      throw new Error('Vega-Lite API is not available in this runtime (vegaLite.compile missing).');
    }
    // vega-lite -> vega compilation
    const compiled = vegaLite.compile(spec);
    vegaSpec = compiled.spec;
  }

  const view = new vega.View(vega.parse(vegaSpec), { renderer: 'none' });
  try {
    const svg = await view.toSVG();
    return svg;
  } finally {
    view.finalize();
  }
}

// ── Remote rendering (RN / Kroki) ──────────────────────────────────────

async function renderVegaLiteRemote(
  code: string,
  engine: string,
  options?: Record<string, unknown>
): Promise<string> {
  const server =
    (typeof options?.server === 'string' ? options.server : null) ??
    DEFAULT_VEGA_SERVER;
  const krokiEngine = engine === 'vega' ? 'vega' : 'vegalite';
  const url = `${server.replace(/\/+$/, '')}/${krokiEngine}/svg`;

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
      throw new Error(`Vega server error: HTTP ${res.status} ${res.statusText}`);
    }

    const body = await res.text();
    const trimmed = body.trimStart();
    if (!trimmed.startsWith('<svg') && !trimmed.startsWith('<?xml')) {
      throw new Error('Vega server returned non-SVG response.');
    }
    return body;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Vega rendering timeout after ${timeout}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Public API ─────────────────────────────────────────────────────────

export async function renderVegaLite(
  code: string,
  engine: string,
  options?: Record<string, unknown>
): Promise<string> {
  // Web/Browser: local rendering via vega + vega-lite JS libraries
  if (typeof document !== 'undefined') {
    return renderVegaLiteLocal(code, engine);
  }
  // RN / non-browser: Kroki remote rendering
  return renderVegaLiteRemote(code, engine, options);
}
