// @vitest-environment jsdom
/**
 * The Notebook follows its own timeline live.
 *
 * Two branches met here: the Notebook learned to refresh itself when the deck,
 * the clipboard or the library changed (round-2 shell pass), and the Files app
 * learned to delete a note (`removeNotebookEntry`). A note deleted in Files, or
 * an event appended by another surface in the same window, still sat in an open
 * Notebook until the window lost and regained focus, because the timeline was
 * the one stream it did not listen to.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/db', () => ({
  kvGet: async () => undefined,
  kvSet: async () => undefined,
  kvUpdate: async () => undefined,
}));

import { appendNotebookEvent, removeNotebookEntry } from '../notebookTimeline';
import { useNotebook, type NotebookState } from '../components/notebook/NotebookContent';

let host: HTMLDivElement;
let root: Root;
let latest: NotebookState | null = null;

function Probe() {
  latest = useNotebook();
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  latest = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function titles(): string[] {
  return (latest?.inView ?? []).map((entry) => entry.title);
}

describe('an open Notebook and its timeline', () => {
  it('drops a note deleted elsewhere and shows one appended elsewhere, without a refocus', async () => {
    const note = appendNotebookEvent({ stream: 'translations', title: 'kept for later' });
    await act(async () => {
      root.render(<Probe />);
      await vi.runAllTimersAsync();
    });
    expect(titles()).toContain('kept for later');

    await act(async () => {
      expect(removeNotebookEntry(note.id)).toBe(true);
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(titles()).not.toContain('kept for later');

    await act(async () => {
      appendNotebookEvent({ stream: 'translations', title: 'written in another app' });
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(titles()).toContain('written in another app');
  });
});
