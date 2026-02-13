let vizInstance: any = null;

async function ensureLoaded(): Promise<any> {
  if (vizInstance) return vizInstance;
  try {
    const mod = await import('@viz-js/viz');
    vizInstance = await mod.instance();
    return vizInstance;
  } catch (err) {
    throw new Error(
      `Failed to load @viz-js/viz: ${err instanceof Error ? err.message : String(err)}. ` +
        'Install it with: npm install @viz-js/viz'
    );
  }
}

export async function renderDot(code: string): Promise<string> {
  const viz = await ensureLoaded();
  const svg: string = viz.renderString(code, { format: 'svg', engine: 'dot' });
  return svg;
}
