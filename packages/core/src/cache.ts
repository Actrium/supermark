/**
 * LRU (Least Recently Used) cache implementation.
 * Used to cache the results of compute-intensive operations such as diagram rendering.
 */

export interface LRUCacheOptions {
  /**
   * Maximum cache capacity (number of entries).
   * @default 100
   */
  maxSize?: number;

  /**
   * TTL (time to live) of a cache entry, in milliseconds.
   * @default undefined (never expires)
   */
  ttl?: number;

  /**
   * Optional value size estimator (used to estimate memory footprint).
   * @default (value) => JSON.stringify(value).length
   */
  sizeCalculator?: (value: unknown) => number;
}

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  size: number;
}

/**
 * LRU cache class.
 *
 * @example
 * ```typescript
 * const cache = new LRUCache<string>({ maxSize: 100, ttl: 60000 });
 *
 * // Store a value
 * cache.set('key1', 'value1');
 *
 * // Read a value
 * const value = cache.get('key1'); // 'value1'
 *
 * // Check existence
 * const exists = cache.has('key1'); // true
 *
 * // Clear the cache
 * cache.clear();
 * ```
 */
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private readonly maxSize: number;
  private readonly ttl: number | undefined;
  private readonly sizeCalculator: (value: unknown) => number;
  private totalSize: number = 0;

  constructor(options: LRUCacheOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize ?? 100;
    this.ttl = options.ttl;
    this.sizeCalculator =
      options.sizeCalculator ??
      (value => {
        try {
          return JSON.stringify(value).length;
        } catch {
          return 1;
        }
      });
  }

  /**
   * Get a cache entry.
   * @param key the cache key
   * @returns the cached value, or undefined if it doesn't exist or has expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check whether the entry has expired
    if (this.ttl && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.totalSize -= entry.size;
      return undefined;
    }

    // LRU: move the accessed entry to the end (Map's insertion order)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set a cache entry.
   * @param key the cache key
   * @param value the value to cache
   */
  set(key: string, value: T): void {
    // If it already exists, remove the old value first
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      this.totalSize -= existingEntry.size;
      this.cache.delete(key);
    }

    const size = this.sizeCalculator(value);
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      size,
    };

    // Add the new entry
    this.cache.set(key, entry);
    this.totalSize += size;

    // If capacity is exceeded, evict the oldest entry (the first one in the Map)
    while (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        const firstEntry = this.cache.get(firstKey);
        if (firstEntry) {
          this.totalSize -= firstEntry.size;
        }
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * Check whether the given key exists in the cache.
   * @param key the cache key
   * @returns whether it exists and has not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a cache entry.
   * @param key the cache key
   * @returns whether it was successfully deleted
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.totalSize -= entry.size;
    }
    return this.cache.delete(key);
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.totalSize = 0;
  }

  /**
   * Get the current number of cache entries.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all cache keys.
   */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  /**
   * Get cache statistics.
   */
  getStats(): {
    size: number;
    maxSize: number;
    totalSize: number;
    ttl: number | undefined;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalSize: this.totalSize,
      ttl: this.ttl,
    };
  }

  /**
   * Purge expired cache entries.
   * @returns the number of entries purged
   */
  purgeExpired(): number {
    if (!this.ttl) {
      return 0;
    }

    let count = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.totalSize -= entry.size;
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }
}

/**
 * Helper function for generating a cache key.
 * @param parts the components that make up the key
 * @returns the cache key
 */
export function createCacheKey(...parts: (string | number | boolean | undefined | null)[]): string {
  return parts
    .filter(part => part !== null && part !== undefined)
    .map(part => String(part))
    .join(':');
}

/**
 * A simple hash function (used to generate short cache keys).
 * @param str the input string
 * @returns the hash value
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
