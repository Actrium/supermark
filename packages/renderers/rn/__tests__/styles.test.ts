import { describe, expect, it } from 'bun:test';

import './support/mock-react-native';

const stylesModule = await import('../src/styles');
const { defaultStyles, darkThemeStyles, mergeStyles, themeBackground } = stylesModule;

/**
 * Tests for the canvas-background responsibility boundary.
 *
 * Contract: the component does not paint a canvas background on root — the
 * canvas is provided by the host. The library only exports the recommended
 * canvas colors that pair with the built-in theme foreground colors
 * (themeBackground) for the host to use.
 */
describe('theme canvas ownership', () => {
  describe('themeBackground', () => {
    it('exports recommended canvas colors that pair with the built-in theme foreground colors', () => {
      expect(themeBackground.dark).toBe('#0d1117');
      expect(themeBackground.light).toBe('#ffffff');
    });
  });

  describe('darkThemeStyles', () => {
    it('does not carry its own canvas background on root (the canvas is provided by the host)', () => {
      expect(darkThemeStyles.root).toBeUndefined();
    });

    it('has removed lightThemeStyles (light is equivalent to the default theme)', () => {
      expect((stylesModule as Record<string, unknown>).lightThemeStyles).toBeUndefined();
    });

    it('retains dark-friendly foreground colors and decoration colors', () => {
      expect(darkThemeStyles.paragraph?.color).toBe('#e0e0e0');
      expect(darkThemeStyles.codeBlock?.backgroundColor).toBe('#2d2d2d');
      expect(darkThemeStyles.tableHeaderCell?.backgroundColor).toBe('#2d2d2d');
    });
  });

  describe('mergeStyles', () => {
    it('falls back to the default styles when no custom styles are given', () => {
      const merged = mergeStyles(undefined);
      expect(merged.paragraph).toEqual(defaultStyles.paragraph);
    });

    it('after merging, root does not carry a canvas background', () => {
      const merged = mergeStyles(undefined);
      expect((merged.root as { backgroundColor?: string }).backgroundColor).toBeUndefined();
    });

    it('user custom styles override the defaults while keeping fields that were not overridden', () => {
      const merged = mergeStyles({ paragraph: { color: '#ff0000' } });
      expect(merged.paragraph.color).toBe('#ff0000');
      expect(merged.paragraph.lineHeight).toBe(defaultStyles.paragraph.lineHeight);
    });
  });
});
