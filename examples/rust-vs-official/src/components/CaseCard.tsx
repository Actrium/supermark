import { useState } from 'react';
import type { SpecCase, Verdict } from '../types.ts';
import { DiffView } from './DiffView.tsx';

const STATUS_LABEL: Record<Verdict['status'], string> = {
  pass: 'pass',
  whitespace: 'whitespace',
  fail: 'fail',
  error: 'error',
};

interface Props {
  c: SpecCase;
  verdict: Verdict;
  defaultOpen?: boolean;
}

export function CaseCard({ c, verdict, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAst, setShowAst] = useState(false);

  return (
    <div className={`case case-${verdict.status}`}>
      <button className="case-head" onClick={() => setOpen(o => !o)}>
        <span className={`badge badge-${verdict.status}`}>{STATUS_LABEL[verdict.status]}</span>
        <span className="case-num">
          {c.spec} #{c.number}
        </span>
        <span className="case-section">{c.section}</span>
        <span className="case-ms">{verdict.ms.toFixed(2)} ms</span>
        <span className="case-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="case-body">
          <div className="case-col">
            <div className="case-col-label">
              Markdown input {showAst && <span className="muted">(rendered AST below)</span>}
            </div>
            <pre className="case-code">{c.markdown}</pre>
          </div>
          {verdict.status === 'error' ? (
            <div className="case-col">
              <div className="case-col-label">Renderer error</div>
              <pre className="case-code case-error">{verdict.error}</pre>
            </div>
          ) : (
            <>
              <div className="case-col">
                <div className="case-col-label">Official expected HTML</div>
                <pre className="case-code">{verdict.expectedNormalized}</pre>
              </div>
              <div className="case-col">
                <div className="case-col-label">Supramark (Rust) HTML</div>
                <pre className="case-code">{verdict.actualNormalized}</pre>
              </div>
              {verdict.status !== 'pass' && (
                <div className="case-col case-col-wide">
                  <div className="case-col-label">Diff (expected − / actual +)</div>
                  <DiffView lines={verdict.diff} />
                </div>
              )}
            </>
          )}
        </div>
      )}
      {open && <AstToggle on={showAst} setOn={setShowAst} markdown={c.markdown} />}
    </div>
  );
}

function AstToggle({
  on,
  setOn,
  markdown,
}: {
  on: boolean;
  setOn: (v: boolean) => void;
  markdown: string;
}) {
  const [json, setJson] = useState<string | null>(null);
  if (!on) {
    return (
      <div className="ast-toggle">
        <button onClick={() => setOn(true)}>show AST v2 JSON</button>
      </div>
    );
  }
  if (json === null) {
    import('@supramark/markdown-web')
      .then(m => {
        try {
          setJson(JSON.stringify(m.parse(markdown), null, 2));
        } catch {
          setJson('(parse failed)');
        }
      })
      .catch(() => setJson('(wasm unavailable)'));
  }
  return (
    <div className="ast-toggle">
      <button onClick={() => setOn(false)}>hide AST</button>
      <pre className="case-code ast-json">{json ?? '…'}</pre>
    </div>
  );
}
