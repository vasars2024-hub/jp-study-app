import { describe, expect, it } from 'vitest';
import {
  READING_WORKSPACE_ACTIONS,
  READING_WORKSPACE_ACTION_SPECS,
  groupReadingWorkspaceActions,
  readingWorkspaceActionApplies,
  readingWorkspaceActionSpec,
  resolveReadingWorkspaceActions,
  type ReadingWorkspaceActionId,
} from '../readingWorkspaceActions';
import {
  READING_WORKSPACE_SCHEMA_VERSION,
  type ReadingWorkspaceEntry,
} from '../readingWorkspace';
import { CATALOGS, en } from '../i18n/catalogs/all';
import { UI_LANGS } from '../i18n/core';

const EPUB_EDITION: NonNullable<ReadingWorkspaceEntry['edition']> = {
  editionId: 'book-1',
  workId: 'book-1',
  format: 'epub',
  origin: 'local',
  providerId: '',
  providerLabel: '',
  language: 'ja',
  coverRef: '',
  unitCount: 0,
};

function entry(patch: Partial<ReadingWorkspaceEntry> = {}): ReadingWorkspaceEntry {
  return {
    version: READING_WORKSPACE_SCHEMA_VERSION,
    key: 'library:book-1',
    itemId: 'book-1',
    work: {
      workId: 'book-1',
      title: 'Kimi no Na wa',
      titleNative: '君の名は。',
      contentType: 'novel',
      tags: [],
    },
    edition: EPUB_EDITION,
    source: { kind: 'local-library', id: 'library' },
    availability: 'readable',
    cover: { state: 'fallback', ref: null },
    progress: { value: null, percent: 0, updatedAt: 0, state: 'unstarted' },
    level: null,
    knownRatio: null,
    tags: [],
    ...patch,
  } as ReadingWorkspaceEntry;
}

const ALL: ReadingWorkspaceActionId[] = [...READING_WORKSPACE_ACTIONS];

describe('reading workspace action registry', () => {
  it('registers exactly the nine capabilities Track 4 names, once each', () => {
    expect(READING_WORKSPACE_ACTION_SPECS).toHaveLength(READING_WORKSPACE_ACTIONS.length);
    expect(READING_WORKSPACE_ACTION_SPECS.map((s) => s.id)).toEqual([...READING_WORKSPACE_ACTIONS]);
    expect(new Set(READING_WORKSPACE_ACTION_SPECS.map((s) => s.id)).size).toBe(9);
  });

  it('gives one capability one label and one icon', () => {
    // The whole point of the registry: the same action cannot be called two
    // things on two surfaces, because there is only one place the name lives.
    const labels = READING_WORKSPACE_ACTION_SPECS.map((s) => s.labelKey);
    const icons = READING_WORKSPACE_ACTION_SPECS.map((s) => s.icon);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('names exactly one primary action', () => {
    const primary = READING_WORKSPACE_ACTION_SPECS.filter((s) => s.primary);
    expect(primary.map((s) => s.id)).toEqual(['read']);
  });

  it('translates every action label in all four catalogs', () => {
    for (const spec of READING_WORKSPACE_ACTION_SPECS) {
      expect(en[spec.labelKey], `en missing ${spec.labelKey}`).toBeDefined();
      for (const lang of UI_LANGS) {
        expect(CATALOGS[lang][spec.labelKey], `${lang} missing ${spec.labelKey}`).toBeDefined();
      }
    }
  });

  it('throws on an id that is not in the registry', () => {
    expect(() => readingWorkspaceActionSpec('open' as ReadingWorkspaceActionId)).toThrow(
      /unknown reading workspace action/,
    );
    expect(readingWorkspaceActionSpec('mine').icon).toBe('flashcards');
  });
});

describe('readingWorkspaceActionApplies', () => {
  it('offers reading and mining for a local EPUB, and neither import nor extraction', () => {
    const local = entry();
    expect(readingWorkspaceActionApplies('read', local)).toBe(true);
    expect(readingWorkspaceActionApplies('mine', local)).toBe(true);
    expect(readingWorkspaceActionApplies('analyze', local)).toBe(true);
    expect(readingWorkspaceActionApplies('progress', local)).toBe(true);
    expect(readingWorkspaceActionApplies('import', local)).toBe(false);
    expect(readingWorkspaceActionApplies('extract', local)).toBe(false);
    expect(readingWorkspaceActionApplies('jitenVocabulary', local)).toBe(false);
  });

  it('refuses mining and analysis for a page-image series until it has text', () => {
    // A scanned manga has no token stream; mining it would run over nothing.
    const scanned = entry({
      edition: { ...EPUB_EDITION, format: 'image-series' },
      work: { ...entry().work, contentType: 'manga' },
    });
    expect(readingWorkspaceActionApplies('mine', scanned)).toBe(false);
    expect(readingWorkspaceActionApplies('analyze', scanned)).toBe(false);
    // …but it is still a book you can open and look up.
    expect(readingWorkspaceActionApplies('read', scanned)).toBe(true);
    expect(readingWorkspaceActionApplies('dictionary', scanned)).toBe(true);
  });

  it('offers import but not reading for something not held locally', () => {
    const remote = entry({ itemId: null, availability: 'importable' });
    expect(readingWorkspaceActionApplies('import', remote)).toBe(true);
    expect(readingWorkspaceActionApplies('read', remote)).toBe(false);
    expect(readingWorkspaceActionApplies('mine', remote)).toBe(false);
    expect(readingWorkspaceActionApplies('progress', remote)).toBe(false);
    expect(readingWorkspaceActionApplies('plan', remote)).toBe(true);
  });

  it('offers extraction only to a web card that is not already readable', () => {
    const site = entry({
      itemId: null,
      availability: 'external',
      source: { kind: 'curated-site', id: 'syosetu' },
      edition: null,
    });
    expect(readingWorkspaceActionApplies('extract', site)).toBe(true);
    expect(readingWorkspaceActionApplies('analyze', site)).toBe(true);

    const importedFromWeb = entry({ source: { kind: 'web', id: 'https://example.test/x' } });
    expect(importedFromWeb.availability).toBe('readable');
    expect(readingWorkspaceActionApplies('extract', importedFromWeb)).toBe(false);
  });

  it('analyses a plain-text item but does not offer to mine it', () => {
    // Mining walks EPUB sections; a text blob has tokens but no structure.
    const plain = entry({ edition: { ...EPUB_EDITION, format: 'text' } });
    expect(readingWorkspaceActionApplies('analyze', plain)).toBe(true);
    expect(readingWorkspaceActionApplies('mine', plain)).toBe(false);
  });

  it('offers Jiten vocabulary only to a Jiten-sourced card', () => {
    const jiten = entry({ itemId: null, availability: 'importable', source: { kind: 'jiten', id: '4821' } });
    expect(readingWorkspaceActionApplies('jitenVocabulary', jiten)).toBe(true);
    expect(readingWorkspaceActionApplies('jitenVocabulary', entry())).toBe(false);
  });

  it('withholds planning from something that cannot be obtained at all', () => {
    const dead = entry({ itemId: null, availability: 'unavailable' });
    expect(readingWorkspaceActionApplies('plan', dead)).toBe(false);
  });

  it('withholds a dictionary lookup from a card with no title to look up', () => {
    const untitled = entry({ work: { ...entry().work, title: '', titleNative: '' } });
    expect(readingWorkspaceActionApplies('dictionary', untitled)).toBe(false);
  });
});

describe('resolveReadingWorkspaceActions', () => {
  it('renders only what the host can actually perform', () => {
    // The honesty rule. `read` applies to this entry, but a host that cannot
    // open a book must not paint an Open button.
    const local = entry();
    expect(readingWorkspaceActionApplies('read', local)).toBe(true);
    expect(resolveReadingWorkspaceActions(local, ['mine']).map((s) => s.id)).toEqual(['mine']);
    expect(resolveReadingWorkspaceActions(local, []).map((s) => s.id)).toEqual([]);
  });

  it('drops a hosted action the entry cannot support', () => {
    const scanned = entry({ edition: { ...EPUB_EDITION, format: 'image-series' } });
    expect(resolveReadingWorkspaceActions(scanned, ['read', 'mine', 'dictionary']).map((s) => s.id))
      .toEqual(['read', 'dictionary']);
  });

  it('keeps registry order regardless of how the host lists its repertoire', () => {
    const shuffled: ReadingWorkspaceActionId[] = ['mine', 'dictionary', 'progress', 'read'];
    expect(resolveReadingWorkspaceActions(entry(), shuffled).map((s) => s.id)).toEqual([
      'read',
      'progress',
      'dictionary',
      'mine',
    ]);
  });

  it('tolerates a host listing its whole repertoire and lets the card decide', () => {
    const site = entry({
      itemId: null,
      availability: 'external',
      source: { kind: 'curated-site', id: 'aozora' },
      edition: null,
    });
    expect(resolveReadingWorkspaceActions(site, ALL).map((s) => s.id)).toEqual([
      'extract',
      'plan',
      'analyze',
      'dictionary',
    ]);
  });
});

describe('groupReadingWorkspaceActions', () => {
  it('orders read before acquire before study and drops empty groups', () => {
    const grouped = groupReadingWorkspaceActions(resolveReadingWorkspaceActions(entry(), ALL));
    expect(grouped.map((b) => b.group)).toEqual(['read', 'acquire', 'study']);
    expect(grouped[0].actions.map((s) => s.id)).toEqual(['read', 'progress']);
    // A book you own can still be scheduled; only import and extraction are
    // meaningless once it is local.
    expect(grouped[1].actions.map((s) => s.id)).toEqual(['plan']);
    expect(grouped[2].actions.map((s) => s.id)).toEqual(['analyze', 'dictionary', 'mine']);
  });

  it('returns nothing for an empty set rather than three empty buckets', () => {
    expect(groupReadingWorkspaceActions([])).toEqual([]);
  });
});
