import { LRUCache, createCacheKey, simpleHash } from '../src/cache';

describe('LRUCache', () => {
  describe('基础功能', () => {
    it('应该能够设置和获取值', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('应该在键不存在时返回 undefined', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('应该能够检查键是否存在', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('应该能够删除键', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('应该能够清空所有缓存', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('LRU 淘汰策略', () => {
    it('应该在超过最大容量时淘汰最旧的条目', () => {
      const cache = new LRUCache<string>({ maxSize: 3 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // 应该淘汰 key1

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('访问条目应该更新其位置（LRU）', () => {
      const cache = new LRUCache<string>({ maxSize: 3 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // 访问 key1，使其成为最新的
      cache.get('key1');

      // 添加 key4，应该淘汰 key2（最旧的未访问）
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });
  });

  describe('TTL 过期', () => {
    it('应该在 TTL 过期后返回 undefined', async () => {
      const cache = new LRUCache<string>({ maxSize: 10, ttl: 50 }); // 50ms TTL
      cache.set('key1', 'value1');

      expect(cache.get('key1')).toBe('value1');

      // 等待 TTL 过期
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(cache.get('key1')).toBeUndefined();
    });

    it('应该能够清理过期的条目', async () => {
      const cache = new LRUCache<string>({ maxSize: 10, ttl: 50 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      await new Promise(resolve => setTimeout(resolve, 100));

      const purged = cache.purgeExpired();
      expect(purged).toBe(2);
      expect(cache.size).toBe(0);
    });
  });

  describe('统计信息', () => {
    it('应该返回正确的统计信息', () => {
      const cache = new LRUCache<string>({ maxSize: 10, ttl: 1000 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(10);
      expect(stats.ttl).toBe(1000);
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });
});

describe('createCacheKey', () => {
  it('应该创建正确的缓存键', () => {
    expect(createCacheKey('mermaid', 'abc123')).toBe('mermaid:abc123');
    expect(createCacheKey('math', 'formula', 'inline')).toBe('math:formula:inline');
  });

  it('应该过滤 null 和 undefined 值', () => {
    expect(createCacheKey('mermaid', null, 'abc123')).toBe('mermaid:abc123');
    expect(createCacheKey('mermaid', undefined, 'abc123')).toBe('mermaid:abc123');
  });
});

describe('simpleHash', () => {
  it('应该为相同的字符串生成相同的哈希', () => {
    const hash1 = simpleHash('test string');
    const hash2 = simpleHash('test string');
    expect(hash1).toBe(hash2);
  });

  it('应该为不同的字符串生成不同的哈希', () => {
    const hash1 = simpleHash('test string 1');
    const hash2 = simpleHash('test string 2');
    expect(hash1).not.toBe(hash2);
  });

  it('应该返回字符串类型的哈希', () => {
    const hash = simpleHash('test');
    expect(typeof hash).toBe('string');
  });
});
