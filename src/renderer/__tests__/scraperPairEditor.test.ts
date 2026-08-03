import { describe, expect, it } from 'vitest';
import {
  cookieHeaderToPairs,
  headerRecordToPairs,
  pairsToCookieHeader,
  pairsToHeaderRecord,
} from '../components/scraper/settings/pairEditor';

describe('scraper settings pair editor', () => {
  it('round-trips request headers', () => {
    const pairs = headerRecordToPairs({
      Referer: 'https://example.test/',
      'Accept-Language': 'ja,en;q=0.8',
    });

    expect(pairsToHeaderRecord(pairs)).toEqual({
      Referer: 'https://example.test/',
      'Accept-Language': 'ja,en;q=0.8',
    });
  });

  it('keeps equals signs inside cookie values', () => {
    const pairs = cookieHeaderToPairs('session=abc==; locale=ja');

    expect(pairs).toMatchObject([
      { key: 'session', value: 'abc==' },
      { key: 'locale', value: 'ja' },
    ]);
    expect(pairsToCookieHeader(pairs)).toBe('session=abc==; locale=ja');
  });

  it('drops blank keys and lets the last duplicate header win', () => {
    expect(pairsToHeaderRecord([
      { id: '1', key: '', value: 'ignored' },
      { id: '2', key: 'Referer', value: 'first' },
      { id: '3', key: 'Referer', value: 'second' },
    ])).toEqual({ Referer: 'second' });
  });
});
