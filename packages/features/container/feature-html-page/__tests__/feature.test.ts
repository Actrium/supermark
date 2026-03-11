import { htmlPageFeature } from '../src/feature';
import { validateFeature } from '@supramark/core';

describe('HTML Page Feature', () => {
  it('should pass feature validation', () => {
    const result = validateFeature(htmlPageFeature);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should expose correct metadata id', () => {
    expect(htmlPageFeature.metadata.id).toBe('@supramark/feature-html-page');
  });

  it('should provide at least one example', () => {
    const examples = htmlPageFeature.examples ?? [];
    expect(Array.isArray(examples)).toBe(true);
    expect(examples.length).toBeGreaterThan(0);
  });
});
