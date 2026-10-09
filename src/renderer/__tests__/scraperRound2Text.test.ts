// @vitest-environment jsdom
/**
 * The Scraper's round-2 sentences in the UI language: qBittorrent's new codes
 * (transport, back-off, API key) and the job note for site-rule pages that
 * could not be read.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { sxQbitMessage } from '../components/scraper/strings';
import { localizeScraperJobNote } from '../components/scraper/localize';
import { setUiLang } from '../i18n';
import { ensureCatalog } from '../../shared/i18n/catalogs';

async function lang(code: 'en' | 'ru' | 'ja' | 'zh'): Promise<void> {
  await ensureCatalog(code);
  setUiLang(code);
  await new Promise((r) => setTimeout(r, 0));
}

afterEach(async () => {
  await lang('en');
});

describe('qBittorrent codes', () => {
  const codes: Array<[string, Record<string, string | number>]> = [
    ['unreachable', { address: '127.0.0.1:8080' }],
    ['hostUnresolved', { host: 'nas.local' }],
    ['timeout', { address: '127.0.0.1:8080' }],
    ['transport', { address: '127.0.0.1:8080', detail: 'socket hang up' }],
    ['loginBackoff', { seconds: 30 }],
    ['noApiKey', {}],
    ['apiKeyWhitespace', {}],
    ['apiKeyControlChar', {}],
  ];

  it.each(['ru', 'ja', 'zh'] as const)('every new code is worded in %s, never main\'s English', async (code) => {
    await lang(code);
    for (const [messageCode, messageVars] of codes) {
      const text = sxQbitMessage({ message: 'ENGLISH FROM MAIN', messageCode, messageVars });
      expect(text, messageCode).not.toBe('ENGLISH FROM MAIN');
      expect(text).not.toMatch(/\{\w+\}|scraperFix\./);
      for (const value of Object.values(messageVars)) expect(text).toContain(String(value));
    }
  });
});

describe('site-rule page failures in the job note', () => {
  // Exactly what `engine.ts` `pageFailuresNote` writes (pinned there by the E2E probe).
  const note = 'Some rule checks did not pass. Could not read page 2 (HTTP 503); the episode list may be incomplete. '
    + 'Missing episode numbers: 7.';

  it('the renderer words it in the UI language, beside the other note sentences', async () => {
    await lang('ru');
    const text = localizeScraperJobNote(note);
    expect(text).toContain('страница 2 (HTTP 503)');
    expect(text).toContain('список эпизодов может быть неполным');
    expect(text).not.toMatch(/Could not read|page 2/);
  });
});
