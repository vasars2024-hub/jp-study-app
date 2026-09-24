// @vitest-environment jsdom
/**
 * Subtitle audit 6b-6e / 11a / 11c: a matched anime episode played over directstream with a
 * `.ja.srt` and an `.en.srt` beside it showed the Japanese line and never the English one.
 *
 * That shape reaches the overlay through `MediaCaptionsManager`, which fetches a track only
 * when it is SELECTED. The second line is by definition the track beside the selected one, so
 * `getTrackContent()` answered null for it forever and the overlay's retry re-read that null
 * four times a second. Driven here against the REAL manager (only the on-screen renderer is
 * faked, since jsdom has no layout), with the directstream track shape: two SRT sidecars
 * served by URL, English listed first, Japanese the default pick.
 */
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('media-captions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('media-captions')>();
  class FakeCaptionsRenderer {
    currentTime = 0;
    changeTrack = vi.fn();
    reset = vi.fn();
    destroy = vi.fn();
  }
  return { ...actual, CaptionsRenderer: FakeCaptionsRenderer };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

// eslint-disable-next-line import/first -- must follow the mocks above
import { MediaCaptionsManager } from '../../../vendor/seanime-web/app/(main)/_features/video-core/video-core-media-captions';
// eslint-disable-next-line import/first
import { mediaCaptionCues } from '../mediaCaptionStudyAdapter';

const VTT: Record<string, string> = {
  'sub/en': [
    'WEBVTT', '',
    '00:00:01.000 --> 00:00:04.000', "Good morning. Nice weather today, isn't it?", '',
    '00:00:04.500 --> 00:00:08.000', 'It is. Shall we go for a walk?',
  ].join('\n'),
  'sub/ja': [
    'WEBVTT', '',
    '00:00:01.000 --> 00:00:04.000', 'おはようございます。今日はいい天気ですね。', '',
    '00:00:04.500 --> 00:00:08.000', 'そうですね。散歩に行きませんか？',
  ].join('\n'),
};

function directstreamPair() {
  const host = document.createElement('div');
  const video = document.createElement('video');
  host.appendChild(video);
  const fetched: string[] = [];
  const manager = new MediaCaptionsManager({
    videoElement: video,
    // Seanime lists sidecars in directory order: `.en` before `.ja`.
    tracks: [
      { src: 'sub/en', label: '[Test] Yuru Camp - 04.en', language: 'en', type: 'srt' },
      { src: 'sub/ja', label: '[Test] Yuru Camp - 04.ja', language: 'ja', type: 'srt' },
    ],
    settings: {
      preferredSubtitleLanguage: 'ja,jpn,japanese',
      preferredSubtitleBlacklist: '',
      subtitleDelay: 0,
      captionCustomization: {},
    } as never,
    fetchAndConvertToVTT: async (url?: string) => {
      fetched.push(String(url));
      return VTT[String(url)];
    },
    sendTranslateRequest: () => undefined,
    translateTargetLang: null,
  });
  const loaded = new Promise<void>((resolve) => {
    manager.addEventListener('tracksloaded', () => resolve());
  });
  return { manager, fetched, loaded };
}

describe('the second line on the provider-captions (directstream sidecar) path', () => {
  it('reads the English track beside the selected Japanese one', async () => {
    const { manager, fetched, loaded } = directstreamPair();
    await loaded;
    expect(manager.getSelectedTrackIndexOrNull()).toBe(1);
    // The defect's shape: only the selected track was ever fetched.
    expect(fetched).toEqual(['sub/ja']);
    expect(manager.getTrackContent(0)).toBeNull();

    const english = await mediaCaptionCues(manager, 0);
    expect(english.map((cue) => cue.text)).toEqual([
      "Good morning. Nice weather today, isn't it?",
      'It is. Shall we go for a walk?',
    ]);
    expect(english[0]).toMatchObject({ trackNumber: 0, startMs: 1_000, endMs: 4_000 });
    // Reading it did not take the study line away from Japanese.
    expect(manager.getSelectedTrackIndexOrNull()).toBe(1);
    manager.destroy();
  });

  it('fetches each track once, however often the second line asks and whatever is selected later', async () => {
    const { manager, fetched, loaded } = directstreamPair();
    await loaded;
    // The overlay retries on every timeupdate while the timeline is empty.
    await Promise.all([mediaCaptionCues(manager, 0), mediaCaptionCues(manager, 0)]);
    await manager.selectTrack(0);
    await manager.selectTrack(1);
    expect(fetched.filter((url) => url === 'sub/en')).toHaveLength(1);
    expect(fetched.filter((url) => url === 'sub/ja')).toHaveLength(1);
    manager.destroy();
  });
});
