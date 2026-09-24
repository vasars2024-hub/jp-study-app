// @vitest-environment jsdom
/**
 * "Mine the current subtitle line" — the shortcut, driven end to end through the
 * panel that actually exports.
 *
 * Worth its own file because the failure mode is invisible from the shortcut's
 * side: `registerCommandHandler` returns fine, the key press is swallowed, and
 * nothing reaches Anki. The two ways this breaks are both closure bugs —
 * re-running the export on every draft change, or exporting the line that was on
 * screen when the shortcut was first registered rather than the one playing now —
 * so both are asserted here rather than the mere fact that something fired.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import VideoCoreMiningPanel from '../../media/VideoCoreMiningPanel';
import { loadDeck } from '../flashcardDeck';
import type { VideoCoreMiningSource } from '../../shared/videoCoreMining';
import type { VideoCoreStudyCue } from '../../shared/videoCoreStudy';

const SOURCE: VideoCoreMiningSource = {
  playbackId: 'pb-1',
  playbackType: 'local',
  streamType: 'file',
  localFilePath: 'C:\\anime\\ep01.mkv',
  mediaId: 42,
  mediaTitle: 'Test Show',
  episodeNumber: 1,
};

const CUE_A: VideoCoreStudyCue = {
  index: 3, trackNumber: 1, text: 'この町が好き。', startMs: 271_000, endMs: 273_000,
};
const CUE_B: VideoCoreStudyCue = {
  index: 4, trackNumber: 1, text: 'どうして？', startMs: 274_000, endMs: 275_000,
};

let root: Root | null = null;
let mineNote: ReturnType<typeof vi.fn>;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  mineNote = vi.fn().mockResolvedValue({ ok: true, noteId: 7, destination: 'Mining::Japanese' });
  (window as unknown as { api: Record<string, unknown> }).api = {
    ankiStatus: vi.fn().mockResolvedValue({ connected: true, decks: ['Mining::Japanese'] }),
    // Mining goes through the study database first (renderer/studyMining.ts),
    // which asks the link whether Anki is up before sending the note.
    ankiLinkState: vi.fn().mockResolvedValue({ state: 'connected', consecutiveFailures: 0 }),
    ankiMineNote: mineNote,
  };
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function mount(cue: VideoCoreStudyCue, mineSignal: number): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(
      <VideoCoreMiningPanel
        cue={cue}
        displayText={cue.text}
        source={SOURCE}
        video={null}
        subtitleDelaySec={0}
        mineSignal={mineSignal}
      />,
    );
  });
  return host;
}

async function rerender(cue: VideoCoreStudyCue, mineSignal: number): Promise<void> {
  await act(async () => {
    root?.render(
      <VideoCoreMiningPanel
        cue={cue}
        displayText={cue.text}
        source={SOURCE}
        video={null}
        subtitleDelaySec={0}
        mineSignal={mineSignal}
      />,
    );
  });
}

describe('video.mineCurrentLine shortcut', () => {
  it('does not mine anything just because the panel mounted', async () => {
    await mount(CUE_A, 0);
    expect(mineNote).not.toHaveBeenCalled();
  });

  it('mines the line on screen when the signal fires', async () => {
    await mount(CUE_A, 0);
    await rerender(CUE_A, 1);

    expect(mineNote).toHaveBeenCalledTimes(1);
    const request = mineNote.mock.calls[0][0];
    expect(request.sentence).toBe('この町が好き。');
    expect(request.route).toMatchObject({ source: 'subtitle' });
  });

  it('mines the NEW line after the cue changes, not the one it started on', async () => {
    // The stale-closure bug: an effect holding the first render's `onMine` would
    // export この町が好き。 forever, whatever is actually playing.
    await mount(CUE_A, 0);
    await rerender(CUE_A, 1);
    await rerender(CUE_B, 1);
    await rerender(CUE_B, 2);

    expect(mineNote).toHaveBeenCalledTimes(2);
    expect(mineNote.mock.calls[1][0].sentence).toBe('どうして？');
  });

  it('does not re-mine when the draft changes but the signal does not', async () => {
    // The other closure bug: depending on `onMine` in the effect re-runs it on
    // every keystroke in the panel's own fields.
    await mount(CUE_A, 0);
    await rerender(CUE_A, 1);
    await rerender(CUE_B, 1);
    await rerender(CUE_A, 1);

    expect(mineNote).toHaveBeenCalledTimes(1);
  });

  it('answers the shortcut a second time for the same line — without a duplicate card', async () => {
    // A boolean flag would latch after the first press; the counter is why the
    // second press is heard at all. Since mining writes the study database, the
    // same line mined twice is found, not re-created: one card, one note, and
    // the panel says the line is already mined.
    const host = await mount(CUE_A, 0);
    await rerender(CUE_A, 1);
    await rerender(CUE_A, 2);

    expect(mineNote).toHaveBeenCalledTimes(1);
    expect(loadDeck()).toHaveLength(1);
    expect(host.textContent).toContain('Anki already contains this note');
  });
});
