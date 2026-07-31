import { useEffect, useRef, useState } from 'react';
import { loadWebD2Render } from '@supramark/engines/web';
import type { RenderFn } from '@supramark/engines';
import './App.css';

interface Example {
  label: string;
  code: string;
}

const EXAMPLES: Example[] = [
  {
    label: 'Basic flow',
    code: 'a -> b: hello\nb -> c\nc -> a',
  },
  {
    label: 'Shapes & styles',
    code: [
      'manager: Manager {',
      '  shape: person',
      '}',
      'employee: Employee {',
      '  shape: person',
      '}',
      'manager -> employee: manages',
      'employee -> manager: reports to',
    ].join('\n'),
  },
  {
    label: 'ELK layout',
    code: 'layout-engine: elk\n\na -> b\nb -> c\nc -> a',
  },
  {
    label: 'Containers',
    code: [
      'server: Web Server {',
      '  api: API',
      '  static: Static Assets',
      '}',
      'client -> server.api: request',
      'server.api -> server.static: serve',
    ].join('\n'),
  },
];

const STORAGE_KEY = 'supramark:d2-playground:code';
const INITIAL = EXAMPLES[0].code;

function loadInitial(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && saved.trim() ? saved : INITIAL;
  } catch {
    return INITIAL;
  }
}

function App() {
  const [code, setCode] = useState<string>(loadInitial);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const renderRef = useRef<RenderFn | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadWebD2Render()
      .then(render => {
        if (cancelled) return;
        renderRef.current = render;
        setEngineReady(true);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!engineReady) return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const render = renderRef.current;
      if (!render) return;
      setBusy(true);
      try {
        const out = await render(code);
        if (cancelled) return;
        setSvg(out);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [code, engineReady]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* ignore quota / privacy mode */
    }
  }, [code]);

  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'd2-diagram.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1>D2 Playground</h1>
        <p className="app__subtitle">
          Paste D2 source, see the SVG. Rendered in-browser via{' '}
          <code>@actrium/d2-little-web</code> (wasm) through <code>@supramark/engines</code>.
        </p>
      </header>

      <div className="app__examples">
        {EXAMPLES.map(ex => (
          <button
            key={ex.label}
            type="button"
            className="app__example-btn"
            onClick={() => setCode(ex.code)}
          >
            {ex.label}
          </button>
        ))}
      </div>

      <main className="app__main">
        <section className="panel panel--editor">
          <div className="panel__head">
            <span>Source</span>
            <span className="panel__hint">D2</span>
          </div>
          <textarea
            className="editor"
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            placeholder="a -> b"
          />
        </section>

        <section className="panel panel--preview">
          <div className="panel__head">
            <span>Preview</span>
            <div className="panel__actions">
              {busy && <span className="panel__busy">rendering…</span>}
              <button
                type="button"
                className="panel__action"
                onClick={downloadSvg}
                disabled={!svg || busy}
              >
                Download SVG
              </button>
            </div>
          </div>
          <div className="preview">
            {error ? (
              <pre className="preview__error">{error}</pre>
            ) : svg ? (
              <div
                className="preview__svg"
                // engines' d2 loader already injected width/height from the
                // viewBox (injectD2Dimensions); CSS scales it to the container.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <div className="preview__placeholder">Loading engine…</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
