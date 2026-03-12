import { diagramMermaidFeature } from '../src/feature.js';

describe('Diagram Mermaid Feature', () => {
  it('has valid metadata id', () => {
    expect(diagramMermaidFeature.metadata.id).toBe('@supramark/feature-diagram-mermaid');
  });

  it('uses diagram ast type', () => {
    expect(diagramMermaidFeature.syntax.ast.type).toBe('diagram');
  });

  it('selector matches mermaid engine', () => {
    const node = { type: 'diagram', engine: 'mermaid', code: 'graph TD\n  A --> B' };
    expect(diagramMermaidFeature.syntax.ast.selector(node as any)).toBe(true);
  });

  it('selector rejects non-mermaid engine', () => {
    const node = { type: 'diagram', engine: 'dot', code: 'digraph G { A -> B }' };
    expect(diagramMermaidFeature.syntax.ast.selector(node as any)).toBe(false);
  });

  it('selector rejects non-diagram node', () => {
    const node = { type: 'paragraph', children: [] };
    expect(diagramMermaidFeature.syntax.ast.selector(node as any)).toBe(false);
  });
});
