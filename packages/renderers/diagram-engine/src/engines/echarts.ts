let echartsModule: any = null;

async function ensureLoaded(): Promise<any> {
  if (echartsModule) return echartsModule;
  try {
    // Dynamic import of optional peer dependency
    echartsModule = await import(/* webpackIgnore: true */ 'echarts');
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
