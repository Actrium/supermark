import { weatherFeature } from '../src/feature';
import { validateContainerFeature } from '@supramark/core';

describe('Weather Feature', () => {
  describe('Definition', () => {
    it('should have valid metadata', () => {
      const result = validateContainerFeature(weatherFeature);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct id', () => {
      expect(weatherFeature.id).toMatch(/^@[\w-]+\/feature-[\w-]+$/);
    });

    it('should have semantic version', () => {
      expect(weatherFeature.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should define supported container names', () => {
      expect(weatherFeature.containerNames).toEqual(['weather']);
    });

    it('should expose parser registration', () => {
      expect(typeof weatherFeature.registerParser).toBe('function');
    });

    it('should expose renderer export names', () => {
      expect(weatherFeature.webRendererExport).toBe('renderWeatherContainerWeb');
      expect(weatherFeature.rnRendererExport).toBe('renderWeatherContainerRN');
    });
  });
});
