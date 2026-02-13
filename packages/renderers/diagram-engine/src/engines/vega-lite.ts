let vegaModule: any = null;
let vegaLiteModule: any = null;

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
    vegaModule = vMod;
    vegaLiteModule = vlMod;
    return { vega: vegaModule, vegaLite: vegaLiteModule };
  } catch (err) {
    throw new Error(
      `Failed to load vega/vega-lite: ${err instanceof Error ? err.message : String(err)}. ` +
        'Install them with: npm install vega vega-lite'
    );
  }
}

export async function renderVegaLite(code: string, engine: string): Promise<string> {
  const { vega, vegaLite } = await ensureLoaded();

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
