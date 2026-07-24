import type { SpecCase, Verdict } from '../types.ts';

interface Props {
  cases: SpecCase[];
  verdicts: Map<string, Verdict>;
  version: string | null;
  done: number;
}

export function Summary({ cases, verdicts, version, done }: Props) {
  const totals = { pass: 0, whitespace: 0, fail: 0, error: 0 };
  for (const v of verdicts.values()) totals[v.status]++;

  const total = cases.length;
  const passing = totals.pass + totals.whitespace;
  const passRate = total ? ((passing / total) * 100).toFixed(1) : '0.0';

  const bySpec = breakdownBy(cases, verdicts, c => c.spec);
  const sections = breakdownBy(cases, verdicts, c => `${c.spec} · ${c.section}`);
  const sectionsSorted = [...sections.entries()].sort((a, b) => b[1].fail + b[1].error - (a[1].fail + a[1].error));

  return (
    <div className="summary">
      <div className="summary-head">
        <div>
          <h1>Supramark Rust parser vs. official spec</h1>
          <p className="muted">
            {version ? `supramark-markdown v${version} · ` : ''}
            CommonMark 0.30 ({bySpec.get('commonmark')?.total ?? 0} cases) + GFM 0.29 ({bySpec.get('gfm')?.total ?? 0} cases)
            {' · '}rendered to HTML via the Rust crate's internal renderer and compared against the
            canonical expected HTML.
          </p>
        </div>
        <div className="summary-rate">
          <div className="rate-big">{passRate}%</div>
          <div className="muted">{passing}/{total} pass (incl. whitespace-only)</div>
        </div>
      </div>

      <div className="legend">
        <span className="badge badge-pass">pass {totals.pass}</span>
        <span className="badge badge-whitespace">whitespace {totals.whitespace}</span>
        <span className="badge badge-fail">fail {totals.fail}</span>
        <span className="badge badge-error">error {totals.error}</span>
        {done < total && <span className="muted">running… {done}/{total}</span>}
      </div>

      <div className="sections">
        <h2>By section (sorted by failures)</h2>
        <div className="section-grid">
          {sectionsSorted.map(([name, s]) => {
            const sPass = s.pass + s.whitespace;
            const rate = s.total ? (sPass / s.total) * 100 : 0;
            return (
              <div key={name} className="section-row">
                <div className="section-name" title={name}>{name}</div>
                <div className="section-bar">
                  <div className="section-bar-fill" style={{ width: `${rate}%` }} />
                </div>
                <div className="section-count">{sPass}/{s.total}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function breakdownBy(
  cases: SpecCase[],
  verdicts: Map<string, Verdict>,
  key: (c: SpecCase) => string,
): Map<string, { pass: number; whitespace: number; fail: number; error: number; total: number }> {
  const map = new Map<string, { pass: number; whitespace: number; fail: number; error: number; total: number }>();
  for (const c of cases) {
    const k = key(c);
    const entry = map.get(k) ?? { pass: 0, whitespace: 0, fail: 0, error: 0, total: 0 };
    entry.total++;
    const v = verdicts.get(c.id);
    if (v) entry[v.status]++;
    map.set(k, entry);
  }
  return map;
}
