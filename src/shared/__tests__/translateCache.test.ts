import { describe, expect, it } from 'vitest';
import { TranslateResultCache, translateCacheKey, type TranslateCacheEntry } from '../translateCache';

const entry = (text: string): TranslateCacheEntry => ({
  text,
  segments: [{ source: 'あ', target: text }],
  meta: { provider: 'local' },
});

const key = (text: string, extra: Partial<Parameters<typeof translateCacheKey>[0]> = {}): string =>
  translateCacheKey({ provider: 'local', source: 'ja', target: 'en', style: 'natural', text, ...extra });

describe('translateCacheKey', () => {
  it('differs for every input that changes the translation', () => {
    const base = key('猫');
    expect(key('猫')).toBe(base);
    expect(key('犬')).not.toBe(base);
    expect(key('猫', { provider: 'deepl' })).not.toBe(base);
    expect(key('猫', { style: 'literal' })).not.toBe(base);
    expect(key('猫', { target: 'ru' })).not.toBe(base);
    expect(key('猫', { modelFileName: 'Qwen3-8B.gguf' })).not.toBe(base);
    expect(key('猫', { terms: [{ source: '猫', target: 'Neko' }] })).not.toBe(base);
    expect(key('猫', { hints: [{ text: '猫', gloss: 'cat' }] })).not.toBe(base);
  });

  it('treats language codes case-insensitively', () => {
    expect(key('猫', { source: 'JA', target: 'EN' })).toBe(key('猫'));
  });
});

describe('TranslateResultCache', () => {
  it('returns copies, so a caller mutating a hit cannot corrupt the cache', () => {
    const cache = new TranslateResultCache();
    cache.set(key('猫'), entry('cat'));
    const hit = cache.get(key('猫'))!;
    hit.segments[0].target = 'dog';
    hit.meta.cached = true;
    expect(cache.get(key('猫'))).toEqual(entry('cat'));
  });

  it('evicts the least recently used entry past the entry cap', () => {
    const cache = new TranslateResultCache(2, 1_000_000);
    cache.set(key('一'), entry('one'));
    cache.set(key('二'), entry('two'));
    expect(cache.get(key('一'))?.text).toBe('one'); // touch: 二 is now the oldest
    cache.set(key('三'), entry('three'));
    expect(cache.size).toBe(2);
    expect(cache.get(key('二'))).toBeUndefined();
    expect(cache.get(key('一'))?.text).toBe('one');
  });

  it('stays under its character budget, and never keeps an entry larger than the budget', () => {
    const cache = new TranslateResultCache(100, 400);
    for (let i = 0; i < 10; i++) cache.set(key(`文${i}`), entry('x'.repeat(60)));
    expect(cache.totalChars).toBeLessThanOrEqual(400);
    expect(cache.size).toBeGreaterThan(0);
    cache.set(key('巨大'), entry('y'.repeat(1_000)));
    expect(cache.get(key('巨大'))).toBeUndefined();
  });

  it('replaces an entry in place without double-counting it', () => {
    const cache = new TranslateResultCache();
    cache.set(key('猫'), entry('cat'));
    const before = cache.totalChars;
    cache.set(key('猫'), entry('cat'));
    expect(cache.totalChars).toBe(before);
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.totalChars).toBe(0);
  });
});
