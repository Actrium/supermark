import { admonitionFeature } from '../src/feature';
import { validateFeature } from '@supramark/core';

describe('Admonition Feature', () => {
  describe('Metadata', () => {
    it('should have valid metadata', () => {
      const result = validateFeature(admonitionFeature);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct id', () => {
      expect(admonitionFeature.metadata.id).toMatch(/^@[\w-]+\/feature-[\w-]+$/);
    });

    it('should have semantic version', () => {
      expect(admonitionFeature.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Syntax', () => {
    it('should define AST node type', () => {
      expect(admonitionFeature.syntax.ast.type).toBeDefined();
      expect(typeof admonitionFeature.syntax.ast.type).toBe('string');
    });

    // TODO: 添加更多语法测试
  });

  // TODO: 添加渲染测试
  // TODO: 添加集成测试
});
