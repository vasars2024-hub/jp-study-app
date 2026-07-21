import { describe, expect, it } from 'vitest';
import {
  buildInboxMetaBase,
  charCount,
  checkBearerToken,
  contentHash,
  detectInboxLang,
  estReadingMinutes,
  isAllowedExtensionOrigin,
  levelFromKnownRatio,
  normalizeInboxText,
} from '../inboxMeta';

describe('inboxMeta', () => {
  it('detects JA / ZH / EN heuristically', () => {
    expect(detectInboxLang('これは日本語のテストです。')).toBe('ja');
    expect(detectInboxLang('这是一段中文测试文字没有假名')).toBe('zh');
    expect(detectInboxLang('This is plain English text.')).toBe('en');
  });

  it('hashes normalized text stably', () => {
    expect(contentHash('hello   world')).toBe(contentHash('hello world'));
    expect(contentHash('a')).not.toBe(contentHash('b'));
  });

  it('estimates reading time', () => {
    expect(estReadingMinutes('', 'ja')).toBe(0);
    expect(estReadingMinutes('あ'.repeat(400), 'ja')).toBe(1);
    expect(estReadingMinutes('字'.repeat(400), 'zh')).toBe(2);
  });

  it('maps known ratio to level bands', () => {
    expect(levelFromKnownRatio(0.96)).toBe(1);
    expect(levelFromKnownRatio(0.5)).toBe(6);
    expect(levelFromKnownRatio(0.1)).toBe(7);
  });

  it('builds base meta with sample', () => {
    const meta = buildInboxMetaBase({
      sourceUrl: 'https://syosetu.com/n1234/1/',
      text: 'こんにちは世界',
    });
    expect(meta.lang).toBe('ja');
    expect(meta.charCount).toBe(charCount('こんにちは世界'));
    expect(meta.contentHash).toHaveLength(16);
    expect(meta.textSample).toContain('こんにちは');
    expect(meta.levelEstimate).toBeNull();
  });

  it('validates bearer tokens and extension origins', () => {
    expect(checkBearerToken('Bearer abc', 'abc')).toBe(true);
    expect(checkBearerToken('Bearer xyz', 'abc')).toBe(false);
    expect(checkBearerToken(undefined, 'abc')).toBe(false);
    expect(isAllowedExtensionOrigin('chrome-extension://abcdef')).toBe(true);
    expect(isAllowedExtensionOrigin('https://evil.example')).toBe(false);
    expect(isAllowedExtensionOrigin(undefined)).toBe(true);
  });

  it('normalizes whitespace', () => {
    expect(normalizeInboxText('  a \n\n b  ')).toBe('a b');
  });
});
