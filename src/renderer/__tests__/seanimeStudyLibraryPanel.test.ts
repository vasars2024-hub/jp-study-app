// @vitest-environment jsdom
/**
 * Phase 6 slice 2 — the Study Mode surface.
 *
 * Real client render (see `videoCoreMiningPanelStructure.test.ts` for why the docblock is
 * needed and why SSR is not an option here — this component's data arrives in an effect).
 *
 * The two states worth pinning hardest are the ones the real data actually produces:
 * "sidecar ready but the library is empty" (the user's current state, measured in
 * `proof/phase6-join-20260730/`) and "29 of 30 items have no Japanese subtitle". Both were
 * blank or misleading in the obvious implementation.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeanimeLibraryFile } from '../../shared/seanimeStudyLibrary';
import type { MediaItem } from '../../shared/types';

const PATH = 'C:\\Library\\Frieren\\Sousou no Frieren - 01.mkv';

function mediaItem(patch: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'study-1',
    title: 'Frieren 01',
    path: PATH,
    fileName: 'Sousou no Frieren - 01.mkv',
    addedAt: 1,
    subtitles: [{ id: 'sub-ja', lang: 'ja', source: 'embedded', format: 'srt', path: 's.srt' }],
    ...patch,
  } as MediaItem;
}

let host: HTMLDivElement | null = null;

function stubApi(
  reply: { ok: true; files: SeanimeLibraryFile[] } | { ok: false; error: string },
  media: MediaItem[] = [],
  addMediaPaths: (paths: string[]) => Promise<MediaItem[]> = async () => media,
  anki: { connected: boolean; decks: string[]; error?: string } = {
    connected: true,
    decks: ['JP Study::Immersion'],
  },
  /**
   * Merged last, so a case can replace any route — D311 needs `seanimeStart` and
   * a `seanimeStudyLibrary` whose answer CHANGES once the sidecar is up, which a
   * fixed `reply` cannot express.
   */
  overrides: Record<string, unknown> = {},
): void {
  vi.stubGlobal('window', globalThis.window);
  (globalThis.window as unknown as { api: Record<string, unknown> }).api = {
    seanimeStudyLibrary: async () => reply,
    listMedia: async () => media,
    addMediaPaths,
    ankiStatus: async () => ({ models: [], ...anki }),
    profileRulesGet: async () => ({ schemaVersion: 2, rules: [] }),
    seanimeStart: async () => ({ kind: 'ready', error: null }),
    ...overrides,
  };
}

afterEach(() => {
  host?.remove();
  host = null;
});

beforeEach(() => {
  vi.resetModules();
  // Without this React warns "not configured to support act(...)" on every update, which
  // is noise that would hide a real warning.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

async function render(props: Record<string, unknown> = {}): Promise<string> {
  const { default: Panel } = await import('../components/reading/SeanimeStudyLibraryPanel');
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Panel, props));
  });
  return host.innerHTML;
}

describe('SeanimeStudyLibraryPanel', () => {
  it('mounts the load status as a live region before it has content', async () => {
    stubApi({ ok: true, files: [] });
    const html = await render();
    expect(html).toContain('class="study-lib-status"');
    expect(html).toContain('aria-live="polite"');
  });

  it('explains an empty media server instead of rendering a blank panel', async () => {
    // This is the user's REAL current state: local_files is [] and no scan has ever run.
    stubApi({ ok: true, files: [] });
    const html = await render();
    expect(html).toContain('The media server has no files yet.');
    expect(html).toContain('run a scan');
    // Filters and list are meaningless with no files and must not render.
    expect(html).not.toContain('class="study-lib-filters"');
    expect(html).not.toContain('class="study-lib-list"');
  });

  it('shows an offline sidecar as an explicit reason, never as an empty library', async () => {
    stubApi({ ok: false, error: 'Seanime sidecar is stopped.' });
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).toContain('Seanime sidecar is stopped.');
    expect(html).toContain('The media library could not be read.');
    // The distinction that matters: this must NOT read as "your library is empty".
    expect(html).not.toContain('The media server has no files yet.');
  });

  /**
   * D311 — measured live, pid 4652 window 1: the Readiness pane said "Start the
   * media server, then refresh." and the whole window held 16 buttons, of which
   * the only pane control was Refresh. `MediaWorkspaceHost` and `BlancStudyPlayer`
   * have carried a real Start button the whole time, so the capability existed and
   * this surface alone was a dead end.
   */
  describe('the offline state can start the server it names', () => {
    it('offers the control its own instruction asks for', async () => {
      stubApi({ ok: false, error: 'Seanime sidecar is stopped.' });
      const html = await render();
      expect(html).toContain('Start the media server, then refresh.');
      expect(html).toContain('Start the media server<');
    });

    it('does not offer it once the library reads', async () => {
      // Control: an unconditional button would pass the case above while making
      // the healthy surface offer a redundant start.
      stubApi({ ok: true, files: [] });
      const html = await render();
      expect(html).not.toContain('Start the media server');
    });

    it('re-reads the library after a start that reaches ready', async () => {
      let up = false;
      stubApi({ ok: false, error: 'Seanime sidecar is stopped.' }, [mediaItem()], undefined, undefined, {
        seanimeStudyLibrary: async () => (up
          ? { ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }
          : { ok: false, error: 'Seanime sidecar is stopped.' }),
        seanimeStart: async () => {
          up = true;
          return { kind: 'ready', error: null };
        },
      });
      await render();
      const mounted = host as HTMLDivElement;
      const button = [...mounted.querySelectorAll('button')]
        .find((b) => b.textContent?.trim() === 'Start the media server');
      expect(button).toBeTruthy();
      await act(async () => { (button as HTMLButtonElement).click(); });
      // The panel reloaded on its own: the error box is gone and real rows arrived.
      expect(mounted.innerHTML).not.toContain('The media library could not be read.');
      expect(mounted.innerHTML).toContain('class="study-lib-list"');
    });

    it('says why a start failed instead of silently doing nothing', async () => {
      stubApi({ ok: false, error: 'Seanime sidecar is stopped.' }, [], undefined, undefined, {
        seanimeStart: async () => ({
          kind: 'failed',
          error: 'sidecar did not become healthy within 30s',
        }),
      });
      await render();
      const mounted = host as HTMLDivElement;
      const button = [...mounted.querySelectorAll('button')]
        .find((b) => b.textContent?.trim() === 'Start the media server');
      expect(button).toBeTruthy();
      await act(async () => { (button as HTMLButtonElement).click(); });
      expect(mounted.innerHTML).toContain('sidecar did not become healthy within 30s');
      // Still offline, and still says so — a failed start must not look like a fix.
      expect(mounted.innerHTML).toContain('The media library could not be read.');
    });
  });

  it('states the next action for each state, not just the state name', async () => {
    stubApi(
      { ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] },
      [mediaItem()],
    );
    const html = await render();
    expect(html).toContain('Not analysed');
    expect(html).toContain('Analyse the attached Japanese subtitles.');
  });

  it('puts a file Study OS never imported in `unlinked` with an import action', async () => {
    stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, []);
    const html = await render();
    expect(html).toContain('Not imported');
    expect(html).toContain('Import this file into Gum');
  });

  it('surfaces the no-Japanese-subtitle case, which is 29 of 30 real items', async () => {
    stubApi(
      { ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] },
      [mediaItem({ subtitles: [] })],
    );
    const html = await render();
    expect(html).toContain('No Japanese subtitles');
    expect(html).toContain('Find Japanese subtitles for this file first.');
  });

  it('defaults to the work queue and excludes ready files from it', async () => {
    stubApi(
      {
        ok: true,
        files: [
          { path: PATH, mediaId: 1, episode: 1 },
          { path: 'C:\\Library\\other.mkv', mediaId: 2, episode: 2 },
        ],
      },
      [mediaItem(), mediaItem({ id: 'study-2', path: 'C:\\Library\\other.mkv', subtitles: [] })],
    );
    const html = await render();
    // Both need work, so both appear; the default filter is the queue.
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Needs work');
    expect((html.match(/class="study-lib-row"/g) ?? []).length).toBe(2);
  });

  it('gives the filter group an accessible name via role=group', async () => {
    stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, [mediaItem()]);
    const html = await render();
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Filter by readiness"');
  });

  it('shows the joined path, so an unexpected `unlinked` is debuggable', async () => {
    stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, []);
    const html = await render();
    expect(html).toContain('class="study-lib-row-path"');
    expect(html).toContain('Sousou no Frieren - 01.mkv');
  });

  it('renders no readiness score when no orchestrator document is supplied', async () => {
    stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, [mediaItem()]);
    const html = await render();
    // The component must not invent a coverage figure it has no document for.
    expect(html).not.toContain('% known');
  });

  it('hides the level filter when nothing in the library is scored', async () => {
    // With no readiness document that is every entry, so an always-present control would
    // offer a filter that cannot do anything.
    stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, [mediaItem()]);
    const html = await render();
    expect(html).not.toContain('class="study-lib-level"');
  });

  it('offers an Open action named by title, not a row of identical "Open"s', async () => {
    stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, [mediaItem()]);
    const html = await render();
    expect(html).toContain('class="study-lib-open"');
    expect(html).toContain('aria-label="Open Frieren 01"');
  });

  it('reports Anki as healthy only when a mined card would actually land', async () => {
    stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, [mediaItem()]);
    const html = await render();
    expect(html).toContain('Anki is connected');
    expect(html).toContain('data-ok="true"');
  });

  it('states the fix when Anki is unreachable, and keeps the library usable', async () => {
    stubApi(
      { ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] },
      [mediaItem()],
      async () => [mediaItem()],
      { connected: false, decks: [], error: 'AnkiConnect refused the connection.' },
    );
    const html = await render();
    expect(html).toContain('Anki is not reachable');
    expect(html).toContain('AnkiConnect refused the connection.');
    expect(html).toContain('data-ok="false"');
    // Subtitle work is still actionable without Anki — the list must survive.
    expect(html).toContain('class="study-lib-list"');
  });

  it('separates "connected but no decks" from "unreachable"', async () => {
    stubApi(
      { ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] },
      [mediaItem()],
      async () => [mediaItem()],
      { connected: true, decks: [] },
    );
    const html = await render();
    expect(html).toContain('no decks to mine into');
    expect(html).not.toContain('not reachable');
  });

  it('offers Import only where importing is the stated next action', async () => {
    stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, []);
    const unlinked = await render();
    expect(unlinked).toContain('aria-label="Import Sousou no Frieren - 01.mkv into Gum"');

    // Already in Study OS: an Import button here would do nothing and say nothing.
    stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, [mediaItem()]);
    const linked = await render();
    expect(linked).not.toContain('into Gum');
  });

  it('imports through the committed addMediaPaths contract and re-resolves the row', async () => {
    let received: string[] = [];
    stubApi(
      { ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] },
      [],
      async (paths) => { received = paths; return [mediaItem()]; },
    );
    await render();
    const button = host?.querySelector<HTMLButtonElement>('.study-lib-open');
    await act(async () => { button?.click(); });
    expect(received).toEqual([PATH]);
    const html = host?.innerHTML ?? '';
    // Named by the title the entry had *at click time* — Study OS did not know the file
    // yet, so the join had fallen back to the file name. That fallback is the point.
    expect(html).toContain('Imported Sousou no Frieren - 01.mkv.');
    // Assert on the row's own state, not on the text "Not imported" — that string is also
    // a permanent filter-chip label, so a text assertion would pass either way.
    expect(host?.querySelectorAll('.study-lib-row[data-state="unlinked"]')).toHaveLength(0);
    expect(host?.querySelectorAll('.study-lib-row[data-state="unanalyzed"]')).toHaveLength(1);
  });

  it('reports a silent skip instead of claiming an import that did not happen', async () => {
    // media:addPaths skips a file whose extension is not in MEDIA_EXT and returns the
    // library unchanged — so "the call did not throw" is not evidence of success.
    stubApi(
      { ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] },
      [],
      async () => [],
    );
    await render();
    const button = host?.querySelector<HTMLButtonElement>('.study-lib-open');
    await act(async () => { button?.click(); });
    const html = host?.innerHTML ?? '';
    expect(html).toContain('was not imported');
    expect(html).not.toContain('Imported ');
    // Same reason as above: check the row state, not the filter-chip text.
    expect(host?.querySelectorAll('.study-lib-row[data-state="unlinked"]')).toHaveLength(1);
  });

  it('surfaces an import failure rather than swallowing it', async () => {
    stubApi(
      { ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] },
      [],
      async () => { throw new Error('disk is unreadable'); },
    );
    await render();
    const button = host?.querySelector<HTMLButtonElement>('.study-lib-open');
    await act(async () => { button?.click(); });
    expect(host?.innerHTML ?? '').toContain('disk is unreadable');
  });

  it('asks the app to open the real file path when Open is pressed', async () => {
    stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, [mediaItem()]);
    await render();
    const seen: unknown[] = [];
    const listener = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener('seanime:media-workspace-open', listener);
    const button = host?.querySelector<HTMLButtonElement>('.study-lib-open');
    expect(button).toBeTruthy();
    await act(async () => { button?.click(); });
    window.removeEventListener('seanime:media-workspace-open', listener);
    // The event carries the path, not a pickMedia() call — a native dialog is
    // unanswerable from a bridge-driven run and blocks nothing visible.
    expect(seen).toEqual([{ localFilePath: PATH }]);
  });

  describe('the watch-to-review rollup (slice 6)', () => {
    function seedMining(): void {
      localStorage.setItem('jp-video-core-mining-history-v1', JSON.stringify([{
        id: 'mine-1',
        createdAt: 1_700_000_000_000,
        status: 'exported',
        noteId: 501,
        term: '無防備',
        sentence: '猫が窓辺で寝ている。',
        provenance: {
          schemaVersion: 1,
          cue: { index: 0, trackNumber: 3, rawText: 'x', text: 'x', startMs: 2148, endMs: 5148 },
          source: {
            playbackId: 'p1',
            playbackType: 'localfile',
            streamType: 'native',
            localFilePath: PATH,
          },
          assets: {},
          capturedAt: 1_700_000_000_000,
        },
      }]));
    }

    afterEach(() => localStorage.clear());

    it('states what watching a row already produced', async () => {
      seedMining();
      stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, [mediaItem()]);
      await render();
      expect(host?.querySelector('.study-lib-row-loop')?.textContent)
        .toContain('1 card mined');
    });

    it('hands off to the Review view scoped to that file', async () => {
      // Without this the count is a dead end — a number the user can read but not follow.
      seedMining();
      stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, [mediaItem()]);
      await render();
      const seen: unknown[] = [];
      const listener = (event: Event) => seen.push((event as CustomEvent).detail);
      window.addEventListener('seanime:study-review-focus', listener);
      const rollup = host?.querySelector<HTMLButtonElement>('.study-lib-row-loop');
      await act(async () => { rollup?.click(); });
      window.removeEventListener('seanime:study-review-focus', listener);
      // The join key, never a raw path — both Phase 6 halves already share it.
      expect(seen).toEqual([{ pathKey: PATH.replace(/\\/g, '/').toLowerCase(), title: 'Frieren 01' }]);
    });

    it('renders no rollup at all for a file nothing was mined from', async () => {
      // Absent, not "0 cards mined": a permanent zero on every row is noise, and its
      // absence is already the honest answer.
      stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, [mediaItem()]);
      await render();
      expect(host?.querySelector('.study-lib-row-loop')).toBeNull();
    });
  });

  /**
   * The analyse row action.
   *
   * The capability is INJECTED, never imported — `main/mediaStudyOrchestrator.ts`, which
   * registers `study:prepare`, is untracked, and this line does not depend on another
   * track's uncommitted contracts. So the first test here is that the shipped default
   * renders no button at all; everything after it supplies the action explicitly.
   */
  describe('analyse', () => {
    const analysable = (): void => stubApi(
      { ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] },
      [mediaItem()],
    );

    it('renders no analyse button when nobody supplies the action', async () => {
      // The shipped default. A button that cannot do anything is worse than no button.
      analysable();
      await render();
      expect(host?.querySelector('.study-lib-analyse')).toBeNull();
    });

    it('offers analyse on an unanalyzed row once the action is supplied', async () => {
      analysable();
      await render({ onAnalyse: async () => ({ status: 'prepared', candidateCount: 3 }) });
      const button = host?.querySelector<HTMLButtonElement>('.study-lib-analyse');
      expect(button?.textContent).toBe('Analyse');
      // Named by title for the same reason Open and Import are — "Analyse" repeated down
      // a list gives a screen reader nothing to choose between.
      expect(button?.getAttribute('aria-label')).toBe(
        'Analyse the Japanese subtitles of Frieren 01',
      );
    });

    it('hands the whole entry to the action and states what came back', async () => {
      analysable();
      const seen: Array<{ studyMediaId?: string; subtitleRecordId?: string }> = [];
      await render({
        onAnalyse: async (entry: { studyMediaId?: string; subtitleRecordId?: string }) => {
          seen.push(entry);
          return { status: 'prepared', candidateCount: 137 };
        },
      });
      await act(async () => {
        host?.querySelector<HTMLButtonElement>('.study-lib-analyse')?.click();
      });
      // Both ids the real `prepareStudyMediaById(mediaId, subtitleRecordId)` needs are on
      // the entry already, so the adapter is an assignment rather than a lookup.
      expect(seen).toHaveLength(1);
      expect(seen[0]?.studyMediaId).toBe('study-1');
      expect(seen[0]?.subtitleRecordId).toBe('sub-ja');
      expect(host?.querySelector('.study-lib-status')?.textContent)
        .toBe('Analysed Frieren 01 — 137 study words found.');
    });

    it('reports a queued transcription as its own outcome, not as "analysed"', async () => {
      // The branch most likely to be read as a failure path. It is not: the work is real,
      // it just moved to the transcription queue, and saying "analysed" here would be a
      // lie the user only finds out about when no readiness score ever appears.
      analysable();
      await render({ onAnalyse: async () => ({ status: 'queued-transcription' }) });
      await act(async () => {
        host?.querySelector<HTMLButtonElement>('.study-lib-analyse')?.click();
      });
      const said = host?.querySelector('.study-lib-status')?.textContent ?? '';
      expect(said).toBe(
        'Frieren 01 has no Japanese subtitles yet, so transcription was queued instead.',
      );
      expect(said).not.toContain('Analysed');
    });

    it('surfaces a failing analysis instead of leaving the row stuck busy', async () => {
      analysable();
      await render({
        onAnalyse: async () => { throw new Error('The tokenizer is not available.'); },
      });
      await act(async () => {
        host?.querySelector<HTMLButtonElement>('.study-lib-analyse')?.click();
      });
      expect(host?.querySelector('.study-lib-status')?.textContent)
        .toBe('The tokenizer is not available.');
      // The `finally` clearing busyKey is the point — a rejected action that left the row
      // disabled would need a reload to escape.
      expect(host?.querySelector<HTMLButtonElement>('.study-lib-analyse')?.disabled).toBe(false);
    });

    it('does not offer analyse where analysis is not the next action', async () => {
      // `missing-subtitles` has nothing to analyse. Offering it here would send the user
      // at a button whose only possible outcome is the transcription queue, which the
      // row's own action line already tells them about.
      stubApi(
        { ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] },
        [mediaItem({ subtitles: [] })],
      );
      await render({ onAnalyse: async () => ({ status: 'prepared', candidateCount: 1 }) });
      expect(host?.querySelector('.study-lib-row')?.getAttribute('data-state'))
        .toBe('missing-subtitles');
      expect(host?.querySelector('.study-lib-analyse')).toBeNull();
    });

    it('does not offer analyse on an unlinked file', async () => {
      // Not in Study OS at all, so there is no media id to analyse. Import comes first.
      stubApi({ ok: true, files: [{ path: PATH, mediaId: 1, episode: 1 }] }, []);
      await render({ onAnalyse: async () => ({ status: 'prepared', candidateCount: 1 }) });
      expect(host?.querySelector('.study-lib-row')?.getAttribute('data-state')).toBe('unlinked');
      expect(host?.querySelector('.study-lib-analyse')).toBeNull();
    });
  });
});
