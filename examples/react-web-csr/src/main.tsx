import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { FeaturePreview } from './FeaturePreview.tsx';
import { featureRegistry, type FeatureCategory } from './feature-registry';

const params = new URLSearchParams(window.location.search);
const featureParam = params.get('feature');

const categoryLabels: Record<FeatureCategory, string> = {
  container: 'Container',
  basic: 'Basic',
  diagram: 'Diagram',
};

const categoryOrder: FeatureCategory[] = ['container', 'basic', 'diagram'];

function FeatureList() {
  const grouped = new Map<FeatureCategory, typeof featureRegistry>();
  for (const f of featureRegistry) {
    const cat = f.category ?? 'basic';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(f);
  }

  return (
    <div
      style={{
        maxWidth: 640,
        margin: '80px auto',
        padding: '0 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#1a1a1a',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Supramark Features</h1>
      <p style={{ color: '#666', marginBottom: 32, fontSize: 14 }}>
        Select a feature to open its interactive preview.
      </p>
      {categoryOrder.map(cat => {
        const items = grouped.get(cat);
        if (!items?.length) return null;
        return (
          <div key={cat} style={{ marginBottom: 28 }}>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#999',
                marginBottom: 10,
                paddingBottom: 6,
                borderBottom: '1px solid #eee',
              }}
            >
              {categoryLabels[cat]}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {items.map(f => (
                <a
                  key={f.shortName}
                  href={`?feature=${f.shortName}`}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 12,
                    padding: '8px 12px',
                    borderRadius: 6,
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
                    {f.displayName}
                  </span>
                  {f.description && (
                    <span style={{ color: '#888', fontSize: 13 }}>{f.description}</span>
                  )}
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {featureParam ? <FeaturePreview initialFeature={featureParam} /> : <FeatureList />}
  </StrictMode>
);
