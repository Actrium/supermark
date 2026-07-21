import { describe, expect, it, mock } from 'bun:test';

// styles.ts import react-native 的 StyleSheet;react-native 的 JS 入口含 Flow
// 语法 (import typeof),bun 无法加载。用 identity mock 替代 —— 测试只关心样式对象的
// 纯逻辑 (mergeStyles / themeBackground / darkThemeStyles 结构),不依赖 StyleSheet.create
// 的运行时语义。动态 import 确保 mock 先注册、再加载 styles。
mock.module('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
}));

const stylesModule = await import('../src/styles');
const { defaultStyles, darkThemeStyles, mergeStyles, themeBackground } = stylesModule;

/**
 * 画布背景职责边界测试。
 *
 * 契约:组件不在 root 上绘制画布背景 —— 画布由宿主提供。
 * 库只导出与内置主题前景色配套的推荐画布色 (themeBackground) 供宿主选用。
 */
describe('theme canvas ownership', () => {
  describe('themeBackground', () => {
    it('导出与内置主题前景色配套的推荐画布色', () => {
      expect(themeBackground.dark).toBe('#0d1117');
      expect(themeBackground.light).toBe('#ffffff');
    });
  });

  describe('darkThemeStyles', () => {
    it('不在 root 上自带画布背景 (画布由宿主提供)', () => {
      expect(darkThemeStyles.root).toBeUndefined();
    });

    it('已移除 lightThemeStyles (light 等同默认主题)', () => {
      expect((stylesModule as Record<string, unknown>).lightThemeStyles).toBeUndefined();
    });

    it('保留深色友好的前景色与元素装饰色', () => {
      expect(darkThemeStyles.paragraph?.color).toBe('#e0e0e0');
      expect(darkThemeStyles.codeBlock?.backgroundColor).toBe('#2d2d2d');
      expect(darkThemeStyles.tableHeaderCell?.backgroundColor).toBe('#2d2d2d');
    });
  });

  describe('mergeStyles', () => {
    it('无自定义样式时回退到默认样式', () => {
      const merged = mergeStyles(undefined);
      expect(merged.paragraph).toEqual(defaultStyles.paragraph);
    });

    it('合并后 root 不携带画布背景', () => {
      const merged = mergeStyles(undefined);
      expect((merged.root as { backgroundColor?: string }).backgroundColor).toBeUndefined();
    });

    it('用户自定义样式覆盖默认值,且保留未覆盖字段', () => {
      const merged = mergeStyles({ paragraph: { color: '#ff0000' } });
      expect(merged.paragraph.color).toBe('#ff0000');
      expect(merged.paragraph.lineHeight).toBe(defaultStyles.paragraph.lineHeight);
    });
  });
});
