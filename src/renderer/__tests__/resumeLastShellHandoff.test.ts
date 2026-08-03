// @vitest-environment jsdom
/**
 * `video.resumeLast` across the app's shells — Phase 6 slice 14.
 *
 * The command is a **built-in**, so it is offered in every shell that mounts
 * `CommandPalette`. Only some of those mount `MediaWorkspaceHost`:
 *
 *   App.tsx:~700  reader (NovelReader / MangaReader)   palette YES   host NO
 *   App.tsx:~730  pop-out (music, settings, games, …)  palette YES   host only for `video`
 *   App.tsx:~750  desktop                              palette YES   host YES
 *
 * In the first two the old gate — a DOM query for `.seanime-host-launcher` — found nothing
 * and the command reported *"The media server is off, so there is nothing to resume into."*
 * Measured against this tree before the fix, with the sidecar at `ready`:
 *
 *   { sidecar: 'ready', hostMounted: false,
 *     toasts: ['The media server is off, so there is nothing to resume into.'] }
 *
 * A missing host is a fact about the **window**. Whether the sidecar is disabled is a fact
 * about the **machine**, and only main can answer it. These tests pin them apart, and pin
 * the one thing that makes the reader handoff possible: presence is published from the
 * listener's own effect, so it is true a commit before the launcher renders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mediaWorkspaceHostExists,
  registerMediaWorkspaceHost,
} from '../../shared/mediaWorkspace';
import { VIDEO_CORE_RESUME_STORAGE_KEY } from '../../shared/videoCoreStudy';

// Hoisted, so declared here rather than beside the one test that needs them: the adopted
// workspace would drag in the whole vendor bundle, and `seanimeBootstrap` reaches the
// network. Neither is what the presence assertion is about.
vi.mock('../../media/MediaWorkspace', () => ({ default: () => null }));
vi.mock('../../media/seanimeBootstrap', () => ({
  bootstrapSeanimeConnection: () => Promise.resolve({ baseUrl: '', token: '' }),
}));

let toasts: string[] = [];
let statusKind = 'ready';
let statusCalls = 0;

function onToast(event: Event): void {
  toasts.push(String((event as CustomEvent).detail?.message ?? ''));
}

/** Drains the two microtask hops in `resumeLastEpisode` (the IPC, then the `.then`). */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  localStorage.clear();
  toasts = [];
  statusKind = 'ready';
  statusCalls = 0;
  window.addEventListener('os:toast', onToast);
  Object.defineProperty(window, 'api', {
    value: new Proxy({}, {
      get: (_target, prop) => {
        if (typeof prop === 'string' && prop.startsWith('on')) return () => () => undefined;
        if (prop === 'seanimeStatus') {
          return () => {
            statusCalls += 1;
            return Promise.resolve({ kind: statusKind, pid: 1, port: 1234 });
          };
        }
        return () => Promise.resolve(null);
      },
    }),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  window.removeEventListener('os:toast', onToast);
  document.body.innerHTML = '';
});

function seedOneFile(): void {
  localStorage.setItem(VIDEO_CORE_RESUME_STORAGE_KEY, JSON.stringify([
    { key: 'file:c:/anime/newest - 07.mkv', positionSec: 742, updatedAt: 9_000 },
  ]));
}

describe('a shell with no MediaWorkspaceHost', () => {
  it('does not claim the media server is off', async () => {
    // THE DEFECT. The sidecar is `ready`; the reader shell simply has no host.
    seedOneFile();
    const { runCommand } = await import('../keyboardShortcuts');

    runCommand('video.resumeLast');
    await settle();

    expect(toasts).toEqual(['This window has no media player — resume from the main window.']);
  });

  it('answers from the shell alone, without asking main', async () => {
    // Load-bearing, not an optimisation: "no host in this window" is knowable without
    // the sidecar, and asking anyway would let an IPC failure re-word a shell fact as a
    // sidecar fact — which is the defect coming back through the other door.
    seedOneFile();
    const { runCommand } = await import('../keyboardShortcuts');

    runCommand('video.resumeLast');
    await settle();

    expect(statusCalls).toBe(0);
  });
});

describe('a shell with a host', () => {
  it('says the media server is off only when main says it is disabled', async () => {
    const release = registerMediaWorkspaceHost();
    statusKind = 'disabled';
    seedOneFile();
    const { runCommand } = await import('../keyboardShortcuts');

    runCommand('video.resumeLast');
    await settle();

    expect(toasts).toEqual(['The media server is off, so there is nothing to resume into.']);
    release();
  });

  it('resumes with a host mounted and nothing rendered yet', async () => {
    // The reader handoff's whole basis. `MediaWorkspaceHost` registers its listeners in
    // an unconditional effect, so one commit after a fresh mount the listener is live
    // while `status` is still null and NO launcher is in the DOM. The old DOM gate read
    // that as "the media server is off"; the resume must go through.
    const release = registerMediaWorkspaceHost();
    seedOneFile();
    const opens: unknown[] = [];
    const onOpen = (event: Event): void => void opens.push((event as CustomEvent).detail);
    window.addEventListener('seanime:media-workspace-open', onOpen);
    const { runCommand } = await import('../keyboardShortcuts');

    expect(document.querySelector('.seanime-host-launcher')).toBeNull();
    runCommand('video.resumeLast');
    await settle();

    expect(opens).toHaveLength(1);
    expect(toasts).toEqual([]);
    window.removeEventListener('seanime:media-workspace-open', onOpen);
    release();
  });

  it('still reports an empty store as nothing-watched', async () => {
    const release = registerMediaWorkspaceHost();
    const { runCommand } = await import('../keyboardShortcuts');

    runCommand('video.resumeLast');
    await settle();

    expect(toasts).toEqual(['Nothing watched yet — open a video first.']);
    release();
  });
});

describe('host presence counting', () => {
  it('is false with nothing mounted and true while a host is', () => {
    expect(mediaWorkspaceHostExists()).toBe(false);
    const release = registerMediaWorkspaceHost();
    expect(mediaWorkspaceHostExists()).toBe(true);
    release();
    expect(mediaWorkspaceHostExists()).toBe(false);
  });

  it('survives a double release, which StrictMode produces', () => {
    // StrictMode runs an effect's cleanup twice in development. A second decrement would
    // under-count a host that is still mounted, and the symptom would be this slice's
    // defect appearing on the desktop — the one shell that definitely has a host.
    const first = registerMediaWorkspaceHost();
    const second = registerMediaWorkspaceHost();
    first();
    first();
    expect(mediaWorkspaceHostExists()).toBe(true);
    second();
    expect(mediaWorkspaceHostExists()).toBe(false);
  });
});

describe('the real MediaWorkspaceHost publishes its presence', () => {
  it('registers on mount and releases on unmount, before any status arrives', async () => {
    // The tests above stand in for the host. This one is why they are allowed to: without
    // it, presence would be proven only against a stub, and the file that must actually
    // call `registerMediaWorkspaceHost` could quietly stop doing so.
    const { createElement } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: MediaWorkspaceHost } = await import('../../media/MediaWorkspaceHost');
    const { act } = await import('react');

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    expect(mediaWorkspaceHostExists()).toBe(false);
    await act(async () => {
      root.render(createElement(MediaWorkspaceHost));
    });
    expect(mediaWorkspaceHostExists(), 'host did not publish its presence').toBe(true);

    await act(async () => {
      root.unmount();
    });
    expect(mediaWorkspaceHostExists(), 'host did not release on unmount').toBe(false);
    container.remove();
  });
});
