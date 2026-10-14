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
    })).toBe('3 torrents sent to Seanime debrid.');
    expect(sxAcquisitionMessage({
      message: 'x',
      messageCode: 'sentDebrid',
      messageVars: { count: 1 },
    })).toBe('1 torrent sent to Seanime debrid.');
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

describe('v1: scraper text main writes in English reaches the screen translated', () => {
  it('names every send-report reason code main can write, in all four languages', async () => {
    const qbitSource = (await import('node:fs')).readFileSync(
      (await import('node:path')).join(__dirname, '..', '..', 'main', 'scraper', 'qbittorrent.ts'),
      'utf8',
    );
    const codes = [...qbitSource.matchAll(/reasonCode: '(send\.[a-zA-Z]+)'/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThanOrEqual(7);
    for (const code of new Set(codes)) {
      const key = `scraperFix.${code}`;
      for (const catalog of [SCRAPER_FIX_EN, SCRAPER_FIX_JA, SCRAPER_FIX_ZH, SCRAPER_FIX_RU]) {
        expect(catalog[key], key).toBeTruthy();
      }
    }
  });

  it('has a key for every job failure code the engine throws', async () => {
    const engine = (await import('node:fs')).readFileSync(
      (await import('node:path')).join(__dirname, '..', '..', 'main', 'scraper', 'engine.ts'),
      'utf8',
    );
    const codes = [...engine.matchAll(/new ScraperJobError\(\s*'([a-zA-Z]+)'/g)].map((m) => m[1]);
    codes.push('validationFailed');
    expect(codes.length).toBeGreaterThanOrEqual(7);
    for (const code of codes) {
      for (const catalog of [SCRAPER_FIX_EN, SCRAPER_FIX_JA, SCRAPER_FIX_ZH, SCRAPER_FIX_RU]) {
        expect(catalog[`scraperFix.ui.err.${code}`], code).toBeTruthy();
      }
    }
  });

  it('no ja/zh/ru value among the new keys is left in English', () => {
    const fresh = Object.keys(SCRAPER_FIX_EN).filter((key) =>
      key.startsWith('scraperFix.send.') || key.startsWith('scraperFix.ui.problem.')
      || key.startsWith('scraperFix.ui.subs.') || key.startsWith('scraperFix.ui.note.'));
    expect(fresh.length).toBeGreaterThan(15);
    for (const key of fresh) {
      for (const catalog of [SCRAPER_FIX_JA, SCRAPER_FIX_ZH, SCRAPER_FIX_RU]) {
        expect(JSON.stringify(catalog[key]), key).not.toBe(JSON.stringify(SCRAPER_FIX_EN[key]));
      }
    }
  });
});
