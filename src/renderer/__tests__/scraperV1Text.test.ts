// @vitest-environment jsdom
/**
 * v1: the scraper sentences main writes in English (send-report reasons, job
 * failures, job notes, row validation notes, the site-rule provider label)
 * reach the screen in the UI language, and the subtitle badge says nothing in
 * raw English.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  localizeScraperJobNote,
  localizeScraperProvider,
  localizeScraperRowNote,
  qbitSendOutcomeText,
  qbitSendReasonText,
  scraperErrorText,
} from '../components/scraper/localize';
import { SubtitleBadge } from '../components/scraper/result/Pill';
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

const ENGLISH = 'ENGLISH FROM MAIN';

describe('send report', () => {
  const coded: Array<{ reasonCode: string; reasonVars?: Record<string, string | number> }> = [
    { reasonCode: 'send.noMagnet' },
    { reasonCode: 'send.noSeeders' },
    { reasonCode: 'send.notAccepted' },
    { reasonCode: 'send.already' },
    { reasonCode: 'send.failed' },
    { reasonCode: 'send.answered', reasonVars: { status: 409 } },
    { reasonCode: 'send.partial', reasonVars: { accepted: 1, total: 3, refused: 2 } },
    { reasonCode: 'qbit.disabled' },
    { reasonCode: 'qbit.unreachable', reasonVars: { address: '127.0.0.1:8080' } },
    { reasonCode: 'torrentFile.not-bencode' },
  ];

  it('English reads the code, not main’s sentence', async () => {
    expect(qbitSendReasonText({ reason: ENGLISH, reasonCode: 'send.answered', reasonVars: { status: 409 } }))
      .toBe('qBittorrent answered 409.');
    expect(qbitSendOutcomeText('skipped')).toBe('Skipped');
  });

  it.each(['ru', 'ja', 'zh'] as const)('every reason and outcome is worded in %s', async (code) => {
    await lang(code);
    for (const detail of coded) {
      const text = qbitSendReasonText({ reason: ENGLISH, ...detail });
      expect(text, detail.reasonCode).not.toBe(ENGLISH);
      expect(text).not.toMatch(/\{\w+\}|scraperFix\.|scr2\./);
    }
    for (const outcome of ['sent', 'skipped', 'failed'] as const) {
      expect(qbitSendOutcomeText(outcome)).not.toMatch(/^(sent|skipped|failed|Sent|Skipped|Failed)$/);
    }
  });

  it('an uncoded or unknown reason keeps main’s text rather than showing a key', () => {
    expect(qbitSendReasonText({ reason: ENGLISH })).toBe(ENGLISH);
    expect(qbitSendReasonText({ reason: ENGLISH, reasonCode: 'send.fromTheFuture' })).toBe(ENGLISH);
  });
});

describe('job failures', () => {
  it('a coded failure is shown from its key', async () => {
    expect(scraperErrorText({ message: ENGLISH, code: 'noCatalogueMatch', vars: { query: 'frieren' } }))
      .toBe('Nothing in the catalogue matches "frieren".');
    await lang('ja');
    const ja = scraperErrorText({ message: ENGLISH, code: 'ruleInvalid', vars: { host: 'example.test' } });
    expect(ja).toContain('example.test');
    expect(ja).not.toBe(ENGLISH);
  });

  it('an unknown code falls back to the message path', () => {
    expect(scraperErrorText({ message: 'There is nothing to search for.', code: 'nope' }))
      .toBe('There is nothing to search for. Enter a URL or a title.');
  });
});

describe('job notes, row notes and the provider label', () => {
  const note = 'Partial episode list: page 2 of the catalogue failed to load. '
    + 'Episode list is short: 3 of 28. 5 index result(s). 1 playable stream(s).';

  it('English reads naturally', () => {
    expect(localizeScraperJobNote(note)).toBe(
      'Partial episode list: page 2 of the catalogue failed to load. '
      + 'The episode list is short: 3 of 28 episodes. 5 index results. 1 playable stream.',
    );
  });

  it.each(['ru', 'ja', 'zh'] as const)('no English sentence survives in %s', async (code) => {
    await lang(code);
    const text = localizeScraperJobNote(note);
    expect(text).not.toMatch(/Partial|short|index result|playable/);
    expect(localizeScraperRowNote('Placeholder title. No subtitles found.')).not.toMatch(/Placeholder|subtitles/);
    expect(localizeScraperProvider('Site rule · example.test')).toContain('example.test');
    expect(localizeScraperProvider('Site rule · example.test')).not.toContain('Site rule');
    // A catalogue's own name is a name and stays as it is.
    expect(localizeScraperProvider('MyAnimeList (Jikan)')).toBe('MyAnimeList (Jikan)');
  });
});

describe('subtitle badge', () => {
  it.each(['ru', 'ja', 'zh'] as const)('has no raw English in %s', async (code) => {
    await lang(code);
    const none = renderToStaticMarkup(createElement(SubtitleBadge, { subtitles: [], languagePriority: ['ja'] }));
    expect(none).not.toMatch(/none|No subtitles/);
    const other = renderToStaticMarkup(createElement(SubtitleBadge, {
      subtitles: [{ language: 'en', format: 'ass', embedded: true, quality: 0.5, source: 'Nyaa' }],
      languagePriority: ['ja'],
    }));
    expect(other).toContain('EN ASS');
    expect(other).not.toMatch(/embedded|preferred language/);
  });
});
