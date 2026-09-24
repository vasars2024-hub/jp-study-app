// @vitest-environment node
/**
 * Crash handling (audit robust #5): a crashed renderer is reloaded with
 * backoff instead of staying dead, repeated crashes ask the user (safe mode),
 * a fatal main error shows a dialog with "Copy details", and the diagnostic
 * log is readable.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  box: [] as number[],
  shown: 0,
  clipboard: '',
  relaunched: 0,
  exited: [] as number[],
}));

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.1',
    getPath: () => os.tmpdir(),
    isReady: () => true,
    relaunch: () => {
      h.relaunched += 1;
    },
    exit: (code: number) => {
      h.exited.push(code);
    },
    isPackaged: false,
    getAppMetrics: () => [],
  },
  BrowserWindow: {},
  clipboard: {
    writeText: (t: string) => {
      h.clipboard = t;
    },
  },
  dialog: {
    showMessageBoxSync: () => {
      h.shown += 1;
      return h.box.shift() ?? 2;
    },
    showErrorBox: () => undefined,
  },
  ipcMain: { handle: () => undefined },
  shell: { openPath: () => Promise.resolve('') },
}));
vi.mock('../errorLog', () => ({
  logDiagnostic: () => undefined,
  errorDetail: (e: unknown) => (e instanceof Error ? e.stack ?? e.message : String(e)),
  redactSecrets: (s: string) => s,
}));
vi.mock('../i18n', () => ({ mt: (k: string) => k }));

const { CRASH_RELOAD_BACKOFF_MS, decideCrashAction, handleFatalMainError, readRecentDiagnostics, watchRendererCrashes } = await import('../crashRecovery');

beforeEach(() => {
  h.box = [];
  h.shown = 0;
  h.clipboard = '';
  h.relaunched = 0;
  h.exited = [];
});

describe('renderer crash policy', () => {
  it('reloads with growing backoff, then asks', () => {
    const now = 1_000_000;
    expect(decideCrashAction('oom', [], now)).toEqual({ kind: 'reload', delayMs: CRASH_RELOAD_BACKOFF_MS[0] });
    expect(decideCrashAction('crashed', [now - 1000], now)).toEqual({ kind: 'reload', delayMs: CRASH_RELOAD_BACKOFF_MS[1] });
    expect(decideCrashAction('oom', [now - 3000, now - 2000, now - 1000], now)).toEqual({ kind: 'ask' });
    // Old crashes age out of the window.
    expect(decideCrashAction('oom', [now - 11 * 60 * 1000, now - 10 * 60 * 1000 - 1], now).kind).toBe('reload');
    expect(decideCrashAction('clean-exit', [], now)).toEqual({ kind: 'ignore' });
  });

  it('a crashed window is actually reloaded (it used to stay dead)', () => {
    vi.useFakeTimers();
    const wc = Object.assign(new EventEmitter(), { id: 7, reload: vi.fn() });
    const win = { webContents: wc, isDestroyed: () => false, close: vi.fn() };
    watchRendererCrashes(win as never);
    wc.emit('render-process-gone', {}, { reason: 'oom', exitCode: -1 });
    vi.advanceTimersByTime(CRASH_RELOAD_BACKOFF_MS[0]);
    expect(wc.reload).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('fatal main-process error', () => {
  it('offers Copy details, then restart', () => {
    h.box = [1, 0]; // Copy details, then Restart
    const flush = vi.fn();
    handleFatalMainError(new Error('boom'), flush);
    expect(flush).toHaveBeenCalled();
    expect(h.clipboard).toContain('boom');
    expect(h.clipboard).toContain('1.0.1');
    expect(h.shown).toBe(2);
    expect(h.relaunched).toBe(1);
    expect(h.exited).toEqual([1]);
  });
});

describe('diagnostic log reader', () => {
  it('returns recent warnings and errors, newest first, tolerating a torn line', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-'));
    const file = path.join(dir, 'main.log');
    const line = (ts: string, severity: string, op: string) =>
      JSON.stringify({ ts, severity, subsystem: 's', operation: op, detail: 'd' });
    fs.writeFileSync(file, ['{"ts":"torn', line('2026-01-01', 'error', 'a'), line('2026-01-02', 'info', 'b'), line('2026-01-03', 'warn', 'c'), ''].join('\n'));
    expect(readRecentDiagnostics(file).map((e) => e.operation)).toEqual(['c', 'a']);
    expect(readRecentDiagnostics(file, 50, 'info').map((e) => e.operation)).toEqual(['c', 'b', 'a']);
    expect(readRecentDiagnostics(path.join(dir, 'missing.log'))).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
