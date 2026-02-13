import React, { useEffect, useState, useContext } from 'react';
import { DiagramEngineContext } from './DiagramEngineProvider.js';

interface MathBlockWebProps {
  value: string;
  displayMode: boolean;
  className?: string;
}

export const MathBlockWeb: React.FC<MathBlockWebProps> = ({ value, displayMode, className }) => {
  const diagramEngine = useContext(DiagramEngineContext);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!diagramEngine) return;

    let cancelled = false;

    diagramEngine
      .render({
        engine: 'math',
        code: value,
        options: { displayMode },
      })
      .then(result => {
        if (cancelled) return;
        if (result.success) {
          setHtml(result.payload);
        }
      })
      .catch(() => {
        // On error, leave the raw TeX visible
      });

    return () => {
      cancelled = true;
    };
  }, [diagramEngine, value, displayMode]);

  // No engine or not yet rendered: fall back to placeholder
  if (!diagramEngine || !html) {
    const tag = displayMode ? 'div' : 'span';
    return React.createElement(
      tag,
      {
        'data-suprimark-math': displayMode ? 'block' : 'inline',
        className,
      },
      displayMode ? React.createElement('code', { className }, value) : value
    );
  }

  if (displayMode) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
};
