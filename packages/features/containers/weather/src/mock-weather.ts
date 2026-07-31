/**
 * Weather mock data derivation (shared layer)
 *
 * Contains only platform-agnostic derivation logic (temperature / humidity /
 * wind / condition index). The concrete condition representation (web semantic
 * key / RN emoji) is mapped by each runtime and is intentionally not coupled
 * here — see WEB_CONDITIONS in runtime.web.tsx and RN_CONDITIONS in
 * runtime.rn.tsx.
 *
 * A real app should replace this with a real weather API call.
 *
 * @packageDocumentation
 */

/**
 * Return type of getMockWeather
 */
export interface MockWeather {
  /** Temperature (already converted per units) */
  temp: number;
  /** Temperature unit label, e.g. '°C' / '°F' */
  unit: string;
  /**
   * Condition index (0..2), derived from the location hash.
   * Each runtime maps it to its own platform representation.
   */
  conditionIndex: number;
  /** Humidity (%) */
  humidity: number;
  /** Wind speed (already converted per units) */
  wind: number;
  /** Wind unit label, e.g. 'km/h' / 'mph' */
  windUnit: string;
}

/**
 * Derive deterministic mock weather data from a location name.
 *
 * The same location always derives the same result (pure function, no side
 * effects).
 */
export function getMockWeather(
  location: string,
  units: 'metric' | 'imperial' = 'metric',
): MockWeather {
  // Derive a pseudo-random temperature from the location name
  const hash = location.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const baseTemp = 15 + (hash % 20);
  const temp = units === 'imperial' ? Math.round(baseTemp * 1.8 + 32) : baseTemp;
  const unit = units === 'imperial' ? '°F' : '°C';

  const conditionIndex = hash % 3;

  const humidity = 40 + (hash % 40);
  const wind = 5 + (hash % 20);
  const windUnit = units === 'imperial' ? 'mph' : 'km/h';

  return { temp, unit, conditionIndex, humidity, wind, windUnit };
}
