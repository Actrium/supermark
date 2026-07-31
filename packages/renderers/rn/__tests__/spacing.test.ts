import { describe, expect, it } from 'bun:test';

import './support/mock-react-native';

const { defaultStyles } = await import('../src/styles');

/**
 * Tests for the block-spacing gap model.
 *
 * Model: spacing follows the container (gap), not the block (marginBottom).
 * - root (column + gap:8) governs top-level block spacing, with no trailing gap.
 * - list (gap:4) governs list_item spacing.
 * - Nested containers that carry block children (footnote's inner content /
 *   definition description / generic container) each add their own gap at
 *   the render site, instead of reusing the shared listItem / listItemText —
 *   the latter are a row layout with no gap.
 */
describe('block spacing gap model', () => {
  it('root uses column + gap to unify top-level block spacing, with no trailing gap', () => {
    expect(defaultStyles.root.flexDirection).toBe('column');
    expect(defaultStyles.root.gap).toBe(8);
  });

  it('list uses gap to space list_item elements', () => {
    expect(defaultStyles.list.gap).toBe(4);
  });

  it('the shared listItem is a row layout with no gap (not polluted by nested containers)', () => {
    expect(defaultStyles.listItem.flexDirection).toBe('row');
    expect((defaultStyles.listItem as Record<string, unknown>).gap).toBeUndefined();
  });

  it('the shared listItemText carries no gap (not polluted by nested containers)', () => {
    expect((defaultStyles.listItemText as Record<string, unknown>).gap).toBeUndefined();
  });

  it('block default styles no longer carry marginBottom (spacing is now handled by container gap)', () => {
    expect((defaultStyles.paragraph as Record<string, unknown>).marginBottom).toBeUndefined();
    expect((defaultStyles.h1 as Record<string, unknown>).marginBottom).toBeUndefined();
    expect((defaultStyles.codeBlock as Record<string, unknown>).marginBottom).toBeUndefined();
  });

  it('headings use marginTop to express "more space above than below", graded by level (stacks with root gap)', () => {
    // Space above = root gap(8) + marginTop; space below = root gap(8)
    expect((defaultStyles.h1 as Record<string, unknown>).marginTop).toBe(8); // 16 above
    expect((defaultStyles.h2 as Record<string, unknown>).marginTop).toBe(6); // 14 above
    expect((defaultStyles.h3 as Record<string, unknown>).marginTop).toBe(4); // 12 above
    expect((defaultStyles.h4 as Record<string, unknown>).marginTop).toBe(2); // 10 above
    // h5/h6 add no marginTop, spaced the same as the block above
    expect((defaultStyles.h5 as Record<string, unknown>).marginTop).toBeUndefined();
    expect((defaultStyles.h6 as Record<string, unknown>).marginTop).toBeUndefined();
  });
});
