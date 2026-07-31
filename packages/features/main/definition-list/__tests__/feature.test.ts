import { definitionListFeature } from '../src/feature';
import { validateFeature } from '@supramark/core';

describe('Definition List Feature', () => {
  describe('Metadata', () => {
    it('should have valid metadata', () => {
      const result = validateFeature(definitionListFeature);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct id', () => {
      expect(definitionListFeature.metadata.id).toMatch(/^@[\w-]+\/feature-[\w-]+$/);
    });

    it('should have semantic version', () => {
      expect(definitionListFeature.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Syntax', () => {
    it('should define AST node type', () => {
      expect(definitionListFeature.syntax.ast.type).toBeDefined();
      expect(typeof definitionListFeature.syntax.ast.type).toBe('string');
    });

    // TODO: add more syntax tests
  });

  // TODO: add render tests
  // TODO: add integration tests
});
