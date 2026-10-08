/**
 * Intercept persistence: when the last one fired (the rate limit survives a
 * restart) and a lifetime tally for the terminal's `root` dump. The answers
 * themselves go to the review log as practice rows, where Statistics counts them.
 */
import { useSyncExternalStore } from 'react';
import type { InterceptSource } from './intercept';
import { writeLocalStorageJson } from '../localStorageWrite';

export const WIRED_INTERCEPT_KEY = 'jp-wired-intercept-v1';

export interface InterceptRecord {
  lastAt: number | null;
  total: number;
  passed: number;
}

const EMPTY: InterceptRecord = { lastAt: null, total: 0, passed: 0 };

function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function loadInterceptRecord(): InterceptRecord {
  try {
    const raw = localStorage.getItem(WIRED_INTERCEPT_KEY);
    if (!raw) return { ...EMPTY };
    const r = JSON.parse(raw) as Partial<InterceptRecord>;
    return {
      lastAt: typeof r.lastAt === 'number' && Number.isFinite(r.lastAt) ? r.lastAt : null,
      total: n(r.total),
      passed: n(r.passed),
    };
  } catch {
    return { ...EMPTY };
  }
}

function saveInterceptRecord(record: InterceptRecord): void {
  try {
    writeLocalStorageJson(WIRED_INTERCEPT_KEY, record);
  } catch {
    /* session-only */
  }
}

/** Mark that an intercept was raised (answered or not — both spend the slot). */
export function noteInterceptRaised(at = Date.now()): void {
  saveInterceptRecord({ ...loadInterceptRecord(), lastAt: at });
}

export function noteInterceptAnswered(passed: boolean): void {
  const r = loadInterceptRecord();
  saveInterceptRecord({ ...r, total: r.total + 1, passed: r.passed + (passed ? 1 : 0) });
}

// ---------------------------------------------------------------------------
// The transmission currently on the channel (session state, not persisted).
// ---------------------------------------------------------------------------

export interface ActiveIntercept {
  source: InterceptSource;
  code: string;
  raisedAt: number;
}

let active: ActiveIntercept | null = null;
const listeners = new Set<() => void>();

export function setActiveIntercept(next: ActiveIntercept | null): void {
  active = next;
  listeners.forEach((fn) => fn());
}

export function getActiveIntercept(): ActiveIntercept | null {
  return active;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function snapshot(): ActiveIntercept | null {
  return active;
}

export function useActiveIntercept(): ActiveIntercept | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
