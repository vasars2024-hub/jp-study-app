// @vitest-environment jsdom
/**
 * A player mine happens once: a panel that remounts with the request it already handled
 * does not replay it, and a second press on a line whose mine is still cutting audio does
 * not start a second ffmpeg job or a second card (`media/mineRequestGuard.ts`).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import VideoCoreMiningPanel from '../../media/VideoCoreMiningPanel';
import {
  beginCueMine,
  claimMineRequest,
  endCueMine,
  mineCueIdentity,
  resetMineGuardsForTests,
} from '../../media/mineRequestGuard';
import type { VideoCoreMineRequest, VideoCoreMiningSource } from '../../shared/videoCoreMining';
import type { VideoCoreStudyCue } from '../../shared/videoCoreStudy';

vi.mock('../mineTarget', () => ({
  pickMineTarget: vi.fn().mockResolvedValue(null),
  lookupMineGloss: vi.fn().mockResolvedValue(null),
}));
vi.mock('../components/ui/Toast', () => ({ showToast: () => undefined }));

const SOURCE: VideoCoreMiningSource = {
  playbackId: 'pb-1',
  playbackType: 'local',
  streamType: 'file',
  localFilePath: 'C:\\anime\\ep01.mkv',
  mediaId: 42,
  mediaTitle: 'Test Show',
  episodeNumber: 1,
};
const CUE: VideoCoreStudyCue = { index: 3, trackNumber: 1, text: 'この町が好き。', startMs: 271_000, endMs: 273_000 };

let roots: Root[] = [];
let mineNote: ReturnType<typeof vi.fn>;
let extractAudioClip: ReturnType<typeof vi.fn>;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  resetMineGuardsForTests();
  mineNote = vi.fn().mockResolvedValue({ ok: true, noteId: 7, destination: 'Mining::Japanese' });
  extractAudioClip = vi.fn().mockResolvedValue({ ok: false });
  (window as unknown as { api: Record<string, unknown> }).api = {
    ankiStatus: vi.fn().mockResolvedValue({ connected: true, decks: ['Mining::Japanese'] }),
    ankiLinkState: vi.fn().mockResolvedValue({ state: 'connected', consecutiveFailures: 0 }),
    ankiMineNote: mineNote,
    extractAudioClip,
  };
});

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount();
  });
  roots = [];
  document.body.replaceChildren();
});

async function render(request: VideoCoreMineRequest | null, root?: Root): Promise<Root> {
  let target = root;
  if (!target) {
    const host = document.createElement('div');
    document.body.append(host);
    target = createRoot(host);
    roots.push(target);
  }
  const into = target;
  await act(async () => {
    into.render(
      <VideoCoreMiningPanel
        cue={CUE}
        displayText={CUE.text}
        source={SOURCE}
        video={null}
        subtitleDelaySec={0}
        mineRequest={request}
      />,
    );
  });
  return into;
}

describe('player mine requests are handled once', () => {
  it('a remounted panel does not replay the request it already mined', async () => {
    const request: VideoCoreMineRequest = { seq: 1, id: 'req-1', cue: CUE, text: CUE.text };
    const first = await render(request);
    expect(mineNote).toHaveBeenCalledTimes(1);
    act(() => first.unmount());
    roots = roots.filter((root) => root !== first);
    await render(request);
    expect(mineNote).toHaveBeenCalledTimes(1);
    // The audio cut runs before the deck's own dedupe: one cut means one mine attempt.
    expect(extractAudioClip).toHaveBeenCalledTimes(1);
  });

  it('a second mounted copy of the card block does not mine the same request', async () => {
    const request: VideoCoreMineRequest = { seq: 1, id: 'req-2', cue: CUE, text: CUE.text };
    await render(request);
    await render(request);
    expect(mineNote).toHaveBeenCalledTimes(1);
    expect(extractAudioClip).toHaveBeenCalledTimes(1);
  });

  it('a second press while the first mine is still cutting audio is the same mine', async () => {
    let finishClip: (value: unknown) => void = () => undefined;
    extractAudioClip.mockImplementationOnce(() => new Promise((resolve) => { finishClip = resolve; }));
    const root = await render({ seq: 1, id: 'press-1', cue: CUE, text: CUE.text });
    await render({ seq: 2, id: 'press-2', cue: CUE, text: CUE.text }, root);
    await act(async () => {
      finishClip({ ok: false });
      await Promise.resolve();
    });
    // Let the first mine finish its async tail.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(extractAudioClip).toHaveBeenCalledTimes(1);
    expect(mineNote).toHaveBeenCalledTimes(1);
  });
});

describe('mineRequestGuard', () => {
  it('claims an id once, and always takes a request with no id', () => {
    expect(claimMineRequest('a')).toBe(true);
    expect(claimMineRequest('a')).toBe(false);
    expect(claimMineRequest(undefined)).toBe(true);
    expect(claimMineRequest(undefined)).toBe(true);
  });

  it('keeps one mine in flight per line, keyed by source, subtitle track and cue', () => {
    const line = mineCueIdentity('C:/a.mkv', CUE);
    const otherTrack = mineCueIdentity('C:/a.mkv', { ...CUE, trackNumber: 2 });
    expect(line).not.toBe(otherTrack);
    expect(beginCueMine(line)).toBe(true);
    expect(beginCueMine(line)).toBe(false);
    expect(beginCueMine(otherTrack)).toBe(true);
    endCueMine(line);
    expect(beginCueMine(line)).toBe(true);
  });
});
