import { useState, useRef, useCallback, useEffect } from 'react';
import { Supramark } from '@supramark/web/client';
import { featureRegistry, findFeature, containerRenderers, type FeatureEntry } from './feature-registry';

export function FeaturePreview({ initialFeature }: { initialFeature: string }) {
  const initial = findFeature(initialFeature) ?? featureRegistry[0];
  const [feature, setFeature] = useState<FeatureEntry>(initial);
  const [selectedExample, setSelectedExample] = useState(0);
  const [markdown, setMarkdown] = useState(initial.examples[0]?.markdown ?? '');
  const [dirty, setDirty] = useState(false); // track if editor content modified from example
  const [previewWidth, setPreviewWidth] = useState(480); // px
  const [maxPreviewWidth, setMaxPreviewWidth] = useState(1200); // actual available width
  const [bgMode, setBgMode] = useState<'light' | 'dark'>('light');
  const [copied, setCopied] = useState(false);

  // Splitter drag
  const [leftPct, setLeftPct] = useState(50);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);

  // Editor + gutter scroll sync
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Sync gutter scroll with textarea
  const onEditorScroll = useCallback(() => {
    if (editorRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = editorRef.current.scrollTop;
    }
  }, []);

  // Compute visible line count from editor height
  const LINE_HEIGHT = 19.5; // 13px * 1.5
  const [visibleLines, setVisibleLines] = useState(50);
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const h = el.clientHeight;
      setVisibleLines(Math.ceil(h / LINE_HEIGHT));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Track available width in preview area (subtract padding: 16px * 2)
  useEffect(() => {
    const el = previewAreaRef.current;
    if (!el) return;
    const update = () => {
      const available = el.clientWidth - 32; // 16px padding each side
      setMaxPreviewWidth(Math.max(120, available));
      setPreviewWidth(prev => Math.min(prev, Math.max(120, available)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const lineCount = markdown.split('\n').length;
  const gutterLines = Math.max(lineCount, visibleLines);

  const switchFeature = (shortName: string) => {
    const f = findFeature(shortName);
    if (!f) return;
    setFeature(f);
    setSelectedExample(0);
    setMarkdown(f.examples[0]?.markdown ?? '');
    setDirty(false);
    const url = new URL(window.location.href);
    url.searchParams.set('feature', shortName);
    window.history.replaceState(null, '', url.toString());
  };

  const switchExample = (idx: number) => {
    setSelectedExample(idx);
    setMarkdown(feature.examples[idx]?.markdown ?? '');
    setDirty(false);
  };

  const onEditorChange = (value: string) => {
    setMarkdown(value);
    setDirty(value !== (feature.examples[selectedExample]?.markdown ?? ''));
  };

  const copyVersion = () => {
    navigator.clipboard.writeText(feature.version);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const monoFont = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

  return (
    <div ref={containerRef} style={{
      position: 'fixed', inset: 0, display: 'flex', overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 13,
      userSelect: dragging.current ? 'none' : 'auto',
    }}>
      {/* ===== Left pane ===== */}
      <div style={{ width: `${leftPct}%`, display: 'flex', flexDirection: 'column', borderRight: '1px solid #d0d0d0', minWidth: 0 }}>
        {/* Left header: [Feature ▾] [Demo ▾]  ...  Ver: x.y.z */}
        <div style={{
          height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px', borderBottom: '1px solid #e0e0e0', flexShrink: 0, background: '#fafafa',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              value={feature.shortName}
              onChange={e => switchFeature(e.target.value)}
              style={{
                fontSize: 14, fontWeight: 600,
                border: '1px solid #d0d0d0', borderRadius: 4, background: '#fff',
                cursor: 'pointer', padding: '2px 6px', outline: 'none',
                color: '#1a1a1a', width: 'auto',
              }}
            >
              {featureRegistry.map(f => (
                <option key={f.shortName} value={f.shortName}>{f.displayName}</option>
              ))}
            </select>
            {feature.examples.length > 0 && (
              <select
                value={selectedExample}
                onChange={e => switchExample(Number(e.target.value))}
                style={{
                  fontSize: 13, fontWeight: 500,
                  border: '1px solid #d0d0d0', borderRadius: 4, background: '#fff',
                  cursor: 'pointer', padding: '2px 6px', outline: 'none',
                  color: '#333', width: 'auto',
                }}
              >
                {feature.examples.map((ex, i) => (
                  <option key={i} value={i}>
                    {ex.name}{i === selectedExample && dirty ? '*' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          <span
            onClick={copyVersion}
            title="Click to copy"
            style={{ fontSize: 12, color: '#999', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {copied ? 'Copied!' : `Ver: ${feature.version}`}
          </span>
        </div>

        {/* Editor with line numbers */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          {/* Line numbers gutter */}
          <div
            ref={gutterRef}
            style={{
              width: 40, flexShrink: 0, overflow: 'hidden',
              background: '#f5f5f5', borderRight: '1px solid #e0e0e0',
              padding: '8px 0', textAlign: 'right',
              fontFamily: monoFont, fontSize: 13, lineHeight: '1.5', color: '#b0b0b0',
              userSelect: 'none',
            }}
          >
            {Array.from({ length: gutterLines }, (_, i) => (
              <div key={i} style={{ paddingRight: 8, height: LINE_HEIGHT }}>{i + 1}</div>
            ))}
          </div>
          {/* Textarea */}
          <textarea
            ref={editorRef}
            value={markdown}
            onChange={e => onEditorChange(e.target.value)}
            onScroll={onEditorScroll}
            spellCheck={false}
            style={{
              flex: 1, padding: '8px 12px', border: 'none', resize: 'none',
              background: '#fff', color: '#1a1a1a',
              fontFamily: monoFont, fontSize: 13, lineHeight: '1.5',
              outline: 'none', tabSize: 2, minWidth: 0,
            }}
            placeholder="Enter Markdown here..."
          />
        </div>
      </div>

      {/* ===== Splitter ===== */}
      <div
        onMouseDown={onDragStart}
        style={{ width: 5, cursor: 'col-resize', background: '#e0e0e0', flexShrink: 0 }}
        onMouseEnter={e => (e.currentTarget.style.background = '#4a90d9')}
        onMouseLeave={e => { if (!dragging.current) e.currentTarget.style.background = '#e0e0e0'; }}
      />

      {/* ===== Right pane ===== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Right header: all controls right-aligned */}
        <div style={{
          height: 36, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
          padding: '0 12px', borderBottom: '1px solid #e0e0e0', flexShrink: 0, background: '#fafafa',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#666' }}>Width:</span>
            <input
              type="range" min={120} max={maxPreviewWidth} step={10} value={previewWidth}
              onChange={e => setPreviewWidth(Math.min(Number(e.target.value), maxPreviewWidth))}
              style={{ width: 120, accentColor: '#333' }}
            />
            <span style={{ fontSize: 11, color: '#999', minWidth: 40, textAlign: 'right' }}>{previewWidth}px</span>
          </div>
          <div style={{ width: 20, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: bgMode === 'light' ? '#333' : '#aaa', fontWeight: bgMode === 'light' ? 600 : 400, userSelect: 'none' }}>Light</span>
          <div
            onClick={() => setBgMode(bgMode === 'light' ? 'dark' : 'light')}
            style={{
              width: 36, height: 20, borderRadius: 10, cursor: 'pointer', position: 'relative',
              background: bgMode === 'dark' ? '#333' : '#ccc',
              transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: 8,
              background: '#fff',
              position: 'absolute', top: 2,
              left: bgMode === 'dark' ? 18 : 2,
              transition: 'left 0.2s',
              boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
            }} />
          </div>
          <span style={{ fontSize: 11, color: bgMode === 'dark' ? '#333' : '#aaa', fontWeight: bgMode === 'dark' ? 600 : 400, userSelect: 'none' }}>Dark</span>
        </div>

        {/* Preview area */}
        <div ref={previewAreaRef} style={{
          flex: 1, overflow: 'auto',
          background: bgMode === 'dark' ? '#1a1a1a' : '#f5f5f5',
          display: 'flex', justifyContent: 'center', padding: '24px 16px',
        }}>
          <div style={{
            width: previewWidth, maxWidth: '100%',
            background: bgMode === 'dark' ? '#2d2d2d' : '#fff',
            color: bgMode === 'dark' ? '#e0e0e0' : '#1a1a1a',
            borderRadius: 6,
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            padding: 20,
            alignSelf: 'flex-start',
          }}>
            <Supramark markdown={markdown} containerRenderers={containerRenderers} />
          </div>
        </div>
      </div>
    </div>
  );
}
