import type { SpecCase } from './types.ts';
// Vite JSON import — CommonMark 0.30 spec.json (652 examples).
import commonmarkRaw from './data/commonmark-spec.json';
import { parseGfmSpec } from './gfm-spec.ts';

export function loadCommonMarkCases(): SpecCase[] {
  const data = commonmarkRaw as Array<{
    markdown: string;
    html: string;
    example: number;
    section: string;
  }>;
  return data.map(c => ({
    id: `commonmark:${c.example}`,
    spec: 'commonmark',
    number: c.example,
    section: c.section,
    markdown: c.markdown,
    html: c.html,
  }));
}

export function loadGfmCases(): SpecCase[] {
  return parseGfmSpec();
}

export function loadAllCases(): SpecCase[] {
  return [...loadCommonMarkCases(), ...loadGfmCases()];
}
