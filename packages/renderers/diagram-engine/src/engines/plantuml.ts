const DEFAULT_SERVER = 'https://www.plantuml.com/plantuml/svg';

// ── PlantUML text encoding (deflate + custom base64) ────────────────────

function encode6bit(b: number): string {
  if (b < 10) return String.fromCharCode(48 + b); // '0'-'9'
  b -= 10;
  if (b < 26) return String.fromCharCode(65 + b); // 'A'-'Z'
  b -= 26;
  if (b < 26) return String.fromCharCode(97 + b); // 'a'-'z'
  b -= 26;
  if (b === 0) return '-';
  if (b === 1) return '_';
  return '?';
}

function encode3bytes(b1: number, b2: number, b3: number): string {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return encode6bit(c1) + encode6bit(c2) + encode6bit(c3) + encode6bit(c4);
}

function encodeBytes(data: Uint8Array): string {
  let result = '';
  for (let i = 0; i < data.length; i += 3) {
    if (i + 2 < data.length) {
      result += encode3bytes(data[i], data[i + 1], data[i + 2]);
    } else if (i + 1 < data.length) {
      result += encode3bytes(data[i], data[i + 1], 0);
    } else {
      result += encode3bytes(data[i], 0, 0);
    }
  }
  return result;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // Browser & modern runtimes: use CompressionStream
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      writer.write(data);
      writer.close();
      const reader = cs.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result;
    } catch {
      // 'deflate-raw' not supported, fall through
    }
  }

  // Node.js / Bun fallback
  const { deflateRawSync } = await import('node:zlib');
  return new Uint8Array(deflateRawSync(Buffer.from(data)));
}

async function encodePlantUmlText(text: string): Promise<string> {
  const utf8 = new TextEncoder().encode(text);
  const deflated = await deflateRaw(utf8);
  return encodeBytes(deflated);
}

// ── Render ───────────────────────────────────────────────────────────────

export async function renderPlantUml(
  code: string,
  options?: Record<string, unknown>
): Promise<{ payload: string; format: 'svg' | 'html' }> {
  const server =
    (typeof options?.server === 'string' ? options.server : null) ??
    (typeof options?.plantumlServer === 'string' ? options.plantumlServer : null) ??
    DEFAULT_SERVER;

  const encoded = await encodePlantUmlText(code);
  const url = `${server.replace(/\/+$/, '')}/${encoded}`;

  // In browser: return <img> tag to bypass CORS restrictions
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const escapedUrl = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return {
      payload: `<img src="${escapedUrl}" alt="PlantUML diagram" style="max-width:100%;height:auto" />`,
      format: 'html',
    };
  }

  // Server/test environment: fetch SVG via GET
  const timeout = typeof options?.timeout === 'number' ? options.timeout : 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const body = await res.text();

    // Validate the response is actually SVG, not an HTML error page
    const trimmed = body.trimStart();
    if (!trimmed.startsWith('<svg') && !trimmed.startsWith('<?xml')) {
      throw new Error(
        'PlantUML server returned non-SVG response. ' +
          'The server may be unavailable or the endpoint has changed.'
      );
    }

    return { payload: body, format: 'svg' };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`PlantUML rendering timeout after ${timeout}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
