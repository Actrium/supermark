import type { DiffLine } from '../types.ts';

export function DiffView({ lines }: { lines: DiffLine[] }) {
  if (lines.length === 0) return null;
  return (
    <pre className="diff">
      {lines.map((l, i) => (
        <div key={i} className={`diff-line diff-${l.type}`}>
          <span className="diff-marker">{l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}</span>
          <span className="diff-text">{l.text || ' '}</span>
        </div>
      ))}
    </pre>
  );
}
