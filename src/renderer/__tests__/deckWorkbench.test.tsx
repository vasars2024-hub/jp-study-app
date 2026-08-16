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
import { ACTION_KINDS } from '../components/anki/DeckWorkbenchTray';

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
const exportApkgDraft = vi.fn();

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
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // The setter is per element class: calling the input one on a textarea throws
  // "'set value' called on an object that is not a valid instance".
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/**
 * React maps `onBlur` onto the native `focusout`, not `blur` — `blur` does not
 * bubble, so React's delegated root listener never sees it and a commit-on-blur
 * field looks like it silently dropped the edit.
 */
async function blur(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function key(el: HTMLElement, k: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
  });
}

/** The rendered row for a note id — virtualized, so it may not be there. */
function rowOf(noteId: string): HTMLElement {
  const el = host.querySelector(`#wb-row-${noteId}`);
  if (!el) throw new Error(`row ${noteId} is not rendered`);
  return el as HTMLElement;
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  installLayout(900, 400);
  for (const m of [readApkgDraft, readAnkiConnectDraft, ankiDraftSessionList, ankiDraftSessionDelete, loadDeckAsAnkiDraft, exportApkgDraft]) m.mockReset();
  ankiDraftSessionList.mockResolvedValue([]);
  ankiDraftSessionDelete.mockResolvedValue(true);
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { readApkgDraft, readAnkiConnectDraft, ankiDraftSessionList, ankiDraftSessionDelete, exportApkgDraft },
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

  it('claims no unbuilt step anywhere in the walked flow', async () => {
    // Step 7 was the last placeholder; with it built, walking the whole flow
    // must never show the "not built yet" disclaimer or an empty step body.
    await toBrowse(browsable());
    await click(buttonBy('ankiWorkbench.browser.selectAll'));
    for (let i = 0; i < 5; i += 1) {
      await click(buttonBy('ankiWorkbench.next'));
      expect(host.textContent).not.toContain('ankiWorkbench.step.notReady');
    }
    // The last step really is step 7 with its own surface, not a placeholder.
    expect(host.querySelector('.wb-apply')).not.toBeNull();
  });

  it('splits every tray kind across steps 3, 4 and 5 and gives step 2 none of them', async () => {
    await toBrowse(browsable());
    await click(buttonBy('ankiWorkbench.browser.selectAll'));
    const kindsOn = () => {
      const select = [...host.querySelectorAll('.wb-tray-form select')][0] as HTMLSelectElement;
      return [...select.options].map((o) => o.value);
    };
    // Step 2 confirms a selection; it queues nothing.
    expect(host.querySelector('.wb-browser')).not.toBeNull();
    expect(host.querySelector('.wb-tray')).toBeNull();

    await click(buttonBy('ankiWorkbench.next'));
    const enrich = kindsOn();
    expect(enrich).toEqual(['enrich-dictionary', 'fill-reading', 'apply-ai-additions']);
    expect(host.textContent).toContain('ankiWorkbench.step.enrich.lead');
    // The Browser is step 2's; a tray step acts on the selection it recorded.
    expect(host.querySelector('.wb-browser')).toBeNull();

    await click(buttonBy('ankiWorkbench.next'));
    const fields = kindsOn();
    expect(fields).toEqual(['find-replace', 'normalize-text', 'swap-fields', 'copy-field']);
    expect(host.textContent).toContain('ankiWorkbench.step.fields.lead');
    // The card designer reshapes the note type the field edits are written into.
    expect(host.querySelector('.wb-design')).not.toBeNull();

    await click(buttonBy('ankiWorkbench.next'));
    const rules = kindsOn();
    expect(rules).toEqual([
      'prioritize-new',
      'rescue-leeches',
      'set-mastery',
      'add-tags',
      'remove-tags',
    ]);
    expect(host.textContent).toContain('ankiWorkbench.step.rules.lead');
    expect(host.querySelector('.wb-design')).toBeNull();

    // The partition: every kind the tray offers belongs to exactly one step.
    const split = [...enrich, ...fields, ...rules];
    expect([...split].sort()).toEqual([...ACTION_KINDS].sort());
    expect(new Set(split).size).toBe(split.length);
  });

  it('carries a queued action across Next and Back, because the tray unmounts and the queue must not', async () => {
    await toBrowse(browsable());
    await click(buttonBy('ankiWorkbench.browser.selectAll'));
    await click(buttonBy('ankiWorkbench.next'));
    await click(buttonBy('ankiWorkbench.next'));
    // The tray does not remount between steps, so its `kind` must fall back to
    // one this step owns — otherwise this is an enrich form on step 4.
    const kindSelect = host.querySelector('.wb-tray-form select') as HTMLSelectElement;
    expect(kindSelect.value).toBe('find-replace');
    await type(host.querySelector('.wb-tray-form input') as HTMLInputElement, 'ねこ');
    await click(buttonBy('ankiWorkbench.tray.add'));
    expect(host.querySelectorAll('.wb-tray-action')).toHaveLength(1);

    await click(buttonBy('ankiWorkbench.next'));
    // Step 5 cannot *build* a find-replace, but it shows the one queue there is.
    expect(host.querySelectorAll('.wb-tray-action')).toHaveLength(1);
    await click(buttonBy('ankiWorkbench.back'));
    expect(host.querySelectorAll('.wb-tray-action')).toHaveLength(1);
    await click(buttonBy('ankiWorkbench.back'));
    expect(host.querySelectorAll('.wb-tray-action')).toHaveLength(1);
  });

  it('takes back a step’s outcome sentence when its batch is undone from another step', async () => {
    await toBrowse(browsable());
    await click(buttonBy('ankiWorkbench.browser.selectAll'));
    await click(buttonBy('ankiWorkbench.next'));
    await click(buttonBy('ankiWorkbench.next'));
    const stepFour = () =>
      ([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[3]!;

    await type(host.querySelector('.wb-tray-form input') as HTMLInputElement, 'ねこ');
    await type([...host.querySelectorAll('.wb-tray-form input')][1] as HTMLInputElement, 'イヌ');
    await click(buttonBy('ankiWorkbench.tray.add'));
    await click(buttonBy('ankiWorkbench.tray.apply'));
    expect(stepFour().textContent).toContain('ankiWorkbench.step.fields.outcome:1');

    // Undo from step 5, where the batch was not queued — the journal is the
    // draft's, not any one step's, and the claim has to move with it.
    await click(buttonBy('ankiWorkbench.next'));
    await click(buttonBy('ankiWorkbench.edit.undo'));
    expect(stepFour().textContent).toContain('ankiWorkbench.step.fields.outcomeNone');
    expect(stepFour().textContent).not.toContain('ankiWorkbench.step.fields.outcome:');

    await click(buttonBy('ankiWorkbench.edit.redo'));
    expect(stepFour().textContent).toContain('ankiWorkbench.step.fields.outcome:1');
  });

  it('reviews the net of the session on step 6 and restates it when an undo runs from there', async () => {
    await toBrowse(browsable());
    await click(buttonBy('ankiWorkbench.browser.selectAll'));
    await click(buttonBy('ankiWorkbench.next'));
    await click(buttonBy('ankiWorkbench.next'));
    await type(host.querySelector('.wb-tray-form input') as HTMLInputElement, 'ねこ');
    await type([...host.querySelectorAll('.wb-tray-form input')][1] as HTMLInputElement, 'イヌ');
    await click(buttonBy('ankiWorkbench.tray.add'));
    await click(buttonBy('ankiWorkbench.tray.apply'));

    await click(buttonBy('ankiWorkbench.next'));
    await click(buttonBy('ankiWorkbench.next'));
    const stepSix = () =>
      ([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[5]!;

    // The dry run is real: it names the field, counts the notes, and says out
    // loud that nothing has been written anywhere yet.
    expect(host.querySelector('.wb-review')).not.toBeNull();
    expect(host.textContent).toContain('ankiWorkbench.review.dryRun');
    // One note, two fields: the step-4 sentence counts notes and the review
    // counts values, and both numbers are true of the same batch.
    expect(host.textContent).toContain('ankiWorkbench.review.changed:1,3');
    expect(host.textContent).toContain('ankiWorkbench.review.field:Expression,1');
    expect(host.textContent).toContain('ankiWorkbench.review.field:Meaning,1');
    expect(stepSix().textContent).toContain('ankiWorkbench.step.review.outcome:1');

    // The diff list carries the source's value on the left, not step 4's.
    await click(buttonBy('ankiWorkbench.review.diffs:2'));
    expect(host.querySelectorAll('.wb-review-diff')).toHaveLength(2);
    expect(host.querySelector('.wb-review-diff')!.textContent).toContain('ねこ');

    // Undo from step 6 itself: the sentence that was just falsified is restated.
    await click(buttonBy('ankiWorkbench.edit.undo'));
    expect(host.textContent).toContain('ankiWorkbench.review.empty');
    expect(host.querySelector('.wb-review-diff')).toBeNull();
    expect(stepSix().textContent).toContain('ankiWorkbench.step.review.outcomeNone');
  });

  it('records each optional step as visited-and-empty rather than passing it silently', async () => {
    await toBrowse(browsable());
    await click(buttonBy('ankiWorkbench.browser.selectAll'));
    const stepAt = (i: number) =>
      ([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[i]!;
    for (const i of [2, 3, 4]) expect(stepAt(i).className).not.toContain('done');

    for (const [i, key] of [
      [2, 'enrich'],
      [3, 'fields'],
      [4, 'rules'],
    ] as const) {
      await click(buttonBy('ankiWorkbench.next'));
      expect(stepAt(i).className).toContain('done');
      expect(stepAt(i).textContent).toContain(`ankiWorkbench.step.${key}.outcomeNone`);
    }
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

  it('says why a query was refused instead of showing an empty grid', async () => {
    // Phase 3's rule: an unrecognized key is a refusal. Without the message the
    // grid empties and reads exactly like "nothing matched" — the failure mode
    // the flat search was deliberately left simple to avoid.
    await toBrowse(browsable());
    const search = host.querySelector('.wb-browser-search') as HTMLInputElement;
    await type(search, 'Expresion:ねこ');
    const alert = host.querySelector('.wb-browser-query-error');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toBe('ankiWorkbench.browser.query.unknownKey:Expresion:ねこ');
    expect(search.getAttribute('aria-invalid')).toBe('true');
    expect(search.getAttribute('aria-describedby')).toBe('wb-browser-query-error');
    expect(host.querySelectorAll('.wb-browser-row')).toHaveLength(0);
    // A query that does not parse is not a filter, so it cannot license the
    // whole-source claim either.
    expect([...host.querySelectorAll('button')].some((b) => b.textContent?.includes('browser.selectAll'))).toBe(false);

    // Fixing the key clears the message and filters for real.
    await type(search, 'Expression:ねこ');
    expect(host.querySelector('.wb-browser-query-error')).toBeNull();
    expect(search.getAttribute('aria-invalid')).toBeNull();
    expect(host.querySelectorAll('.wb-browser-row')).toHaveLength(1);
  });

  it('filters on a nested query the flat search could not express', async () => {
    await toBrowse(browsable());
    const search = host.querySelector('.wb-browser-search') as HTMLInputElement;
    // Two rows carry `animal`; one of them is ねこ. `-` excludes it.
    await type(search, 'animal -Expression:ねこ');
    expect(host.querySelectorAll('.wb-browser-row')).toHaveLength(1);
    await type(search, '(animal or nothing-matches-this) cards:1');
    expect(host.querySelectorAll('.wb-browser-row')).toHaveLength(2);
  });

  it('has no journal before anything is edited, and records a step once there is one', async () => {
    await toBrowse(browsable());
    // Nothing happened yet, so there is nothing to consult — an empty history
    // panel would be a control that does nothing.
    expect(host.querySelector('.wb-journal')).toBeNull();

    await click(host.querySelectorAll('.wb-browser-cell')[0] as HTMLElement);
    const field = host.querySelector('.wb-inspector-input') as HTMLTextAreaElement;
    await type(field, 'ねこ・edited');
    await blur(field);

    const toggle = host.querySelector('.wb-journal-toggle') as HTMLButtonElement;
    expect(toggle.textContent).toBe('ankiWorkbench.journal.title:1,1');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.wb-journal-list')).toBeNull();

    await click(toggle);
    const entries = [...host.querySelectorAll('.wb-journal-entry')];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.textContent).toContain('ankiWorkbench.journal.single:1');
    expect(entries[0]?.textContent).toContain('ankiWorkbench.journal.fields:Expression');
    expect(entries[0]?.className).not.toContain('wb-journal-undone');

    // Undone is recorded, not erased: the step count drops but the entry stays.
    await click(buttonBy('ankiWorkbench.edit.undo'));
    expect((host.querySelector('.wb-journal-toggle') as HTMLElement).textContent).toBe('ankiWorkbench.journal.title:0,0');
    expect(host.querySelector('.wb-journal-entry')?.className).toContain('wb-journal-undone');
  });

  it('saves a view and restores its query, sort and columns — but never a selection', async () => {
    window.localStorage.removeItem('jp-anki-browser-views');
    await toBrowse(browsable());
    const search = host.querySelector('.wb-browser-search') as HTMLInputElement;
    await type(search, 'animal');
    await click(rowOf('n1').querySelector('input') as HTMLElement);
    const toggles = [...host.querySelectorAll('.wb-browser-column-toggle input')] as HTMLInputElement[];
    await click(toggles[1]!); // hide the second field column

    await type(host.querySelector('.wb-browser-view-name') as HTMLInputElement, 'Animals');
    await click(buttonBy('ankiWorkbench.browser.views.save'));

    const stored = JSON.parse(window.localStorage.getItem('jp-anki-browser-views') ?? '{}');
    expect(stored.views).toHaveLength(1);
    expect(stored.views[0].query).toBe('animal');
    expect(stored.views[0].visibleColumnIds).not.toContain('field:Meaning');
    // The selected note is not part of the view: a note id means nothing after a
    // reimport, and restoring one would silently reselect the wrong note.
    expect(JSON.stringify(stored)).not.toContain('n1');

    // Change everything, then apply the saved view back.
    await type(search, '');
    await click(toggles[1]!);
    expect(host.querySelectorAll('.wb-browser-row')).toHaveLength(3);

    const pick = host.querySelector('.wb-browser-view-pick') as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(pick, stored.views[0].id);
      pick.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect((host.querySelector('.wb-browser-search') as HTMLInputElement).value).toBe('animal');
    expect(host.querySelectorAll('.wb-browser-row')).toHaveLength(2);
    expect(([...host.querySelectorAll('.wb-browser-column-toggle input')] as HTMLInputElement[])[1]!.checked).toBe(false);

    await click(buttonBy('ankiWorkbench.browser.views.delete'));
    expect(JSON.parse(window.localStorage.getItem('jp-anki-browser-views') ?? '{}').views).toEqual([]);
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

  it('opens a note in the inspector without changing the selection', async () => {
    await toBrowse(browsable());
    expect(host.querySelector('.wb-inspector')).toBeNull();

    await click(host.querySelectorAll('.wb-browser-cell')[0] as HTMLElement);
    const inspector = host.querySelector('.wb-inspector')!;
    expect(inspector.textContent).toContain('ankiWorkbench.inspector.noteType:Basic');
    expect(inspector.textContent).toContain('ankiWorkbench.inspector.cards:1');
    // Opening is not selecting.
    expect(host.textContent).toContain('ankiWorkbench.browser.selected:0');
    expect(host.querySelectorAll('.wb-browser-row.focused')).toHaveLength(1);
  });

  it('edits a field on blur, updates the row, and undoes it', async () => {
    await toBrowse(browsable());
    await click(host.querySelectorAll('.wb-browser-cell')[0] as HTMLElement);
    const box = host.querySelector('.wb-inspector-input') as HTMLTextAreaElement;
    await type(box, '<b>とら</b>');
    await blur(box);

    // The row reads the normalized text, so the HTML must not leak into it.
    const firstRow = host.querySelectorAll('.wb-browser-row')[0]!;
    expect(firstRow.textContent).toContain('とら');
    expect(firstRow.textContent).not.toContain('<b>');
    expect(firstRow.className).toContain('edited');
    expect(host.textContent).toContain('ankiWorkbench.browser.edited:1');

    await click(buttonBy('ankiWorkbench.edit.undo'));
    expect(host.querySelectorAll('.wb-browser-row')[0]!.textContent).toContain('ねこ');
    expect(host.textContent).not.toContain('ankiWorkbench.browser.edited');
    expect(buttonBy('ankiWorkbench.edit.undo').disabled).toBe(true);
    expect(buttonBy('ankiWorkbench.edit.redo').disabled).toBe(false);
  });

  it('says what a cloze edit would do to the cards instead of doing it silently', async () => {
    const d = browsable();
    d.noteTypes[0]!.kind = 'cloze';
    d.notes[0]!.fields[0] = { ord: 0, name: 'Expression', raw: '{{c1::ねこ}}', normalized: 'ねこ' };
    await toBrowse(d);
    await click(host.querySelectorAll('.wb-browser-cell')[0] as HTMLElement);

    const box = host.querySelector('.wb-inspector-input') as HTMLTextAreaElement;
    await type(box, '{{c1::ねこ}} {{c2::猫}}');
    await blur(box);
    expect(host.querySelector('.wb-inspector')!.textContent).toContain(
      'ankiWorkbench.inspector.clozeAdded:2',
    );
  });

  it('drops the edit journal when a different source replaces the draft', async () => {
    // An op names a note id; replaying it against another deck would write one
    // deck's text into a note that merely shares an id.
    await toBrowse(browsable());
    await click(host.querySelectorAll('.wb-browser-cell')[0] as HTMLElement);
    const box = host.querySelector('.wb-inspector-input') as HTMLTextAreaElement;
    await type(box, 'edited');
    await blur(box);
    expect(host.textContent).toContain('ankiWorkbench.browser.edited:1');

    await click(([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[0]!);
    await click(buttonBy('ankiWorkbench.source.apkg'));
    await click(([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[1]!);
    expect(host.textContent).not.toContain('ankiWorkbench.browser.edited');
    expect(buttonBy('ankiWorkbench.edit.undo').disabled).toBe(true);
  });

  it('drives the whole Browser grid from the keyboard', async () => {
    await toBrowse(browsable());
    const grid = host.querySelector('.wb-browser-grid') as HTMLDivElement;
    expect(grid.getAttribute('role')).toBe('grid');
    // One tab stop for the list: 100k rows have no tabbable order to walk, so
    // every row control is out of it and the grid itself is in it.
    expect(grid.tabIndex).toBe(0);
    for (const el of host.querySelectorAll('.wb-browser-row input, .wb-browser-row button')) {
      expect((el as HTMLElement).tabIndex).toBe(-1);
    }

    // Arrow down from nowhere lands on the first row and opens it.
    await key(grid, 'ArrowDown');
    expect(grid.getAttribute('aria-activedescendant')).toBe('wb-row-n1');
    expect(host.querySelector('.wb-inspector')).not.toBeNull();
    // Moving the cursor is not selecting: the batch is untouched.
    expect(host.textContent).toContain('ankiWorkbench.browser.selected:0');

    await key(grid, 'ArrowDown');
    expect(grid.getAttribute('aria-activedescendant')).toBe('wb-row-n2');
    await key(grid, ' ');
    expect(host.textContent).toContain('ankiWorkbench.browser.selected:1');
    expect(rowOf('n2').getAttribute('aria-selected')).toBe('true');

    // Shift+Arrow extends from the anchor the last plain move set.
    await key(grid, 'ArrowDown', { shiftKey: true });
    expect(host.textContent).toContain('ankiWorkbench.browser.selected:2');
    expect(rowOf('n3').getAttribute('aria-selected')).toBe('true');
    expect(rowOf('n1').getAttribute('aria-selected')).toBe('false');

    // Home/End are absolute, and neither disturbs the selection.
    await key(grid, 'Home');
    expect(grid.getAttribute('aria-activedescendant')).toBe('wb-row-n1');
    await key(grid, 'End');
    expect(grid.getAttribute('aria-activedescendant')).toBe('wb-row-n3');
    expect(host.textContent).toContain('ankiWorkbench.browser.selected:2');

    // Ctrl+A is the footer button, not a second, looser rule.
    await key(grid, 'a', { ctrlKey: true });
    expect(host.textContent).toContain('ankiWorkbench.browser.selected:3');

    // Escape closes the inspector without clearing the batch.
    await key(grid, 'Escape');
    expect(host.querySelector('.wb-inspector')).toBeNull();
    expect(host.textContent).toContain('ankiWorkbench.browser.selected:3');
  });

  it('does not walk the cursor off either end of the grid', async () => {
    await toBrowse(browsable());
    const grid = host.querySelector('.wb-browser-grid') as HTMLDivElement;
    await key(grid, 'ArrowUp');
    // From nowhere, ArrowUp enters at the last row rather than doing nothing.
    expect(grid.getAttribute('aria-activedescendant')).toBe('wb-row-n3');
    for (let i = 0; i < 5; i += 1) await key(grid, 'ArrowDown');
    expect(grid.getAttribute('aria-activedescendant')).toBe('wb-row-n3');
    for (let i = 0; i < 5; i += 1) await key(grid, 'ArrowUp');
    expect(grid.getAttribute('aria-activedescendant')).toBe('wb-row-n1');
    // PageUp/PageDown clamp the same way rather than throwing on an empty slot.
    await key(grid, 'PageDown');
    expect(grid.getAttribute('aria-activedescendant')).toBe('wb-row-n3');
  });

  it('survives a session list that throws', async () => {
    ankiDraftSessionList.mockRejectedValue(new Error('no store'));
    await mount();
    expect(host.textContent).toContain('ankiWorkbench.sessions.none');
    expect(host.querySelectorAll('.deck-workbench-source')).toHaveLength(3);
  });
});

describe('DeckWorkbench step 7 — Apply or export', () => {
  /** Select everything on step 2, then walk the flow to step 7. */
  async function toApply() {
    await click(buttonBy('ankiWorkbench.browser.selectAll'));
    for (let i = 0; i < 5; i += 1) await click(buttonBy('ankiWorkbench.next'));
  }

  /** Edit n1's Expression through the inspector, so the net set is non-empty. */
  async function editOneField() {
    await click(host.querySelectorAll('.wb-browser-cell')[0] as HTMLElement);
    const field = host.querySelector('.wb-inspector-input') as HTMLTextAreaElement;
    await type(field, 'ねこ・edited');
    await blur(field);
  }

  it('offers no export for a source that is not a package file', async () => {
    loadDeckAsAnkiDraft.mockReturnValue({
      draft: browsable({ source: { kind: 'local-deck', label: 'Local deck', fingerprint: 'fp-local' } }),
    });
    await mount();
    await click(buttonBy('ankiWorkbench.source.localDeck'));
    await click(buttonBy('ankiWorkbench.next'));
    await toApply();

    expect(host.textContent).toContain('ankiWorkbench.apply.noFile');
    expect(host.querySelector('.wb-apply-export')).toBeNull();
    expect(exportApkgDraft).not.toHaveBeenCalled();
  });

  it('disables export over an empty net change set and says why', async () => {
    await toBrowse(browsable());
    await toApply();

    expect(host.textContent).toContain('ankiWorkbench.apply.empty');
    const button = host.querySelector('.wb-apply-export') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await click(button);
    expect(exportApkgDraft).not.toHaveBeenCalled();
  });

  it('exports the net set through the real channel, with no outPath, and records the step', async () => {
    exportApkgDraft.mockResolvedValue({
      ok: true,
      filePath: 'C:\\out\\Core 2k (edited).apkg',
      fileName: 'Core 2k (edited).apkg',
      notesUpdated: 1,
      cardsUpdated: 0,
      verified: true,
      fingerprint: 'fp-new',
    });
    await toBrowse(browsable());
    await editOneField();
    await toApply();

    // The claim is computed from the same builder the exporter receives.
    expect(host.textContent).toContain('ankiWorkbench.apply.notes:1');
    await click(buttonBy('ankiWorkbench.apply.export'));

    expect(exportApkgDraft).toHaveBeenCalledTimes(1);
    const request = exportApkgDraft.mock.calls[0]![0];
    expect(request.fingerprint).toBe('fp-1');
    expect(request.changes.notes).toEqual([
      { noteId: 'n1', fields: ['ねこ・edited', 'ねこ-en'], tags: undefined },
    ]);
    expect(request.changes.cardMoves).toEqual([]);
    // No outPath and no sourcePath: the save dialog and the fingerprint's
    // remembered path are the production path, and the test proves it is taken.
    expect(request).not.toHaveProperty('outPath');
    expect(request).not.toHaveProperty('sourcePath');

    expect(host.textContent).toContain('ankiWorkbench.apply.ok.file:C:\\out\\Core 2k (edited).apkg');
    expect(host.textContent).toContain('ankiWorkbench.apply.ok.counts:1,0');
    expect(host.textContent).toContain('ankiWorkbench.apply.ok.verified');
    expect(host.textContent).toContain('ankiWorkbench.step.apply.outcome:Core 2k (edited).apkg,1');
    expect(host.textContent).toContain('ankiWorkbench.progress:7,7');
  });

  it('reports a refusal under its own code and does not satisfy the step', async () => {
    exportApkgDraft.mockResolvedValue({
      ok: false,
      errorCode: 'source-changed',
      error: 'fingerprint moved',
    });
    await toBrowse(browsable());
    await editOneField();
    await toApply();
    await click(buttonBy('ankiWorkbench.apply.export'));

    const alert = host.querySelector('.wb-apply-result [role="alert"]');
    expect(alert?.textContent).toContain('ankiWorkbench.apply.error.source-changed');
    // The adapter's own words survive alongside the translated line.
    expect(host.textContent).toContain('fingerprint moved');
    expect(host.textContent).toContain('ankiWorkbench.progress:6,7');
  });

  it('stays silent when the save dialog is cancelled', async () => {
    exportApkgDraft.mockResolvedValue({ ok: false, errorCode: 'cancelled' });
    await toBrowse(browsable());
    await editOneField();
    await toApply();
    await click(buttonBy('ankiWorkbench.apply.export'));

    expect(host.querySelector('.wb-apply-result')).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain('ankiWorkbench.progress:6,7');
  });
});
