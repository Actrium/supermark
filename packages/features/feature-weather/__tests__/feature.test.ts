import { weatherFeature } from '../src/feature';
import { validateFeature } from '@supramark/core';

describe('Weather Feature', () => {
  describe('Metadata', () => {
    it('should have valid metadata', () => {
      const result = validateFeature(weatherFeature);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct id', () => {
      expect(weatherFeature.metadata.id).toMatch(/^@[\w-]+\/feature-[\w-]+$/);
    });

    it('should have semantic version', () => {
      expect(weatherFeature.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should have syntaxFamily "container"', () => {
      expect(weatherFeature.metadata.syntaxFamily).toBe('container');
    });
  });

  describe('Syntax', () => {
    it('should define AST node type as "container"', () => {
      expect(weatherFeature.syntax.ast.type).toBe('container');
    });

    it('should have selector for name "weather"', () => {
      const selector = weatherFeature.syntax.ast.selector;
      expect(selector).toBeDefined();
      
      // Test selector matches correct node
      const validNode = { type: 'container', name: 'weather', children: [] };
      expect(selector!(validNode as any)).toBe(true);
      
      // Test selector rejects wrong name
      const wrongNode = { type: 'container', name: 'other', children: [] };
      expect(selector!(wrongNode as any)).toBe(false);
    });
  });
});
