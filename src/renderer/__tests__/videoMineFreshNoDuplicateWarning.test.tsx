// @vitest-environment jsdom
/**
 * A successful one-key mine must not be reported back as "Already mined".
 *
 * Rendering footage caught it: C (one-key mine) toasted "Saved to your deck", and the panel
 * immediately showed the red "Already mined — <word> is in your collection" banner for the
 * same card. Nothing mined twice. The banner reads the mining history, and the mine had
 * just appended the card it created to that history, so the panel found its own fresh
 * card and called it a duplicate. A genuine repeat — the same line mined again, or a line
 * mined in an earlier session — must still warn.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import VideoCoreMiningPanel from '../../media/VideoCoreMiningPanel';
import { resetMineGuardsForTests } from '../../media/mineRequestGuard';
import { loadDeck } from '../flashcardDeck';
import type { VideoCoreMineRequest, VideoCoreMiningSource } from '../../shared/videoCoreMining';
import type { VideoCoreStudyCue } from '../../shared/videoCoreStudy';

vi.mock('../mineTarget', () => ({
  pickMineTarget: vi.fn().mockResolvedValue({ surface: '町', lemma: '町', reading: 'まち' }),
  lookupMineGloss: vi.fn().mockResolvedValue(null),
}));
const toasts: Array<{ message: string }> = [];
vi.mock('../components/ui/Toast', () => ({
  showToast: (toast: { message: string }) => { toasts.push(toast); },
}));

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
let host: HTMLElement;
let seq = 0;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  toasts.length = 0;
  seq = 0;
  resetMineGuardsForTests();
  // The footage case: no Anki set up, so the card is saved locally ("Saved to your deck").
  (window as unknown as { api: Record<string, unknown> }).api = {
    ankiLinkState: vi.fn().mockResolvedValue({ state: 'disconnected', consecutiveFailures: 3 }),
    ankiStatus: vi.fn().mockResolvedValue({ connected: false, decks: [] }),
    ankiMineNote: vi.fn(),
  };
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function render(cue: VideoCoreStudyCue, request: VideoCoreMineRequest | null): Promise<void> {
  if (!root) root = createRoot(host);
  await act(async () => {
    root?.render(
      <VideoCoreMiningPanel
        cue={cue}
        displayText={cue.text}
        source={SOURCE}
        video={null}
        subtitleDelaySec={0}
        mineRequest={request}
      />,
    );
  });
}

/** One press of C on `cue`: a fresh request, as the overlay's `mineLine` builds it. */
async function pressMine(cue: VideoCoreStudyCue): Promise<void> {
  seq += 1;
  await render(cue, { seq, id: `mine-test-${seq}`, cue, text: cue.text });
}

function banner(): Element | null {
  return host.querySelector('.study-mining-mined');
}

describe('one-key mine: "Already mined" banner', () => {
  it('shows only the success state right after a fresh mine', async () => {
    await render(CUE_A, null);
    expect(banner()).toBeNull();

    await pressMine(CUE_A);

    expect(loadDeck()).toHaveLength(1);
    expect(toasts.map((toast) => toast.message)).toContain('Saved to your deck');
    expect(host.querySelector('.study-mining-message')?.textContent).toBe('Saved to your deck');
    expect(banner()).toBeNull();
    expect(host.textContent).not.toContain('Already mined');
  });

  it('still warns on a genuine second attempt at the same line', async () => {
    await render(CUE_A, null);
    await pressMine(CUE_A);
    expect(banner()).toBeNull();

    await pressMine(CUE_A);

    expect(loadDeck()).toHaveLength(1);
    expect(banner()?.textContent).toContain('Already mined');
    expect(banner()?.textContent).toContain('町');
  });

  it('warns about a line mined earlier once the panel comes back to it', async () => {
    await render(CUE_A, null);
    await pressMine(CUE_A);
    await render(CUE_B, null);
    expect(banner()).toBeNull();

    await render(CUE_A, null);
    expect(banner()?.textContent).toContain('Already mined');
  });

  it('warns about a line mined in an earlier session, before any new attempt', async () => {
    await render(CUE_A, null);
    await pressMine(CUE_A);
    act(() => root?.unmount());
    root = null;

    await render(CUE_A, null);
    expect(banner()?.textContent).toContain('Already mined');
  });
});
