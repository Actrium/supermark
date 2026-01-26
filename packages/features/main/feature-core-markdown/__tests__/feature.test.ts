import { coreMarkdownFeature } from '../src/feature';
import { validateFeature } from '@supramark/core';

describe('Core Markdown Feature', () => {
  describe('Metadata', () => {
    it('should have valid metadata', () => {
      const result = validateFeature(coreMarkdownFeature);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct id', () => {
      expect(coreMarkdownFeature.metadata.id).toMatch(/^@[\w-]+\/feature-[\w-]+$/);
    });

    it('should have semantic version', () => {
      expect(coreMarkdownFeature.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Syntax', () => {
    it('should define AST node type', () => {
      expect(coreMarkdownFeature.syntax.ast.type).toBeDefined();
      expect(typeof coreMarkdownFeature.syntax.ast.type).toBe('string');
    });

    // TODO: 添加更多语法测试
  });

  // TODO: 添加渲染测试
  // TODO: 添加集成测试
});
