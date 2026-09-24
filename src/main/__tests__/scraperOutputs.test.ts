// @vitest-environment node
// Exports, downloads and the plugin registry — the three surfaces that were
// pure fixtures, checked against real files and a real qBittorrent stand-in.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { QbitTransferRow } from '../../shared/scraperResults';

let tempRoot = '';
let saveResult: { canceled: boolean; filePath?: string } = { canceled: true };
let revealed: string[] = [];
let dialogPaths: string[] = [];

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'downloads' ? path.join(tempRoot, 'downloads') : tempRoot),
    getAppMetrics: () => [],
  },
  ipcMain: { handle: () => undefined },
  dialog: {
    showSaveDialog: async (options: { defaultPath?: string }) => {
      dialogPaths.push(options.defaultPath ?? '');
      return saveResult;
    },
  },
  shell: { showItemInFolder: (p: string) => revealed.push(p) },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (v: string) => Buffer.from(`enc:${v}`),
    decryptString: (b: Buffer) => b.toString().slice(4),
  },
}));

// The downloads list is a projection of qBittorrent's transfers; the client
// itself has its own suite, so it is stubbed to one known shape here.
const qbit = vi.hoisted(() => ({
  transfers: [] as QbitTransferRow[],
  calls: 0,
  free: null as number | null,
  savePath: '',
}));
vi.mock('../scraper/qbittorrent', () => ({
  qbitTransfers: async () => {
    qbit.calls += 1;
    return qbit.transfers;
  },
  qbitFreeSpace: async () => (qbit.free === null
    ? { ok: false, reason: 'down', status: 'unreachable' }
    : { ok: true, value: qbit.free }),
  qbitDefaultSavePath: async () => ({ ok: true, value: qbit.savePath }),
}));

const { listExports, safeFileName, writeExport } = await import('../scraper/exports');
const { downloadsFreeSpace, listDownloads, toDownloadRow, toDownloadState } = await import('../scraper/downloads');
const { listPlugins, pluginsRoot, readManifest } = await import('../scraper/plugins');
const { setScraperStoreRoot } = await import('../scraper/store');

beforeAll(async () => {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'scraper-outputs-'));
  setScraperStoreRoot(path.join(tempRoot, 'scraper'));
  await fsp.mkdir(path.join(tempRoot, 'downloads'), { recursive: true });
});

afterAll(async () => {
  setScraperStoreRoot(null);
  await fsp.rm(tempRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await fsp.rm(path.join(tempRoot, 'scraper'), { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  saveResult = { canceled: true };
  revealed = [];
  qbit.transfers = [];
  qbit.calls = 0;
  qbit.free = null;
  qbit.savePath = '';
  dialogPaths = [];
});

// ---- exports ------------------------------------------------------------

function exportRequest(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'job-a',
    format: 'csv',
    columns: [],
    destination: '',
    content: 'number,title\n1,The Journey’s End\n',
    defaultName: 'frieren-2026-07-27.csv',
    recordCount: 1,
    ...overrides,
  };
}

describe('safeFileName', () => {
  it('reduces anything path-like to a bare file name', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Windows\\system32\\x.csv')).toBe('x.csv');
    expect(safeFileName('a b/c*d?.json')).toBe('c-d-.json');
    expect(safeFileName('///')).toBe('anime-export');
  });
});

describe('writeExport', () => {
  it('writes the bytes to the chosen path and records it', async () => {
    const target = path.join(tempRoot, 'out.csv');
    saveResult = { canceled: false, filePath: target };

    const record = await writeExport(exportRequest());
    expect(record?.outcome).toBe('ok');
    expect(record?.destination).toBe(target);
    expect(record?.records).toBe(1);
    await expect(fsp.readFile(target, 'utf-8')).resolves.toContain('The Journey’s End');

    const listed = await listExports();
    expect(listed).toHaveLength(1);
    expect(listed[0].format).toBe('CSV');
    expect(listed[0].ageMinutes).toBe(0);
  });

  it('records nothing when the user cancels', async () => {
    saveResult = { canceled: true };
    await expect(writeExport(exportRequest())).resolves.toBeNull();
    await expect(listExports()).resolves.toEqual([]);
  });

  it('records a failed write rather than swallowing it', async () => {
    // A directory cannot be overwritten by a file.
    const target = path.join(tempRoot, 'a-directory');
    await fsp.mkdir(target, { recursive: true });
    saveResult = { canceled: false, filePath: target };

    const record = await writeExport(exportRequest());
    expect(record?.outcome).toBe('failed');
    expect(record?.note).toBeTruthy();
    expect((await listExports())[0].outcome).toBe('failed');
  });

  it('reveals the file only when asked', async () => {
    saveResult = { canceled: false, filePath: path.join(tempRoot, 'reveal.csv') };
    await writeExport(exportRequest());
    expect(revealed).toEqual([]);
    await writeExport(exportRequest({ openAfter: true }));
    expect(revealed).toHaveLength(1);
  });

  it('opens the dialog in the configured destination folder', async () => {
    const folder = path.join(tempRoot, 'exports-here');
    await fsp.mkdir(folder, { recursive: true });
    saveResult = { canceled: true };
    await writeExport(exportRequest({ destination: folder }));
    expect(dialogPaths[0]).toBe(path.join(folder, 'frieren-2026-07-27.csv'));
  });

  it('falls back to Downloads when the destination is not a folder', async () => {
    saveResult = { canceled: true };
    await writeExport(exportRequest({ destination: path.join(tempRoot, 'no-such-folder') }));
    await writeExport(exportRequest({ destination: 'relative/path' }));
    await writeExport(exportRequest({ destination: '' }));
    const downloads = path.join(tempRoot, 'downloads', 'frieren-2026-07-27.csv');
    expect(dialogPaths).toEqual([downloads, downloads, downloads]);
  });

  it('keeps the newest records first and bounds the history', async () => {
    for (let i = 0; i < 55; i += 1) {
      saveResult = { canceled: false, filePath: path.join(tempRoot, `n${i}.csv`) };
      await writeExport(exportRequest({ recordCount: i }));
    }
    const listed = await listExports();
    expect(listed).toHaveLength(50);
    expect(listed[0].records).toBe(54);
  });
});

// ---- downloads ----------------------------------------------------------

function transfer(overrides: Partial<QbitTransferRow> = {}): QbitTransferRow {
  return {
    hash: 'aa11',
    name: '[SubsPlease] Frieren - 01',
    state: 'downloading',
    progress: 0.4,
    downloadSpeedBps: 4_000_000,
    uploadSpeedBps: 0,
    etaSec: 300,
    ratio: 0,
    category: 'anime',
    tags: ['seasonal'],
    savePath: 'D:\\Anime',
    sizeBytes: 1_000_000_000,
    downloadedBytes: 400_000_000,
    uploadedBytes: 0,
    addedOn: '2026-07-27T00:00:00.000Z',
    completedOn: null,
    peersConnected: 2,
    peersTotal: 20,
    seedsConnected: 5,
    seedsTotal: 100,
    availability: 2,
    pieceStates: [],
    episodeId: null,
    ...overrides,
  };
}

describe('free space', () => {
  const config = { enabled: true } as never;

  it('is qBittorrent\u2019s own figure when the client answers', async () => {
    qbit.free = 123_456_789;
    qbit.savePath = 'Z:\\remote';
    await expect(downloadsFreeSpace({ config })).resolves.toEqual({
      bytes: 123_456_789,
      source: 'qbittorrent',
      path: 'Z:\\remote',
    });
  });

  it('measures the save path locally when the client cannot say', async () => {
    qbit.savePath = tempRoot;
    const report = await downloadsFreeSpace({ config });
    expect(report.source).toBe('disk');
    expect(report.bytes).toBeGreaterThan(0);
  });

  it('is null — never a made-up number — when nothing can be measured', async () => {
    qbit.savePath = path.join(tempRoot, 'missing', 'folder');
    await expect(downloadsFreeSpace({ config })).resolves.toMatchObject({ bytes: null, source: 'none' });
  });

  it('measures Downloads when qBittorrent is off', async () => {
    const report = await downloadsFreeSpace({ config: { enabled: false } as never });
    expect(report.source).toBe('disk');
    expect(report.path).toBe(path.join(tempRoot, 'downloads'));
  });
});

describe('the downloads list', () => {
  it('maps transfer states onto download states', () => {
    expect(toDownloadState('downloading')).toBe('downloading');
    expect(toDownloadState('checking')).toBe('downloading');
    expect(toDownloadState('paused')).toBe('paused');
    expect(toDownloadState('error')).toBe('failed');
    expect(toDownloadState('stalled')).toBe('queued');
    expect(toDownloadState('seeding')).toBe('done');
  });

  it('projects a transfer onto a download row', () => {
    const row = toDownloadRow(transfer());
    expect(row.id).toBe('aa11');
    expect(row.title).toContain('Frieren');
    expect(row.subtitle).toBe('anime · seasonal');
    expect(row.receivedBytes).toBe(400_000_000);
    expect(row.totalBytes).toBe(1_000_000_000);
    expect(row.speedBps).toBe(4_000_000);
    expect(row.destination).toBe('D:\\Anime');
    expect(row.error).toBe('');
  });

  it('calls a finished transfer done, with no ETA left', () => {
    const row = toDownloadRow(transfer({ progress: 1, state: 'seeding', etaSec: 4 }));
    expect(row.state).toBe('done');
    expect(row.etaSec).toBeNull();
  });

  it('surfaces an errored transfer with a reason', () => {
    expect(toDownloadRow(transfer({ state: 'error' })).error).toBeTruthy();
  });

  it('does not call qBittorrent at all when it is switched off', async () => {
    const rows = await listDownloads({
      config: { enabled: false } as never,
    });
    expect(rows).toEqual([]);
    expect(qbit.calls).toBe(0);
  });

  it('lists the client transfers when it is on', async () => {
    qbit.transfers = [transfer(), transfer({ hash: 'bb22', progress: 1, state: 'seeding' })];
    const rows = await listDownloads({ config: { enabled: true } as never });
    expect(rows.map((r) => r.state)).toEqual(['downloading', 'done']);
  });
});

// ---- plugins ------------------------------------------------------------

async function writePlugin(folder: string, manifest: unknown | string): Promise<void> {
  const dir = path.join(pluginsRoot(), folder);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(
    path.join(dir, 'manifest.json'),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
    'utf-8',
  );
}

describe('the plugin registry', () => {
  it('returns nothing when no plugins directory exists', async () => {
    await expect(listPlugins()).resolves.toEqual([]);
  });

  it('reads a valid manifest', async () => {
    await writePlugin('subs-helper', {
      id: 'subs-helper',
      name: 'Subtitle Helper',
      version: '1.2.0',
      publisher: 'Someone',
      description: 'Finds subtitles.',
      apiVersion: 1,
      permissions: ['http', 'subtitles'],
    });
    const [plugin] = await listPlugins(['subs-helper']);
    expect(plugin.name).toBe('Subtitle Helper');
    expect(plugin.version).toBe('1.2.0');
    expect(plugin.compatible).toBe(true);
    expect(plugin.enabled).toBe(true);
    expect(plugin.permissions).toEqual(['http', 'subtitles']);
  });

  it('takes enabled state from the profile, not from the manifest', async () => {
    await writePlugin('claims-enabled', {
      id: 'claims-enabled',
      name: 'Pushy',
      apiVersion: 1,
      enabled: true,
    });
    expect((await listPlugins([]))[0].enabled).toBe(false);
    expect((await listPlugins(['claims-enabled']))[0].enabled).toBe(true);
  });

  it('marks a manifest that needs a newer API as incompatible, and says so', () => {
    const plugin = readManifest('future', { id: 'future', name: 'Future', apiVersion: 7 }, []);
    expect(plugin.compatible).toBe(false);
    expect(plugin.description).toMatch(/plugin API v7/);
  });

  it('marks an unknown permission as incompatible', () => {
    const plugin = readManifest(
      'nosy',
      { id: 'nosy', apiVersion: 1, permissions: ['http', 'filesystem'] },
      [],
    );
    expect(plugin.compatible).toBe(false);
    expect(plugin.description).toMatch(/filesystem/);
  });

  it('lists a broken manifest rather than hiding the plugin', async () => {
    await writePlugin('broken', '{ not json');
    const [plugin] = await listPlugins();
    expect(plugin.id).toBe('broken');
    expect(plugin.compatible).toBe(false);
    expect(plugin.description).toMatch(/could not be read/i);
  });

  it('sorts by name', async () => {
    await writePlugin('z', { id: 'z', name: 'Zebra', apiVersion: 1 });
    await writePlugin('a', { id: 'a', name: 'Alpha', apiVersion: 1 });
    expect((await listPlugins()).map((p) => p.name)).toEqual(['Alpha', 'Zebra']);
  });
});
