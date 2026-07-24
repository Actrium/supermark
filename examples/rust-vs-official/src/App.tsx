import { useEffect, useMemo, useState } from 'react';
import { loadAllCases } from './specs.ts';
import { runAllBatched } from './runner.ts';
import type { SpecCase, SupramarkNodeLike, Verdict, VerdictStatus } from './types.ts';
import { renderHtml } from './renderHtml.ts';
import { Summary } from './components/Summary.tsx';
import { CaseCard } from './components/CaseCard.tsx';
import './App.css';

type SpecFilter = 'all' | 'commonmark' | 'gfm';
type StatusFilter = 'all' | VerdictStatus;

const PAGE = 100;

/**
 * Parse `#focus=commonmark:24,commonmark:34` (or `?focus=…`) so a link can
 * deep-link to a subset of cases, overriding the normal filters and expanding
 * each card so the comparison is visible without an extra click.
 */
function readFocusIds(): string[] | null {
  const hash = window.location.hash.replace(/^#/, '');
  const query = window.location.search.replace(/^\?/, '');
  const combined = `${hash}&${query}`;
  const m = combined.match(/(?:^|&)focus=([^&]+)/);
  if (!m) return null;
  return decodeURIComponent(m[1])
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function App() {
  const cases = useMemo(() => loadAllCases(), []);
  const [focusIds, setFocusIds] = useState<string[] | null>(() =>
    typeof window === 'undefined' ? null : readFocusIds(),
  );
  const [verdicts, setVerdicts] = useState<Map<string, Verdict>>(new Map());
  const [done, setDone] = useState(0);
  const [version, setVersion] = useState<string | null>(null);
  const [specFilter, setSpecFilter] = useState<SpecFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import('@supramark/markdown-web');
      if (cancelled) return;
      setVersion(mod.version());
      // In focus mode, only run the selected cases — instant load.
      const target = focusIds
        ? cases.filter(c => focusIds.includes(c.id))
        : cases;
      await runAllBatched(
        target,
        (src: string) => renderHtml(mod.parse(src) as SupramarkNodeLike),
        (vs, d) => {
          if (cancelled) return;
          // New map identity each batch so React re-renders.
          setVerdicts(new Map(vs));
          setDone(d);
        },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [cases, focusIds]);

  const sections = useMemo(() => {
    const s = new Set<string>();
    for (const c of cases) {
      if (specFilter === 'all' || c.spec === specFilter) s.add(c.section);
    }
    return [...s].sort();
  }, [cases, specFilter]);

  const filtered = useMemo(() => {
    if (focusIds) {
      const set = new Set(focusIds);
      return cases.filter(c => set.has(c.id));
    }
    const q = query.trim().toLowerCase();
    return cases.filter(c => {
      if (specFilter !== 'all' && c.spec !== specFilter) return false;
      if (sectionFilter !== 'all' && c.section !== sectionFilter) return false;
      const v = verdicts.get(c.id);
      if (statusFilter !== 'all') {
        if (!v || v.status !== statusFilter) return false;
      }
      if (q) {
        const hay = `${c.section}\n${c.markdown}\n${v?.actual ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cases, verdicts, specFilter, statusFilter, sectionFilter, query, focusIds]);

  // Reset pagination when filters change.
  useEffect(() => setVisible(PAGE), [specFilter, statusFilter, sectionFilter, query, focusIds]);

  const shown = filtered.slice(0, visible);

  return (
    <div className="app">
      <Summary cases={cases} verdicts={verdicts} version={version} done={done} />

      {focusIds && (
        <div className="focus-banner">
          <span>
            Focused on {focusIds.length} case{focusIds.length === 1 ? '' : 's'} from the URL —
            each card shows the Supramark (Rust) HTML next to the official expected HTML.
          </span>
          <button
            className="focus-clear"
            onClick={() => {
              setFocusIds(null);
              if (window.location.hash || window.location.search) {
                history.replaceState(null, '', window.location.pathname);
              }
            }}
          >
            clear focus
          </button>
        </div>
      )}

      <div className="filters">
        <select value={specFilter} onChange={e => setSpecFilter(e.target.value as SpecFilter)} disabled={!!focusIds}>
          <option value="all">all specs</option>
          <option value="commonmark">CommonMark 0.30</option>
          <option value="gfm">GFM 0.29</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} disabled={!!focusIds}>
          <option value="all">all statuses</option>
          <option value="pass">pass</option>
          <option value="whitespace">whitespace</option>
          <option value="fail">fail</option>
          <option value="error">error</option>
        </select>
        <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)} disabled={!!focusIds}>
          <option value="all">all sections</option>
          {sections.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          type="search"
          placeholder="search markdown / section / output…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={!!focusIds}
        />
        <span className="muted filter-count">{filtered.length} cases</span>
      </div>

      <div className="case-list">
        {shown.map(c => {
          const v = verdicts.get(c.id);
          if (!v) return <div key={c.id} className="case case-pending">…</div>;
          return <CaseCard key={c.id} c={c} verdict={v} defaultOpen={!!focusIds} />;
        })}
        {shown.length === 0 && <div className="empty">No cases match the current filters.</div>}
      </div>

      {visible < filtered.length && (
        <button className="load-more" onClick={() => setVisible(v => v + PAGE)}>
          show {Math.min(PAGE, filtered.length - visible)} more ({filtered.length - visible} remaining)
        </button>
      )}
    </div>
  );
}
