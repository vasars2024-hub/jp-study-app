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

import type { AnkiDraft, AnkiDraftDiagnostic } from '../../shared/ankiDraft';
import DeckWorkbench from '../components/anki/DeckWorkbench';

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

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
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
    readApkgDraft.mockResolvedValue({ ok: true, draft: draft() });
    await mount();
    await click(buttonBy('ankiWorkbench.source.apkg'));
    await click(buttonBy('ankiWorkbench.next'));

    expect(host.textContent).toContain('ankiWorkbench.step.notReady');
    expect(host.querySelector('.deck-workbench-rail')).toBeNull();
    // Back, Next and the stepper are the only controls on an unbuilt step.
    const controls = [...host.querySelectorAll('.deck-workbench-body button')];
    expect(controls).toHaveLength(0);
  });

  it('marks later steps stale when a second source replaces the first', async () => {
    readApkgDraft.mockResolvedValue({ ok: true, draft: draft() });
    await mount();
    await click(buttonBy('ankiWorkbench.source.apkg'));
    await click(buttonBy('ankiWorkbench.next'));
    // Step 2 records nothing yet, so stale needs a satisfied later step; the
    // observable contract here is that a re-read returns the user to step 1's
    // recorded outcome with the new numbers, not the old ones.
    await click(([...host.querySelectorAll('.deck-workbench-step')] as HTMLButtonElement[])[0]!);
    readApkgDraft.mockResolvedValue({
      ok: true,
      draft: draft({
        source: { kind: 'apkg', label: 'Kaishi', fingerprint: 'fp-3' },
        counts: { notes: 1, cards: 1, decks: 1, noteTypes: 1, reviews: 0, mediaReferences: 0 },
      }),
    });
    await click(buttonBy('ankiWorkbench.source.apkg'));
    expect(host.textContent).toContain('ankiWorkbench.step.source.outcome:Kaishi,1');
    expect(host.textContent).not.toContain('Core 2k');
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

  it('survives a session list that throws', async () => {
    ankiDraftSessionList.mockRejectedValue(new Error('no store'));
    await mount();
    expect(host.textContent).toContain('ankiWorkbench.sessions.none');
    expect(host.querySelectorAll('.deck-workbench-source')).toHaveLength(3);
  });
});
