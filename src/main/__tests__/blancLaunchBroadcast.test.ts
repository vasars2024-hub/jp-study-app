// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

/**
 * Closing the Study OS window broadcast "jobs ready = false" from its webContents'
 * own 'destroyed' handler. At that moment `getAllWindows()` still lists the window
 * (`isDestroyed()` is false) while its webContents is gone, and `send` throws
 * "Object has been destroyed" — an uncaught main-process exception that put up
 * the "Gum ran into a problem" dialog on an ordinary close (measured live 2026-10-08).
 */

interface FakeWin {
  isDestroyed: () => boolean;
  webContents: { isDestroyed: () => boolean; send: ReturnType<typeof vi.fn> };
}

const windows: FakeWin[] = [];

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  BrowserWindow: { getAllWindows: () => windows },
  ipcMain: { handle: () => undefined, on: () => undefined },
}));

function fakeWin(opts: { winGone?: boolean; contentsGone?: boolean; throws?: boolean } = {}): FakeWin {
  return {
    isDestroyed: () => opts.winGone === true,
    webContents: {
      isDestroyed: () => opts.contentsGone === true,
      send: vi.fn(() => {
        if (opts.throws || opts.contentsGone) throw new TypeError('Object has been destroyed');
      }),
    },
  };
}

describe('Blanc broadcasts survive a window mid-teardown', () => {
  it('skips a window whose webContents is already destroyed and still reaches the others', async () => {
    const { broadcastStudyOsJobsReady, broadcastStudyOsAlive } = await import('../blancLaunch');
    const closing = fakeWin({ contentsGone: true });
    const blanc = fakeWin();
    windows.splice(0, windows.length, closing, blanc);

    expect(() => broadcastStudyOsJobsReady(false)).not.toThrow();
    expect(() => broadcastStudyOsAlive(false)).not.toThrow();
    expect(closing.webContents.send).not.toHaveBeenCalled();
    expect(blanc.webContents.send).toHaveBeenCalledWith('blanc:study-os-jobs-ready', false);
    expect(blanc.webContents.send).toHaveBeenCalledWith('blanc:study-os-alive', false);
  });

  it('does not let one throwing send stop the broadcast', async () => {
    const { broadcastStudyOsJobsReady } = await import('../blancLaunch');
    const racing = fakeWin({ throws: true });
    const blanc = fakeWin();
    windows.splice(0, windows.length, racing, blanc);

    expect(() => broadcastStudyOsJobsReady(true)).not.toThrow();
    expect(blanc.webContents.send).toHaveBeenCalledWith('blanc:study-os-jobs-ready', true);
  });
});
