/**
 * One shared 1 Hz clock for the WIRED shell's per-window readouts.
 *
 * Every Wired window prints its own uptime (`T+mm:ss`) in the status strip.
 * A timer per window would mean N intervals and — worse — N re-renders of the
 * whole `FloatingWindow` subtree each second. Instead a single interval runs
 * while at least one subscriber exists, and only the tiny readout components
 * that call `useWiredSecond()` re-render. The interval is torn down the moment
 * the last readout unmounts (leaving Wired, closing every window).
 */
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let timer: number | null = null;
let nowSec = Math.floor(Date.now() / 1000);

function tick(): void {
  nowSec = Math.floor(Date.now() / 1000);
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (timer === null && typeof window !== 'undefined') {
    nowSec = Math.floor(Date.now() / 1000);
    timer = window.setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

function snapshot(): number {
  return nowSec;
}

/** Current wall-clock second, shared by every subscriber. */
export function useWiredSecond(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * When each window was first seen this session. Module state rather than a
 * field on `Win`, because uptime is fiction for the status strip — it must not
 * be persisted into the layout store or survive a restart.
 */
const mountedAt = new Map<string, number>();

export function windowMountedAt(id: string): number {
  let at = mountedAt.get(id);
  if (at === undefined) {
    at = Math.floor(Date.now() / 1000);
    mountedAt.set(id, at);
  }
  return at;
}

export function forgetWindowMount(id: string): void {
  mountedAt.delete(id);
}

/** `T+mm:ss`, rolling to `T+h:mm:ss` past the hour. */
export function formatUptime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `T+${h}:${mm}:${ss}` : `T+${mm}:${ss}`;
}
