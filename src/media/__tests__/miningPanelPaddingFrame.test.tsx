// @vitest-environment jsdom
/**
 * The card panel cuts what the learner set and pictures the right line:
 *
 * - card audio and clips carry the learner's lead-in / tail, stopped at the next line;
 * - the manual Audio button cuts a local file with ffmpeg like the one-key mine (it used to
 *   record the line off the player in real time, hijacking playback, with no padding);
 * - a mined line no longer on screen gets a frame cut from inside it, not the frame of
 *   whatever is playing now;
 * - a stream away from the line says why there is no picture.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import VideoCoreMiningPanel from '../VideoCoreMiningPanel';
import { resetMineGuardsForTests } from '../mineRequestGuard';
import type { VideoCoreMineRequest, VideoCoreMiningSource } from '../../shared/videoCoreMining';
import type { VideoCoreStudyCue } from '../../shared/videoCoreStudy';

vi.mock('../../renderer/mineTarget', () => ({
  pickMineTarget: vi.fn().mockResolvedValue(null),
  lookupMineGloss: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../renderer/components/ui/Toast', () => ({ showToast: () => undefined }));

const LOCAL: VideoCoreMiningSource = {
  playbackId: 'pb-1',
  playbackType: 'local',
  streamType: 'file',
  localFilePath: 'C:\\anime\\ep01.mkv',
  mediaId: 42,
  mediaTitle: 'Test Show',
  episodeNumber: 1,
};
const STREAM: VideoCoreMiningSource = { playbackId: 'pb-2', playbackType: 'online', streamType: 'online' };

const CUE: VideoCoreStudyCue = { index: 3, trackNumber: 1, text: 'この町が好き。', startMs: 271_000, endMs: 273_000 };
const TRACK: VideoCoreStudyCue[] = [
  { index: 2, trackNumber: 1, text: 'まえ', startMs: 268_000, endMs: 270_900 },
  CUE,
  { index: 4, trackNumber: 1, text: 'つぎ', startMs: 273_200, endMs: 275_000 },
];
const PADDING = { beforeMs: 400, afterMs: 600, stopAtNeighbours: true };

let root: Root | null = null;
let extractAudioClip: ReturnType<typeof vi.fn>;
let extractVideoFrame: ReturnType<typeof vi.fn>;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  resetMineGuardsForTests();
  extractAudioClip = vi.fn().mockResolvedValue({ ok: true, base64: 'QUJD', bytes: 3, mimeType: 'audio/mpeg' });
  extractVideoFrame = vi.fn().mockResolvedValue({ ok: true, base64: 'SlBH', bytes: 3, mimeType: 'image/jpeg' });
  (window as unknown as { api: Record<string, unknown> }).api = {
    ankiStatus: vi.fn().mockResolvedValue({ connected: true, decks: ['Mining::Japanese'] }),
    ankiLinkState: vi.fn().mockResolvedValue({ state: 'connected', consecutiveFailures: 0 }),
    ankiMineNote: vi.fn().mockResolvedValue({ ok: true, noteId: 7, destination: 'Mining::Japanese' }),
    extractAudioClip,
    extractVideoFrame,
  };
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

/** The slice of a <video> the panel reads, parked well after the line. */
function videoAt(currentTime: number): HTMLVideoElement {
  return { currentTime, videoWidth: 1280, videoHeight: 720, paused: true } as unknown as HTMLVideoElement;
}

async function render(props: {
  source?: VideoCoreMiningSource;
  request?: VideoCoreMineRequest | null;
  video?: HTMLVideoElement | null;
  expanded?: boolean;
}): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <VideoCoreMiningPanel
        cue={CUE}
        displayText={CUE.text}
        source={props.source ?? LOCAL}
        video={props.video ?? null}
        subtitleDelaySec={0}
        mineRequest={props.request ?? null}
        clipPadding={PADDING}
        trackCues={TRACK}
        defaultExpanded={props.expanded ?? false}
      />,
    );
  });
  return host;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('mined card audio carries the learner\'s padding', () => {
  it('one-key mine: lead-in as set, tail stopped where the next line starts', async () => {
    await render({ request: { seq: 1, id: 'req-pad', cue: CUE, text: CUE.text } });
    await settle();
    expect(extractAudioClip).toHaveBeenCalledTimes(1);
    const request = extractAudioClip.mock.calls[0][0];
    expect(request).toMatchObject({ filePath: LOCAL.localFilePath, startSec: 271, endSec: 273 });
    expect(request.padBeforeSec).toBeCloseTo(0.1); // the previous line ends at 270.9 s
    expect(request.padAfterSec).toBeCloseTo(0.2); // the next line starts at 273.2 s
  });

  it('the Audio button cuts a local file instead of recording the player', async () => {
    const host = await render({ expanded: true, video: videoAt(272) });
    await act(async () => host.querySelector<HTMLButtonElement>('[data-study-action="capture-audio"]')!.click());
    await settle();
    expect(extractAudioClip).toHaveBeenCalledTimes(1);
    expect(extractAudioClip.mock.calls[0][0]).toMatchObject({ startSec: 271, endSec: 273 });
  });
});

describe('the card\'s picture is the mined line\'s', () => {
  it('one-key mine after the line has passed: a frame cut from inside the line', async () => {
    await render({ request: { seq: 1, id: 'req-frame', cue: CUE, text: CUE.text }, video: videoAt(274.5) });
    await settle();
    expect(extractVideoFrame).toHaveBeenCalledTimes(1);
    expect(extractVideoFrame.mock.calls[0][0]).toMatchObject({ filePath: LOCAL.localFilePath, atSec: 272 });
  });

  it('a stream away from the line says why there is no picture', async () => {
    const host = await render({ source: STREAM, expanded: true, video: videoAt(400) });
    await act(async () => host.querySelector<HTMLButtonElement>('[data-study-action="capture-screenshot"]')!.click());
    await settle();
    expect(extractVideoFrame).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Play the line to take its picture');
  });
});
