import { diagramVegaLiteFeature } from '../src/feature.js';

describe('Diagram Vega-Lite Feature', () => {
  it('has valid metadata id', () => {
    expect(diagramVegaLiteFeature.metadata.id).toBe('@supramark/feature-diagram-vega-lite');
  });

  it('uses diagram ast type', () => {
    expect(diagramVegaLiteFeature.syntax.ast.type).toBe('diagram');
  });
});
