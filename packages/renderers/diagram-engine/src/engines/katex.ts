let katexModule: any = null;

async function ensureLoaded(): Promise<any> {
  if (katexModule) return katexModule;
  try {
    const mod = await import('katex');
    katexModule = mod.default ?? mod;
    return katexModule;
  } catch (err) {
    throw new Error(
      `Failed to load katex: ${err instanceof Error ? err.message : String(err)}. ` +
        'Install it with: npm install katex'
    );
  }
}

export async function renderKatex(
  code: string,
  options?: Record<string, unknown>
): Promise<string> {
  const katex = await ensureLoaded();
  const displayMode = !!options?.displayMode;
  const html: string = katex.renderToString(code, {
    displayMode,
    throwOnError: false,
  });
  return html;
}
