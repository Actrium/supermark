import { describe, expect, it, mock } from 'bun:test';

// styles.ts import react-native 的 StyleSheet;其 JS 入口含 Flow 语法,bun 无法加载。
// 用 identity mock —— 测试只关心样式对象的 gap 模型,不依赖 StyleSheet.create 运行时。
mock.module('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
}));

const { defaultStyles } = await import('../src/styles');

/**
 * block 间距 gap 模型测试。
 *
 * 模型:间距跟着容器走 (gap),不跟着 block 走 (marginBottom)。
 * - root (column + gap:8) 管 top-level block 间距,无 trailing。
 * - list (gap:4) 管 list_item 间距。
 * - 承载 block children 的嵌套容器 (footnote 内层 / definition description / generic container)
 *   各自在渲染处独立加 gap,不复用共享的 listItem / listItemText —— 后者是 row 布局、不带 gap。
 */
describe('block spacing gap model', () => {
  it('root 用 column + gap 统一 top-level block 间距,无 trailing', () => {
    expect(defaultStyles.root.flexDirection).toBe('column');
    expect(defaultStyles.root.gap).toBe(8);
  });

  it('list 用 gap 给 list_item 间距', () => {
    expect(defaultStyles.list.gap).toBe(4);
  });

  it('共享 listItem 是 row 布局且不带 gap (不被嵌套容器污染)', () => {
    expect(defaultStyles.listItem.flexDirection).toBe('row');
    expect((defaultStyles.listItem as Record<string, unknown>).gap).toBeUndefined();
  });

  it('共享 listItemText 不带 gap (不被嵌套容器污染)', () => {
    expect((defaultStyles.listItemText as Record<string, unknown>).gap).toBeUndefined();
  });

  it('block 默认样式不再携带 marginBottom (间距改由容器 gap 管)', () => {
    expect((defaultStyles.paragraph as Record<string, unknown>).marginBottom).toBeUndefined();
    expect((defaultStyles.h1 as Record<string, unknown>).marginBottom).toBeUndefined();
    expect((defaultStyles.codeBlock as Record<string, unknown>).marginBottom).toBeUndefined();
  });

  it('标题用 marginTop 表达"上方比下方宽"的分级 (与 root gap 叠加)', () => {
    // 上方间距 = root gap(8) + marginTop;下方间距 = root gap(8)
    expect((defaultStyles.h1 as Record<string, unknown>).marginTop).toBe(8); // 上方 16
    expect((defaultStyles.h2 as Record<string, unknown>).marginTop).toBe(6); // 上方 14
    expect((defaultStyles.h3 as Record<string, unknown>).marginTop).toBe(4); // 上方 12
    expect((defaultStyles.h4 as Record<string, unknown>).marginTop).toBe(2); // 上方 10
    // h5/h6 不加 marginTop,与上方块等距
    expect((defaultStyles.h5 as Record<string, unknown>).marginTop).toBeUndefined();
    expect((defaultStyles.h6 as Record<string, unknown>).marginTop).toBeUndefined();
  });
});
