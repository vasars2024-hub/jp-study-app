// @vitest-environment jsdom
/**
 * The reader shell's `video.resumeLast` handoff — Phase 6 slice 14.
 *
 * Driven against a **real** `MediaWorkspaceHost`, not a marker element, because the whole
 * question is an ordering one: does the host's open listener exist by the time the resume
 * dispatches, one commit after the book closes? A stub host would answer yes by
 * construction and prove nothing.
 *
 * The shell here mirrors `App.tsx`'s structure in the one respect that matters — the host
 * is a CHILD of the component running the hook, which is what puts the host's effect
 * before the hook's in the same commit.
 *
 * The companion property — *a resume goes through while the host has rendered nothing* —
 * is pinned in `resumeLastShellHandoff.test.ts` instead. A version of it here needed a
 * gate on the status IPC, and that gate blocks the built-in's own availability check as
 * well as the host's first render, so it could not distinguish the two. An instrument
 * that cannot see the thing it reports on is this track's most expensive recurring
 * mistake; the sibling file settles it with a registration and no timing at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { VIDEO_CORE_RESUME_STORAGE_KEY } from '../../shared/videoCoreStudy';

vi.mock('../../media/MediaWorkspace', () => ({ default: () => null }));
vi.mock('../../media/seanimeBootstrap', () => ({
  bootstrapSeanimeConnection: () => Promise.resolve({ baseUrl: '', token: '' }),
}));

let toasts: string[] = [];
let opens: { localFilePath?: string; startAtSec?: number }[] = [];
let statusKind = 'ready';

function onToast(event: Event): void {
  toasts.push(String((event as CustomEvent).detail?.message ?? ''));
}
function onOpen(event: Event): void {
  opens.push((event as CustomEvent).detail);
}

beforeEach(() => {
  localStorage.clear();
  toasts = [];
  opens = [];
  statusKind = 'ready';
  window.addEventListener('os:toast', onToast);
  window.addEventListener('seanime:media-workspace-open', onOpen);
  Object.defineProperty(window, 'api', {
    value: new Proxy({}, {
      get: (_target, prop) => {
        if (typeof prop === 'string' && prop.startsWith('on')) return () => () => undefined;
        if (prop === 'seanimeStatus') {
          return () => Promise.resolve({ kind: statusKind, pid: 1, port: 1234 });
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
  window.removeEventListener('seanime:media-workspace-open', onOpen);
  document.body.innerHTML = '';
});

function seedOneFile(): void {
  localStorage.setItem(VIDEO_CORE_RESUME_STORAGE_KEY, JSON.stringify([
    { key: 'file:c:/anime/newest - 07.mkv', positionSec: 742, updatedAt: 9_000 },
  ]));
}

/**
 * `App.tsx` in miniature: a `reading` state, the hook, and the two branches — a reader
 * with a palette and no host, or a desktop with a host.
 */
async function mountShell(): Promise<{ root: Root; setReading: (v: boolean) => void }> {
  const { useReaderResumeHandoff } = await import('../readerResumeHandoff');
  const { default: MediaWorkspaceHost } = await import('../../media/MediaWorkspaceHost');

  let setReadingExternal: ((v: boolean) => void) | null = null;

  function Shell(): ReactElement {
    const [reading, setReading] = useState(true);
    setReadingExternal = setReading;
    useReaderResumeHandoff(reading, () => setReading(false));
    // The reader branch renders no host — that IS the defect's shape.
    return reading
      ? createElement('div', { className: 'reader-root' })
      : createElement(MediaWorkspaceHost);
  }

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Shell));
  });
  return { root, setReading: (v) => setReadingExternal?.(v) };
}

describe('resuming from inside a book', () => {
  it('closes the reader and reaches the host that mounts in its place', async () => {
    seedOneFile();
    const { runCommand } = await import('../keyboardShortcuts');
    const { root } = await mountShell();

    expect(document.querySelector('.reader-root')).not.toBeNull();
    await act(async () => {
      runCommand('video.resumeLast');
    });

    expect(document.querySelector('.reader-root'), 'the book stayed open').toBeNull();
    expect(opens, 'the open event was lost between the two commits').toHaveLength(1);
    expect(opens[0]?.localFilePath).toContain('newest - 07.mkv');
    expect(toasts).toEqual([]);
    await act(async () => root.unmount());
  });

  it('keeps the book open when the sidecar is disabled, and says so', async () => {
    // The ordering that makes this a fix rather than a trade: a machine with no media
    // workspace must not lose its reader to a command that could never have worked.
    statusKind = 'disabled';
    seedOneFile();
    const { runCommand } = await import('../keyboardShortcuts');
    const { root } = await mountShell();

    await act(async () => {
      runCommand('video.resumeLast');
    });

    expect(document.querySelector('.reader-root'), 'the book was closed for nothing')
      .not.toBeNull();
    expect(opens).toEqual([]);
    expect(toasts).toEqual(['The media server is off, so there is nothing to resume into.']);
    await act(async () => root.unmount());
  });

  it('reports an empty resume store without leaving the user in the reader for nothing', async () => {
    // Nothing to resume is still a real answer, and the book still closes — the command
    // was accepted and the desktop is where the media surfaces are. What must not happen
    // is silence, which is this seam's recurring failure.
    const { runCommand } = await import('../keyboardShortcuts');
    const { root } = await mountShell();

    await act(async () => {
      runCommand('video.resumeLast');
    });

    expect(opens).toEqual([]);
    expect(toasts).toEqual(['Nothing watched yet — open a video first.']);
    await act(async () => root.unmount());
  });

  it('leaves the built-in alone once the reader is closed', async () => {
    // The handler is registered only while a book is open. If it outlived the reader,
    // every later resume from the desktop would take a pointless round trip through a
    // close-the-book path with no book to close.
    seedOneFile();
    const { runCommand } = await import('../keyboardShortcuts');
    const { root, setReading } = await mountShell();
    await act(async () => setReading(false));
    opens = [];

    await act(async () => {
      runCommand('video.resumeLast');
    });

    expect(opens).toHaveLength(1);
    expect(toasts).toEqual([]);
    await act(async () => root.unmount());
  });
});
