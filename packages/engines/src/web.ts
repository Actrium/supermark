import { createDiagramEngine } from './engine';
import { GRAPHVIZ_LAYOUT_ENGINES, pickGraphvizDiagramOptions } from './graphviz';
import { installHostMetricsBridge } from './host-bridge.js';
import { loadEchartsSvgRender, loadVegaLiteSvgRender } from './js-chart-loaders';
import type {
  DiagramEngineOptions,
  DiagramRenderFn,
  DiagramRenderService,
  GraphvizRenderAdapter,
} from './types';

/**
 * Minimal shape of a wasm-bindgen ESM module probed defensively for an
 * init entry and a sync convert/render entry.
 */
/** wasm-bindgen init entry: may take a wasm URL/bytes, returns sync or async. */
type WasmInitFn = (...args: unknown[]) => unknown;
/** wasm-bindgen convert/render entry: `(code) => svg`, sync or async. */
type WasmConvertFn = (code: string) => string | Promise<string>;

interface WasmRenderModule {
  default?: unknown;
  init?: unknown;
  convert?: unknown;
  // d2's `render` export is the elk bridge (handle, layoutJson). Other
  // wasm modules use `render` as a convert-fallback name; `pickWasmConvert`
  // casts it to WasmConvertFn in that case.
  render?: (handle: number, layoutJson: string) => string;
  renderSvg?: unknown;
  // elk layout bridge exports (added alongside `convert`):
  prepare?: (input: string) => D2PrepareResult;
  drop_prepared?: (handle: number) => void;
}

/** Result of the wasm `prepare` export (wasm-bindgen class with getters). */
interface D2PrepareResult {
  handle: number;
  request: string;
}

// --- elk layout bridge DTO (mirrors crates/d2-little/src/layout_bridge.rs) ---

interface D2BoardRequest {
  token: string;
  has_sequence: boolean;
  has_grid: boolean;
  has_near: boolean;
  has_containers: boolean;
  objects: { id: string; width: number; height: number; parent_id: string | null }[];
  edges: {
    id: string;
    src: string;
    dst: string;
    has_label: boolean;
    label_width: number;
    label_height: number;
  }[];
}
interface D2LayoutRequest {
  multi_board: boolean;
  boards: D2BoardRequest[];
}
interface D2LayoutResult {
  boards: {
    token: string;
    objects: { id: string; x: number; y: number }[];
    edges: { id: string; route: [number, number][]; is_curve?: boolean }[];
  }[];
}

/** A loaded `@actrium/graphviz-anywhere-web` Graphviz instance. */
interface GraphvizInstance {
  layout(dot: string, format: string, engine: string): string;
  version(): string;
}

/** Minimal surface of the `@actrium/graphviz-anywhere-web` ESM module. */
interface GraphvizWebModule {
  Graphviz: { load(): Promise<GraphvizInstance> };
}

const GRAPHVIZ_WEB_SPEC = '@actrium/graphviz-anywhere-web';

/** Probe a wasm-bindgen module for its optional `default`/`init` entry. */
function pickWasmInit(mod: WasmRenderModule): WasmInitFn | null {
  if (typeof mod.default === 'function') return mod.default as WasmInitFn;
  if (typeof mod.init === 'function') return mod.init as WasmInitFn;
  return null;
}

/** Probe a wasm-bindgen module for a `convert`/`render`/`renderSvg` entry. */
function pickWasmConvert(mod: WasmRenderModule): WasmConvertFn | null {
  if (typeof mod.convert === 'function') return mod.convert as WasmConvertFn;
  // `render` on d2's module is the elk bridge ((handle, json) => svg), not a
  // convert entry; d2 always exposes `convert`, so this fallback is only hit
  // for other modules that name their convert-fn `render`.
  if (typeof mod.render === 'function') return mod.render as unknown as WasmConvertFn;
  if (typeof mod.renderSvg === 'function') return mod.renderSvg as WasmConvertFn;
  return null;
}

export interface WebGraphvizAdapterOptions {
  adapter?: GraphvizRenderAdapter;
  loadAdapter?: () => Promise<GraphvizRenderAdapter>;
}

export interface WebDiagramEngineOptions extends DiagramEngineOptions {
  graphviz?: WebGraphvizAdapterOptions;
}

export function createWebDiagramEngine(
  options: WebDiagramEngineOptions = {}
): DiagramRenderService {
  const graphviz = options.graphviz ?? {};

  return createDiagramEngine({
    ...options,
    graphviz: {
      adapter: graphviz.adapter,
      loadAdapter: graphviz.loadAdapter ?? createWebGraphvizAdapterLoader(),
    },
    echarts: {
      render: options.echarts?.render,
      loadRender: options.echarts?.loadRender ?? loadEchartsSvgRender,
    },
    vegaLite: {
      render: options.vegaLite?.render,
      loadRender: options.vegaLite?.loadRender ?? loadVegaLiteSvgRender,
    },
    plantuml: {
      render: options.plantuml?.render,
      loadRender: options.plantuml?.loadRender ?? loadWebPlantumlRender,
    },
    d2: {
      render: options.d2?.render,
      loadRender: options.d2?.loadRender ?? loadWebD2Render,
    },
  });
}

/**
 * Default web-side lazy loader for PlantUML.
 *
 * Loads `@actrium/plantuml-little-web` (Rust → wasm) on first use and
 * returns a `RenderFn`. The wasm binary initialises as a side effect of the
 * ES-module import (`import * as wasm from "./plantuml_little_web_bg.wasm"`).
 *
 * Graphviz bridge contract (see `packages/web/src/lib.rs`):
 *
 *   globalThis.__graphviz_anywhere_render(dot, engine, format) -> string
 *
 * `plantuml-little-web` delegates layout for component / activity / state /
 * use-case diagrams to Graphviz via this global. We install a synchronous
 * wrapper backed by `@actrium/graphviz-anywhere-web` (pre-loaded) so the
 * wasm call site can invoke it without returning to the JS event loop.
 */
// loadRender contract returns Promise<DiagramRenderFn>; this loader only wires
// up closures and resolves the render fn lazily, so no top-level await is used.
// eslint-disable-next-line @typescript-eslint/require-await
async function loadWebPlantumlRender(): Promise<DiagramRenderFn> {
  // Install the host text-metrics bridge before loading the wasm so the
  // wasm's metrics-host-callback impl can resolve `supramark.measureText`
  // on first render. Idempotent.
  installHostMetricsBridge();

  let plantumlPromise: Promise<DiagramRenderFn> | null = null;
  let graphvizBridgePromise: Promise<void> | null = null;

  const ensureGraphvizBridge = async () => {
    if (!graphvizBridgePromise) {
      graphvizBridgePromise = (async () => {
        const spec: string = GRAPHVIZ_WEB_SPEC;
        const { Graphviz } = (await import(spec)) as GraphvizWebModule;
        const graphviz = await Graphviz.load();

        const g = globalThis as unknown as {
          __graphviz_anywhere_render?: (dot: string, engine?: string, format?: string) => string;
        };
        if (typeof g.__graphviz_anywhere_render !== 'function') {
          g.__graphviz_anywhere_render = (
            dot: string,
            engine?: string,
            format?: string
          ): string => {
            return graphviz.layout(dot, format ?? 'svg', engine ?? 'dot');
          };
        }
      })();
    }

    return graphvizBridgePromise;
  };

  const loadPlantuml = async (): Promise<DiagramRenderFn> => {
    if (!plantumlPromise) {
      plantumlPromise = (async () => {
        // Load the wasm module. wasm-bindgen's ESM-wasm build initialises via
        // the `import * from '*.wasm'` side effect, so no separate init call is
        // needed. Some builds still ship a default `init()` — probe defensively.
        const puml = (await import(
          '@actrium/plantuml-little-web' as string
        )) as WasmRenderModule;

        const init = pickWasmInit(puml);
        if (init) {
          try {
            await init();
          } catch {
            // Already initialised via the module-import side effect — ignore.
          }
        }

        const convert = pickWasmConvert(puml);
        if (!convert) {
          throw new Error(
            '`@actrium/plantuml-little-web` is missing a convert / render entry. Expected one of: convert, render, renderSvg.'
          );
        }

        return async (code: string): Promise<string> => {
          // `convert` is synchronous (wasm-bindgen-generated) but `await` handles
          // both sync and async return shapes uniformly.
          const svg = await convert(code);
          const normalized = String(svg ?? '');
          if (!normalized.includes('<svg')) {
            throw new Error('PlantUML renderer did not return SVG output.');
          }
          return normalized;
        };
      })();
    }
    return plantumlPromise;
  };

  return async (code: string): Promise<string> => {
    if (plantumlNeedsGraphviz(code)) {
      await ensureGraphvizBridge();
    }
    const render = await loadPlantuml();
    return render(code);
  };
}

function plantumlNeedsGraphviz(code: string): boolean {
  const normalized = code.toLowerCase();
  const hasSequenceArrow = /(^|\n)\s*[\w.$"'[\] -]+\s*(?:--?|==?|\.\.)[>x]/.test(normalized);
  const hasSequenceKeyword =
    /(^|\n)\s*(actor|participant|boundary|control|entity|queue|collections?)\b/.test(normalized);
  const hasGraphLayoutKeyword =
    /(^|\n)\s*(abstract\s+class|class|interface|enum|annotation|component|state|usecase|object|package|node|artifact|folder|frame|cloud|database|rectangle|storage|agent|card)\b/.test(
      normalized
    );
  const hasActivityKeyword =
    /(^|\n)\s*(start|stop|if\s*\(|while\s*\(|repeat\b|fork\b|partition\b|:[^;\n]+;)/.test(
      normalized
    );

  if (hasGraphLayoutKeyword || hasActivityKeyword) return true;
  if (hasSequenceArrow || hasSequenceKeyword) return false;
  return true;
}

/**
 * Default web-side lazy loader for D2.
 *
 * Loads `@actrium/d2-little-web` (Rust → wasm) on first use and returns a
 * `RenderFn`. Unlike plantuml-little-web, d2-little ships a pure-Rust layout
 * engine so there is no Graphviz bridge to wire — this loader is a thin
 * adapter over the wasm module's `convert(code) -> svg` entry.
 *
 * The wasm binary initialises as a side effect of the ES-module import
 * (`import * as wasm from "./d2_little_web_bg.wasm"`). Some wasm-bindgen builds
 * still ship a default `init()` — we probe defensively and `await` it if
 * present, swallowing errors caused by re-init.
 */
async function loadWebD2Render(): Promise<DiagramRenderFn> {
  // d2 wasm 通过 globalThis.supramark.measureText 量字宽；bridge 未安装时
  // wasm-bindgen catch 路径 fallback 到 size*0.6 启发式，导致 layout 偏差。
  installHostMetricsBridge();

  const d2 = (await import('@actrium/d2-little-web' as string)) as WasmRenderModule;

  const init = pickWasmInit(d2);
  if (init) {
    try {
      await init();
    } catch {
      // Already initialised via the module-import side effect — ignore.
    }
  }

  const convert = pickWasmConvert(d2);
  if (!convert) {
    throw new Error(
      '`@actrium/d2-little-web` is missing a convert / render entry. Expected one of: convert, render, renderSvg.'
    );
  }

  return async (code: string): Promise<string> => {
    // `layout-engine: elk` is routed to the elkjs bridge (host-driven
    // layered layout) instead of d2-little's built-in dagre. The bridge
    // falls back to dagre for inputs it can't handle yet (multi-board,
    // sequence / grid / containers / `near:`), so users always get a
    // rendered diagram. See `loadWebD2ElkLayout`.
    if (requestsElkLayout(code) && typeof d2.prepare === 'function' && typeof d2.render === 'function') {
      try {
        const elkSvg = await renderD2ViaElk(d2, code);
        if (elkSvg != null) {
          return injectD2Dimensions(elkSvg);
        }
        // `null` ⇒ prepare flagged an unsupported feature; fall through to dagre.
      } catch (err) {
        // Don't leave a prepared graph pinned in wasm memory.
        console.warn('[d2] elk layout failed, falling back to dagre:', err);
      }
    }

    // `convert` is synchronous (wasm-bindgen-generated) but `await` handles
    // both sync and async return shapes uniformly.
    const svg = await convert(code);
    const normalized = String(svg ?? '');
    if (!normalized.includes('<svg')) {
      throw new Error('D2 renderer did not return SVG output.');
    }
    // d2-little ships an SVG with only `viewBox`, no width/height (upstream
    // design: meant to fit any container when used as a standalone file).
    // When embedded as inline SVG via dangerouslySetInnerHTML, browsers
    // stretch width to fill the parent and scale height by aspect ratio,
    // which blows up extreme viewBoxes. Inject width/height from viewBox
    // so the SVG renders at its intrinsic size (CSS can shrink it if needed).
    return injectD2Dimensions(normalized);
  };
}

/** Does the D2 source request the elk layout engine? */
function requestsElkLayout(code: string): boolean {
  return /layout-engine\s*:\s*elk\b/i.test(code);
}

/**
 * Drive the elkjs layered layout through d2-little's prepare/render bridge.
 * Returns the rendered SVG, or `null` when the input carries a feature the
 * MVP can't lay out externally (in which case the caller falls back to the
 * dagre `convert` path).
 *
 * Lazy-loads `elkjs` on first use; non-elk D2 never pays the cost.
 */
async function renderD2ViaElk(d2: WasmRenderModule, code: string): Promise<string | null> {
  const prepared = d2.prepare!(code);
  let handle = prepared.handle;
  try {
    const request = JSON.parse(prepared.request) as D2LayoutRequest;
    const board = request.boards[0];
    if (
      request.multi_board ||
      !board ||
      board.has_sequence ||
      board.has_grid ||
      board.has_near ||
      board.has_containers
    ) {
      return null; // fall back to dagre
    }

    const elk = await loadElkLayout();
    const elkGraph = buildElkGraph(board);
    const laid = await elk.layout(elkGraph);
    const layoutResult = elkResultToD2(laid);
    const svg = d2.render!(handle, JSON.stringify(layoutResult));
    handle = -1; // render consumed the handle
    if (!String(svg).includes('<svg')) {
      throw new Error('D2 elk bridge did not return SVG output.');
    }
    return String(svg);
  } finally {
    if (handle !== -1 && typeof d2.drop_prepared === 'function') {
      d2.drop_prepared(handle);
    }
  }
}

/** Lazy elkjs loader — mirrors the echarts/vega dynamic-import pattern. */
async function loadElkLayout(): Promise<{ layout(graph: unknown): Promise<unknown> }> {
  // `elkjs/lib/elk.bundled.js` is the browser-safe build (no Node deps).
  const mod = (await import('elkjs/lib/elk.bundled.js' as string)) as {
    default?: new () => { layout(graph: unknown): Promise<unknown> };
  };
  const ELK = mod.default;
  if (!ELK) throw new Error('elkjs bundled build did not export a default ELK constructor.');
  return new ELK();
}

/**
 * Build the elkjs input graph from a flat d2 board request (MVP: no nesting).
 *
 * Layout options mirror upstream d2's `d2elklayout` defaults
 * (`d2layouts/d2elklayout/layout.go`): `GREEDY_MODEL_ORDER` cycle breaking
 * + `NODES_AND_EDGES` model order + `BALANCED` fixed alignment +
 * `forceNodeModelOrder` per node, so the output matches d2lang.com's elk
 * rendering (clean parallel edge routing) rather than elkjs defaults (which
 * curve backward edges around into S-shapes on fully-connected graphs).
 *
 * d2 also inflates each node's width (or height, for horizontal directions)
 * by `max(incoming, outgoing) * PORT_SPACING` when a node has ≥2 edges on a
 * side, so multiple edges attach at distinct ports instead of overlapping —
 * reproduced here.
 */
function buildElkGraph(board: D2BoardRequest): unknown {
  const PORT_SPACING = 40;
  const incoming: Record<string, number> = {};
  const outgoing: Record<string, number> = {};
  for (const e of board.edges) {
    outgoing[e.src] = (outgoing[e.src] ?? 0) + 1;
    incoming[e.dst] = (incoming[e.dst] ?? 0) + 1;
  }

  // Root-level options (d2 DefaultLayout root LayoutOptions).
  const rootOpts = {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.layered.thoroughness': 8,
    'elk.layered.spacing.edgeEdgeBetweenLayers': 50,
    'elk.spacing.edgeNode': 40,
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.cycleBreaking.strategy': 'GREEDY_MODEL_ORDER',
    'elk.nodeSize.constraints': 'MINIMUM_SIZE',
    'elk.contentAlignment': 'H_CENTER V_CENTER',
    'spacing.nodeNodeBetweenLayers': 70,
    'spacing.edgeNodeBetweenLayers': 40,
    'elk.spacing.nodeSelfLoop': 50,
  };
  // Per-node options — forceNodeModelOrder preserves declaration order.
  const nodeOpts = {
    ...rootOpts,
    'elk.layered.crossingMinimization.forceNodeModelOrder': true,
  };

  return {
    id: 'root',
    layoutOptions: rootOpts,
    children: board.objects.map(o => {
      const ec = Math.max(incoming[o.id] ?? 0, outgoing[o.id] ?? 0);
      const inflate = (incoming[o.id] ?? 0) >= 2 || (outgoing[o.id] ?? 0) >= 2;
      // MVP is vertical (DOWN) only, so inflation widens the node.
      const width = inflate ? Math.max(o.width, ec * PORT_SPACING) : o.width;
      return { id: o.id, width, height: o.height, layoutOptions: nodeOpts };
    }),
    edges: board.edges.map(e => ({
      id: e.id,
      sources: [e.src],
      targets: [e.dst],
    })),
  };
}

/** Map elkjs output back into the d2 layout-result DTO. */
function elkResultToD2(laid: unknown): D2LayoutResult {
  const root = laid as {
    children?: {
      id: string;
      // elkjs places positions either nested (`position`) or flat on the
      // node depending on version / build; accept both.
      position?: { x: number; y: number };
      x?: number;
      y?: number;
    }[];
    edges?: {
      id: string;
      sections?: {
        startPoint: { x: number; y: number };
        endPoint: { x: number; y: number };
        bendPoints?: { x: number; y: number }[];
      }[];
    }[];
  };
  const objects = (root.children ?? []).map(c => ({
    id: c.id,
    x: c.position?.x ?? c.x ?? 0,
    y: c.position?.y ?? c.y ?? 0,
  }));
  const edges = (root.edges ?? []).map(e => {
    const section = e.sections?.[0];
    const route: [number, number][] = [];
    if (section) {
      route.push([section.startPoint.x, section.startPoint.y]);
      for (const bp of section.bendPoints ?? []) route.push([bp.x, bp.y]);
      route.push([section.endPoint.x, section.endPoint.y]);
    }
    return { id: e.id, route, is_curve: false };
  });
  return { boards: [{ token: 'root', objects, edges }] };
}

function injectD2Dimensions(svg: string): string {
  const openTag = svg.match(/<svg\b[^>]*>/);
  if (!openTag) return svg;
  const tag = openTag[0];
  if (/\swidth=/.test(tag) || /\sheight=/.test(tag)) return svg;
  const vb = tag.match(/viewBox="([^"]+)"/);
  if (!vb) return svg;
  const parts = vb[1].trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) return svg;
  const [, , w, h] = parts;
  if (w <= 0 || h <= 0) return svg;
  const replaced = tag.replace('<svg', `<svg width="${w}" height="${h}"`);
  return svg.replace(tag, replaced);
}

function createWebGraphvizAdapterLoader(): () => Promise<GraphvizRenderAdapter> {
  let adapterPromise: Promise<GraphvizRenderAdapter> | null = null;

  return () => {
    if (!adapterPromise) {
      adapterPromise = loadWebGraphvizAdapter();
    }
    return adapterPromise;
  };
}

async function loadWebGraphvizAdapter(): Promise<GraphvizRenderAdapter> {
  const { Graphviz } = await import('@actrium/graphviz-anywhere-web');
  const graphviz = await Graphviz.load();

  return {
    renderToSvg(code, rawOptions) {
      const opt = pickGraphvizDiagramOptions(rawOptions);
      return Promise.resolve(graphviz.layout(code, 'svg', opt.layoutEngine ?? 'dot'));
    },
    getCapabilities() {
      return Promise.resolve({
        graphvizVersion: graphviz.version(),
        engines: ['dot', 'neato', 'fdp', 'sfdp', 'circo', 'twopi', 'osage', 'patchwork'],
        formats: ['svg'] as Array<'svg'>,
      });
    },
  };
}

export { GRAPHVIZ_LAYOUT_ENGINES };
export { loadWebPlantumlRender };
export { loadWebD2Render };
