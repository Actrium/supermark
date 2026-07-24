export type SpecId = 'commonmark' | 'gfm';

export interface SpecCase {
  /** Stable id across the dataset, e.g. "commonmark:142" / "gfm:77". */
  id: string;
  spec: SpecId;
  /** 1-indexed example number within its spec source. */
  number: number;
  section: string;
  markdown: string;
  /** Official expected HTML (already normalized in the source spec). */
  html: string;
}

export type VerdictStatus = 'pass' | 'whitespace' | 'fail' | 'error';

export interface DiffLine {
  type: 'equal' | 'add' | 'del';
  text: string;
}

export interface Verdict {
  status: VerdictStatus;
  /** Supramark-rendered HTML (raw). */
  actual: string;
  /** Normalized expected. */
  expectedNormalized: string;
  /** Normalized actual. */
  actualNormalized: string;
  diff: DiffLine[];
  error?: string;
  /** Wall-clock ms for the parse+render call. */
  ms: number;
}

/**
 * Structural view of the Supramark AST v2 root — only the fields the
 * reference HTML renderer walks. Kept loose (all optional) so the example
 * stays decoupled from the exact AST schema.
 */
export interface SupramarkNodeLike {
  type: string;
  children?: SupramarkNodeLike[];
  value?: string;
  lang?: string;
  depth?: number;
  ordered?: boolean;
  start?: number;
  url?: string;
  title?: string;
  alt?: string;
}
