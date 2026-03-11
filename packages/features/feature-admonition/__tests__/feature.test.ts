import { admonitionFeature } from '../src/feature';
import { validateContainerFeature } from '@supramark/core';

describe('Admonition Feature', () => {
  describe('Definition', () => {
    it('should have valid metadata', () => {
      const result = validateContainerFeature(admonitionFeature);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct id', () => {
      expect(admonitionFeature.id).toMatch(/^@[\w-]+\/feature-[\w-]+$/);
    });

    it('should have semantic version', () => {
      expect(admonitionFeature.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should define supported container names', () => {
      expect(admonitionFeature.containerNames).toEqual(
        expect.arrayContaining(['note', 'tip', 'info', 'warning', 'danger']),
      );
    });

    it('should expose parser registration', () => {
      expect(typeof admonitionFeature.registerParser).toBe('function');
    });

    it('should expose renderer export names', () => {
      expect(admonitionFeature.webRendererExport).toBe('renderAdmonitionContainerWeb');
      expect(admonitionFeature.rnRendererExport).toBe('renderAdmonitionContainerRN');
    });
  });
});
