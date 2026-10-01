import { describe, expect, it } from 'vitest';
import {
  GROUP_OPTIONS,
  SCRAPER_COLUMNS,
  columnById,
  columnLabel,
  gridTemplate,
  minTrackWidth,
  groupLabelFor,
  resolveColumns,
  rowMatches,
  sortRows,
  sortedResolutions,
} from '../components/scraper/result/columns';
import { bestSubtitle, type EpisodeRow } from '../../shared/scraperResults';
import { SCRAPER_COLUMN_IDS } from '../../shared/scraperShell';

function row(over: Partial<EpisodeRow> = {}): EpisodeRow {
  return {
    id: 'e1',
    seriesId: 'one-piece',
    number: 1,
    numberLabel: '第1話',
    season: 1,
    titleEn: 'Romance Dawn',
    titleJa: '冒険の夜明け',
    kind: 'episode',
    audio: 'sub',
    resolution: '1080p',
    sourceId: 'streamsb',
    sourceLabel: 'StreamSB',
    sizeBytes: 700 * 1024 * 1024,
    durationSec: 1_440,
    airDate: null,
    url: '/ep-1',
    thumbnailUrl: '',
    subtitles: [],
    status: 'ok',
    statusNote: '',
    ...over,
  };
}

describe('table columns', () => {
  it('declares a column for every id the shell can persist', () => {
    // A stored column id with no definition would silently vanish from the
    // table instead of erroring.
    const declared = new Set(SCRAPER_COLUMNS.map((c) => c.id));
    for (const id of SCRAPER_COLUMN_IDS) {
      expect(declared.has(id), id).toBe(true);
    }
  });

  it('keeps locked columns visible even when the user hides everything', () => {
    const resolved = resolveColumns([], [...SCRAPER_COLUMN_IDS]);
    const ids = resolved.map((c) => c.id);
    expect(ids).toContain('index');
    expect(ids).toContain('title');
    expect(ids).toContain('link');
  });

  it('renders columns in the user’s saved order', () => {
    const resolved = resolveColumns(['size', 'source'], ['size', 'title', 'source', 'index', 'select', 'link']);
    expect(resolved.map((c) => c.id)).toEqual(['size', 'title', 'source', 'index', 'select', 'link']);
  });

  it('drops an unknown id from the order without breaking the rest', () => {
    const resolved = resolveColumns(['size'], ['ghost' as never, 'title', 'size']);
    expect(resolved.map((c) => c.id)).toEqual(['title', 'size']);
  });

  it('builds one grid track list, which is what keeps header and rows aligned', () => {
    const resolved = resolveColumns(['size'], [...SCRAPER_COLUMN_IDS]);
    const template = gridTemplate(resolved);
    expect(template.split(' ').length).toBeGreaterThanOrEqual(resolved.length);
    expect(template).toContain('34px');
  });

  it('floors the table at its tracks, so a narrow card scrolls instead of clipping columns', () => {
    const resolved = resolveColumns(['size'], [...SCRAPER_COLUMN_IDS]);
    const floor = minTrackWidth(resolved);
    // Every fixed track counts in full and a minmax track by its floor: never less than the
    // fixed widths alone, and title's 220px floor is in it.
    const fixed = resolved
      .map((c) => /^(\d+)px$/.exec(c.track)?.[1])
      .filter(Boolean)
      .reduce((sum, n) => sum + Number(n), 0);
    expect(floor).toBeGreaterThanOrEqual(fixed + 220);
    expect(minTrackWidth([{ id: 'title', labelKey: '', track: '1fr' } as never])).toBe(0);
    expect(minTrackWidth([{ id: 'title', labelKey: '', track: 'minmax(90px, 0.7fr)' } as never])).toBe(90);
  });

  it('resolves a column by id', () => {
    expect(columnLabel(columnById('size')!)).toBe('Size');
    expect(columnById('ghost' as never)).toBeUndefined();
  });
});

describe('rowMatches', () => {
  const r = row();

  it('matches everything on an empty query', () => {
    expect(rowMatches(r, '   ')).toBe(true);
  });

  it('matches the English title, case-insensitively', () => {
    expect(rowMatches(r, 'romance')).toBe(true);
    expect(rowMatches(r, 'ROMANCE')).toBe(true);
  });

  it('matches the Japanese title without lowercasing it', () => {
    // Lowercasing Japanese is a no-op but the comparison must still work.
    expect(rowMatches(r, '冒険')).toBe(true);
  });

  it('matches an exact episode number', () => {
    expect(rowMatches(row({ number: 42 }), '42')).toBe(true);
    expect(rowMatches(row({ number: 42 }), '4')).toBe(false);
  });

  it('matches source and resolution', () => {
    expect(rowMatches(r, 'streamsb')).toBe(true);
    expect(rowMatches(r, '1080')).toBe(true);
  });

  it('rejects a miss', () => {
    expect(rowMatches(r, 'frieren')).toBe(false);
  });
});

describe('sortRows', () => {
  const rows = [row({ id: 'b', number: 10 }), row({ id: 'a', number: 2 }), row({ id: 'c', number: 1 })];

  it('sorts numerically, so 2 comes before 10', () => {
    expect(sortRows(rows, 'index', 'asc').map((r) => r.number)).toEqual([1, 2, 10]);
    expect(sortRows(rows, 'index', 'desc').map((r) => r.number)).toEqual([10, 2, 1]);
  });

  it('does not mutate the caller’s array', () => {
    const before = rows.map((r) => r.id);
    sortRows(rows, 'index', 'desc');
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it('leaves rows alone for a column with no sort key', () => {
    expect(sortRows(rows, 'link', 'asc').map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts text naturally', () => {
    const texts = [row({ titleEn: 'Episode 10' }), row({ titleEn: 'Episode 2' })];
    expect(sortRows(texts, 'title', 'asc').map((r) => r.titleEn)).toEqual(['Episode 2', 'Episode 10']);
  });
});

describe('grouping', () => {
  it('offers a no-grouping option first', () => {
    expect(GROUP_OPTIONS[0].value).toBe('');
  });

  it('labels a row for each grouping key', () => {
    const r = row({ season: 3, kind: 'ova' });
    expect(groupLabelFor(r, 'season')).toBe('Season 3');
    expect(groupLabelFor(r, 'type')).toBe('OVA');
    expect(groupLabelFor(r, 'source')).toBe('StreamSB');
    expect(groupLabelFor(r, 'resolution')).toBe('1080p');
    expect(groupLabelFor(r, '')).toBe('');
  });
});

describe('bestSubtitle', () => {
  const ja = { language: 'ja', format: 'srt' as const, embedded: false, quality: 0.8, source: 'x' };
  const jaBetter = { ...ja, quality: 0.95 };
  const en = { language: 'en', format: 'ass' as const, embedded: true, quality: 0.99, source: 'y' };

  it('prefers the first language in the priority list, not the highest quality', () => {
    // The point of the preference order: a perfect English track must not beat
    // a good Japanese one for a learner studying Japanese.
    expect(bestSubtitle([en, ja], ['ja', 'en'])?.language).toBe('ja');
  });

  it('picks the best track within the preferred language', () => {
    expect(bestSubtitle([ja, jaBetter], ['ja'])?.quality).toBe(0.95);
  });

  it('falls back to the best available when no preferred language exists', () => {
    expect(bestSubtitle([en], ['ja'])?.language).toBe('en');
  });

  it('returns null when there is nothing at all', () => {
    expect(bestSubtitle([], ['ja'])).toBeNull();
  });
});

describe('resolution ordering', () => {
  it('lists filter options by pixel height, not text order', () => {
    expect(sortedResolutions(['720p', '1080p', '480p', '2160p', '720p'])).toEqual(['2160p', '1080p', '720p', '480p']);
  });
});
