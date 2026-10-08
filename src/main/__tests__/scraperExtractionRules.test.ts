// @vitest-environment node
//
// The Extraction settings group's text and numbering toggles.
//
// Pure functions and a pure row pass, so this is a unit test by nature. What it
// has to establish beyond "the transformation works" is the other half: that
// each toggle is genuinely read, and that turning it off leaves the row exactly
// as it arrived. A settings group whose "off" position also changes the data
// would be worse than one that was never wired.

import { describe, expect, it, vi } from 'vitest';
import { DOMParser } from 'linkedom';
import type { EpisodeRow } from '../../shared/scraperResults';
import {
  createDefaultScraperSettingsDocument,
  resolveScraperSettings,
  type ScraperExtractionSettings,
} from '../../shared/scraperSettings';
import {
  DEFAULT_SITE_RULE,
  extractWithRule,
  isHiddenElement,
  type RuleDocument,
} from '../../shared/scraperSiteRules';

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/gum-vitest-userdata`, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const {
  applyExtractionSettings,
  cleanExtractedText,
  decodeHtmlEntities,
  normalizeEpisodeNumbering,
  seasonFromTitle,
  specialKindFromTitle,
} = await import('../scraper/extractionRules');

function extraction(patch: Partial<ScraperExtractionSettings> = {}): ScraperExtractionSettings {
  const base = resolveScraperSettings(createDefaultScraperSettingsDocument()).extraction;
  return { ...base, ...patch };
}

/** Everything off — the baseline a "does this toggle do anything?" test needs. */
const NOTHING_ON = extraction({
  cleanText: false,
  decodeHtmlEntities: false,
  removeDuplicateEpisodes: false,
  normalizeEpisodeNumbering: false,
  detectSeasonNumbers: false,
  detectSpecials: false,
});

function row(over: Partial<EpisodeRow> = {}): EpisodeRow {
  return {
    id: 'series-e1',
    seriesId: 'series',
    number: 1,
    numberLabel: 'EP 01',
    season: 1,
    titleEn: 'The Journey’s End',
    titleJa: '',
    kind: 'episode',
    audio: 'sub',
    resolution: '1080p',
    sourceId: 'catalogue',
    sourceLabel: 'Test',
    sizeBytes: 0,
    durationSec: 1_400,
    airDate: '2023-09-29',
    url: 'https://example.test/1',
    thumbnailUrl: '',
    subtitles: [],
    status: 'pending',
    statusNote: '',
    ...over,
  };
}

// ------------------------------------------------- extraction.ignoreHidden ---

const PAGE_WITH_HIDDEN = `<!doctype html><html><body>
<table><tbody>
  <tr class="ep"><td class="title">Visible one</td></tr>
  <tr class="ep" hidden><td class="title">Template row</td></tr>
  <tr class="ep" style="display:none"><td class="title">Mobile clone</td></tr>
  <tr class="ep" aria-hidden="true"><td class="title">Aria hidden</td></tr>
  <tr class="ep sr-only"><td class="title">Screen-reader only</td></tr>
  <tr class="ep"><td class="title">Visible two</td></tr>
</tbody></table></body></html>`;

const HIDDEN_RULE = {
  ...DEFAULT_SITE_RULE,
  id: 'hidden-fixture',
  host: 'example.test',
  sampleUrl: 'https://example.test/eps',
  episodeSelector: 'tr.ep',
  titleSelector: '.title',
  enabled: true,
};

const parse = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html') as unknown as RuleDocument;

describe('isHiddenElement', () => {
  it.each([
    ['<i hidden></i>', true],
    ['<i style="display:none"></i>', true],
    ['<i style="VISIBILITY: HIDDEN"></i>', true],
    ['<i aria-hidden="true"></i>', true],
    ['<i class="row sr-only"></i>', true],
    ['<i class="hiddenish"></i>', false],
    ['<i aria-hidden="false"></i>', false],
    ['<i style="display:block"></i>', false],
    ['<i></i>', false],
  ])('reads %s as hidden=%s', (html, expected) => {
    const doc = parse(`<html><body>${html}</body></html>`);
    expect(isHiddenElement(doc.querySelectorAll('i')[0])).toBe(expected);
  });
});

describe('extraction.ignoreHiddenElements', () => {
  it('keeps every matched row when the setting is off', () => {
    const out = extractWithRule(parse(PAGE_WITH_HIDDEN), HIDDEN_RULE);
    expect(out.rows).toHaveLength(6);
  });

  it('skips template rows, mobile clones and aria-hidden duplicates when on', () => {
    const out = extractWithRule(parse(PAGE_WITH_HIDDEN), HIDDEN_RULE, HIDDEN_RULE.sampleUrl, {
      ignoreHiddenElements: true,
    });
    expect(out.rows.map((r) => r.title)).toEqual(['Visible one', 'Visible two']);
  });

  it('numbers the kept rows consecutively, leaving no hole where a row was dropped', () => {
    const out = extractWithRule(parse(PAGE_WITH_HIDDEN), HIDDEN_RULE, HIDDEN_RULE.sampleUrl, {
      ignoreHiddenElements: true,
    });
    expect(out.rows.map((r) => r.index)).toEqual([1, 2]);
  });

  it('says in the report how many rows it skipped', () => {
    const out = extractWithRule(parse(PAGE_WITH_HIDDEN), HIDDEN_RULE, HIDDEN_RULE.sampleUrl, {
      ignoreHiddenElements: true,
    });
    expect(out.checks.find((c) => c.id === 'rows-found')?.detail)
      .toBe('2 row(s), 4 hidden row(s) skipped');
  });

  it('says nothing about hidden rows when there were none', () => {
    const out = extractWithRule(
      parse('<html><body><tr class="ep"><td class="title">Only</td></tr></body></html>'),
      HIDDEN_RULE,
      HIDDEN_RULE.sampleUrl,
      { ignoreHiddenElements: true },
    );
    expect(out.checks.find((c) => c.id === 'rows-found')?.detail).toBe('1 row(s)');
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes the references episode titles actually carry', () => {
    expect(decodeHtmlEntities('Fri&amp;ren &ndash; It&rsquo;s Magic')).toBe('Fri&ren – It’s Magic');
    expect(decodeHtmlEntities('Episode&nbsp;3')).toBe('Episode 3');
  });

  it('decodes decimal and hex numeric references', () => {
    expect(decodeHtmlEntities('&#26085;&#x672c;')).toBe('日本');
  });

  it('leaves an unknown or malformed reference exactly as written', () => {
    expect(decodeHtmlEntities('&notarealentity; &#xZZ; 100% &')).toBe('&notarealentity; &#xZZ; 100% &');
  });

  it('does not decode a lone surrogate into a broken string', () => {
    expect(decodeHtmlEntities('&#xD800;')).toBe('&#xD800;');
  });
});

describe('cleanExtractedText', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanExtractedText('  The   Journey’s\n\tEnd  ')).toBe('The Journey’s End');
  });

  it('removes zero-width characters that make equal titles compare unequal', () => {
    const withZeroWidth = 'Killing​Magic﻿';
    expect(withZeroWidth).not.toBe('KillingMagic');
    expect(cleanExtractedText(withZeroWidth)).toBe('KillingMagic');
  });

  it('folds non-breaking and ideographic spaces to a plain space', () => {
    expect(cleanExtractedText('Episode 3　1')).toBe('Episode 3 1');
  });
});

describe('normalizeEpisodeNumbering', () => {
  it.each([
    ['Episode 3 - Killing Magic', 3, 'Killing Magic'],
    ['EP 01 — The Journey', 1, 'The Journey'],
    ['#12: Aura the Guillotine', 12, 'Aura the Guillotine'],
    ['第3話 「魔法を殺す者」', 3, '「魔法を殺す者」'],
    ['E07. Somewhere', 7, 'Somewhere'],
    ['Episode 12.5', 12.5, 'Episode 12.5'],
  ])('reads %s as %d / %s', (title, number, rest) => {
    const result = normalizeEpisodeNumbering(title);
    expect(result.number).toBe(number);
    expect(result.title).toBe(rest);
  });

  it('does not treat a mid-sentence mention as a marker', () => {
    expect(normalizeEpisodeNumbering('The Village at Episode 3')).toEqual({
      number: null,
      title: 'The Village at Episode 3',
    });
  });

  it('keeps the original when stripping would leave nothing', () => {
    expect(normalizeEpisodeNumbering('Episode 3').title).toBe('Episode 3');
  });
});

describe('seasonFromTitle', () => {
  it.each([
    ['Frieren Season 2 - Episode 1', 2],
    ['Show S03E04', 3],
    ['進撃の巨人 第4期', 4],
    ['Bocchi 2nd Season', 2],
  ])('reads %s as season %d', (title, season) => {
    expect(seasonFromTitle(title)).toBe(season);
  });

  it('is null when the title says nothing about a season', () => {
    expect(seasonFromTitle('Killing Magic')).toBeNull();
  });
});

describe('specialKindFromTitle', () => {
  it.each([
    ['Frieren OVA', 'ova'],
    ['Something ONA', 'ona'],
    ['Season 1 Recap', 'recap'],
    ['総集編', 'recap'],
    ['The Movie', 'movie'],
    ['Special: Beach Episode', 'special'],
    ['Teaser Trailer', 'trailer'],
  ] as const)('reads %s as %s', (title, kind) => {
    expect(specialKindFromTitle(title)).toBe(kind);
  });

  it('prefers the more specific kind', () => {
    expect(specialKindFromTitle('OVA Special')).toBe('ova');
  });

  it('is null for an ordinary episode title', () => {
    expect(specialKindFromTitle('Killing Magic')).toBeNull();
  });
});

describe('applyExtractionSettings', () => {
  it('leaves every row untouched when every toggle is off', () => {
    const rows = [row({ titleEn: '  Episode 3 &amp; Friends  ', number: 0, season: 1 })];
    expect(applyExtractionSettings(rows, NOTHING_ON)).toEqual(rows);
  });

  it('decodes entities only when Decode HTML Entities is on', () => {
    const rows = [row({ titleEn: 'Fri&amp;ren' })];
    expect(applyExtractionSettings(rows, { ...NOTHING_ON, decodeHtmlEntities: true })[0].titleEn)
      .toBe('Fri&ren');
    expect(applyExtractionSettings(rows, NOTHING_ON)[0].titleEn).toBe('Fri&amp;ren');
  });

  it('cleans the Japanese title too', () => {
    const rows = [row({ titleJa: '  魔法​使い  ' })];
    expect(applyExtractionSettings(rows, { ...NOTHING_ON, cleanText: true })[0].titleJa)
      .toBe('魔法使い');
  });

  it('strips a leading marker and canonicalises the label when normalising', () => {
    const rows = [row({ titleEn: 'Episode 3 - Killing Magic', number: 3, numberLabel: '3' })];
    const [normalized] = applyExtractionSettings(rows, {
      ...NOTHING_ON,
      normalizeEpisodeNumbering: true,
    });
    expect(normalized.titleEn).toBe('Killing Magic');
    expect(normalized.numberLabel).toBe('EP 03');
  });

  it('adopts the title marker only when the row has no number of its own', () => {
    const withNumber = applyExtractionSettings(
      [row({ titleEn: 'Episode 3 - Killing Magic', number: 11 })],
      { ...NOTHING_ON, normalizeEpisodeNumbering: true },
    );
    // The catalogue said 11; a number scraped out of the title does not overrule it.
    expect(withNumber[0].number).toBe(11);

    const without = applyExtractionSettings(
      [row({ titleEn: 'Episode 3 - Killing Magic', number: 0 })],
      { ...NOTHING_ON, normalizeEpisodeNumbering: true },
    );
    expect(without[0].number).toBe(3);
  });

  it('reads the season from the title as it arrived, before the marker is stripped', () => {
    const [detected] = applyExtractionSettings(
      [row({ titleEn: 'Episode 1 - Season 2 Premiere', season: 1 })],
      { ...NOTHING_ON, normalizeEpisodeNumbering: true, detectSeasonNumbers: true },
    );
    expect(detected.season).toBe(2);
    expect(detected.titleEn).toBe('Season 2 Premiere');
  });

  it('re-classifies a special the catalogue called an episode', () => {
    const [detected] = applyExtractionSettings(
      [row({ titleEn: 'Frieren OVA', kind: 'episode' })],
      { ...NOTHING_ON, detectSpecials: true },
    );
    expect(detected.kind).toBe('ova');
  });

  it('never downgrades a kind the catalogue already knew', () => {
    const [kept] = applyExtractionSettings(
      [row({ titleEn: 'Killing Magic', kind: 'recap' })],
      { ...NOTHING_ON, detectSpecials: true },
    );
    expect(kept.kind).toBe('recap');
  });

  it('drops a repeated episode number when asked to', () => {
    const rows = [
      row({ id: 'a', number: 1 }),
      row({ id: 'b', number: 1 }),
      row({ id: 'c', number: 2 }),
    ];
    const kept = applyExtractionSettings(rows, {
      ...NOTHING_ON,
      removeDuplicateEpisodes: true,
    });
    expect(kept.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('does not treat the same number in two seasons as a duplicate', () => {
    const rows = [row({ id: 'a', number: 1, season: 1 }), row({ id: 'b', number: 1, season: 2 })];
    expect(applyExtractionSettings(rows, { ...NOTHING_ON, removeDuplicateEpisodes: true }))
      .toHaveLength(2);
  });

  it('de-duplicates on the numbers normalisation produced, not the ones it started with', () => {
    const rows = [
      row({ id: 'a', titleEn: 'Episode 1 - First', number: 0 }),
      row({ id: 'b', titleEn: 'Ep 1: First again', number: 0 }),
    ];
    const kept = applyExtractionSettings(rows, {
      ...NOTHING_ON,
      normalizeEpisodeNumbering: true,
      removeDuplicateEpisodes: true,
    });
    expect(kept.map((r) => r.id)).toEqual(['a']);
  });
});
