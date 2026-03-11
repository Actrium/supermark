let echartsModule: any = null;

function resolveEchartsApi(mod: any): any {
  // Different bundlers/runtimes may expose ECharts via default export.
  if (mod && typeof mod.init === 'function') return mod;
  if (mod?.default && typeof mod.default.init === 'function') return mod.default;
  if (mod?.default?.default && typeof mod.default.default.init === 'function') {
    return mod.default.default;
  }
  return mod;
}

async function ensureLoaded(): Promise<any> {
  if (echartsModule) return echartsModule;
  try {
    // Dynamic import of optional peer dependency
    const mod = await import(/* webpackIgnore: true */ 'echarts');
    echartsModule = resolveEchartsApi(mod);
    return echartsModule;
  } catch (err) {
    throw new Error(
      `Failed to load echarts: ${err instanceof Error ? err.message : String(err)}. ` +
        'Install it with: npm install echarts'
    );
  }
}

export async function renderECharts(
  code: string,
  options?: Record<string, unknown>
): Promise<string> {
  const echarts = await ensureLoaded();
  if (!echarts || typeof echarts.init !== 'function') {
    throw new Error('ECharts API is not available in this runtime (echarts.init missing).');
  }

  let option: Record<string, unknown>;
  try {
    option = JSON.parse(code);
  } catch (err) {
    throw new Error(
      `Failed to parse ECharts option JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const width = typeof options?.width === 'number' ? options.width : 600;
  const height = typeof options?.height === 'number' ? options.height : 400;

  // SSR mode: no DOM needed
  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width,
    height,
  });

  try {
    chart.setOption(option);
    const svg: string = chart.renderToSVGString();
    return svg;
  } finally {
    chart.dispose();
  }
}
