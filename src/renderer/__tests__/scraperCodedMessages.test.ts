import { describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({ getUiLang: () => 'en' }));

import { sxAcquisitionMessage, sxQbitMessage } from '../components/scraper/strings';
import { SCRAPER_FIX_EN } from '../../shared/i18n/scraperFix/en';
import { SCRAPER_FIX_JA } from '../../shared/i18n/scraperFix/ja';
import { SCRAPER_FIX_RU } from '../../shared/i18n/scraperFix/ru';
import { SCRAPER_FIX_ZH } from '../../shared/i18n/scraperFix/zh';

describe('coded scraper messages from main', () => {
  it('translates a qBittorrent test code with its variables', () => {
    expect(sxQbitMessage({
      message: 'english from main',
      messageCode: 'connected',
      messageVars: { address: 'localhost:8080' },
    })).toBe('Connected to localhost:8080.');
    expect(sxQbitMessage({
      message: 'english from main',
      messageCode: 'loginStatus',
      messageVars: { status: 502 },
    })).toBe('qBittorrent answered 502 to the login.');
  });

  it("keeps main's message when there is no code or the code is unknown", () => {
    expect(sxQbitMessage({ message: 'Connection refused.' })).toBe('Connection refused.');
    expect(sxQbitMessage({ message: 'raw', messageCode: 'nope' })).toBe('raw');
  });

  it('translates acquisition notices', () => {
    expect(sxAcquisitionMessage({
      message: 'x',
      messageCode: 'sentDebrid',
      messageVars: { count: 3 },
    })).toBe('3 torrent(s) sent to Seanime debrid.');
    expect(sxAcquisitionMessage({ message: 'sidecar down' })).toBe('sidecar down');
  });

  it('carries every qbit and acq key in all four languages', () => {
    const keys = Object.keys(SCRAPER_FIX_EN).filter((k) => /^scraperFix\.(qbit|acq)\./.test(k));
    expect(keys.length).toBeGreaterThanOrEqual(24);
    for (const catalog of [SCRAPER_FIX_JA, SCRAPER_FIX_ZH, SCRAPER_FIX_RU]) {
      for (const key of keys) expect(catalog[key], key).toBeTruthy();
    }
  });
});
