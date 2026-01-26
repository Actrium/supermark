/**
 * LRU (Least Recently Used) 缓存实现
 * 用于缓存图表渲染结果等计算密集型操作的结果
 */

export interface LRUCacheOptions {
  /**
   * 缓存最大容量（条目数量）
   * @default 100
   */
  maxSize?: number;

  /**
   * 缓存项的 TTL（生存时间，毫秒）
   * @default undefined（永不过期）
   */
  ttl?: number;

  /**
   * 可选的值序列化函数（用于估算内存大小）
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
 * LRU 缓存类
 *
 * @example
 * ```typescript
 * const cache = new LRUCache<string>({ maxSize: 100, ttl: 60000 });
 *
 * // 存入缓存
 * cache.set('key1', 'value1');
 *
 * // 读取缓存
 * const value = cache.get('key1'); // 'value1'
 *
 * // 检查是否存在
 * const exists = cache.has('key1'); // true
 *
 * // 清除缓存
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
    this.sizeCalculator = options.sizeCalculator ?? ((value) => {
      try {
        return JSON.stringify(value).length;
      } catch {
        return 1;
      }
    });
  }

  /**
   * 获取缓存项
   * @param key 缓存键
   * @returns 缓存值，如果不存在或已过期则返回 undefined
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // 检查是否过期
    if (this.ttl && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.totalSize -= entry.size;
      return undefined;
    }

    // LRU: 将访问的项移到最后（Map 的插入顺序）
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * 设置缓存项
   * @param key 缓存键
   * @param value 缓存值
   */
  set(key: string, value: T): void {
    // 如果已存在，先删除旧值
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

    // 添加新条目
    this.cache.set(key, entry);
    this.totalSize += size;

    // 如果超过最大容量，删除最旧的条目（Map 的第一个）
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
   * 检查缓存中是否存在指定键
   * @param key 缓存键
   * @returns 是否存在且未过期
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * 删除缓存项
   * @param key 缓存键
   * @returns 是否成功删除
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.totalSize -= entry.size;
    }
    return this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.totalSize = 0;
  }

  /**
   * 获取当前缓存的条目数量
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 获取所有缓存键
   */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  /**
   * 获取缓存统计信息
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
   * 清理过期的缓存项
   * @returns 清理的条目数量
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
 * 生成缓存键的辅助函数
 * @param parts 键的组成部分
 * @returns 缓存键
 */
export function createCacheKey(...parts: (string | number | boolean | undefined | null)[]): string {
  return parts
    .filter(part => part !== null && part !== undefined)
    .map(part => String(part))
    .join(':');
}

/**
 * 简单的哈希函数（用于生成短缓存键）
 * @param str 输入字符串
 * @returns 哈希值
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
