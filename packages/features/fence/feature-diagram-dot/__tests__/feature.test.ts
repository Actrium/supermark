import { diagramDotFeature } from '../src/feature.js';

describe('Diagram DOT Feature', () => {
  it('has valid metadata id', () => {
    expect(diagramDotFeature.metadata.id).toBe('@supramark/feature-diagram-dot');
  });

  it('uses diagram ast type', () => {
    expect(diagramDotFeature.syntax.ast.type).toBe('diagram');
  });
});
