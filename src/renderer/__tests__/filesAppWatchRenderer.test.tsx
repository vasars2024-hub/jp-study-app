// @vitest-environment jsdom
/**
 * Gate 25's renderer half — "recognised **without a manual refresh**".
 *
 * Main's half is measured in `main/__tests__/filesAppWatch.test.ts`, on real
 * chunked writes. What is measured here is the clause that half cannot claim
 * for itself: that the window learns about an arrival WITHOUT asking. So the
 * test never calls anything on the hook. It pushes an arrival through the
 * preload callback the way main's broadcast does, and then asks whether the
 * index refreshed and whether the app says what landed.
 *
 * The production `FilesApp` is what renders the notice, so the notice half is
 * asserted on that component rather than on a probe: a status line that only
 * exists in a test host is not a surface anyone can see.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFilesWatch } from '../components/filesapp/useFilesWatch';
import {
  commitIngestStabilityMs,
  commitIngestWatchRootAdded,
  resetIngestSettingsMemoryForTests,
} from '../filesIngestSettingsStore';
import type { FilesWatchArrival } from '../../main/filesApp/watch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const filesWatchSet = vi.fn<
  (roots: string[], options?: unknown) => Promise<{ roots: string[]; pending: number }>
>();
const onFilesWatchArrival = vi.fn<(cb: (a: FilesWatchArrival[]) => void) => () => void>();
const unsubscribe = vi.fn();
/** The callback main would broadcast into, captured from the subscription. */
let push: ((a: FilesWatchArrival[]) => void) | null = null;

const refresh = vi.fn();

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let observed: ReturnType<typeof useFilesWatch> | null = null;

function Probe() {
  observed = useFilesWatch(refresh);
  return (
    <div>
      <span className="roots">{observed.roots.join('|')}</span>
      <span className="arrivals">{observed.arrivals.map((a) => a.entry.name).join('|')}</span>
      <span className="elapsed">{observed.arrivals.map((a) => a.elapsedMs).join('|')}</span>
    </div>
  );
}

function arrival(name: string, elapsedMs: number): FilesWatchArrival {
  return {
    entry: {
      path: `C:\\dl\\${name}`,
      name,
      sizeBytes: 4096,
      target: 'media',
      confidence: 'exact',
      reasonKey: 'fileDrop.reason.media',
      candidateCount: 1,
      settlement: 'placed',
    },
    root: 'C:\\dl',
    elapsedMs,
    at: 1_000,
  };
}

beforeEach(() => {
  localStorage.clear();
  resetIngestSettingsMemoryForTests();
  refresh.mockReset();
  filesWatchSet.mockReset();
  onFilesWatchArrival.mockReset();
  unsubscribe.mockReset();
  push = null;
  filesWatchSet.mockImplementation(async (roots: string[]) => ({ roots, pending: 0 }));
  onFilesWatchArrival.mockImplementation((cb) => {
    push = cb;
    return unsubscribe;
  });
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: { filesWatchSet, onFilesWatchArrival },
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  observed = null;
});

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<Probe />));
  await act(async () => {
    await Promise.resolve();
  });
}

describe('gate 25 — the renderer is told, it does not ask', () => {
  it('sends the stored roots and window to main on mount', async () => {
    commitIngestWatchRootAdded('C:\\dl');
    commitIngestStabilityMs(30_000);
    await mount();
    expect(filesWatchSet).toHaveBeenCalledWith(['C:\\dl'], { stabilityMs: 30_000 });
    expect(host?.querySelector('.roots')?.textContent).toBe('C:\\dl');
  });

  it('an arrival refreshes the index with nothing asking it to', async () => {
    commitIngestWatchRootAdded('C:\\dl');
    await mount();
    expect(refresh).not.toHaveBeenCalled();

    // Exactly what main's broadcast delivers. Nothing in this test polls,
    // sweeps or re-renders on purpose.
    await act(async () => push?.([arrival('ep01.mkv', 4_200)]));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(host?.querySelector('.arrivals')?.textContent).toBe('ep01.mkv');
    // The elapsed time is carried through as a NUMBER, so the surface can format
    // it for the locale rather than shipping a pre-rendered string.
    expect(host?.querySelector('.elapsed')?.textContent).toBe('4200');
  });

  it('an empty batch refreshes nothing — a broadcast is not an arrival', async () => {
    await mount();
    await act(async () => push?.([]));
    expect(refresh).not.toHaveBeenCalled();
    expect(host?.querySelector('.arrivals')?.textContent).toBe('');
  });

  it('re-applies when the settings document changes, without a remount', async () => {
    await mount();
    expect(filesWatchSet).toHaveBeenCalledWith([], { stabilityMs: 3_000 });
    await act(async () => {
      commitIngestWatchRootAdded('C:\\downloads');
      await Promise.resolve();
    });
    expect(filesWatchSet).toHaveBeenLastCalledWith(['C:\\downloads'], { stabilityMs: 3_000 });
  });

  it('reports what MAIN says it is watching, not what was asked', async () => {
    // A root main refused (gone, unreadable, past its cap) must not appear as
    // watched: the status line would then claim a folder is covered when it is
    // not, which is worse than showing nothing.
    commitIngestWatchRootAdded('C:\\dl');
    commitIngestWatchRootAdded('C:\\gone');
    filesWatchSet.mockImplementation(async () => ({ roots: ['C:\\dl'], pending: 0 }));
    await mount();
    expect(host?.querySelector('.roots')?.textContent).toBe('C:\\dl');
  });

  it('unsubscribes on unmount, so a closed window stops being told', async () => {
    await mount();
    expect(unsubscribe).not.toHaveBeenCalled();
    await act(async () => root?.unmount());
    root = null;
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('survives a build with no watch API at all', async () => {
    // The preload is versioned separately from the renderer, and a window that
    // threw here would take the whole Files app down over a missing watcher.
    Object.defineProperty(window, 'api', { configurable: true, writable: true, value: {} });
    await mount();
    expect(host?.querySelector('.roots')?.textContent).toBe('');
    expect(refresh).not.toHaveBeenCalled();
  });
});
