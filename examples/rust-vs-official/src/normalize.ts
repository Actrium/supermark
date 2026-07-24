import type { DiffLine } from './types.ts';

/**
 * Normalize HTML the way the CommonMark spec harness does: CRLF → LF, strip
 * trailing whitespace on each line, collapse 3+ blank lines, single trailing
 * newline. Applied to BOTH expected and actual before comparison so the diff
 * reflects structural differences, not incidental whitespace.
 */
export function normalizeHtml(input: string): string {
  let out = input.replace(/\r\n?/g, '\n');
  out = out
    .split('\n')
    .map(line => line.replace(/\s+$/g, ''))
    .join('\n');
  // Collapse 3+ consecutive newlines down to 2.
  out = out.replace(/\n{3,}/g, '\n\n');
  // Ensure exactly one trailing newline.
  out = out.replace(/\n+$/g, '\n');
  return out;
}

/**
 * Whitespace-insensitive fingerprint: collapse every whitespace run to a single
 * space and trim. If two outputs share a fingerprint but differ under
 * `normalizeHtml`, the divergence is whitespace-only.
 */
export function whitespaceFingerprint(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/** Tiny LCS diff over lines, good enough for short expected/actual HTML. */
export function lineDiff(expected: string, actual: string): DiffLine[] {
  const a = expected.split('\n');
  const b = actual.split('\n');
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i..] and b[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: 'equal', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'del', text: a[i] });
      i++;
    } else {
      lines.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) lines.push({ type: 'del', text: a[i++] });
  while (j < m) lines.push({ type: 'add', text: b[j++] });
  return lines;
}
