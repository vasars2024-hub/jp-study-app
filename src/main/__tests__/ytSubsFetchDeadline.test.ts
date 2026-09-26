// @vitest-environment node
/**
 * Resilience audit #1: a captions-only yt-dlp run that stalls used to keep
 * `yt:fetchSubsOnly` — and the "measuring" state in the discovery panel —
 * pending forever: the promise settled only on the child's own error/close.
 *
 * `spawn` is stubbed with a child that never exits, so the only thing that can
 * settle the fetch is the deadline (or a cancel), which must kill the tree.
 */
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ root: '', killed: 0, spawned: 0 }));

vi.mock('electron', () => ({
  app: { getPath: () => h.root },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: () => {
      h.spawned += 1;
      const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; pid?: number; kill: () => boolean };
      child.stderr = new EventEmitter();
      child.kill = () => {
        h.killed += 1;
        return true;
      };
      return child;
    },
  };
});

vi.mock('../media', () => ({
  downloadYoutubeUrl: async () => ({ ok: false as const, error: 'stub' }),
  findYtDlp: async () => 'yt-dlp',
  removePartialDownloads: () => undefined,
  ytDlpJson: async () => ({ ok: false as const, error: 'stub' }),
  ytDlpSubtitleLangs: (lang: string) => [lang],
  withYtDlpJsRuntime: async (args: string[]) => args,
}));

h.root = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-subs-deadline-'));
const { fetchSubsOnly, cancelYtSubsFetches } = await import('../ytPlaylists');

beforeEach(() => {
  h.killed = 0;
  h.spawned = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a caption fetch that never finishes', () => {
  it('settles as a timeout at the deadline and kills the process', async () => {
    vi.useFakeTimers();
    const pending = fetchSubsOnly('abc123', 'https://www.youtube.com/watch?v=abc123', ['ja'], { timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(pending).resolves.toMatchObject({ ok: false, code: 'timeout' });
    expect(h.spawned).toBe(1);
    expect(h.killed).toBe(1);
  });

  it('settles at once when cancelled, and kills the process', async () => {
    const controller = new AbortController();
    const pending = fetchSubsOnly('abc123', 'https://www.youtube.com/watch?v=abc123', ['ja'], { signal: controller.signal });
    await vi.waitFor(() => expect(h.spawned).toBe(1));
    controller.abort();
    await expect(pending).resolves.toMatchObject({ ok: false, code: 'cancelled' });
    expect(h.killed).toBe(1);
  });

  it('exposes a cancel-all for the IPC', () => {
    expect(() => cancelYtSubsFetches()).not.toThrow();
  });
});
