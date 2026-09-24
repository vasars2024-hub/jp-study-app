// @vitest-environment jsdom
/**
 * Subtitle audit 6h: on a muxed MKV with a Japanese and an English stream, switching the
 * primary to Japanese left lines missing from both the study line and the second line.
 *
 * Three races in the adopted subtitle manager, each driven here against the REAL
 * `VideoCoreSubtitleManager` (only JASSUB is faked, with a start-up delay like the real
 * worker's, because that delay is what opens the window):
 *
 * 1. The constructor's default pick and the user's pick both await the same `_init()`. The
 *    older one resumed first and, after its own awaits, announced `trackselected` for the
 *    track the user had just left — so the overlay's idea of "primary" and the manager's
 *    disagreed.
 * 2. A track switch did not re-derive the active cues, so `cuechange` kept describing the
 *    previous track until the next `timeupdate` (never, while paused).
 * 3. Cues that arrived from the directstream AFTER playback entered them were not looked at
 *    until the next `timeupdate`, and nothing told the overlay's second line that its track
 *    had grown — it only re-listed on the primary's `cuechange`.
 *
 * Plus the two mount/reselect holes found on the way: `addEventTrack` always SELECTED the
 * track (Gum's English helper line became the study line), and re-selecting a file track that
 * was already loaded never announced `trackselected` at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  // media-captions extends the browser's VTTCue at import time; jsdom has none.
  const g = globalThis as Record<string, unknown>;
  if (!g.VTTCue) {
    g.VTTCue = class {
      constructor(public startTime: number, public endTime: number, public text: string) {}
    };
  }
  if (!g.VTTRegion) g.VTTRegion = class {};
});

vi.mock('../jassub/runtime.js', () => {
  class FakeJassub {
    renderer = {
      setTrack: vi.fn(),
      createEvent: vi.fn(),
      addFonts: vi.fn(async () => undefined),
      disableStyleOverride: vi.fn(),
      setDefaultFont: vi.fn(),
    };
    timeOffset = 0;
    // The real worker takes seconds to boot; a few ticks is enough to interleave two picks.
    ready = new Promise<void>((resolve) => setTimeout(resolve, 20));
    resize = vi.fn();
    destroy = vi.fn();
  }
  return { default: FakeJassub };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

// eslint-disable-next-line import/first -- must follow the mocks above
import { VideoCoreSubtitleManager } from '../../../vendor/seanime-web/app/(main)/_features/video-core/video-core-subtitles';

type Listener = (event: Event) => void;

function fakeVideo(currentTime = 0): HTMLVideoElement {
  const video = new EventTarget() as unknown as HTMLVideoElement & { currentTime: number };
  const textTracks = new EventTarget() as unknown as TextTrackList;
  (textTracks as unknown as { [Symbol.iterator]: () => Iterator<TextTrack> })[Symbol.iterator] =
    function* iterate() { /* none */ };
  Object.assign(video, { currentTime, textTracks, paused: true });
  return video;
}

const SETTINGS = {
  preferredSubtitleLanguage: 'en,eng,english',
  preferredSubtitleBlacklist: '',
  preferredAudioLanguage: 'jpn',
  subtitleDelay: 0,
  videoEnhancement: { enabled: false, contrast: 1, saturation: 1, brightness: 1 },
  subtitleCustomization: { enabled: false },
  captionCustomization: {},
};

const TRACK = (number: number, language: string, name: string) => ({
  number,
  uid: number,
  type: 'subtitle',
  codecID: 'S_TEXT/ASS',
  name,
  language,
  languageIETF: language,
  default: true,
  forced: false,
  enabled: true,
});

function event(trackNumber: number, startMs: number, endMs: number, text: string) {
  return {
    trackNumber,
    text,
    startTime: startMs,
    duration: endMs - startMs,
    codecID: 'S_TEXT/ASS',
    extraData: { style: 'Default', readorder: '0', layer: '0', name: '', marginl: '0', marginr: '0', marginv: '0', effect: '' },
  };
}

const managers: VideoCoreSubtitleManager[] = [];

function makeManager(
  video: HTMLVideoElement,
  extra: Record<string, unknown> = {},
): VideoCoreSubtitleManager {
  const manager = new VideoCoreSubtitleManager({
    videoElement: video,
    jassubOffscreenRender: false,
    playbackInfo: {
      id: 'pb',
      mkvMetadata: { subtitleTracks: [TRACK(3, 'jpn', 'Japanese'), TRACK(4, 'eng', 'English')] },
      ...extra,
    } as never,
    settings: SETTINGS as never,
    fetchAndConvertToASS: async (_url?: string, content?: string) => content ?? '',
    sendTranslateRequest: () => undefined,
    translateTargetLang: null,
  });
  managers.push(manager);
  return manager;
}

function record(manager: VideoCoreSubtitleManager, type: string): unknown[] {
  const seen: unknown[] = [];
  manager.addEventListener(type, ((e: CustomEvent) => seen.push(e.detail)) as Listener);
  return seen;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

afterEach(() => {
  for (const manager of managers.splice(0)) manager.destroy();
});

describe('VideoCore subtitle manager — primary track switching', () => {
  it('lets only the newest selection finish (the default pick cannot overwrite the user\'s)', async () => {
    const manager = makeManager(fakeVideo());
    const selected = record(manager, 'trackselected');
    // The constructor has already started the default pick (English, per the setting).
    // The user picks Japanese while JASSUB is still starting.
    void manager.selectTrack(3);
    await settle();
    expect(manager.getSelectedTrackNumberOrNull()).toBe(3);
    // Exactly one announcement, for the track that is actually selected.
    expect(selected.map((detail) => (detail as { trackNumber: number }).trackNumber)).toEqual([3]);
  });

  it('switching tracks re-derives the active cues at once, even while paused', async () => {
    const video = fakeVideo(5);
    const manager = makeManager(video);
    await settle();
    await manager.onSubtitleEvents([
      event(3, 4500, 8000, 'そうですね。散歩に行きませんか？'),
      event(4, 4500, 8000, 'It is. Shall we go for a walk?'),
    ] as never);
    await manager.selectTrack(4);
    expect(manager.getActiveCues().map((cue) => cue.text)).toEqual(['It is. Shall we go for a walk?']);
    const changes = record(manager, 'cuechange');
    await manager.selectTrack(3);
    // No `timeupdate` fired: the manager itself moved to the new track's line.
    expect(manager.getActiveCues().map((cue) => cue.text)).toEqual(['そうですね。散歩に行きませんか？']);
    expect(changes.length).toBeGreaterThan(0);
  });

  it('a line that arrives after playback entered it is shown without waiting for timeupdate', async () => {
    const video = fakeVideo(5);
    const manager = makeManager(video);
    await manager.selectTrack(3);
    await settle();
    const added = record(manager, 'eventsadded');
    const changes = record(manager, 'cuechange');
    expect(manager.getActiveCues()).toEqual([]);
    await manager.onSubtitleEvents([
      event(3, 4500, 8000, 'そうですね。散歩に行きませんか？'),
      event(4, 4500, 8000, 'It is. Shall we go for a walk?'),
    ] as never);
    expect(manager.getActiveCues().map((cue) => cue.text)).toEqual(['そうですね。散歩に行きませんか？']);
    expect(changes.length).toBe(1);
    // …and the second line's track is announced, so its timeline can be re-read.
    expect(added).toEqual([{ trackNumbers: [3, 4] }]);
    // A repeat of the same events is not news.
    await manager.onSubtitleEvents([event(4, 4500, 8000, 'It is. Shall we go for a walk?')] as never);
    expect(added).toHaveLength(1);
  });

  it('addEventTrack(…, { select: false }) mounts a track beside the study line', async () => {
    const manager = makeManager(fakeVideo());
    await manager.selectTrack(3);
    await settle();
    await manager.addEventTrack(TRACK(5, 'en', 'English (helper)') as never, { select: false });
    expect(manager.getSelectedTrackNumberOrNull()).toBe(3);
    expect(manager.getTracks().map((track) => track.number)).toEqual([3, 4, 5]);
    // Upstream's behaviour is unchanged for every other caller.
    await manager.addEventTrack(TRACK(6, 'ja', 'Whisper') as never);
    expect(manager.getSelectedTrackNumberOrNull()).toBe(6);
  });

  it('re-selecting a file track that is already loaded announces it', async () => {
    const manager = makeManager(fakeVideo(), {
      mkvMetadata: undefined,
      subtitleTracks: [
        { index: 0, label: 'Show - 01.ja', language: 'ja', type: 'srt', content: 'JA', useLibassRenderer: true },
        { index: 1, label: 'Show - 01.en', language: 'en', type: 'srt', content: 'EN', useLibassRenderer: true },
      ],
    });
    await settle();
    const selected = record(manager, 'trackselected');
    await manager.selectTrack(1000);
    await settle();
    await manager.selectTrack(1001);
    await settle();
    await manager.selectTrack(1000);
    await settle();
    expect(selected.map((detail) => (detail as { trackNumber: number }).trackNumber))
      .toEqual([1000, 1001, 1000]);
  });
});
