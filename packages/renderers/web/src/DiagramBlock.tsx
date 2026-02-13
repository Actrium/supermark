import React, { useEffect, useState, useContext } from 'react';
import { DiagramEngineContext } from './DiagramEngineProvider.js';

interface DiagramBlockProps {
  engine: string;
  code: string;
  className?: string;
  preClassName?: string;
  codeClassName?: string;
}

export const DiagramBlock: React.FC<DiagramBlockProps> = ({
  engine,
  code,
  className,
  preClassName,
  codeClassName,
}) => {
  const diagramEngine = useContext(DiagramEngineContext);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!diagramEngine) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setHtml(null);

    diagramEngine
      .render({ engine, code })
      .then(result => {
        if (cancelled) return;
        if (result.success) {
          setHtml(result.payload);
        } else {
          setError(result.error?.details || result.payload || 'Rendering failed');
        }
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [diagramEngine, engine, code]);

  // No engine available: fall back to placeholder (compatible with SSR/legacy)
  if (!diagramEngine) {
    return (
      <div data-suprimark-diagram={engine} className={className}>
        <pre className={preClassName}>
          <code className={codeClassName}>{code}</code>
        </pre>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={className} style={{ padding: '12px', color: '#999', fontSize: 13 }}>
        Rendering {engine} diagram...
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <div
          style={{
            border: '1px solid #ffccc7',
            background: '#fff2f0',
            padding: '12px',
            borderRadius: '4px',
            margin: '8px 0',
          }}
        >
          <div style={{ color: '#cf1322', fontWeight: 600, marginBottom: 8 }}>
            Diagram render error
          </div>
          <div style={{ color: '#595959', fontSize: 13, whiteSpace: 'pre-wrap' }}>{error}</div>
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', color: '#1890ff', fontSize: 13 }}>
              Show source
            </summary>
            <pre
              style={{
                background: '#fafafa',
                padding: 8,
                borderRadius: 4,
                marginTop: 8,
                overflow: 'auto',
              }}
            >
              <code>{code}</code>
            </pre>
          </details>
        </div>
      </div>
    );
  }

  if (html) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return null;
};
