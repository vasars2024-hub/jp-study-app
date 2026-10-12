// @vitest-environment node
/**
 * risk4: the metered-connection probe starts the in-box Windows PowerShell by
 * absolute path (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`),
 * hidden, never a bare `powershell.exe` resolved through PATH.
 */
import { describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFile: execFileMock }));

import { probeConnectionCost, systemPowerShellPath } from '../meteredConnection';

describe('metered probe: which powershell', () => {
  it('builds the path from %SystemRoot%', () => {
    expect(systemPowerShellPath({ SystemRoot: 'D:\\Win' })).toBe('D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    expect(systemPowerShellPath({ SystemRoot: 'C:\\Windows\\' })).toBe(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    );
  });

  it('a missing or relative %SystemRoot% falls back to C:\\Windows, never to PATH', () => {
    for (const env of [{}, { SystemRoot: 'Windows' }, { SystemRoot: '.\\evil' }, { SystemRoot: '\\\\host\\share' }]) {
      expect(systemPowerShellPath(env)).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    }
  });

  it('the default runner execs that absolute path with windowsHide and a timeout', async () => {
    execFileMock.mockImplementation((_file: string, _args: string[], _opts: unknown, cb: (e: unknown, out: string) => void) =>
      cb(null, 'Unrestricted|False|False'),
    );
    expect(await probeConnectionCost(undefined, 'win32', { SystemRoot: 'C:\\Windows' })).toBe('unrestricted');
    const [file, args, opts] = execFileMock.mock.calls[0] as [string, string[], { windowsHide?: boolean; timeout?: number }];
    expect(file).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    expect(args).toEqual(expect.arrayContaining(['-NoProfile', '-NonInteractive']));
    expect(opts.windowsHide).toBe(true);
    expect(opts.timeout).toBeGreaterThan(0);
  });
});
