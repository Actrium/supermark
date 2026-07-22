import { LRUCache } from '@supramark/core';

/** Runtime cache policy resolved from the host's Supramark configuration. */
export interface RendererCachePolicy {
  enabled: boolean;
  maxSize: number;
  ttl?: number;
}

/** Cache policy input accepted by existing Supramark diagram configuration. */
export interface RendererCachePolicyInput {
  enabled?: boolean;
  maxSize?: number;
  ttl?: number;
}

// Default bounds apply only when a host explicitly enables caching without limits.
const DEFAULT_CACHE_MAX_SIZE = 100;

/**
 * Keeps resolved values in the core LRU cache and shares equivalent in-flight work.
 * Rejected work is never retained, so a later mount can retry normally.
 */
export class AsyncRendererCache<T> {
  private readonly values: LRUCache<T>;
  private readonly pending = new Map<string, Promise<T>>();

  constructor(policy: RendererCachePolicy) {
    this.values = new LRUCache<T>({
      maxSize: policy.maxSize,
      ttl: policy.ttl,
    });
  }

  /** Returns a resolved cache value synchronously for first-render restoration. */
  get(key: string): T | undefined {
    return this.values.get(key);
  }

  /** Returns cached work or starts one shared asynchronous computation. */
  getOrCreate(
    key: string,
    factory: () => Promise<T>,
    shouldRetain: (value: T) => boolean = () => true
  ): Promise<T> {
    const cached = this.values.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }

    const existing = this.pending.get(key);
    if (existing) {
      return existing;
    }

    const promise = factory()
      .then(value => {
        if (shouldRetain(value)) {
          this.values.set(key, value);
        }
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === promise) {
          this.pending.delete(key);
        }
      });

    this.pending.set(key, promise);
    return promise;
  }
}

// Renderer-level caches are keyed by namespace and policy rather than config identity.
// This lets equivalent inline config objects share completed and in-flight work while
// each AsyncRendererCache remains bounded by its resolved LRU policy.
const rendererCaches = new Map<string, AsyncRendererCache<unknown>>();

/** Resolves an engine override on top of the diagram-wide cache policy. */
export function resolveRendererCachePolicy(
  override: RendererCachePolicyInput | undefined,
  fallback: RendererCachePolicyInput | undefined
): RendererCachePolicy {
  const enabled = override?.enabled ?? fallback?.enabled ?? false;
  const configuredMaxSize = override?.maxSize ?? fallback?.maxSize ?? DEFAULT_CACHE_MAX_SIZE;
  const configuredTtl = override?.ttl ?? fallback?.ttl;

  return {
    enabled,
    maxSize: Number.isFinite(configuredMaxSize)
      ? Math.max(0, Math.floor(configuredMaxSize))
      : DEFAULT_CACHE_MAX_SIZE,
    ttl:
      configuredTtl !== undefined && Number.isFinite(configuredTtl) && configuredTtl > 0
        ? configuredTtl
        : undefined,
  };
}

/** Resolves engine > diagram default > global cache precedence. */
export function resolveDiagramCachePolicy(
  enginePolicy: RendererCachePolicyInput | undefined,
  diagramPolicy: RendererCachePolicyInput | undefined,
  globalCache: boolean | undefined
): RendererCachePolicy {
  const diagramFallback = resolveRendererCachePolicy(
    diagramPolicy,
    globalCache === undefined ? undefined : { enabled: globalCache }
  );
  return resolveRendererCachePolicy(enginePolicy, diagramFallback);
}

/** Returns the renderer-level cache for one namespace and resolved policy. */
export function getRendererCache<T>(
  namespace: string,
  policy: RendererCachePolicy
): AsyncRendererCache<T> | undefined {
  if (!policy.enabled || policy.maxSize === 0) {
    return undefined;
  }

  const policyKey = `${namespace}:${policy.maxSize}:${policy.ttl ?? 'none'}`;
  let cache = rendererCaches.get(policyKey);
  if (!cache) {
    cache = new AsyncRendererCache<unknown>(policy);
    rendererCaches.set(policyKey, cache);
  }

  return cache as AsyncRendererCache<T>;
}

/** Deterministically serializes JSON-like render options for cache keys. */
export function stableSerialize(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(',')}}`;
  }
  if (typeof value === 'string') {
    return `string:${JSON.stringify(value)}`;
  }
  return `${typeof value}:${String(value)}`;
}

/** @internal Resets renderer caches for deterministic tests. */
export function clearReactNativeRendererCaches(): void {
  rendererCaches.clear();
}
