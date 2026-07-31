import { emojiFeature } from '../src/feature';
import { validateFeature } from '@supramark/core';

describe('Emoji Feature', () => {
  describe('Metadata', () => {
    it('should have valid metadata', () => {
      const result = validateFeature(emojiFeature);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct id', () => {
      expect(emojiFeature.metadata.id).toMatch(/^@[\w-]+\/feature-[\w-]+$/);
    });

    it('should have semantic version', () => {
      expect(emojiFeature.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Syntax', () => {
    it('should define AST node type', () => {
      expect(emojiFeature.syntax.ast.type).toBeDefined();
      expect(typeof emojiFeature.syntax.ast.type).toBe('string');
    });

    // TODO: add more syntax tests
  });

  // TODO: add render tests
  // TODO: add integration tests
});
