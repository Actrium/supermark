import { mathFeature } from '../src/feature';
import { validateFeature } from '@supramark/core';

describe('Math Feature', () => {
  describe('Metadata', () => {
    it('should have valid metadata', () => {
      const result = validateFeature(mathFeature);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct id', () => {
      expect(mathFeature.metadata.id).toMatch(/^@[\w-]+\/feature-[\w-]+$/);
    });

    it('should have semantic version', () => {
      expect(mathFeature.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Syntax', () => {
    it('should define AST node type', () => {
      expect(mathFeature.syntax.ast.type).toBeDefined();
      expect(typeof mathFeature.syntax.ast.type).toBe('string');
    });

    it('should use selector to match both inline and block math nodes', () => {
      const { selector } = mathFeature.syntax.ast;
      expect(selector).toBeDefined();
      // inline
      const inlineMatch = selector!({ type: 'math_inline', value: 'E = mc^2' } as any);
      // block
      const blockMatch = selector!({
        type: 'math_block',
        value: '\\int_0^1 x^2 dx',
      } as any);

      expect(inlineMatch).toBe(true);
      expect(blockMatch).toBe(true);
    });
  });

  // TODO: 添加渲染测试
  // TODO: 添加集成测试
});
