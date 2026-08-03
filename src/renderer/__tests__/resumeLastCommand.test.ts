// @vitest-environment jsdom
/**
 * `video.resumeLast` — Phase 6 slice 11.
 *
 * Slice 7 put a Continue-watching group in the command palette, but only in
 * `search` mode. `Ctrl+Space` — the binding literally labelled "Open command
 * palette" — opens `commands` mode, so the group is not there. Slice 10 made the
 * palette reachable over the full-screen media workspace, which is exactly where
 * a user wants the next episode and exactly where the list surfaces are not.
 *
 * This command closes that. The rules worth pinning are the two failure paths,
 * because both of them look identical from outside — nothing happens — and this
 * seam has produced a silent no-op three separate times now:
 *
 *   no host mounted   -> nothing in this window listens for the open event
 *   nothing watched   -> the resume store is empty
 *
 * Neither may dispatch. Both must be distinguishable by the caller, so the
 * toast can say which one it was rather than "something went wrong".
 *
 * **Slice 14 corrected the first line of that table.** It used to read "the sidecar
 * is off, nothing listens", and the conflation was the defect: a shell can mount the
 * palette without a host (the reader, every pop-out but `video`), and those windows
 * were told the media server was off while it was running. Presence is now published
 * by the host itself rather than inferred from its launcher being in the DOM — see
 * `resumeLastShellHandoff.test.ts`, which owns the shell half.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MEDIA_WORKSPACE_OPEN_EVENT,
  registerMediaWorkspaceHost,
} from '../../shared/mediaWorkspace';
import {
  CONTINUE_WATCHING_REWIND_SEC,
} from '../../shared/seanimeContinueWatching';
import { VIDEO_CORE_RESUME_STORAGE_KEY } from '../../shared/videoCoreStudy';
import { resumeMostRecentWatched } from '../continueWatchingStore';

let releaseHost: (() => void) | null = null;
let opens: { localFilePath?: string; startAtSec?: number }[] = [];

/**
 * Stands in for a mounted `MediaWorkspaceHost` — the registration it makes from the
 * same effect that adds its window listeners.
 *
 * It used to append a `.seanime-host-launcher` element instead, which is what the host
 * renders once a non-`disabled` status has arrived. That made the launcher's presence
 * the test for "is anything listening", and slice 14 is what those are not.
 */
function mountHost(): void {
  releaseHost = registerMediaWorkspaceHost();
}

function onOpen(event: Event): void {
  opens.push((event as CustomEvent).detail);
}

beforeEach(() => {
  localStorage.clear();
  opens = [];
  window.addEventListener(MEDIA_WORKSPACE_OPEN_EVENT, onOpen);
});

afterEach(() => {
  window.removeEventListener(MEDIA_WORKSPACE_OPEN_EVENT, onOpen);
  releaseHost?.();
  releaseHost = null;
});

/** Two entries, deliberately out of order in the store — see the ordering test. */
function seedTwoFiles(): void {
  localStorage.setItem(VIDEO_CORE_RESUME_STORAGE_KEY, JSON.stringify([
    { key: 'file:c:/anime/older - 03.mkv', positionSec: 120, updatedAt: 1_000 },
    { key: 'file:c:/anime/newest - 07.mkv', positionSec: 742, updatedAt: 9_000 },
  ]));
}

describe('video.resumeLast', () => {
  it('opens the most recently watched file, not the first one in the store', () => {
    // The store's array order is not recency order. `seanimeContinueWatching`
    // sorts on updatedAt, and this reuses that rather than re-deciding — a
    // second ordering rule here would be a second chance to disagree with the
    // widget and the palette group, which show the same list.
    mountHost();
    seedTwoFiles();

    expect(resumeMostRecentWatched()).toBe('opened');
    expect(opens).toHaveLength(1);
    expect(opens[0]?.localFilePath).toContain('newest - 07.mkv');
  });

  it('resumes slightly before where playback stopped', () => {
    mountHost();
    seedTwoFiles();

    resumeMostRecentWatched();
    expect(opens[0]?.startAtSec).toBe(742 - CONTINUE_WATCHING_REWIND_SEC);
  });

  it('reports no-host and dispatches nothing when no host is mounted', () => {
    // Nothing in this window listens for the open event — either the shell mounts no
    // host at all, or the sidecar is disabled so the host never mounted. Dispatching
    // here would be a command that appears to work. Which of the two it is belongs to
    // the caller, not here: see `resumeLastShellHandoff.test.ts`.
    seedTwoFiles();

    expect(resumeMostRecentWatched()).toBe('no-host');
    expect(opens).toEqual([]);
  });

  it('reports nothing-watched and dispatches nothing on an empty resume store', () => {
    mountHost();

    expect(resumeMostRecentWatched()).toBe('nothing-watched');
    expect(opens).toEqual([]);
  });

  it('treats a corrupt resume store as an empty one rather than throwing', () => {
    mountHost();
    localStorage.setItem(VIDEO_CORE_RESUME_STORAGE_KEY, '{not json');

    expect(resumeMostRecentWatched()).toBe('nothing-watched');
    expect(opens).toEqual([]);
  });

  it('ignores resume keys that cannot be reopened', () => {
    // Only `file:` keys carry a local path, and `MediaWorkspaceOpenRequest`'s
    // only route to a local file is `localFilePath`. A `media:`/`stream:` row
    // would produce a command that cannot work — slice 7's rule 1.
    mountHost();
    localStorage.setItem(VIDEO_CORE_RESUME_STORAGE_KEY, JSON.stringify([
      { key: 'media:154587', positionSec: 300, updatedAt: 9_999 },
      { key: 'stream:https://example.test/a.m3u8', positionSec: 60, updatedAt: 9_998 },
    ]));

    expect(resumeMostRecentWatched()).toBe('nothing-watched');
    expect(opens).toEqual([]);
  });
});

describe('video.resumeLast is registered as a built-in', () => {
  it('is live without any view registering a handler', async () => {
    // Its `video.*` neighbours are view-registered and read "needs view" in the
    // palette until the video view is open. This one has to work from inside the
    // media workspace, where that view is not mounted, so it is a built-in.
    Object.defineProperty(window, 'api', {
      value: new Proxy({}, {
        get: (_t, prop) => (typeof prop === 'string' && prop.startsWith('on')
          ? () => () => undefined
          : () => Promise.resolve(null)),
      }),
      configurable: true,
      writable: true,
    });
    const { COMMAND_CATALOG, commandIsLive } = await import('../keyboardShortcuts');

    const entry = COMMAND_CATALOG.find((c) => c.id === 'video.resumeLast');
    expect(entry, 'video.resumeLast is missing from COMMAND_CATALOG').toBeDefined();
    expect(entry?.category).toBe('Video');
    // Unbound on purpose: every free single letter belongs to the adopted
    // player's own keymap, so a default chord here would collide.
    expect(entry?.defaultKeys).toBe('');
    expect(commandIsLive('video.resumeLast')).toBe(true);
  });
});
