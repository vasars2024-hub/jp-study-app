// @vitest-environment jsdom
/**
 * Phase 6 slice 6 — the watch-to-review loop's surface.
 *
 * Real client render (see `seanimeStudyLibraryPanel.test.ts` for why the docblock is
 * needed and why SSR is not an option — this component's data arrives in an effect).
 *
 * The states worth pinning hardest are the ones that would otherwise degrade silently:
 * a dead Anki must not make every card read `Not tracked` as if that were a verdict, a
 * stream-mined card must not offer a replay button that does nothing, and the replay
 * event must actually carry a start position — without it the loop is just a list.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntervalEntry } from '../../shared/anki';
import { MEDIA_WORKSPACE_OPEN_EVENT } from '../../shared/mediaWorkspace';
import {
  VIDEO_CORE_MINING_HISTORY_KEY,
  type VideoCoreMiningHistoryEntry,
  type VideoCoreMiningHistoryStatus,
} from '../../shared/videoCoreMining';

const PATH = 'C:\\Library\\Frieren\\Sousou no Frieren - 01.mkv';

function historyEntry(patch: {
  id?: string;
  noteId?: number;
  status?: VideoCoreMiningHistoryStatus;
  term?: string;
  sentence?: string;
  localFilePath?: string;
  startMs?: number;
  createdAt?: number;
} = {}): VideoCoreMiningHistoryEntry {
  const startMs = patch.startMs ?? 125_000;
  const sentence = patch.sentence ?? '猫が窓辺で寝ている。';
  return {
    id: patch.id ?? 'mine-1',
    createdAt: patch.createdAt ?? 1_700_000_000_000,
    status: patch.status ?? 'exported',
    noteId: patch.noteId ?? 501,
    term: patch.term ?? '無防備',
    sentence,
    provenance: {
      schemaVersion: 1,
      cue: { index: 0, trackNumber: 3, rawText: sentence, text: sentence, startMs, endMs: startMs + 3000 },
      source: {
        playbackId: 'p1',
        playbackType: 'localfile',
        streamType: 'native',
        ...(patch.localFilePath === undefined
          ? { localFilePath: PATH }
          : patch.localFilePath
            ? { localFilePath: patch.localFilePath }
            : {}),
        mediaTitle: 'Sousou no Frieren',
        episodeNumber: 1,
      },
      assets: {},
      capturedAt: patch.createdAt ?? 1_700_000_000_000,
    },
  };
}

let host: HTMLDivElement | null = null;

function stub(
  history: VideoCoreMiningHistoryEntry[],
  intervals: IntervalEntry[] | null = [],
  anki: { connected: boolean; error?: string } = { connected: true },
): void {
  localStorage.setItem(VIDEO_CORE_MINING_HISTORY_KEY, JSON.stringify(history));
  vi.stubGlobal('window', globalThis.window);
  requestedNoteIds = null;
  (globalThis.window as unknown as { api: Record<string, unknown> }).api = {
    ankiStatus: async () => ({ decks: [], models: [], ...anki }),
    // The panel must ask for ITS OWN note ids, never for the collection. The collection-wide
    // poll does not return inside a minute on a real library, and its word-only expression
    // filter drops mined sentence cards, so a panel that called it was both slow and unable
    // to answer. `ankiGetIntervals` is deliberately absent from this stub: a panel that
    // reaches for it now fails loudly instead of quietly going back to the slow path.
    ankiGetIntervalsForNotes: async (noteIds: readonly number[]) => {
      requestedNoteIds = [...noteIds];
      return intervals === null ? null : {
        generatedAt: 1,
        sourceQueries: [`nid:${noteIds.length} notes`],
        entries: intervals.filter((e) => noteIds.includes(e.noteId)),
        noteCount: intervals.length,
        truncated: false,
      };
    },
  };
}

/** What the last render asked Anki about. See the note in `stubApi`. */
let requestedNoteIds: number[] | null = null;

afterEach(() => {
  host?.remove();
  host = null;
  localStorage.clear();
});

beforeEach(() => {
  vi.resetModules();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

async function render(): Promise<HTMLDivElement> {
  const { default: Panel } = await import('../components/reading/SeanimeWatchLoopPanel');
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Panel, {}));
  });
  return host;
}

describe('SeanimeWatchLoopPanel', () => {
  it('mounts the load status as a live region before it has content', async () => {
    stub([]);
    const el = await render();
    const status = el.querySelector('.study-lib-status');
    expect(status).not.toBeNull();
    expect(status?.getAttribute('aria-live')).toBe('polite');
  });

  it('asks Anki only about the notes it mined, never about the collection', async () => {
    // The whole point of `ankiGetIntervalsForNotes`. `deck:*` matched 155,377 notes on the
    // machine this was measured on, walked 500 at a time, and did not return inside a minute
    // — so the panel never left its loading line and staged everything `untracked`.
    // proof/mining-rollup-live-20260802slice47mine4/.
    stub(
      [historyEntry({ noteId: 501 }), historyEntry({ noteId: 502, id: 'h2' })],
      [{ expression: 'x', ivlDays: 3, noteId: 501, modelName: 'm' }],
    );
    await render();
    expect(requestedNoteIds).toEqual([501, 502]);
  });

  it('stages a card whose term is a SENTENCE, which the collection index cannot hold', async () => {
    // `runPoll` skips any expression with whitespace or over 24 characters, so a mined
    // sentence card — what VideoCoreMiningPanel produces by default — could never be staged
    // from the collection snapshot even after it finished. A by-note lookup has no such rule.
    stub(
      [historyEntry({ noteId: 777, term: 'The cat is sleeping by the window.' })],
      [{
        expression: 'The cat is sleeping by the window.',
        ivlDays: 0, noteId: 777, modelName: 'JP Study App::JA-EN Classic',
      }],
    );
    const el = await render();
    const card = el.querySelector('.study-loop-card');
    expect(card).not.toBeNull();
    expect(card?.getAttribute('data-stage')).not.toBe('untracked');
  });

  it('explains the loop instead of rendering a blank panel with no history', async () => {
    stub([]);
    const el = await render();
    expect(el.querySelector('.study-lib-empty')).not.toBeNull();
    expect(el.textContent).toContain('Nothing mined yet');
    expect(el.querySelector('.study-loop-stats')).toBeNull();
  });

  it('shows a leech in the attention list and marks the row structurally', async () => {
    stub(
      [historyEntry({ noteId: 501 })],
      [{ expression: 'x', ivlDays: 2, noteId: 501, modelName: 'm', leech: true }],
    );
    const el = await render();
    // Structural attribute, not the badge text — "Leech" also appears as a stage label
    // elsewhere, so text alone would pass either way.
    const card = el.querySelector('.study-loop-card[data-stage="leech"]');
    expect(card).not.toBeNull();
    expect(card?.getAttribute('data-prominent')).toBe('true');
  });

  it('says nothing is stuck rather than showing an empty attention list', async () => {
    stub(
      [historyEntry({ noteId: 501 })],
      [{ expression: 'x', ivlDays: 30, noteId: 501, modelName: 'm' }],
    );
    const el = await render();
    expect(el.querySelector('.study-loop-clear')).not.toBeNull();
    expect(el.querySelector('.study-loop-card[data-prominent="true"]')).toBeNull();
    // The card still appears in the full list below.
    expect(el.querySelector('.study-loop-card[data-stage="known"]')).not.toBeNull();
  });

  it('replays a card by raising the workspace event WITH a start position', async () => {
    // Without startAtSec this whole feature is a list. 125,000 ms minus the 1.2 s lead-in.
    stub([historyEntry({ startMs: 125_000 })], []);
    const el = await render();
    const detail: Array<{ localFilePath?: string; startAtSec?: number }> = [];
    const listener = (event: Event): void => {
      detail.push((event as CustomEvent<{ localFilePath?: string; startAtSec?: number }>).detail);
    };
    window.addEventListener(MEDIA_WORKSPACE_OPEN_EVENT, listener);
    const button = el.querySelector<HTMLButtonElement>('.study-loop-card .study-lib-open');
    await act(async () => { button?.click(); });
    window.removeEventListener(MEDIA_WORKSPACE_OPEN_EVENT, listener);
    expect(detail).toHaveLength(1);
    expect(detail[0]?.localFilePath).toBe(PATH);
    expect(detail[0]?.startAtSec).toBeCloseTo(123.8);
  });

  it('disables replay for a stream-mined card and says why', async () => {
    stub([historyEntry({ localFilePath: '' })], []);
    const el = await render();
    const button = el.querySelector<HTMLButtonElement>('.study-loop-card .study-lib-open');
    expect(button?.disabled).toBe(true);
    // A disabled control with no stated reason reads as broken.
    expect(button?.getAttribute('title')).toContain('no file to return to');
  });

  it('names the replay button by term, so a screen reader can tell the rows apart', async () => {
    stub([historyEntry({ term: '無防備' })], []);
    const el = await render();
    const button = el.querySelector('.study-loop-card .study-lib-open');
    expect(button?.getAttribute('aria-label')).toContain('無防備');
  });

  it('reports review state as unknown when Anki is down, rather than as zeroes', async () => {
    stub([historyEntry({ noteId: 501 })], null, { connected: false, error: 'ECONNREFUSED' });
    const el = await render();
    const note = el.querySelector('.study-loop-note[data-alert="true"]');
    expect(note?.textContent).toContain('Anki is not reachable');
    expect(note?.textContent).toContain('ECONNREFUSED');
    // And the card is still listed and still replayable — the provenance half works.
    expect(el.querySelector('.study-loop-card')).not.toBeNull();
    expect(el.querySelector<HTMLButtonElement>('.study-loop-card .study-lib-open')?.disabled)
      .toBe(false);
  });

  it('never claims nothing is stuck when Anki was never asked', async () => {
    // Found by looking at the harness, not by jsdom: with Anki down the attention list
    // was rendering "Nothing is stuck — every mined card is in normal rotation", which is
    // a clean bill of health derived from an unanswered question.
    stub([historyEntry({ noteId: 501 })], null, { connected: false });
    const el = await render();
    expect(el.querySelector('.study-loop-clear')?.textContent)
      .toContain('could not be asked');
    expect(el.textContent).not.toContain('normal rotation');
  });

  it('drops the Anki-derived stat tiles when Anki is unreachable', async () => {
    // A rendered `0` for "Need a look" is not a small inaccuracy while disconnected — it
    // is a confident claim. Only the provenance-derived card count survives.
    stub([historyEntry({ noteId: 501 })], null, { connected: false });
    const el = await render();
    const labels = [...el.querySelectorAll('.study-loop-stat dt')].map((n) => n.textContent);
    expect(labels).toEqual(['Cards']);
  });

  it('does not blame the sync query when Anki is unreachable', async () => {
    // `untracked` is meaningless while disconnected: nothing was asked.
    stub([historyEntry({ noteId: 501 })], null, { connected: false });
    const el = await render();
    expect(el.textContent).not.toContain('sync query');
  });

  it('explains untracked cards when Anki IS connected', async () => {
    stub([historyEntry({ noteId: 501 })], []);
    const el = await render();
    expect(el.textContent).toContain('sync query');
  });

  it('reports refused duplicates instead of dropping them silently', async () => {
    stub([historyEntry({ id: 'd', status: 'duplicate' })], []);
    const el = await render();
    expect(el.textContent).toContain('already had the note');
    // A duplicate produced no card, so the empty state must NOT claim nothing happened.
    expect(el.textContent).not.toContain('Nothing mined yet');
  });

  it('omits the sentence when it is the same string as the term', async () => {
    // A sentence card's term IS the sentence — printing it twice is noise.
    stub([historyEntry({ term: '猫が窓辺で寝ている。', sentence: '猫が窓辺で寝ている。' })], []);
    const el = await render();
    expect(el.querySelector('.study-loop-sentence')).toBeNull();
  });

  describe('focus handoff from a readiness row', () => {
    const OTHER = 'C:\\Library\\Other\\Some Other Show - 03.mkv';
    const focus = { pathKey: PATH.replace(/\\/g, '/').toLowerCase(), title: 'Frieren 01' };

    async function renderFocused(f: typeof focus | null): Promise<HTMLDivElement> {
      const { default: Panel } = await import('../components/reading/SeanimeWatchLoopPanel');
      host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      await act(async () => {
        root.render(createElement(Panel, { focus: f, onClearFocus: () => undefined }));
      });
      return host;
    }

    it('scopes the cards to the focused file', async () => {
      stub([
        historyEntry({ id: 'a', noteId: 1 }),
        historyEntry({ id: 'b', noteId: 2, localFilePath: OTHER }),
      ], []);
      const el = await renderFocused(focus);
      expect(el.querySelectorAll('.study-loop-card')).toHaveLength(1);
      expect(el.querySelector('.study-loop-focus')?.textContent).toContain('Frieren 01');
    });

    it('scopes the STAT TILES too, not just the rendered list', async () => {
      // Filtering only the list would leave the tiles reporting the whole library beside
      // a single title's cards — quietly wrong, which is what this surface exists against.
      stub([
        historyEntry({ id: 'a', noteId: 1 }),
        historyEntry({ id: 'b', noteId: 2, localFilePath: OTHER }),
        historyEntry({ id: 'c', noteId: 3, localFilePath: OTHER }),
      ], []);
      const el = await renderFocused(focus);
      const cardsTile = [...el.querySelectorAll('.study-loop-stat')]
        .find((tile) => tile.querySelector('dt')?.textContent === 'Cards');
      expect(cardsTile?.querySelector('dd')?.textContent).toBe('1');
    });

    it('stays clearable when the focus matches nothing', async () => {
      // Otherwise the view is a dead end with no way back out.
      stub([historyEntry({ noteId: 1, localFilePath: OTHER })], []);
      const el = await renderFocused(focus);
      expect(el.querySelector('.study-loop-focus button')).not.toBeNull();
      expect(el.textContent).toContain('No cards from this title');
      // And it must NOT claim the user has never mined anything.
      expect(el.textContent).not.toContain('Nothing mined yet');
    });

    it('shows everything with no focus', async () => {
      stub([
        historyEntry({ id: 'a', noteId: 1 }),
        historyEntry({ id: 'b', noteId: 2, localFilePath: OTHER }),
      ], []);
      const el = await renderFocused(null);
      expect(el.querySelectorAll('.study-loop-card')).toHaveLength(2);
      expect(el.querySelector('.study-loop-focus')).toBeNull();
    });
  });

  it('emphasises the attention tile only when something needs attention', async () => {
    stub(
      [historyEntry({ noteId: 501 })],
      [{ expression: 'x', ivlDays: 30, noteId: 501, modelName: 'm' }],
    );
    const el = await render();
    expect(el.querySelector('.study-loop-stat[data-alert="true"]')).toBeNull();
  });
});
