import { mathFeature } from '../src/feature';
import { validateFeature } from '@supramark/core';

describe('Math Feature', () => {
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
