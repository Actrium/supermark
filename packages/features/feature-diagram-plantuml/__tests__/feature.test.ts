import { diagramPlantUmlFeature } from '../src/feature.js';

describe('Diagram PlantUML Feature', () => {
  it('has valid metadata id', () => {
    expect(diagramPlantUmlFeature.metadata.id).toBe('@supramark/feature-diagram-plantuml');
  });

  it('uses diagram ast type', () => {
    expect(diagramPlantUmlFeature.syntax.ast.type).toBe('diagram');
  });
});
