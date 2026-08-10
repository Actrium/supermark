export interface DevelopmentGlobals {
  __DEV__?: unknown;
  process?: { env?: Record<string, string | undefined> };
}

/** Resolve development mode, treating React Native's `__DEV__` as authoritative. */
export function resolveDevelopmentMode(
  globals: DevelopmentGlobals = globalThis as DevelopmentGlobals
): boolean {
  if (typeof globals.__DEV__ !== 'undefined') {
    return globals.__DEV__ === true;
  }
  return globals.process?.env?.NODE_ENV !== 'production';
}
