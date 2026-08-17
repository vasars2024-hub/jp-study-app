// The door to the `csv` source: `anki:readCsvDraft` resolving a path before the
// reader sees one.
//
// `csvDraftRead.ts` deliberately imports no Electron — that is what keeps its
// encoding and size-ceiling paths testable against a real temp file — so the
// open dialog lives in the IPC registration instead, and this file is where
// that seam is pinned. The reader itself is covered by `csvDraftRead.test.ts`;
// here it is mocked, because what is under test is which path reaches it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showOpenDialog = vi.fn();
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialog(...args), showSaveDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
}));

const readCsvDraft = vi.fn();
vi.mock('../anki/csvDraftRead', () => ({
  readCsvDraft: (request?: unknown) => readCsvDraft(request),
  // `csvExport.ts` imports the decoder from this module.
  decodeTextBuffer: (bytes: Buffer) => ({ text: bytes.toString('utf8'), encoding: 'utf-8' }),
}));

vi.mock('../i18n', () => ({ mt: (key: string) => key }));

import { registerApkgIpc } from '../anki/apkgImport';

function invoke(channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`no handler for ${channel}; saw ${[...handlers.keys()].join(', ')}`);
  return fn({}, ...args);
}

beforeEach(() => {
  handlers.clear();
  showOpenDialog.mockReset();
  readCsvDraft.mockReset();
  readCsvDraft.mockResolvedValue({ ok: true, draft: { source: { kind: 'csv' } } });
  registerApkgIpc();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('anki:readCsvDraft', () => {
  it('opens the text dialog when the caller names no file, and filters to text extensions', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:\\decks\\love.txt'] });

    const res = (await invoke('anki:readCsvDraft', { noteLimit: 500 })) as { ok: boolean };

    expect(res.ok).toBe(true);
    expect(showOpenDialog).toHaveBeenCalledTimes(1);
    const opts = showOpenDialog.mock.calls[0]![0] as {
      filters: { extensions: string[] }[];
      title: string;
    };
    // Pointing this at .apkg would hand the CSV parser a zip; pointing the
    // package reader at .txt fails as a corrupt zip. The filters are the thing
    // that keeps the two apart at the door.
    expect(opts.filters[0]!.extensions).toEqual(['txt', 'csv', 'tsv']);
    expect(opts.title).toBe('dialog.importAnkiText.title');
    // The reader receives the resolved path plus the caller's own paging.
    expect(readCsvDraft).toHaveBeenCalledWith({ noteLimit: 500, filePath: 'C:\\decks\\love.txt' });
  });

  it('reports a dismissed dialog as cancelled rather than as a read that failed', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    const res = (await invoke('anki:readCsvDraft')) as { ok: boolean; error: string };

    expect(res).toEqual({ ok: false, error: 'cancelled' });
    // Negative control on the line above: the reader must not run at all, or a
    // cancel would still cost a file read and could surface a different error.
    expect(readCsvDraft).not.toHaveBeenCalled();
  });

  it('skips the dialog entirely when the caller supplies a path', async () => {
    const res = (await invoke('anki:readCsvDraft', {
      filePath: 'C:\\decks\\already-known.tsv',
      noteOffset: 2000,
    })) as { ok: boolean };

    expect(res.ok).toBe(true);
    // This is the property the whole flow is drivable without an OS dialog by.
    expect(showOpenDialog).not.toHaveBeenCalled();
    expect(readCsvDraft).toHaveBeenCalledWith({
      filePath: 'C:\\decks\\already-known.tsv',
      noteOffset: 2000,
    });
  });
});
