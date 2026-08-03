// @vitest-environment jsdom
/**
 * What the host does when the sidecar dies underneath it.
 *
 * The supervisor's half of this is covered by `seanimeKeepalive.test.ts` and proven against
 * the real binary. The renderer's half — the chain that turns a crash into a working player
 * again — was only ever *believed* to work, and `NEXT_SESSION.md` said so: the remount logic
 * at `MediaWorkspaceHost.tsx:64` "is believed to cover it but nothing has yet killed a
 * sidecar mid-session and watched the renderer re-provision".
 *
 * A run of `docs/migration/tools/sidecar-restart-electron-harness.mjs` has now watched it, in
 * a real Electron app against the real `seanime.exe`. This file is the regression guard for
 * what that run proved, because all three links below are invisible in normal use — each one
 * fails as "the player just doesn't work after a crash", with nothing in the console:
 *
 *   1. **An unexpected exit must trigger a restart.** The host's `[open, status]` effect
 *      calls `seanimeStart()` for any kind that is not ready/starting/disabled. Nobody
 *      clicks anything; if this stops firing, a crash becomes permanent for the session.
 *   2. **`starting` must NOT trigger one.** It is excluded on purpose — the supervisor is
 *      already mid-spawn, and a second `startSeanime()` racing the first is how you get two
 *      servers against one durable datadir's SQLite database.
 *   3. **A new generation must re-provision and REMOUNT.** A restart mints a new ephemeral
 *      port *and* a new password hash, so the connection must be re-bootstrapped and
 *      `MediaWorkspace` must be rebuilt rather than re-rendered — its adopted client reads
 *      the token through `atomWithStorage(..., { getOnInit: true })`, which snapshotted
 *      localStorage at module-eval time and will never see a later write on its own.
 *
 * Mocking follows `mediaWorkspaceHostReview.test.ts`: without the bootstrap mock `conn.baseUrl`
 * is empty and the library pane legitimately never renders; without the workspace mock the
 * test drags in the whole adopted vendor bundle. The workspace stub numbers its own instances
 * from a `useState` initializer, which runs once per MOUNT — so a changed number is a remount,
 * not merely a re-render with new props.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeanimeStatus } from '../../shared/seanime';

const mocks = vi.hoisted(() => ({
  /** Incremented per MediaWorkspace mount, so a remount is observable. */
  instances: { value: 0 },
  /** Each bootstrap hands back a distinct token, the way a real restart does. */
  bootstraps: { value: 0 },
}));

vi.mock('../../media/seanimeBootstrap', () => ({
  bootstrapSeanimeConnection: async () => {
    mocks.bootstraps.value += 1;
    return {
      baseUrl: `http://127.0.0.1:900${mocks.bootstraps.value}`,
      token: `token-${mocks.bootstraps.value}`,
    };
  },
}));

vi.mock('../../media/MediaWorkspace', async () => {
  const react = await import('react');
  return {
    default: ({ conn }: { conn: { token: string } }) => {
      const [instance] = react.useState(() => {
        mocks.instances.value += 1;
        return mocks.instances.value;
      });
      return react.createElement('div', {
        'data-stub-workspace': 'true',
        'data-instance': String(instance),
        'data-token': conn.token,
      });
    },
  };
});

let host: HTMLDivElement | null = null;
/** The main process's status stream, driven by hand below. */
let pushStatus: ((s: SeanimeStatus) => void) | null = null;
let startCalls = 0;

function status(patch: Partial<SeanimeStatus>): SeanimeStatus {
  return {
    kind: 'stopped', port: 0, pid: null, dataDir: null, version: null,
    simulatedUser: null, error: null, logTail: [], ...patch,
  } as SeanimeStatus;
}

const GEN_1 = status({ kind: 'ready', port: 51106, pid: 8844 });
/** What a real crash looks like from the renderer: `offline`, carrying the child's code. */
const CRASHED = status({ kind: 'offline', port: 0, pid: null, error: 'sidecar exited with code 1' });
const STARTING = status({ kind: 'starting', port: 65047, pid: null });
const GEN_2 = status({ kind: 'ready', port: 65047, pid: 25816 });

function stubApi(initial: SeanimeStatus): void {
  (globalThis.window as unknown as { api: Record<string, unknown> }).api = {
    seanimeStatus: async () => initial,
    onSeanimeStatus: (cb: (s: SeanimeStatus) => void) => {
      pushStatus = cb;
      return () => { pushStatus = null; };
    },
    seanimeStart: async () => { startCalls += 1; return initial; },
    pickMedia: async () => null,
    ankiStatus: async () => ({ connected: false, decks: [], models: [] }),
    ankiGetIntervals: async () => null,
    ankiGetIntervalsForNotes: async () => null,
  };
}

beforeEach(() => {
  vi.resetModules();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  mocks.instances.value = 0;
  mocks.bootstraps.value = 0;
  startCalls = 0;
  pushStatus = null;
});

afterEach(() => {
  host?.remove();
  host = null;
});

/** Several act cycles: a React.lazy chain does not settle in one microtask. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
}

/** Mounts the host on a ready sidecar and opens it, which is the state a crash interrupts. */
async function openOnReady(): Promise<HTMLDivElement> {
  stubApi(GEN_1);
  const { default: MediaWorkspaceHost } = await import('../../media/MediaWorkspaceHost');
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(createElement(MediaWorkspaceHost, {})); });
  const launcher = host.querySelector<HTMLButtonElement>('.seanime-host-launcher');
  await act(async () => { launcher?.click(); });
  await flush();
  return host;
}

async function emit(next: SeanimeStatus): Promise<void> {
  await act(async () => { pushStatus?.(next); });
  await flush();
}

function workspace(el: HTMLElement): HTMLElement | null {
  return el.querySelector<HTMLElement>('[data-stub-workspace]');
}

describe('MediaWorkspaceHost — recovery from a sidecar crash', () => {
  it('mounts the workspace on the first generation', async () => {
    const el = await openOnReady();
    expect(workspace(el)?.dataset.token).toBe('token-1');
  });

  it('restarts the sidecar unattended when it exits unexpectedly', async () => {
    // Link 1. Nothing is clicked here — this is the whole recovery trigger.
    const el = await openOnReady();
    expect(startCalls).toBe(0);
    await emit(CRASHED);
    expect(startCalls).toBe(1);
    expect(el).toBeTruthy();
  });

  it('does not ask for a second start while one is already starting', async () => {
    // Link 2. Two overlapping startSeanime() calls would race a second server onto one
    // durable datadir's database.
    await openOnReady();
    await emit(CRASHED);
    expect(startCalls).toBe(1);
    await emit(STARTING);
    expect(startCalls).toBe(1);
  });

  it('unmounts the adopted workspace the moment the sidecar leaves ready', async () => {
    // Leaving it mounted would point the adopted client at a dead port and a dead token,
    // which is what produced `Unrecoverable HLS error` at readyState 0 in the live pass.
    const el = await openOnReady();
    expect(workspace(el)).not.toBeNull();
    await emit(CRASHED);
    expect(workspace(el)).toBeNull();
  });

  it('re-provisions the connection and REMOUNTS the workspace on the new generation', async () => {
    // Link 3, and the one the harness run confirmed live: a new pid/port must produce a new
    // bootstrap AND a new component instance. A re-render carrying a new token would leave
    // the adopted module-eval token snapshot in place.
    const el = await openOnReady();
    const first = workspace(el);
    expect(first?.dataset.instance).toBe('1');

    await emit(CRASHED);
    await emit(GEN_2);

    const second = workspace(el);
    expect(second).not.toBeNull();
    expect(second?.dataset.instance).toBe('2');
    expect(second?.dataset.token).toBe('token-2');
  });

  it('does NOT remount on a status update that changes no connection detail', async () => {
    // The control for the test above, and the reason its `instance` assertion means anything.
    // Without this, "instance became 2" could just as well be a component that remounts on
    // every status push — which would make the remount assertion pass for the wrong reason
    // and keep passing after the key was broken.
    const el = await openOnReady();
    expect(workspace(el)?.dataset.instance).toBe('1');
    await emit(status({ kind: 'ready', port: 51106, pid: 8844, error: 'a harmless log line' }));
    expect(workspace(el)?.dataset.instance).toBe('1');
    expect(workspace(el)?.dataset.token).toBe('token-1');
  });

  it('re-keys the workspace when only the port changes', async () => {
    // The pid is the obvious discriminator, but the port is provisioned per start too and a
    // key built from the pid alone would silently miss a same-pid reuse.
    const el = await openOnReady();
    await emit(CRASHED);
    await emit(status({ kind: 'ready', port: 65047, pid: 8844 }));
    expect(workspace(el)?.dataset.instance).toBe('2');
  });
});
