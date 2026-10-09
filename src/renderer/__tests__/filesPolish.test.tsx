// @vitest-environment jsdom
/**
 * files2 — keyboard model, async duplicate finding, media preview, empty states.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FILES_PAGE_ROWS, filesCursorTarget, filesRangeIds } from '../components/filesapp/filesKeyboard';
import {
  findDuplicateGroups,
  findDuplicateGroupsAsync,
  mediaPreviewKind,
  previewPlanFor,
  type FilesDuplicateInput,
} from '../../shared/filesApp/preview';
import { FilesPreviewPane, hasFilesPreview } from '../components/filesapp/FilesPreviewPane';
import type { FilesItem } from '../../shared/filesApp/catalog';

const FILES_APP = readFileSync(resolve(__dirname, '..', 'components', 'filesapp', 'FilesApp.tsx'), 'utf8');
const MAIN_IPC = readFileSync(resolve(__dirname, '..', '..', 'main', 'filesApp', 'ipc.ts'), 'utf8');

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
  delete (window as unknown as { api?: unknown }).api;
});

describe('list keyboard model', () => {
  it('moves by row, page and end, clamped to the list', () => {
    expect(filesCursorTarget(0, 'ArrowDown', 5)).toBe(1);
    expect(filesCursorTarget(4, 'ArrowDown', 5)).toBe(4);
    expect(filesCursorTarget(0, 'ArrowUp', 5)).toBe(0);
    expect(filesCursorTarget(2, 'Home', 5)).toBe(0);
    expect(filesCursorTarget(2, 'End', 5)).toBe(4);
    expect(filesCursorTarget(0, 'PageDown', 50)).toBe(FILES_PAGE_ROWS);
    expect(filesCursorTarget(3, 'PageUp', 50)).toBe(0);
    expect(filesCursorTarget(0, 'x', 5)).toBeNull();
    expect(filesCursorTarget(0, 'ArrowDown', 0)).toBeNull();
  });

  it('a Shift+click range covers both ends in either direction', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(filesRangeIds(ids, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(filesRangeIds(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
    expect(filesRangeIds(ids, null, 'c')).toEqual(['c']);
    expect(filesRangeIds(ids, 'b', 'zz')).toEqual([]);
  });

  it('is wired into the rows', () => {
    expect(FILES_APP).toContain('filesCursorTarget(index, e.key, visible.length)');
    expect(FILES_APP).toContain('scrollToIndex={cursorIndex}');
    expect(FILES_APP).toContain('data-row-id={item.id}');
    // Enter on the selected row opens; the search filters off a deferred query.
    expect(FILES_APP).toMatch(/e\.key === 'Enter' && item\.id === selectedId/);
    expect(FILES_APP).toContain('useDeferredValue(query)');
  });
});

describe('duplicates without a main-thread stall', () => {
  const items: FilesDuplicateInput[] = [
    { id: '1', sizeBytes: 10, location: { store: 'file', path: 'C:/a/x.mkv' } },
    { id: '2', sizeBytes: 10, location: { store: 'file', path: 'C:/b/y.mkv' } },
    { id: '3', sizeBytes: 10, location: { store: 'file', path: 'C:/c/z.mkv' } },
    { id: '4', sizeBytes: 99, location: { store: 'file', path: 'C:/a/x.mkv' } },
  ];
  const digest = (path: string): string | null => (path.endsWith('z.mkv') ? 'other' : 'same');

  it('finds exactly what the sync finder finds', async () => {
    const yields = vi.fn(async () => undefined);
    const asyncGroups = await findDuplicateGroupsAsync(items, async (path) => digest(path), {
      yieldEvery: 1,
      yieldNow: yields,
    });
    expect(asyncGroups).toEqual(findDuplicateGroups(items, (path) => digest(path)));
    expect(asyncGroups.some((g) => g.reason === 'content')).toBe(true);
    expect(yields).toHaveBeenCalled();
  });

  it('respects the hashing budget', async () => {
    const hashOf = vi.fn(async () => 'h');
    await findDuplicateGroupsAsync(items, hashOf, { maxHashed: 1, yieldNow: async () => undefined });
    expect(hashOf).toHaveBeenCalledTimes(1);
  });

  it('main serves preview and duplicates from the async index', () => {
    expect(MAIN_IPC).toContain('findIndexDuplicatesAsync((await getFilesIndexAsync()).items)');
    expect(MAIN_IPC).not.toMatch(/FILES_PREVIEW_CHANNEL[\s\S]{0,200}getFilesIndex\(\)\./);
  });
});

describe('media preview', () => {
  const item = (path: string): FilesItem =>
    ({
      id: `file:${path}`,
      name: path.split('/').pop() ?? path,
      kind: 'audio',
      location: { store: 'file', path },
      flags: {},
    }) as unknown as FilesItem;

  it('classifies audio and video, and leaves the main plan unchanged', () => {
    expect(mediaPreviewKind('C:/m/song.FLAC')).toBe('audio');
    expect(mediaPreviewKind('C:/v/ep01.mkv')).toBe('video');
    expect(mediaPreviewKind('C:/b/book.epub')).toBeNull();
    expect(previewPlanFor({ kind: 'video', path: 'C:/v.mkv' })).toBeNull();
    expect(hasFilesPreview(item('C:/m/song.mp3'))).toBe(true);
  });

  it('plays audio in the pane through the player stream', async () => {
    (window as unknown as { api: unknown }).api = {
      mediaFileUrl: vi.fn(async () => 'playfile://tok'),
    };
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<FilesPreviewPane item={item('C:/m/song.mp3')} t={(key) => key} />);
    });
    const audio = host.querySelector('audio');
    expect(audio?.getAttribute('src')).toBe('playfile://tok');
    expect(audio?.hasAttribute('controls')).toBe(true);
    expect(audio?.getAttribute('aria-label')).toBe('files2.preview.audio');
  });

  it('says so when the stream is refused', async () => {
    (window as unknown as { api: unknown }).api = { mediaFileUrl: vi.fn(async () => null) };
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<FilesPreviewPane item={item('C:/m/song.mp3')} t={(key) => key} />);
    });
    expect(host.textContent).toContain('filesApp.preview.none.unsupported');
  });
});

describe('empty states offer the next step', () => {
  it('clear search, show everything, scan a folder, and help', () => {
    for (const key of ['files2.empty.clearSearch', 'files2.empty.showEverything', 'files2.empty.scan']) {
      expect(FILES_APP).toContain(`t('${key}')`);
    }
    expect(FILES_APP).toContain('<HelpLink topic="files" />');
  });
});
