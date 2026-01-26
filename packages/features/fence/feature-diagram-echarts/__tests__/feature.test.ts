import { diagramEchartsFeature } from '../src/feature.js';

describe('Diagram ECharts Feature', () => {
  it('has valid metadata id', () => {
    expect(diagramEchartsFeature.metadata.id).toBe('@supramark/feature-diagram-echarts');
  });

  it('uses diagram ast type', () => {
    expect(diagramEchartsFeature.syntax.ast.type).toBe('diagram');
  });
});
