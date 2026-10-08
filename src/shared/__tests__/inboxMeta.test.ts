import { describe, expect, it } from 'vitest';
import {
  buildInboxMetaBase,
  charCount,
  checkBearerToken,
  constantTimeEqual,
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

  it('rejects bearer tokens that differ only in length or in the last character', () => {
    expect(checkBearerToken('Bearer abc', 'abcd')).toBe(false);
    expect(checkBearerToken('Bearer abcd', 'abc')).toBe(false);
    expect(checkBearerToken('Bearer abd', 'abc')).toBe(false);
    expect(checkBearerToken('bearer   abc  ', 'abc')).toBe(true);
    expect(checkBearerToken('Bearer abc', '')).toBe(false);
    expect(checkBearerToken('Basic abc', 'abc')).toBe(false);
  });

  it('compares strings without an early exit', () => {
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual('token-123', 'token-123')).toBe(true);
    expect(constantTimeEqual('token-123', 'token-124')).toBe(false);
    expect(constantTimeEqual('xoken-123', 'token-123')).toBe(false);
    expect(constantTimeEqual('token', 'token-123')).toBe(false);
    expect(constantTimeEqual('token-123', 'token')).toBe(false);
    // A NUL past the shorter string must not be mistaken for "no character".
    expect(constantTimeEqual('ab', 'ab\u0000')).toBe(false);
    expect(constantTimeEqual('猫a', '猫a')).toBe(true);
    expect(constantTimeEqual('猫a', '猫b')).toBe(false);
  });

  it('checkBearerToken no longer uses a short-circuiting comparison', async () => {
    // Source guard: the comparison must go through constantTimeEqual.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../inboxMeta.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function checkBearerToken'));
    expect(body.slice(0, body.indexOf('\n}'))).toContain('constantTimeEqual(');
    expect(body.slice(0, body.indexOf('\n}'))).not.toMatch(/===\s*token/);
    // Renderer-safe: no Node crypto import in this shared module.
    expect(src).not.toMatch(/from 'node:crypto'|require\('crypto'\)/);
  });

  it('normalizes whitespace', () => {
    expect(normalizeInboxText('  a \n\n b  ')).toBe('a b');
  });
});
