// @vitest-environment jsdom
/**
 * Subtitle audit 7: a matched episode with a `.ja.srt` and an `.en.srt` beside it, closed and
 * opened again. Off → .en switched the study line and the transcript; .en → .ja did not — the
 * line kept the English cue and the transcript stayed on "….en". Only after a reopen, 3 of 3.
 *
 * The cause was the convert-subs call both subtitle managers are built with. It wrapped
 * TanStack's `mutate(variables, { onSuccess, onError })` in a promise, and `mutate`'s own
 * callbacks run for the latest call only. On a reopen the Japanese preference is already
 * known, so the manager's default pick (Japanese) and the overlay's second line (English) ask
 * for a conversion in the same tick: the Japanese one never settled, stayed pending in the
 * manager's per-track load, and every later pick of Japanese waited on it forever.
 *
 * Driven with a real `QueryClient` and `useMutation` mounted in a real React root (the hook's
 * subscription is what delivers `mutate` callbacks at all) and the real `MediaCaptionsManager`;
 * only the on-screen renderer is faked, since jsdom has no layout.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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
import {
  subtitleConverter,
  type ConvertSubsMutation,
  type ConvertSubsVariables,
} from '../../../vendor/seanime-web/app/(main)/_features/video-core/video-core-srt';
// eslint-disable-next-line import/first
import { mediaCaptionCues } from '../mediaCaptionStudyAdapter';

const VTT: Record<string, string> = {
  'sub/en': [
    'WEBVTT', '',
    '00:00:01.000 --> 00:00:04.000', "Good morning. Nice weather today, isn't it?",
  ].join('\n'),
  'sub/ja': [
    'WEBVTT', '',
    '00:00:01.000 --> 00:00:04.000', 'おはようございます。今日はいい天気ですね。',
  ].join('\n'),
};

type Deferred = { resolve: () => void; promise: Promise<void> };
function deferred(): Deferred {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { resolve, promise };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
};

let root: Root | null = null;
let client: QueryClient | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  client?.clear();
  client = null;
});

/** The sidecar's convert-subs endpoint, answering each URL when the test says so. */
async function mountConvertSubs(): Promise<{
  mutation: ConvertSubsMutation;
  answer: (url: string) => Promise<void>;
  asked: string[];
}> {
  const gates = new Map<string, Deferred>();
  const asked: string[] = [];
  const gate = (url: string): Deferred => {
    const existing = gates.get(url);
    if (existing) return existing;
    const created = deferred();
    gates.set(url, created);
    return created;
  };
  const queryClient = new QueryClient();
  client = queryClient;
  const holder: { current: ConvertSubsMutation | null } = { current: null };
  function Host(): null {
    holder.current = useMutation<string | undefined, Error, ConvertSubsVariables>({
      mutationFn: async ({ url }) => {
        asked.push(url);
        await gate(url).promise;
        return VTT[url];
      },
    });
    return null;
  }
  const container = document.createElement('div');
  const reactRoot = createRoot(container);
  root = reactRoot;
  await act(async () => {
    reactRoot.render(
      <QueryClientProvider client={queryClient}>
        <Host />
      </QueryClientProvider>,
    );
  });
  const mutation = holder.current;
  if (!mutation) throw new Error('useMutation did not render');
  return {
    // VideoCore captures the mutation of the render that built the manager; so does this.
    mutation,
    answer: async (url) => {
      gate(url).resolve();
      await flush();
    },
    asked,
  };
}

function sidecarPair(mutation: ConvertSubsMutation) {
  const host = document.createElement('div');
  const video = document.createElement('video');
  host.appendChild(video);
  const selected: number[] = [];
  const manager = new MediaCaptionsManager({
    videoElement: video,
    // Seanime lists sidecars in directory order: `.en` before `.ja`.
    tracks: [
      { src: 'sub/en', label: '[Test] Yuru Camp - 04.en', language: 'en', type: 'srt' },
      { src: 'sub/ja', label: '[Test] Yuru Camp - 04.ja', language: 'ja', type: 'srt' },
    ],
    // What a reopen has: the study language already seeded as the preferred one.
    settings: {
      preferredSubtitleLanguage: 'ja,jpn,japanese',
      preferredSubtitleBlacklist: '',
      subtitleDelay: 0,
      captionCustomization: {},
    } as never,
    fetchAndConvertToVTT: subtitleConverter(mutation, 'vtt'),
    sendTranslateRequest: () => undefined,
    translateTargetLang: null,
  });
  manager.addEventListener('trackselected', (event) => selected.push(event.detail.trackIndex));
  let loaded = false;
  manager.addEventListener('tracksloaded', () => { loaded = true; });
  return { manager, selected, isLoaded: () => loaded };
}

describe('overlapping subtitle conversions on reopen (subtitle audit 7)', () => {
  it('settles the default pick even when the second line asks for its track meanwhile', async () => {
    const { mutation, answer, asked } = await mountConvertSubs();
    const { manager, selected, isLoaded } = sidecarPair(mutation);
    // The manager's own default pick is already converting…
    expect(manager.getSelectedTrackIndexOrNull()).toBe(1);
    // …when the study overlay's second line asks for the English track in the same tick.
    const secondLine = mediaCaptionCues(manager, 0);
    await flush();
    expect(asked).toEqual(['sub/ja', 'sub/en']);

    await answer('sub/en');
    await answer('sub/ja');
    expect((await secondLine).map((cue) => cue.text)).toEqual([
      "Good morning. Nice weather today, isn't it?",
    ]);
    // Before the fix the Japanese conversion never settled: no announcement, no tracksloaded.
    expect(selected).toEqual([1]);
    expect(isLoaded()).toBe(true);
    manager.destroy();
  });

  it('switches Off → .en → .ja after that overlap, cues and announcement following', async () => {
    const { mutation, answer } = await mountConvertSubs();
    const { manager, selected } = sidecarPair(mutation);
    void mediaCaptionCues(manager, 0);
    await flush();
    await answer('sub/en');
    await answer('sub/ja');

    manager.setNoTrack();
    await act(async () => { await manager.selectTrack(0); });
    expect(selected.at(-1)).toBe(0);

    // The step that failed: `selectTrack(1)` waited on the stranded Japanese load forever.
    let settled = false;
    const pick = manager.selectTrack(1).then(() => { settled = true; });
    await flush();
    expect(settled).toBe(true);
    await pick;
    expect(selected.at(-1)).toBe(1);
    expect(manager.getSelectedTrackIndexOrNull()).toBe(1);
    const japanese = await mediaCaptionCues(manager, 1);
    expect(japanese[0]?.text).toBe('おはようございます。今日はいい天気ですね。');
    manager.destroy();
  });
});

describe('MediaCaptionsManager: only the newest selection finishes', () => {
  it('does not announce a slow track after the user has already picked another', async () => {
    const { mutation, answer } = await mountConvertSubs();
    const { manager, selected } = sidecarPair(mutation);
    // The default pick (Japanese) is still converting when the user picks English.
    const english = manager.selectTrack(0);
    await flush();
    await answer('sub/en');
    await english;
    expect(selected).toEqual([0]);

    // The Japanese conversion lands late: it must not take the selection back.
    await answer('sub/ja');
    expect(selected).toEqual([0]);
    expect(manager.getSelectedTrackIndexOrNull()).toBe(0);
    manager.destroy();
  });

  it('does not announce a slow track after the user has turned subtitles off', async () => {
    const { mutation, answer } = await mountConvertSubs();
    const { manager, selected } = sidecarPair(mutation);
    manager.setNoTrack();
    await answer('sub/ja');
    expect(selected).toEqual([]);
    expect(manager.getSelectedTrackIndexOrNull()).toBeNull();
    manager.destroy();
  });
});
