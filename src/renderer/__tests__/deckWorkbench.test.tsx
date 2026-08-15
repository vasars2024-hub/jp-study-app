// @vitest-environment jsdom
//
// What the shared flow tests structurally cannot cover: that the *surface*
// reads the real IPC adapters, records what they answered, and never shows a
// control that does nothing.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));

const loadDeckAsAnkiDraft = vi.fn();
vi.mock('../flashcardDeck', () => ({ loadDeckAsAnkiDraft: () => loadDeckAsAnkiDraft() }));
vi.mock('../components/anki/deckWorkbench.css', () => ({}));

import type { AnkiDraft, AnkiDraftDiagnostic, AnkiDraftNote } from '../../shared/ankiDraft';
import DeckWorkbench from '../components/anki/DeckWorkbench';

/**
 * Step 2 mounts `VirtualList`, and jsdom ships no `ResizeObserver` and reports
 * every `clientHeight` as 0. Without both stubs the browse step throws
 * `ReferenceError: ResizeObserver is not defined` and every test that walks past
 * step 1 fails for a harness reason that looks exactly like a product defect.
 */
function installLayout(width: number, height: number): void {
  class StubResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) { this.callback = callback; }
    observe(target: Element): void {
      this.callback(
        [{ target, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve(): void { /* no-op */ }
    disconnect(): void { /* no-op */ }
  }
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  for (const [prop, value] of [['clientWidth', width], ['clientHeight', height]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
  }
}

let root: Root | null = null;
let host: HTMLDivElement;

const readApkgDraft = vi.fn();
const readAnkiConnectDraft = vi.fn();
const ankiDraftSessionList = vi.fn();
const ankiDraftSessionDelete = vi.fn();

function draft(over: Partial<AnkiDraft> = {}): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'Core 2k', fingerprint: 'fp-1' },
    decks: [], noteTypes: [], notes: [], cards: [],
    diagnostics: [],
    counts: { notes: 2000, cards: 4000, decks: 3, noteTypes: 2, reviews: 0, mediaReferences: 12 },
    ...over,
  };
}

function diag(over: Partial<AnkiDraftDiagnostic>): AnkiDraftDiagnostic {
  return { code: 'missing-media', severity: 'warning', count: 1, samples: [], ...over };
}

function note(id: string, expression: string, tags: string[] = []): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags,
    marked: false,
    fields: [
      { ord: 0, name: 'Expression', raw: expression, normalized: expression },
      { ord: 1, name: 'Meaning', raw: `${expression}-en`, normalized: `${expression}-en` },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [`c-${id}`],
    media: [],
  };
}

/** A draft with real rows, so the Browser has something to show. */
function browsable(over: Partial<AnkiDraft> = {}): AnkiDraft {
  const notes = [note('n1', 'ねこ', ['animal']), note('n2', 'いぬ', ['animal']), note('n3', 'やま')];
  return draft({
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [
      {
        id: 'nt1',
        name: 'Basic',
        kind: 'standard',
        css: '',
        fields: [
          { ord: 0, name: 'Expression', sticky: false, rtl: false },
          { ord: 1, name: 'Meaning', sticky: false, rtl: false },
        ],
        templates: [],
        sortFieldOrd: 0,
      },
    ],
    notes,
    cards: notes.map((n) => ({
      id: n.cardIds[0]!, noteId: n.id, deckId: 'd1', ord: 0, type: 'new' as const,
      queue: 'new' as const, due: 0, interval: 0, easeFactor: 0, reps: 0, lapses: 0,
      left: 0, flag: 'none' as const, modifiedAtSec: 0,
    })),
    counts: { notes: 3, cards: 3, decks: 1, noteTypes: 1, reviews: 0, mediaReferences: 0 },
    ...over,
  });
}

/** Read step 1, then walk to step 2. */
async function toBrowse(d: AnkiDraft, totalNotes?: number) {
  readApkgDraft.mockResolvedValue({ ok: true, draft: d, totalNotes });
  await mount();
  await click(buttonBy('ankiWorkbench.source.apkg'));
  await click(buttonBy('ankiWorkbench.next'));
}

async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<DeckWorkbench />));
}

function buttonBy(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  if (!found) throw new Error(`no button containing ${text}; saw: ${[...host.querySelectorAll('button')].map((b) => b.textContent).join(' | ')}`);
  return found as HTMLButtonElement;
}

/**
 * React installs a value tracker on controlled inputs, so a plain `el.value = x`
 * followed by an `input` event is swallowed as "unchanged" and `onChange` never
 * fires — the search box then looks broken when only the harness is. Write
 * through the prototype setter the tracker watches.
 */
async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  installLayout(900, 400);
  for (const m of [readApkgDraft, readAnkiConnectDraft, ankiDraftSessionList, ankiDraftSessionDelete, loadDeckAsAnkiDraft]) m.mockReset();
  ankiDraftSessionList.mockResolvedValue([]);
  ankiDraftSessionDelete.mockResolvedValue(true);
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { readApkgDraft, readAnkiConnectDraft, ankiDraftSessionList, ankiDraftSessionDelete },
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  // `unstubAllGlobals` does not undo a prototype patch; leaving these behind
  // would give every later test in this worker a 900x400 element.
  delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth;
  delete (HTMLElement.prototype as Partial<HTMLElement>).clientHeight;
});

describe('DeckWorkbench', () => {
  it('starts on step 1 with every later step locked', async () => {
    await mount();
    const steps = [...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[];
    expect(steps).toHaveLength(7);
    expect(steps[0]!.disabled).toBe(false);
    expect(steps[0]!.getAttribute('aria-current')).toBe('step');
    expect(steps.slice(1).every((b) => b.disabled)).toBe(true);
    expect(host.textContent).toContain('ankiWorkbench.progress:0,7');
  });

  it('reads a package through the real channel and reports the collection total, not the page', async () => {
    // The defect a live read against a real 84-deck profile caught: `counts` is
    // the page (500 notes), `totalNotes` is the collection.
    readApkgDraft.mockResolvedValue({
      ok: true,
      draft: draft({
        counts: { notes: 500, cards: 500, decks: 84, noteTypes: 1, reviews: 0, mediaReferences: 12 },
      }),
      totalNotes: 2000,
    });
    await mount();
    await click(buttonBy('ankiWorkbench.source.apkg'));

    expect(readApkgDraft).toHaveBeenCalledTimes(1);
    expect(readApkgDraft.mock.calls[0]![0]).toMatchObject({ noteLimit: expect.any(Number) });
    expect(host.textContent).toContain('ankiWorkbench.step.source.outcome:Core 2k,2000');
    // The page number is shown too, labelled as a page — neither number alone is honest.
    expect(host.textContent).toContain('ankiWorkbench.facts.page:500,2000,500');
    expect(host.textContent).not.toContain('ankiWorkbench.facts.loadedAll');
    expect(host.textContent).toContain('ankiWorkbench.facts.media:12');
    expect(host.textContent).toContain('ankiWorkbench.diagnostics.clean');
    expect(host.textContent).toContain('ankiWorkbench.progress:1,7');

    const steps = [...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[];
    expect(steps[1]!.disabled).toBe(false);
    expect(steps[2]!.disabled).toBe(true);
  });

  it('reports the adapter’s own error and does not satisfy the step', async () => {
    readAnkiConnectDraft.mockResolvedValue({ ok: false, error: 'anki-unreachable' });
    await mount();
    await click(buttonBy('ankiWorkbench.source.connect'));

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('anki-unreachable');
    expect(host.textContent).toContain('ankiWorkbench.progress:0,7');
    expect(([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[1]!.disabled).toBe(true);
  });

  it('stays silent when the file dialog is cancelled', async () => {
    readApkgDraft.mockResolvedValue({ ok: false, error: 'cancelled' });
    await mount();
    await click(buttonBy('ankiWorkbench.source.apkg'));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain('ankiWorkbench.source.empty');
  });

  it('takes the local deck from the renderer store with no IPC at all', async () => {
    loadDeckAsAnkiDraft.mockReturnValue({
      draft: draft({
        source: { kind: 'local-deck', label: 'This app', fingerprint: 'fp-2' },
        counts: { notes: 7, cards: 7, decks: 1, noteTypes: 1, reviews: 0, mediaReferences: 0 },
      }),
      summary: {},
    });
    await mount();
    await click(buttonBy('ankiWorkbench.source.localDeck'));

    expect(readApkgDraft).not.toHaveBeenCalled();
    expect(readAnkiConnectDraft).not.toHaveBeenCalled();
    expect(host.textContent).toContain('ankiWorkbench.step.source.outcome:This app,7');
    // A source that does not page says so rather than implying more is coming.
    expect(host.textContent).toContain('ankiWorkbench.facts.loadedAll:7,7');
    expect(host.textContent).not.toContain('ankiWorkbench.facts.page');
  });

  it('blocks the flow on a blocking diagnostic and lets a warning through', async () => {
    readApkgDraft.mockResolvedValueOnce({
      ok: true,
      draft: draft({ diagnostics: [diag({ code: 'orphan-card', severity: 'blocking', count: 4 })] }),
    });
    await mount();
    await click(buttonBy('ankiWorkbench.source.apkg'));
    expect(host.textContent).toContain('ankiWorkbench.diagnostics.blocking:4,orphan-card');
    expect(([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[1]!.disabled).toBe(true);

    readApkgDraft.mockResolvedValueOnce({
      ok: true,
      draft: draft({ diagnostics: [diag({ code: 'missing-media', count: 9 })] }),
    });
    await click(buttonBy('ankiWorkbench.source.apkg'));
    expect(host.textContent).toContain('ankiWorkbench.diagnostics.warning:9,missing-media');
    expect(([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[1]!.disabled).toBe(false);
  });

  it('says a later step is not built rather than showing a control that does nothing', async () => {
    // Steps 1 and 2 are built now, so the unbuilt claim has to be tested on
    // step 3 — reached only by actually satisfying the selection step.
    await toBrowse(browsable());
    await click(buttonBy('ankiWorkbench.browser.selectAll'));
    await click(buttonBy('ankiWorkbench.next'));

    expect(host.textContent).toContain('ankiWorkbench.step.notReady');
    expect(host.querySelector('.deck-workbench-rail')).toBeNull();
    expect(host.querySelector('.wb-browser')).toBeNull();
    // Back, Next and the stepper are the only controls on an unbuilt step.
    const controls = [...host.querySelectorAll('.deck-workbench-body button')];
    expect(controls).toHaveLength(0);
  });

  it('marks later steps stale when a second source replaces the first', async () => {
    await toBrowse(browsable());
    await click(buttonBy('ankiWorkbench.browser.selectAll'));
    await click(([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[0]!);

    readApkgDraft.mockResolvedValue({
      ok: true,
      draft: browsable({
        source: { kind: 'apkg', label: 'Kaishi', fingerprint: 'fp-3' },
        counts: { notes: 1, cards: 1, decks: 1, noteTypes: 1, reviews: 0, mediaReferences: 0 },
      }),
    });
    await click(buttonBy('ankiWorkbench.source.apkg'));
    expect(host.textContent).toContain('ankiWorkbench.step.source.outcome:Kaishi,1');
    expect(host.textContent).not.toContain('Core 2k');

    // The plan's forbidden case: the recorded selection is not erased, only its
    // passability is withdrawn. The old count is still on screen, flagged.
    const browse = ([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[1]!;
    expect(browse.className).toContain('stale');
    expect(browse.textContent).toContain('ankiWorkbench.step.browse.outcomeAll:3');
    expect(browse.textContent).toContain('ankiWorkbench.step.stale');
    // Step 3 is locked again because step 2 no longer counts as done.
    expect(([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[2]!.disabled).toBe(true);
  });

  it('lists an interrupted session from the store and discards it through IPC', async () => {
    ankiDraftSessionList.mockResolvedValue([
      {
        session: { id: 's1', label: 'Live collection', status: 'interrupted' },
        progress: { status: 'interrupted', covered: 1500, totalNotes: 155383, resumable: true },
      },
    ]);
    await mount();
    expect(host.textContent).toContain('ankiWorkbench.sessions.status.interrupted');
    expect(host.textContent).toContain('ankiWorkbench.sessions.covered:1500,155383');

    ankiDraftSessionList.mockResolvedValue([]);
    await click(buttonBy('ankiWorkbench.sessions.discard'));
    expect(ankiDraftSessionDelete).toHaveBeenCalledWith('s1');
    expect(host.textContent).toContain('ankiWorkbench.sessions.none');
  });

  it('shows the draft as Browser rows and records the selection on step 2', async () => {
    await toBrowse(browsable());
    expect(host.querySelectorAll('.wb-browser-row')).toHaveLength(3);
    // Two field columns visible by default, sort field first.
    expect(host.textContent).toContain('ねこ');
    expect(host.textContent).toContain('ねこ-en');
    expect(host.textContent).toContain('ankiWorkbench.browser.selected:0');
    // Zero selected is not a finished step.
    expect(host.textContent).toContain('ankiWorkbench.progress:1,7');

    const boxes = [...host.querySelectorAll('.wb-browser-row input')] as HTMLInputElement[];
    await click(boxes[0]!);
    expect(host.textContent).toContain('ankiWorkbench.browser.selected:1');
    expect(host.textContent).toContain('ankiWorkbench.step.browse.outcome:1');
    expect(host.textContent).toContain('ankiWorkbench.progress:2,7');
    expect(([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[2]!.disabled).toBe(false);
  });

  it('searches the loaded rows and empties honestly', async () => {
    await toBrowse(browsable());
    const search = host.querySelector('.wb-browser-search') as HTMLInputElement;
    await type(search, 'animal');
    expect(host.querySelectorAll('.wb-browser-row')).toHaveLength(2);

    await type(search, 'nothing-matches-this');
    expect(host.querySelectorAll('.wb-browser-row')).toHaveLength(0);
    expect(host.textContent).toContain('ankiWorkbench.browser.empty');
  });

  it('will not offer "select all matching" for a filtered page of a larger source', async () => {
    // The honesty rule: with a query active on a paged source, "everything
    // matching" is a claim nobody computed — only the rows found here are real.
    await toBrowse(browsable(), 155383);
    expect(host.textContent).toContain('ankiWorkbench.browser.pageOnly:3,155383');
    expect(buttonBy('ankiWorkbench.browser.selectAll').textContent).toContain('155383');

    const search = host.querySelector('.wb-browser-search') as HTMLInputElement;
    await type(search, 'ねこ');
    expect([...host.querySelectorAll('button')].some((b) => b.textContent?.includes('browser.selectAll'))).toBe(false);
    await click(buttonBy('ankiWorkbench.browser.selectFound'));
    expect(host.textContent).toContain('ankiWorkbench.step.browse.outcome:1');
  });

  it('promises only what "select all" will actually select under a filter', async () => {
    // The live run's defect: the button read "select all 3,221" while a filter
    // showed four rows, and the click then selected four. A count in a button
    // is a promise about what the click does.
    await toBrowse(browsable());
    expect(buttonBy('ankiWorkbench.browser.selectAll').textContent).toContain('3');

    const search = host.querySelector('.wb-browser-search') as HTMLInputElement;
    await type(search, 'animal');
    expect(buttonBy('ankiWorkbench.browser.selectAll').textContent).toContain('selectAll:2');
    await click(buttonBy('ankiWorkbench.browser.selectAll'));
    expect(host.textContent).toContain('ankiWorkbench.browser.selected:2');
    expect(host.textContent).toContain('ankiWorkbench.step.browse.outcomeAll:2');
  });

  it('hides a column without touching the note type', async () => {
    await toBrowse(browsable());
    const toggles = [...host.querySelectorAll('.wb-browser-column-toggle input')] as HTMLInputElement[];
    // Two fields + four meta columns, all present whether shown or not.
    expect(toggles).toHaveLength(6);
    // Shown by default: the first two fields plus note type, decks and tags.
    expect(host.querySelectorAll('.wb-browser-row')[0]!.querySelectorAll('.wb-browser-cell')).toHaveLength(5);

    await click(toggles[0]!);
    expect(host.querySelectorAll('.wb-browser-row')[0]!.querySelectorAll('.wb-browser-cell')).toHaveLength(4);
    expect(host.querySelectorAll('.wb-browser-column-toggle input')).toHaveLength(6);
  });

  it('survives a session list that throws', async () => {
    ankiDraftSessionList.mockRejectedValue(new Error('no store'));
    await mount();
    expect(host.textContent).toContain('ankiWorkbench.sessions.none');
    expect(host.querySelectorAll('.deck-workbench-source')).toHaveLength(3);
  });
});
