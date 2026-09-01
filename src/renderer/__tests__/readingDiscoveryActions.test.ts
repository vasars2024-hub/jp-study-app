/**
 * Discover as the second host of the unified Reading action set.
 *
 * The Library drawer adopted the registry first; this is the surface the plan
 * names next. Before it, one discovery card had one button whose label was
 * chosen by the provider's action shape — `reading.openSite`,
 * `novels.action.openSource`, `novels.action.plan`, `common.open` — so the same
 * capability wore a different name on Discover than it did in the Library.
 *
 * Two things have to hold, and both are guarded below:
 *
 *   1. the card's buttons come from the shared registry — label, icon and order
 *      included — rather than being chosen per action shape;
 *   2. nothing is rendered that this surface cannot actually perform, and
 *      nothing it *can* perform is routed through a mechanism that differs from
 *      the surface that already performed it.
 *
 * `discoveryHostedActions` is real logic and is tested as such. The JSX
 * contract is read from source, the way `libraryReadingActions.test.ts` does —
 * the component reaches for `window.api` and cannot be mounted in jsdom.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  discoveryHostedActions,
  discoveryJitenDeckId,
  discoveryNavigation,
  plannedJitenDeckIds,
} from '../utils/readingDiscoveryActions';
import { resolveReadingWorkspaceActions } from '../../shared/readingWorkspaceActions';
import { READING_WORKSPACE_SCHEMA_VERSION } from '../../shared/readingWorkspace';
import type { ReadingWorkspaceEntry } from '../../shared/readingWorkspace';
import type {
  ReadingDiscoveryAction,
  ReadingDiscoveryResult,
} from '../../shared/readingDiscovery';
import { readingSiteDiscoveryResult } from '../readingDiscoveryProviders';
import { READING_SITES } from '../data/readingSites';

const SRC = resolve(__dirname, '../..');
const VIEW = readFileSync(
  resolve(SRC, 'renderer/components/reading/ReadingUnifiedDiscovery.tsx'),
  'utf8',
);
const NOVELS = readFileSync(resolve(SRC, 'renderer/components/novels/NovelsContent.tsx'), 'utf8');

function entry(patch: Partial<ReadingWorkspaceEntry> = {}): ReadingWorkspaceEntry {
  return {
    version: READING_WORKSPACE_SCHEMA_VERSION,
    key: 'k',
    itemId: null,
    work: {
      workId: 'w',
      title: '君の名は。',
      titleNative: '君の名は。',
      contentType: 'novel',
      aniListId: null,
      malId: null,
    },
    edition: null,
    source: { kind: 'provider', id: 'p' },
    availability: 'external',
    cover: { state: 'fallback', ref: null },
    progress: { value: null, percent: 0, updatedAt: 0, state: 'unstarted' },
    level: null,
    knownRatio: null,
    tags: [],
    ...patch,
  } as ReadingWorkspaceEntry;
}

function result(
  action: ReadingDiscoveryAction,
  patch: Partial<ReadingWorkspaceEntry> = {},
): ReadingDiscoveryResult {
  return {
    entry: entry(patch),
    providerId: 'p',
    providerLabelKey: 'novels.kind.local',
    providerPriority: 10,
    action,
    relevance: 0,
  };
}

const libraryResult = result({ type: 'open-library', itemId: 'item-1' }, {
  itemId: 'item-1',
  availability: 'readable',
  source: { kind: 'local-library', id: 'item-1' },
});
const siteResult = result({ type: 'inspect-site', siteId: 'aozora' }, {
  source: { kind: 'curated-site', id: 'aozora' },
});
const jitenResult = result({ type: 'open-plan', query: '君の名は。' }, {
  availability: 'importable',
  source: { kind: 'jiten', id: '4821' },
});
const externalResult = result({ type: 'open-external', url: 'https://example.com/x' });
/** The deck behind `jitenResult` is in the plan; nothing else is. */
const PLANNED = new Set([4821]);
const NOTHING_PLANNED: ReadonlySet<number> = new Set<number>();

describe('discoveryJitenDeckId', () => {
  it('reads the numeric deck id the mining panel requires', () => {
    expect(discoveryJitenDeckId(jitenResult)).toBe(4821);
  });

  it('refuses anything that is not a positive integer id', () => {
    // `FlashcardsContent` consumes `deckId?: number` and ignores everything
    // else, so a card offering the action on a bad id would open onto nothing.
    for (const id of ['', 'abc', '0', '-3', '4.5', '9007199254740993']) {
      expect(
        discoveryJitenDeckId(result({ type: 'open-plan', query: 'q' }, {
          source: { kind: 'jiten', id },
        })),
        `deck id ${id} must not be accepted`,
      ).toBeNull();
    }
  });

  it('is null for every non-Jiten source', () => {
    expect(discoveryJitenDeckId(libraryResult)).toBeNull();
    expect(discoveryJitenDeckId(siteResult)).toBeNull();
    expect(discoveryJitenDeckId(externalResult)).toBeNull();
  });
});

describe('plannedJitenDeckIds', () => {
  it('collects the ids the mining panel would list', () => {
    expect([
      ...plannedJitenDeckIds([{ jitenDeckId: 4821 }, { jitenDeckId: 7 }]),
    ]).toEqual([4821, 7]);
  });

  it('drops plan entries with no deck, exactly as the panel filters them', () => {
    // JitenMiningPanel.tsx:39-42 filters to `jitenDeckId != null`.
    expect(
      plannedJitenDeckIds([{ jitenDeckId: null }, {}, { jitenDeckId: 1.5 }, { jitenDeckId: 3 }]),
    ).toEqual(new Set([3]));
  });

  it('survives a store that could not be read', () => {
    expect(plannedJitenDeckIds(null)).toEqual(new Set());
    expect(plannedJitenDeckIds(undefined)).toEqual(new Set());
  });
});

describe('discoveryHostedActions', () => {
  it('offers the dictionary for every card, because the overlay is app-wide', () => {
    for (const candidate of [libraryResult, siteResult, jitenResult, externalResult]) {
      expect(discoveryHostedActions(candidate, PLANNED)).toContain('dictionary');
    }
  });

  it('offers reading only where the provider handed back an item id', () => {
    expect(discoveryHostedActions(libraryResult, PLANNED)).toContain('read');
    for (const candidate of [siteResult, jitenResult, externalResult]) {
      expect(discoveryHostedActions(candidate, PLANNED)).not.toContain('read');
    }
  });

  it('offers extraction only for the site whose detail modal performs it', () => {
    expect(discoveryHostedActions(siteResult, PLANNED)).toContain('extract');
    for (const candidate of [libraryResult, jitenResult, externalResult]) {
      expect(discoveryHostedActions(candidate, PLANNED)).not.toContain('extract');
    }
  });

  it('offers Jiten vocabulary only when a usable deck id exists', () => {
    expect(discoveryHostedActions(jitenResult, PLANNED)).toContain('jitenVocabulary');
    expect(
      discoveryHostedActions(
        result({ type: 'open-plan', query: 'q' }, {
          source: { kind: 'jiten', id: 'not-a-number' },
        }),
        PLANNED,
      ),
    ).not.toContain('jitenVocabulary');
  });

  it('withholds Jiten vocabulary for a deck the panel could not have found', () => {
    // Measured live: mining an unplanned deck opened JitenMiningPanel silently
    // pointed at a different planned title. Absent, not disabled, not wrong.
    expect(discoveryHostedActions(jitenResult, NOTHING_PLANNED)).not.toContain('jitenVocabulary');
    expect(discoveryHostedActions(jitenResult, new Set([9999]))).not.toContain('jitenVocabulary');
  });

  it('claims nothing this surface has no wiring for', () => {
    for (const candidate of [libraryResult, siteResult, jitenResult, externalResult]) {
      const hosted = new Set(discoveryHostedActions(candidate, PLANNED));
      for (const id of ['import', 'plan', 'analyze', 'progress', 'mine']) {
        expect(hosted.has(id as never), `Discover must not claim ${id}`).toBe(false);
      }
    }
  });
});

describe('what a card resolves to', () => {
  it('gives a library hit read and lookup, in registry order', () => {
    const actions = resolveReadingWorkspaceActions(
      libraryResult.entry,
      discoveryHostedActions(libraryResult, PLANNED),
    );
    expect(actions.map((a) => a.id)).toEqual(['read', 'dictionary']);
    expect(actions[0].primary).toBe(true);
  });

  it('gives a planned Jiten deck lookup and its vocabulary', () => {
    const actions = resolveReadingWorkspaceActions(
      jitenResult.entry,
      discoveryHostedActions(jitenResult, PLANNED),
    );
    expect(actions.map((a) => a.id)).toEqual(['dictionary', 'jitenVocabulary']);
  });

  it('gives an unplanned Jiten deck the lookup alone', () => {
    const actions = resolveReadingWorkspaceActions(
      jitenResult.entry,
      discoveryHostedActions(jitenResult, NOTHING_PLANNED),
    );
    expect(actions.map((a) => a.id)).toEqual(['dictionary']);
  });

  it('leaves every real curated site with an extraction button', () => {
    // The applicability rule withholds `extract` from something already
    // readable; the provider builds sites as `external`, so all 24 qualify.
    // If that ever changes, the site card would silently lose its only way in.
    const sites = READING_SITES.map((site) => readingSiteDiscoveryResult(site, site.name));
    expect(sites.length).toBeGreaterThan(0);
    // A site that failed to match its own name would drop out silently, so the
    // count is checked rather than the nulls being skipped.
    const matched = sites.filter(
      (candidate): candidate is ReadingDiscoveryResult => candidate !== null,
    );
    expect(matched.length).toBe(sites.length);
    for (const candidate of matched) {
      const ids = resolveReadingWorkspaceActions(
        candidate.entry,
        discoveryHostedActions(candidate, NOTHING_PLANNED),
      ).map((a) => a.id);
      expect(ids, `${candidate.entry.work.title} lost its way in`).toContain('extract');
    }
  });
});

describe('navigation that no registry id covers', () => {
  it('names the planner for what opening it does', () => {
    // ja/zh/ru rendered `novels.action.plan` as "add to plan" on a click that
    // only opens the planner — a claim the app did not keep.
    expect(discoveryNavigation(jitenResult)).toEqual({
      labelKey: 'reading.discovery.openPlanner',
      icon: 'calendar',
    });
    expect(discoveryNavigation(externalResult)).toEqual({
      labelKey: 'novels.action.openSource',
      icon: 'external',
    });
  });

  it('stays out of the way when the set already covers the card', () => {
    expect(discoveryNavigation(libraryResult)).toBeNull();
    expect(discoveryNavigation(siteResult)).toBeNull();
  });
});

describe('the card renders the registry, not its own buttons', () => {
  it('maps the resolved set instead of picking a label per action shape', () => {
    expect(VIEW).toContain('discoveryHostedActions(result, plannedDecks)');
    expect(VIEW).toContain('resolveReadingWorkspaceActions(');
    // The gate is only honest if the plan is actually loaded for it.
    expect(VIEW).toContain('plannedJitenDeckIds(store?.plan)');
    expect(VIEW).toContain('setPlannedDecks(planned)');
    expect(VIEW).toContain('{t(action.labelKey)}');
    expect(VIEW).toContain('name={action.icon as');
    expect(VIEW).toContain("className={action.primary ? 'btn primary' : 'btn'}");
    expect(VIEW).toContain('data-reading-action={action.id}');
  });

  it('no longer chooses one button by the provider action type', () => {
    expect(VIEW).not.toContain('function actionLabelKey');
    expect(VIEW).not.toContain("'reading.openSite'");
    expect(VIEW).not.toContain("'novels.action.plan'");
  });

  it('paints the navigation from one place, label and icon together', () => {
    expect(VIEW).toContain('discoveryNavigation(result)');
    expect(VIEW).toContain('{t(navigation.labelKey)}');
    expect(VIEW).toContain('name={navigation.icon as');
  });
});

describe('unifying the set does not fork the mechanism', () => {
  it('opens Jiten vocabulary through the exact handoff Novels already dispatches', () => {
    for (const line of [
      "setHandoffJson('jitenMining', { deckId",
      "new CustomEvent('os:open', { detail: 'flashcards' })",
      "new CustomEvent('flashcards:openEpubMining')",
    ]) {
      expect(VIEW, `Discover must reuse ${line}`).toContain(line);
    }
    expect(NOVELS).toContain("setHandoffJson('jitenMining', {");
    expect(NOVELS).toContain("new CustomEvent('os:open', { detail: 'flashcards' })");
    expect(NOVELS).toContain("new CustomEvent('flashcards:openEpubMining')");
  });

  it('looks words up through the global dictionary overlay channel', () => {
    expect(VIEW).toContain("new CustomEvent('dict:lookup', { detail: { query: lookup } })");
    const overlay = readFileSync(
      resolve(SRC, 'renderer/components/GlobalDictionaryOverlay.tsx'),
      'utf8',
    );
    expect(overlay).toContain("window.addEventListener('dict:lookup'");
  });

  it('does not dispatch a lookup with an empty query', () => {
    expect(VIEW).toContain('if (lookup) {');
  });

  it('looks up the same title the applicability rule accepted', () => {
    expect(VIEW).toContain('(work.titleNative || work.title).trim()');
  });
});
