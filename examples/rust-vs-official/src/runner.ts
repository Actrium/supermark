import type { SpecCase, Verdict, VerdictStatus } from './types.ts';
import { lineDiff, normalizeHtml, whitespaceFingerprint } from './normalize.ts';

export type ParseHtmlFn = (source: string) => string;

/**
 * Render one case through Supramark and compare against the official expected
 * HTML. Three outcomes:
 *   - `pass`        normalized HTML matches exactly
 *   - `whitespace`  differs only by whitespace (same fingerprint)
 *   - `fail`        structural difference
 *   - `error`       the renderer threw
 */
export function runVerdict(c: SpecCase, parseHtml: ParseHtmlFn): Verdict {
  const t0 = performance.now();
  let actual = '';
  try {
    actual = parseHtml(c.markdown);
  } catch (err) {
    return {
      status: 'error',
      actual: '',
      expectedNormalized: normalizeHtml(c.html),
      actualNormalized: '',
      diff: [],
      error: err instanceof Error ? err.message : String(err),
      ms: performance.now() - t0,
    };
  }
  const ms = performance.now() - t0;
  const expectedNormalized = normalizeHtml(c.html);
  const actualNormalized = normalizeHtml(actual);

  let status: VerdictStatus;
  if (expectedNormalized === actualNormalized) {
    status = 'pass';
  } else if (whitespaceFingerprint(expectedNormalized) === whitespaceFingerprint(actualNormalized)) {
    status = 'whitespace';
  } else {
    status = 'fail';
  }

  return {
    status,
    actual,
    expectedNormalized,
    actualNormalized,
    diff: status === 'pass' ? [] : lineDiff(expectedNormalized, actualNormalized),
    ms,
  };
}

/**
 * Run verdicts in batches, yielding control between batches so the UI stays
 * responsive. `onProgress` fires after each batch with the running map.
 */
export async function runAllBatched(
  cases: SpecCase[],
  parseHtml: ParseHtmlFn,
  onProgress: (verdicts: Map<string, Verdict>, done: number) => void,
  batchSize = 40,
): Promise<Map<string, Verdict>> {
  const verdicts = new Map<string, Verdict>();
  for (let i = 0; i < cases.length; i += batchSize) {
    const slice = cases.slice(i, i + batchSize);
    for (const c of slice) {
      verdicts.set(c.id, runVerdict(c, parseHtml));
    }
    onProgress(verdicts, Math.min(i + batchSize, cases.length));
    // Yield to the event loop.
    await new Promise(r => setTimeout(r, 0));
  }
  return verdicts;
}
