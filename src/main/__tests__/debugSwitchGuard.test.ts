// @vitest-environment node
/**
 * A packaged Gum strips `--remote-debugging-*` before Chromium opens DevTools to
 * another process (main/debugSwitchGuard.ts); unpackaged runs (npm start, the e2e
 * harness) keep them. `app.commandLine` is a stub here.
 */
import { describe, expect, it } from 'vitest';
import { guardDebugSwitches, REMOTE_DEBUG_SWITCHES, type CommandLineLike } from '../debugSwitchGuard';

function commandLine(initial: string[], opts: { sticky?: string[] } = {}) {
  const switches = new Set(initial);
  const removed: string[] = [];
  const cl: CommandLineLike = {
    hasSwitch: (name) => switches.has(name),
    removeSwitch: (name) => {
      removed.push(name);
      if (!opts.sticky?.includes(name)) switches.delete(name);
    },
  };
  return { cl, switches, removed };
}

describe('debug switch guard', () => {
  it('strips the remote-debugging port and pipe in a packaged build', () => {
    const { cl, switches } = commandLine(['remote-debugging-port', 'remote-debugging-pipe', 'mute-audio']);
    const logs: string[] = [];
    const r = guardDebugSwitches({ isPackaged: true, commandLine: cl, log: (m) => logs.push(m) });
    expect(r).toEqual({ action: 'stripped', switches: ['remote-debugging-port', 'remote-debugging-pipe'] });
    expect([...switches]).toEqual(['mute-audio']);
    expect(logs.join('\n')).toMatch(/remote-debugging-port/);
  });

  it('catches a switch that is only in argv', () => {
    const { cl, removed } = commandLine([]);
    const r = guardDebugSwitches({ isPackaged: true, commandLine: cl, argv: ['Gum.exe', '--remote-debugging-port=9222'] });
    expect(r.action).toBe('stripped');
    expect(removed).toEqual(['remote-debugging-port']);
  });

  it('refuses to start when a switch will not come off', () => {
    const { cl } = commandLine(['remote-debugging-port'], { sticky: ['remote-debugging-port'] });
    expect(guardDebugSwitches({ isPackaged: true, commandLine: cl })).toEqual({ action: 'refuse', switches: ['remote-debugging-port'] });
    const throwing: CommandLineLike = {
      hasSwitch: (name) => name === 'remote-debugging-pipe',
      removeSwitch: () => {
        throw new Error('no');
      },
    };
    expect(guardDebugSwitches({ isPackaged: true, commandLine: throwing }).action).toBe('refuse');
  });

  it('leaves a clean packaged command line alone', () => {
    const { cl, removed } = commandLine(['e2e', 'mute-audio']);
    expect(guardDebugSwitches({ isPackaged: true, commandLine: cl, argv: ['Gum.exe', '--e2e'] })).toEqual({ action: 'clean' });
    expect(removed).toEqual([]);
  });

  it('unpackaged runs (npm start, the e2e harness) keep every switch', () => {
    const { cl, switches, removed } = commandLine([...REMOTE_DEBUG_SWITCHES]);
    expect(guardDebugSwitches({ isPackaged: false, commandLine: cl, argv: ['electron', '.', '--e2e'] })).toEqual({ action: 'allowed' });
    expect(removed).toEqual([]);
    expect(switches.size).toBe(REMOTE_DEBUG_SWITCHES.length);
  });
});
