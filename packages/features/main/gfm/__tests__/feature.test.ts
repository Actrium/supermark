import { gfmFeature } from '../src/feature';
import { validateFeature } from '@supramark/core';

describe('GFM Feature', () => {
  describe('Metadata', () => {
    it('should have valid metadata', () => {
      const result = validateFeature(gfmFeature);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct id', () => {
      expect(gfmFeature.metadata.id).toMatch(/^@[\w-]+\/feature-[\w-]+$/);
    });

    it('should have semantic version', () => {
      expect(gfmFeature.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Syntax', () => {
    it('should define AST node type', () => {
      expect(gfmFeature.syntax.ast.type).toBeDefined();
      expect(typeof gfmFeature.syntax.ast.type).toBe('string');
    });

    // TODO: add more syntax tests
  });

  // TODO: add render tests
  // TODO: add integration tests
});
