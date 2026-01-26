/**
 * Container renderer registries.
 *
 * These registries allow feature packages to self-register platform-specific
 * container renderers (e.g. `:::weather`) without requiring host apps to
 * manually wire `containerRenderers`.
 *
 * The core package intentionally keeps renderer types as `unknown` to avoid
 * introducing React/Web/RN dependencies.
 */

export type WebContainerRenderer = unknown;
export type RNContainerRenderer = unknown;

const webContainerRenderers: Record<string, WebContainerRenderer> = Object.create(null);
const rnContainerRenderers: Record<string, RNContainerRenderer> = Object.create(null);

export function registerWebContainerRenderer(name: string, renderer: WebContainerRenderer): void {
  webContainerRenderers[name] = renderer;
}

export function registerRNContainerRenderer(name: string, renderer: RNContainerRenderer): void {
  rnContainerRenderers[name] = renderer;
}

export function getWebContainerRenderers(): Record<string, WebContainerRenderer> {
  return { ...webContainerRenderers };
}

export function getRNContainerRenderers(): Record<string, RNContainerRenderer> {
  return { ...rnContainerRenderers };
}
