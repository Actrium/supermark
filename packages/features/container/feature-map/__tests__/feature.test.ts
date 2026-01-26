import { mapFeature } from '../src/feature';
import { validateFeature } from '@supramark/core';

describe('Map Feature', () => {
  describe('Metadata', () => {
    it('should have valid metadata', () => {
      const result = validateFeature(mapFeature);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct id', () => {
      expect(mapFeature.metadata.id).toMatch(/^@[\w-]+\/feature-[\w-]+$/);
    });

    it('should have semantic version', () => {
      expect(mapFeature.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Syntax', () => {
    it('should define AST node type', () => {
      expect(mapFeature.syntax.ast.type).toBeDefined();
      expect(typeof mapFeature.syntax.ast.type).toBe('string');
    });

    // TODO: 添加更多语法测试
  });

  // TODO: 添加渲染测试
  // TODO: 添加集成测试
});
