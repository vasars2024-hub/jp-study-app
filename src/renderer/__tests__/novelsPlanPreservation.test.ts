// @vitest-environment jsdom

/**
 * Track 4 requires saved plans and their imports to be preserved. Two ways they
 * were not:
 *
 * - the legacy `jp-novels-planned` key is the only copy of a plan saved before
 *   the plan store moved into main, and the migration dropped it up front;
 * - `library:importFiles` answers a cancelled dialog with the whole existing
 *   library, and the import link fell back to the first EPUB in it.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JitenPlanEntry, JitenStore } from '../../shared/jiten';
import type { LibraryItem } from '../../shared/types';
import { NOVELS } from '../data/novels';
import { useNovels } from '../components/novels/NovelsContent';

const PLAN_KEY = 'jp-novels-planned';

function emptyStore(): JitenStore {
  return {
    config: { apiBaseUrl: 'https://jiten.test', apiKey: '' },
    sourceProfiles: [],
    plan: [],
  };
}

function book(id: string, title: string): LibraryItem {
  return {
    id,
    title,
    kind: 'book',
    createdAt: 1,
    epubFile: `${id}.epub`,
  } as LibraryItem;
}

let host: HTMLDivElement;
let root: Root;
let jitenUpsertPlan: ReturnType<typeof vi.fn>;
let jitenUpdatePlan: ReturnType<typeof vi.fn>;
let importFiles: ReturnType<typeof vi.fn>;
let listLibrary: ReturnType<typeof vi.fn>;
let state: ReturnType<typeof useNovels> | null = null;
let originalApiDescriptor: PropertyDescriptor | undefined;

function Probe() {
  state = useNovels();
  return null;
}

/** The latest render's hook state, so a stale closure cannot be driven by mistake. */
function current(): ReturnType<typeof useNovels> {
  if (!state) throw new Error('the probe is not mounted');
  return state;
}

async function mount() {
  await act(async () => {
    root.render(createElement(Probe));
    await Promise.resolve();
  });
  // The migration runs after the store resolves, then awaits each upsert.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  originalApiDescriptor = Object.getOwnPropertyDescriptor(window, 'api');
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jitenUpsertPlan = vi.fn();
  jitenUpdatePlan = vi.fn().mockImplementation(async () => emptyStore());
  importFiles = vi.fn();
  listLibrary = vi.fn();
  state = null;
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      jitenGetStore: vi.fn().mockResolvedValue(emptyStore()),
      novelsGet: vi.fn().mockResolvedValue(null),
      jitenUpsertPlan,
      jitenUpdatePlan,
      importFiles,
      listLibrary,
    },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.removeItem(PLAN_KEY);
  if (originalApiDescriptor) {
    Object.defineProperty(window, 'api', originalApiDescriptor);
  } else {
    delete (window as unknown as { api?: unknown }).api;
  }
  vi.restoreAllMocks();
});

describe('legacy plan migration', () => {
  it('moves a saved plan into the main-process store and then drops the legacy key', async () => {
    const novel = NOVELS[0];
    localStorage.setItem(PLAN_KEY, JSON.stringify([novel.id]));
    jitenUpsertPlan.mockImplementation(async () => emptyStore());

    await mount();

    expect(jitenUpsertPlan).toHaveBeenCalledTimes(1);
    expect(jitenUpsertPlan.mock.calls[0][0].id).toBe(`local-${novel.id}`);
    expect(localStorage.getItem(PLAN_KEY)).toBeNull();
  });

  it('keeps the legacy plan when an upsert fails, so nothing is silently destroyed', async () => {
    const novel = NOVELS[0];
    const raw = JSON.stringify([novel.id]);
    localStorage.setItem(PLAN_KEY, raw);
    jitenUpsertPlan.mockRejectedValue(new Error('no jiten handler'));

    await mount();

    expect(jitenUpsertPlan).toHaveBeenCalled();
    expect(localStorage.getItem(PLAN_KEY)).toBe(raw);
  });

  it('keeps the whole legacy plan when a later upsert fails, and retries it', async () => {
    const [first, second] = NOVELS;
    const raw = JSON.stringify([first.id, second.id]);
    localStorage.setItem(PLAN_KEY, raw);
    jitenUpsertPlan
      .mockImplementationOnce(async () => emptyStore())
      .mockRejectedValue(new Error('write failed'));

    await mount();

    // The partial store still reaches the UI, which re-runs the migration from
    // the surviving key: more attempts than entries is the retry, not a leak.
    expect(jitenUpsertPlan.mock.calls.length).toBeGreaterThan(2);
    expect(localStorage.getItem(PLAN_KEY)).toBe(raw);
  });

  it('never upserts the same novel twice within one migration', async () => {
    const novel = NOVELS[0];
    localStorage.setItem(PLAN_KEY, JSON.stringify([novel.id, novel.id]));
    jitenUpsertPlan.mockImplementation(async () => emptyStore());

    await mount();

    expect(jitenUpsertPlan).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PLAN_KEY)).toBeNull();
  });

  it('drops an unusable legacy value without calling the plan store', async () => {
    localStorage.setItem(PLAN_KEY, 'not json');

    await mount();

    expect(jitenUpsertPlan).not.toHaveBeenCalled();
    expect(localStorage.getItem(PLAN_KEY)).toBeNull();
  });

  it('does not re-plan a novel the main-process store already holds', async () => {
    const novel = NOVELS[0];
    localStorage.setItem(PLAN_KEY, JSON.stringify([novel.id]));
    const seeded = emptyStore();
    seeded.plan = [{
      id: `local-${novel.id}`,
      titleJp: novel.titleJp,
      genres: [],
      tags: [],
      difficultyLabel: '',
      sourceLinks: [],
      acquisitionStatus: 'planned',
      createdAt: 1,
      updatedAt: 1,
    }];
    (window.api.jitenGetStore as ReturnType<typeof vi.fn>).mockResolvedValue(seeded);

    await mount();

    expect(jitenUpsertPlan).not.toHaveBeenCalled();
    expect(localStorage.getItem(PLAN_KEY)).toBeNull();
  });
});

describe('plan import linking', () => {
  const novel = NOVELS[0];
  const planId = `local-${novel.id}`;

  function plannedStore(): JitenStore {
    const store = emptyStore();
    store.plan = [{
      id: planId,
      titleJp: novel.titleJp,
      genres: [],
      tags: [],
      difficultyLabel: '',
      sourceLinks: [],
      acquisitionStatus: 'planned',
      createdAt: 1,
      updatedAt: 1,
    } as JitenPlanEntry];
    return store;
  }

  async function importSelected() {
    (window.api.jitenGetStore as ReturnType<typeof vi.fn>).mockResolvedValue(plannedStore());
    await mount();
    await act(async () => {
      current().selectCandidate(planId);
      await Promise.resolve();
    });
    await act(async () => {
      await current().importLocalSelected();
    });
  }

  it('links the plan entry to the book the import actually produced', async () => {
    const existing = book('old-book', '悪の教典 02');
    const fresh = book('new-book', novel.titleJp);
    listLibrary.mockResolvedValue([existing]);
    importFiles.mockResolvedValue([fresh, existing]);

    await importSelected();

    expect(jitenUpdatePlan).toHaveBeenCalledTimes(1);
    expect(jitenUpdatePlan.mock.calls[0][0]).toBe(planId);
    expect(jitenUpdatePlan.mock.calls[0][1]).toMatchObject({
      importedLibraryItemId: 'new-book',
      acquisitionStatus: 'imported',
    });
  });

  it('links nothing when the import dialog is cancelled', async () => {
    // main answers a cancelled dialog with the unchanged library, so the only
    // honest reading of "no new item" is that no import happened.
    const existing = book('old-book', '悪の教典 02');
    listLibrary.mockResolvedValue([existing]);
    importFiles.mockResolvedValue([existing]);

    await importSelected();

    expect(jitenUpdatePlan).not.toHaveBeenCalled();
  });

  it('ignores every pre-existing EPUB, not just the first one', async () => {
    const a = book('old-a', '悪の教典 02');
    const b = book('old-b', '木村宗喜');
    listLibrary.mockResolvedValue([a, b]);
    importFiles.mockResolvedValue([a, b]);

    await importSelected();

    expect(jitenUpdatePlan).not.toHaveBeenCalled();
  });
});
