// @vitest-environment jsdom
/**
 * A closed player must not stay reachable from `document` or `navigator.mediaSession`.
 *
 * VideoCore released its managers only when `playbackInfo` turned null while it was still
 * mounted. The study host unmounts the player with a stream loaded (the video window closes),
 * so each video watched left the whole player behind. Measured on the packaged build
 * (2026-09-26, `longsession.mjs L3` video steps, forced GC before each sample): about +500
 * detached DOM nodes and +110 JS listeners per video, one more `enterpictureinpicture`
 * listener on `document` each time; heap-snapshot retainers `document -> V8EventListener ->
 * PiP manager -> <video>` and `navigator.mediaSession -> action handler -> media-session
 * manager -> <video>`.
 *
 * The managers here are the real ones; jsdom only lacks `navigator.mediaSession`, which is
 * stubbed with a recorder. Mounting the whole VideoCore needs the Seanime server, so the
 * wiring (VideoCore's unmount calls the same release) is pinned on its source.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

// eslint-disable-next-line import/first -- must follow the mocks above
import { VideoCorePipManager } from '../../../vendor/seanime-web/app/(main)/_features/video-core/video-core-pip';
// eslint-disable-next-line import/first
import { VideoCoreMediaSessionManager } from '../../../vendor/seanime-web/app/(main)/_features/video-core/video-core-media-session';
// eslint-disable-next-line import/first
import { releaseVideoCoreManagers } from '../../../vendor/seanime-web/app/(main)/_features/video-core/video-core-teardown';

const handlers = new Map<string, unknown>();
const documentListeners = new Map<string, number>();

beforeAll(() => {
  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    value: {
      metadata: null,
      playbackState: 'none',
      setActionHandler: (action: string, handler: unknown) => {
        if (handler) handlers.set(action, handler);
        else handlers.delete(action);
      },
      setPositionState: () => undefined,
    },
  });
  (globalThis as Record<string, unknown>).MediaMetadata ??= class {
    constructor(public init: unknown) {}
  };
  // Count document listeners by type, honouring removal by AbortSignal.
  const add = document.addEventListener.bind(document);
  const remove = document.removeEventListener.bind(document);
  const bump = (type: string, by: number) => documentListeners.set(type, (documentListeners.get(type) ?? 0) + by);
  document.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
    bump(type, 1);
    if (typeof opts === 'object') opts.signal?.addEventListener('abort', () => bump(type, -1));
    add(type, fn, opts);
  }) as typeof document.addEventListener;
  document.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | EventListenerOptions) => {
    bump(type, -1);
    remove(type, fn, opts);
  }) as typeof document.removeEventListener;
});

afterEach(() => {
  handlers.clear();
  documentListeners.clear();
});

const playbackInfo = { id: 'p1', streamType: 'native', streamUrl: 'http://127.0.0.1:1/stream.mp4' } as never;

describe('releaseVideoCoreManagers', () => {
  it('takes the PiP manager off document', () => {
    const video = document.createElement('video');
    const pip = new VideoCorePipManager(() => undefined);
    pip.setVideo(video, playbackInfo);
    expect(documentListeners.get('enterpictureinpicture')).toBe(1);
    expect(documentListeners.get('leavepictureinpicture')).toBe(1);

    releaseVideoCoreManagers({ pipManager: pip });

    expect(documentListeners.get('enterpictureinpicture')).toBe(0);
    expect(documentListeners.get('leavepictureinpicture')).toBe(0);
  });

  it('takes the media-session manager off navigator.mediaSession', () => {
    const video = document.createElement('video');
    const session = new VideoCoreMediaSessionManager();
    session.setPlaybackInfo(playbackInfo);
    session.setVideo(video);
    session.activate();
    expect(handlers.size).toBeGreaterThan(0);

    releaseVideoCoreManagers({ mediaSessionManager: session });

    expect([...handlers.keys()]).toEqual([]);
  });

  it('is safe on managers that are missing or already released', () => {
    const pip = new VideoCorePipManager(() => undefined);
    const session = new VideoCoreMediaSessionManager();
    expect(() => {
      releaseVideoCoreManagers({});
      releaseVideoCoreManagers({ pipManager: pip, mediaSessionManager: session, subtitleManager: null, previewManager: undefined });
      releaseVideoCoreManagers({ pipManager: pip, mediaSessionManager: session });
    }).not.toThrow();
  });
});

describe('VideoCore wiring', () => {
  // Vitest runs from the repository root.
  const src = readFileSync(resolve(process.cwd(), 'vendor/seanime-web/app/(main)/_features/video-core/video-core.tsx'), 'utf8');

  it('releases every global-holding manager when VideoCore unmounts, not only when playback ends', () => {
    const hooks = [...src.matchAll(/useUnmount\(\(\) => \{([\s\S]*?)\n {4}\}\)/g)].map((m) => m[1]);
    const release = hooks.find((body) => body.includes('releaseVideoCoreManagers('));
    expect(release, 'a useUnmount that calls releaseVideoCoreManagers').toBeDefined();
    for (const manager of ['pipManager', 'mediaSessionManager', 'previewManager', 'subtitleManager', 'mediaCaptionsManager', 'anime4kManager']) {
      expect(release).toMatch(new RegExp(`releaseVideoCoreManagers\\(\\{[^}]*\\b${manager}\\b`));
    }
  });
});
