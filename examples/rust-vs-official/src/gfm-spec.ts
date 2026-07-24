import type { SpecCase } from './types.ts';
// Vite ?raw import — the spec.txt is vendored verbatim.
import gfmSpecRaw from './data/gfm-spec.txt?raw';

/**
 * Parse the GitHub Flavored Markdown spec.txt into example cases.
 *
 * Format (cmark-gfm): each example is fenced by a line of ≥16 backticks
 * followed by ` example`. Inside, the markdown source and expected HTML are
 * separated by a line containing only `.`. A literal `→` (U+2192) stands in
 * for a TAB character in both halves and is restored before comparison.
 *
 * The most recent `## ` heading is tracked as the section name.
 */
export function parseGfmSpec(): SpecCase[] {
  const lines = gfmSpecRaw.split('\n');
  const cases: SpecCase[] = [];
  let section = '(preamble)';
  let i = 0;
  let exampleNo = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^##\s+/.test(line)) {
      section = line.replace(/^##\s+/, '').trim();
    }

    const openMatch = line.match(/^`{16,}\s*example\s*$/);
    if (!openMatch) {
      i++;
      continue;
    }

    const fence = line.match(/^`{16,}/)![0];
    const body: string[] = [];
    i++;
    while (i < lines.length && !lines[i].startsWith(fence)) {
      body.push(lines[i]);
      i++;
    }
    // consume closing fence
    i++;

    // Split markdown / html on a line that is exactly "."
    let dotIndex = body.indexOf('.');
    if (dotIndex === -1) {
      // No separator — skip malformed example.
      continue;
    }
    const markdown = body.slice(0, dotIndex).join('\n');
    const html = body.slice(dotIndex + 1).join('\n');

    exampleNo++;
    cases.push({
      id: `gfm:${exampleNo}`,
      spec: 'gfm',
      number: exampleNo,
      section,
      markdown: markdown.replace(/→/g, '\t'),
      html: html.replace(/→/g, '\t'),
    });
  }

  return cases;
}
