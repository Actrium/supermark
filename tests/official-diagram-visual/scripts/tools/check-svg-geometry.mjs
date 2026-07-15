import { readFile } from 'node:fs/promises';

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('Usage: node check-svg-geometry.mjs <svg> [...]');
  process.exit(2);
}

for (const path of paths) {
  const svg = await readFile(path, 'utf8');
  console.log(JSON.stringify({ path, ...geometryCheck(svg) }, null, 2));
}

function geometryCheck(svg) {
  const viewBox = parseViewBox(svg);
  if (!viewBox) {
    return { pass: false, reason: 'missing-viewBox' };
  }

  const rects = [...svg.matchAll(/<g\b[^>]*class="[^"]*\bnode\b[^"]*"[^>]*transform="translate\(([^,\s)]+)[,\s]+([^)]+)\)"[\s\S]*?<rect\b([^>]*)>/gi)]
    .map(match => {
      const tx = Number(match[1]);
      const ty = Number(match[2]);
      const attrs = match[3];
      const x = Number(attrs.match(/\bx="([^"]+)"/i)?.[1] ?? 0);
      const y = Number(attrs.match(/\by="([^"]+)"/i)?.[1] ?? 0);
      const width = Number(attrs.match(/\bwidth="([^"]+)"/i)?.[1] ?? NaN);
      const height = Number(attrs.match(/\bheight="([^"]+)"/i)?.[1] ?? NaN);
      if (![tx, ty, x, y, width, height].every(Number.isFinite)) return null;
      return {
        left: tx + x,
        top: ty + y,
        right: tx + x + width,
        bottom: ty + y + height,
      };
    })
    .filter(Boolean);

  const view = {
    left: viewBox.x,
    top: viewBox.y,
    right: viewBox.x + viewBox.width,
    bottom: viewBox.y + viewBox.height,
  };
  const overflowingRects = rects.filter(
    rect =>
      rect.left < view.left - 0.5 ||
      rect.top < view.top - 0.5 ||
      rect.right > view.right + 0.5 ||
      rect.bottom > view.bottom + 0.5
  );

  return {
    pass: overflowingRects.length === 0,
    viewBox,
    checkedRects: rects.length,
    overflowingRects,
  };
}

function parseViewBox(svg) {
  const raw = svg.match(/\bviewBox=["']([^"']+)["']/i)?.[1];
  if (!raw) return null;
  const [x, y, width, height] = raw.trim().split(/[\s,]+/).map(Number);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}
