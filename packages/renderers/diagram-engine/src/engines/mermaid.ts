let renderFn: ((code: string) => Promise<string>) | null = null;

async function ensureLoaded(): Promise<(code: string) => Promise<string>> {
  if (renderFn) return renderFn;
  try {
    const mod = await import('beautiful-mermaid');
    renderFn = mod.renderMermaid;
    return renderFn;
  } catch (err) {
    throw new Error(
      `Failed to load beautiful-mermaid: ${err instanceof Error ? err.message : String(err)}. ` +
        'Install it with: npm install beautiful-mermaid'
    );
  }
}

export async function renderMermaid(code: string): Promise<string> {
  const render = await ensureLoaded();
  return render(code);
}
