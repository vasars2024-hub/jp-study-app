// @vitest-environment jsdom
/**
 * Region Recorder round 2, renderer side:
 *
 * - the study-day filing the main window does (Calendar event + study time),
 *   idempotent when main retries a request whose answer was lost;
 * - the history list: delete asks first and only then moves the file to the
 *   Recycle Bin and drops the library item; rows render in Russian with CLDR
 *   plurals and no raw keys;
 * - the level meter is a labelled `meter`;
 * - the bridge tells main when a Whisper model download lands in another window.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileRecordingOnStudyDay, type StudyTagStores } from '../recorder/recordingStudyTag';
import { RecordingHistoryList } from '../recorder/RecordingHistoryList';
import { RecorderMeter } from '../recorder/RecorderPanel';
import { installRecorderMainBridge } from '../recorder/recorderMainBridge';
import { WHISPER_DOWNLOADED_KEY } from '../whisperDownloadSignal';
import { setUiLang } from '../i18n';
import { ensureCatalog } from '../../shared/i18n/catalogs';
import type { RecorderHistoryEntry, RecorderStudyTagRequest } from '../../shared/regionRecorder';

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host.remove();
  setUiLang('en');
  await new Promise((r) => setTimeout(r, 0));
  delete (window as { api?: unknown }).api;
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('filing a recording under its study day', () => {
  const request: RecorderStudyTagRequest = {
    requestId: 't-1', id: 'rec-1', title: 'Gum Recording 2026-10-08 140322', studyDay: '2026-10-08',
    createdAt: new Date(2026, 9, 8, 14, 3, 22).getTime(), seconds: 754, outputPath: 'C:/Videos/Gum Recordings/a.mp4',
  };
  const stores = (): StudyTagStores & { events: ReturnType<StudyTagStores['loadEvents']> } => {
    const events: ReturnType<StudyTagStores['loadEvents']> = [];
    return {
      events,
      loadEvents: () => events,
      addEvent: vi.fn((entry) => {
        const event = { ...entry, id: `e${events.length}`, createdAt: 1 };
        events.push(event);
        return event;
      }),
      recordStudyTime: vi.fn(),
    };
  };

  it('adds an all-day study event on that day and counts the length as study time on it', () => {
    const s = stores();
    expect(fileRecordingOnStudyDay(request, s)).toBe(true);
    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({ date: '2026-10-08', allDay: true, category: 'study', description: request.outputPath });
    expect(s.events[0].title).toContain(request.title);
    expect(s.recordStudyTime).toHaveBeenCalledWith(754, request.createdAt);
  });

  it('a retried request adds nothing twice; a malformed one adds nothing', () => {
    const s = stores();
    fileRecordingOnStudyDay(request, s);
    expect(fileRecordingOnStudyDay({ ...request, requestId: 't-2' }, s)).toBe(true);
    expect(s.events).toHaveLength(1);
    expect(s.recordStudyTime).toHaveBeenCalledTimes(1);
    expect(fileRecordingOnStudyDay({ ...request, studyDay: 'yesterday' }, s)).toBe(false);
  });
});

function row(id: string, extra: Partial<RecorderHistoryEntry & { missing: boolean }> = {}) {
  return {
    id, title: `Rec ${id}`, outputPath: `C:/r/${id}.mp4`, mediaId: `m-${id}`, createdAt: Date.UTC(2026, 9, 8), studyDay: '2026-10-08',
    durationMs: 125_000, bytes: 30 * 1024 * 1024, source: 'region' as const, hasAudio: true, transcript: 'done' as const,
    studyTagged: true, missing: false, ...extra,
  };
}

describe('history list', () => {
  it('deletes only after the confirmation, to the bin, and drops the library item', async () => {
    const action = vi.fn(async () => ({ ok: true, mediaId: 'm-a' }));
    const removeMedia = vi.fn(async () => []);
    const rows = [row('a'), row('b', { transcript: 'waiting-model', missing: true })];
    (window as unknown as { api: unknown }).api = {
      recorderHistory: vi.fn(async () => rows),
      onRecorderHistoryChanged: () => () => undefined,
      recorderHistoryAction: action,
      removeMedia,
    };
    await act(async () => {
      root = createRoot(host);
      root.render(createElement(RecordingHistoryList, { variant: 'settings' }));
    });
    await flush();
    expect(host.querySelectorAll('[data-testid="rr-history-row"]')).toHaveLength(2);
    expect(host.textContent).toContain('waiting for the speech model');
    expect(host.textContent).toContain('moved or deleted');
    expect(host.textContent).not.toMatch(/rec2\./);

    const deleteButton = host.querySelector<HTMLButtonElement>('button[aria-label="Delete Rec a"]')!;
    await act(async () => deleteButton.click());
    expect(action).not.toHaveBeenCalled();
    const confirm = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Move to Recycle Bin')!;
    await act(async () => confirm.click());
    await flush();
    expect(action).toHaveBeenCalledWith('a', 'delete');
    expect(removeMedia).toHaveBeenCalledWith('m-a');

    // A missing file cannot be opened or re-transcribed.
    const rowB = host.querySelectorAll('[data-testid="rr-history-row"]')[1];
    const buttons = [...rowB.querySelectorAll('button')];
    expect(buttons.find((b) => b.textContent === 'Open')?.disabled).toBe(true);
    expect(buttons.find((b) => b.textContent === 'Transcribe again')?.disabled).toBe(true);
  });

  it('renders in Russian, with the plural for "show all"', async () => {
    await ensureCatalog('ru');
    setUiLang('ru');
    await new Promise((r) => setTimeout(r, 0));
    const rows = Array.from({ length: 22 }, (_, i) => row(`r${i}`));
    (window as unknown as { api: unknown }).api = {
      recorderHistory: vi.fn(async () => rows),
      onRecorderHistoryChanged: () => () => undefined,
      recorderHistoryAction: vi.fn(),
    };
    await act(async () => {
      root = createRoot(host);
      root.render(createElement(RecordingHistoryList, { variant: 'blanc', limit: 5 }));
    });
    await flush();
    expect(host.textContent).toContain('Показать все 22 записи');
    expect(host.textContent).toContain('Расшифровать снова');
    expect(host.textContent).not.toMatch(/rec2\.|recorder\./);
  });
});

describe('level meter', () => {
  it('is a labelled meter with its value and a peak marker', async () => {
    await act(async () => {
      root = createRoot(host);
      root.render(createElement(RecorderMeter, { label: 'Mic level', meter: { level: 0.42, peak: 0.8, peakAt: 0, clipping: true } }));
    });
    const meter = host.querySelector('[role="meter"]')!;
    expect(meter.getAttribute('aria-label')).toBe('Mic level');
    expect(meter.getAttribute('aria-valuenow')).toBe('42');
    expect(meter.className).toContain('rr-level--clip');
    expect(host.querySelector<HTMLElement>('.rr-level-peak')!.style.left).toBe('80%');
  });
});

describe('main window bridge', () => {
  it('tells main when a model download lands in another window, and answers study-day requests', async () => {
    let onTag: ((r: RecorderStudyTagRequest) => void) | null = null;
    const modelChanged = vi.fn();
    const reply = vi.fn();
    (window as unknown as { api: unknown }).api = {
      onRecorderOpenInPlayer: () => () => undefined,
      onRecorderStudyTag: (cb: typeof onTag) => { onTag = cb; return () => undefined; },
      recorderStudyTagReply: reply,
      onRecorderModelCheck: () => () => undefined,
      recorderModelCheckReply: vi.fn(),
      recorderModelChanged: modelChanged,
    };
    const off = installRecorderMainBridge();
    window.dispatchEvent(new StorageEvent('storage', { key: WHISPER_DOWNLOADED_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
    expect(modelChanged).toHaveBeenCalledTimes(1);

    onTag!({ requestId: 'q1', id: 'rec-z', title: 'T', studyDay: 'not-a-day', createdAt: 1, seconds: 1, outputPath: 'x' });
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ requestId: 'q1', ok: false }));
    off();
  });
});
