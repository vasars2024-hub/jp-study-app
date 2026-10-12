// @vitest-environment jsdom
/**
 * A window's unsaved work, as main hears it (renderer/unsavedWork.ts): the whole
 * list each time, batched per tick, and emptied when the work is saved, cancelled
 * or unmounted. Driven through the real note editor (NoteViewer), which reports a
 * draft that differs from the saved note — not merely an open editor.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { heldUnsavedWork, holdWindowUnsavedWork, useUnsavedWork } from '../unsavedWork';
import { NoteViewer } from '../components/notes/NoteViewer';
import type { AppUpdateUnsavedKind } from '../../shared/appUpdate';
import type { NotebookTimelineEntry } from '../notebookTimeline';

let root: Root | null = null;
let host: HTMLDivElement;
const report = vi.fn<(kinds: readonly AppUpdateUnsavedKind[]) => void>();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  report.mockClear();
  (window as unknown as { api: unknown }).api = { reportUnsavedWork: report };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

const tick = () => new Promise<void>((r) => queueMicrotask(r));
const last = () => report.mock.calls[report.mock.calls.length - 1]?.[0];

describe('unsaved work reporting', () => {
  it('sends the whole list once per tick, and an empty list when it is released', async () => {
    const a = holdWindowUnsavedWork('ai-job');
    const b = holdWindowUnsavedWork('card-editor');
    await tick();
    expect(report).toHaveBeenCalledTimes(1);
    expect(last()).toEqual(['ai-job', 'card-editor']);
    a();
    b();
    b();
    await tick();
    expect(report).toHaveBeenCalledTimes(2);
    expect(last()).toEqual([]);
    expect(heldUnsavedWork()).toEqual([]);
  });

  it('the hook holds while active and lets go on change and unmount', async () => {
    let setActive: (v: boolean) => void = () => undefined;
    function Probe() {
      const [active, set] = useState(true);
      setActive = set;
      useUnsavedWork('review-session', active);
      return null;
    }
    await act(async () => root!.render(<Probe />));
    await act(tick);
    expect(last()).toEqual(['review-session']);
    await act(async () => setActive(false));
    await act(tick);
    expect(last()).toEqual([]);
    await act(async () => setActive(true));
    await act(tick);
    expect(last()).toEqual(['review-session']);
    await act(async () => root!.render(<></>));
    await act(tick);
    expect(last()).toEqual([]);
  });

  it('the note editor reports an edit that is not saved, and stops after Cancel', async () => {
    const entry = { id: 'n1', title: 'Title', detail: 'Body', ts: 1, folder: 'Notes', stream: 'notes' } as unknown as NotebookTimelineEntry;
    await act(async () => root!.render(<NoteViewer entry={entry} onClose={() => undefined} />));
    const edit = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Edit')!;
    await act(async () => edit.click());
    await act(tick);
    // Open but unchanged: nothing would be lost.
    expect(heldUnsavedWork()).toEqual([]);
    const area = document.querySelector('textarea')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(area, 'Body, edited');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(tick);
    expect(last()).toEqual(['note-editor']);
    const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!;
    await act(async () => cancel.click());
    await act(tick);
    expect(last()).toEqual([]);
  });
});
