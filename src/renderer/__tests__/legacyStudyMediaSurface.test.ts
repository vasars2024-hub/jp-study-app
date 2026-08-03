// @vitest-environment jsdom
import { createElement, createRef, act, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useLegacyStudyMediaSurface } from '../components/media/legacyStudyMediaSurface';
import {
  studyPlaybackPosition,
  type StudyMediaSurface,
} from '../../shared/studyMediaSurface';
import type { MediaState } from '../components/media/MediaContent';
import type { MediaItem } from '../../shared/types';

function item(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'media-1',
    title: 'The Big O - 01',
    path: 'C:/media/the-big-o-01.mkv',
    fileName: 'the-big-o-01.mkv',
    addedAt: 1,
    ...overrides,
  };
}

/**
 * Only the members the contract names exist here. Everything else on
 * `MediaState` is deliberately absent, so if the adapter ever starts reaching
 * for another legacy member this test crashes instead of quietly re-coupling.
 */
function legacyState(over: {
  items: MediaItem[];
  current: MediaItem | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  openFile: () => Promise<void>;
  playbackRate?: number;
  setPlaybackRate?: (rate: number) => void;
}): MediaState {
  return {
    ...over,
    listeningAvailability: null,
    playbackRate: over.playbackRate ?? 0.85,
    setPlaybackRate: over.setPlaybackRate ?? (() => undefined),
  } as unknown as MediaState;
}

// react-dom's `act` warns unless the environment opts in. No shared setup file
// declares this, and the two existing createRoot tests are `.test.tsx`, which
// the vitest include globs never match — so this is the first one that runs.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function mountSurface(state: MediaState): StudyMediaSurface {
  let latest: StudyMediaSurface | null = null;
  const Host = (): null => {
    latest = useLegacyStudyMediaSurface(state);
    return null;
  };
  const host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  act(() => mounted.render(createElement(Host)));
  if (!latest) throw new Error('surface not produced');
  return latest;
}

describe('useLegacyStudyMediaSurface', () => {
  it('projects only the player-agnostic members Study needs', () => {
    const openFile = async (): Promise<void> => undefined;
    const setPlaybackRate = (): void => undefined;
    const items = [item(), item({ id: 'media-2' })];
    const surface = mountSurface(
      legacyState({
        items,
        current: items[0],
        videoRef: createRef(),
        openFile,
        setPlaybackRate,
      }),
    );

    expect(Object.keys(surface).sort()).toEqual([
      'current',
      'items',
      'listeningAvailability',
      'livePositionSec',
      'openFile',
      'playbackRate',
      'setPlaybackRate',
    ]);
    expect(surface.items).toBe(items);
    expect(surface.current).toBe(items[0]);
    expect(surface.listeningAvailability).toBeNull();
    expect(surface.playbackRate).toBe(0.85);
    expect(surface.setPlaybackRate).toBe(setPlaybackRate);
    expect(surface.openFile).toBe(openFile);
  });

  it('reads the live position off the legacy video element through the ref', () => {
    const videoRef = createRef<HTMLVideoElement>() as RefObject<HTMLVideoElement | null>;
    const surface = mountSurface(
      legacyState({
        items: [],
        current: item({ positionSec: 53.267 }),
        videoRef,
        openFile: async (): Promise<void> => undefined,
      }),
    );

    // No element mounted yet — the stored resume point stands.
    expect(surface.livePositionSec()).toBeNull();
    expect(studyPlaybackPosition(surface)).toBe(53.267);

    const element = document.createElement('video');
    Object.defineProperty(element, 'currentTime', { value: 240.5, writable: true });
    videoRef.current = element;

    // The surface reads *through* the ref, so a player attached after the
    // surface was built is still seen. The five-second workspace poll depends
    // on exactly this — a snapshotted number would freeze the return target.
    expect(surface.livePositionSec()).toBe(240.5);
    expect(studyPlaybackPosition(surface)).toBe(240.5);
  });

  it('survives an unmounted player without throwing', () => {
    const videoRef = createRef<HTMLVideoElement>() as RefObject<HTMLVideoElement | null>;
    const surface = mountSurface(
      legacyState({
        items: [],
        current: null,
        videoRef,
        openFile: async (): Promise<void> => undefined,
      }),
    );

    expect(() => surface.livePositionSec()).not.toThrow();
    expect(studyPlaybackPosition(surface)).toBe(0);
  });
});
