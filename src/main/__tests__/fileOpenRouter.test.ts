// @vitest-environment node
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { FILE_OPEN_LIMIT, createFileOpenRouter, fileOpenKind, filePathsFromArgv } from '../fileOpenRouter';

// Hoisted above the import by vitest.
vi.mock('electron', () => ({ ipcMain: { handle: () => undefined } }));

const EXE = 'C:\\Apps\\jp-study-app.exe';
const CWD = path.resolve('/work');
const existing = (...names: string[]) => {
  const set = new Set(names.map((n) => path.resolve(CWD, n)));
  return (p: string) => set.has(p);
};

describe('filePathsFromArgv', () => {
  it('returns existing files of registered types, absolute, in argv order', () => {
    const argv = [EXE, 'book.epub', path.resolve(CWD, 'ep01.mkv'), 'deck.apkg'];
    expect(filePathsFromArgv(argv, { cwd: CWD, isFile: existing('book.epub', 'ep01.mkv', 'deck.apkg') })).toEqual([
      path.resolve(CWD, 'book.epub'),
      path.resolve(CWD, 'ep01.mkv'),
      path.resolve(CWD, 'deck.apkg'),
    ]);
  });

  it('ignores the exe, switches, a dev launch\'s ".", unknown types and missing files', () => {
    const argv = [EXE, '.', '--open=library', '--allow-file-access-from-files', 'notes.txt', 'gone.epub', 'a.srt'];
    expect(filePathsFromArgv(argv, { cwd: CWD, isFile: existing('notes.txt', 'a.srt') })).toEqual([
      path.resolve(CWD, 'a.srt'),
    ]);
  });

  it('matches extensions case-insensitively, strips quotes and de-duplicates', () => {
    const argv = [EXE, '"Show.MP4"', 'show.mp4', 'Subs.ASS'];
    const out = filePathsFromArgv(argv, { cwd: CWD, isFile: () => true });
    expect(out.map((p) => path.basename(p))).toEqual(
      process.platform === 'win32' ? ['Show.MP4', 'Subs.ASS'] : ['Show.MP4', 'show.mp4', 'Subs.ASS'],
    );
  });

  it('never reads a Squirrel install/update launch as files, but firstrun is a normal launch', () => {
    expect(filePathsFromArgv([EXE, '--squirrel-updated', 'x.epub'], { cwd: CWD, isFile: () => true })).toEqual([]);
    expect(filePathsFromArgv([EXE, '--squirrel-firstrun', 'x.epub'], { cwd: CWD, isFile: () => true })).toHaveLength(1);
  });

  it('caps a runaway selection', () => {
    const argv = [EXE, ...Array.from({ length: FILE_OPEN_LIMIT + 10 }, (_, i) => `f${i}.cbz`)];
    expect(filePathsFromArgv(argv, { cwd: CWD, isFile: () => true })).toHaveLength(FILE_OPEN_LIMIT);
  });
});

describe('fileOpenKind (where the DropRouter planner sends each type)', () => {
  it.each([
    ['a.epub', 'book'],
    ['a.cbz', 'manga'],
    ['a.apkg', 'anki'],
    ['a.srt', 'subtitle'],
    ['a.ass', 'subtitle'],
    ['a.mkv', 'video'],
    ['a.MP4', 'video'],
    ['a.txt', null],
  ])('%s -> %s', (file, kind) => {
    expect(fileOpenKind(file)).toBe(kind);
  });
});

function fakeWindow(id: number) {
  const sent: Array<[string, unknown]> = [];
  return {
    sent,
    win: { isDestroyed: () => false, webContents: { id, send: (ch: string, v: unknown) => sent.push([ch, v]) } },
  };
}

function fakeIpc() {
  const handlers = new Map<string, (event: { sender: { id: number } }) => unknown>();
  return {
    handlers,
    ipc: { handle: (ch: string, fn: (event: { sender: { id: number } }) => unknown) => void handlers.set(ch, fn) },
  };
}

describe('createFileOpenRouter', () => {
  it('queues until the renderer drains, then pushes; and shows the window each time', () => {
    const { sent, win } = fakeWindow(7);
    const { handlers, ipc } = fakeIpc();
    const showMainWindow = vi.fn();
    const router = createFileOpenRouter(
      { getMainWindow: () => win as never, showMainWindow },
      ipc as never,
    );

    router.open(['C:\\a.epub']);
    expect(showMainWindow).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([]); // nobody listening yet
    expect(router.pending()).toEqual(['C:\\a.epub']);

    expect(handlers.get('fileOpen:drain')!({ sender: { id: 7 } })).toEqual(['C:\\a.epub']);
    expect(router.pending()).toEqual([]);

    router.open(['C:\\b.mkv']);
    expect(sent).toEqual([['fileOpen:paths', ['C:\\b.mkv']]]);
    expect(showMainWindow).toHaveBeenCalledTimes(2);
  });

  it('holds paths for a recreated window until that renderer drains', () => {
    let current = fakeWindow(1);
    const { handlers, ipc } = fakeIpc();
    const router = createFileOpenRouter(
      { getMainWindow: () => current.win as never, showMainWindow: () => undefined },
      ipc as never,
    );
    handlers.get('fileOpen:drain')!({ sender: { id: 1 } });
    current = fakeWindow(2); // chrome-mode switch recreated the window
    router.open(['C:\\c.apkg']);
    expect(current.sent).toEqual([]);
    expect(handlers.get('fileOpen:drain')!({ sender: { id: 2 } })).toEqual(['C:\\c.apkg']);
  });

  it('only the Study OS window may drain the queue', () => {
    const { win } = fakeWindow(7);
    const { handlers, ipc } = fakeIpc();
    const router = createFileOpenRouter({ getMainWindow: () => win as never, showMainWindow: () => undefined }, ipc as never);
    router.open(['C:\\a.epub']);
    expect(handlers.get('fileOpen:drain')!({ sender: { id: 99 } })).toEqual([]); // Blanc / another renderer
    expect(router.pending()).toEqual(['C:\\a.epub']);
    expect(handlers.get('fileOpen:drain')!({ sender: { id: 7 } })).toEqual(['C:\\a.epub']);
  });

  it('keeps paths queued while locked and delivers them on release', () => {
    const { sent, win } = fakeWindow(7);
    const { handlers, ipc } = fakeIpc();
    let locked = true;
    const showMainWindow = vi.fn();
    const router = createFileOpenRouter(
      { getMainWindow: () => win as never, showMainWindow, isLocked: () => locked },
      ipc as never,
    );
    router.open(['C:\\a.epub']);
    expect(showMainWindow).toHaveBeenCalledTimes(1); // shows the lock UI
    expect(handlers.get('fileOpen:drain')!({ sender: { id: 7 } })).toEqual([]);
    router.open(['C:\\b.mkv']);
    expect(sent).toEqual([]);
    router.release(); // still locked: nothing
    expect(sent).toEqual([]);
    locked = false;
    router.release();
    expect(sent).toEqual([['fileOpen:paths', ['C:\\a.epub', 'C:\\b.mkv']]]);
    expect(router.pending()).toEqual([]);
  });

  it('ignores an empty open', () => {
    const showMainWindow = vi.fn();
    const router = createFileOpenRouter({ getMainWindow: () => null, showMainWindow }, fakeIpc().ipc as never);
    router.open([]);
    expect(showMainWindow).not.toHaveBeenCalled();
  });
});
