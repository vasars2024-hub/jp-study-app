/**
 * WIRED layer descent — the store.
 *
 * Gathers the real progress inputs (knowledge levels + study stats), folds them
 * through `layer.ts`, persists the deepest layer reached and announces crossings
 * on `wired:layer-crossed`. Recomputation is event-driven and debounced: it runs
 * when a review, study session or knowledge change is recorded, never on a
 * timer, and only while something is tracking (the Wired mechanics host).
 */
import { useSyncExternalStore } from 'react';
import { knowledgeCounts, onKnowledgeChanged } from '../knownWords';
import { writeLocalStorageJson } from '../localStorageWrite';
import {
  getSummary,
  MEDIA_STUDY_RECORDED_EVENT,
  READING_RECORDED_EVENT,
  REVIEW_RECORDED_EVENT,
  STATS_RESET_EVENT,
  STUDY_RECORDED_EVENT,
  WATCH_RECORDED_EVENT,
} from '../stats';
import {
  computeSignalDepth,
  layerForDepth,
  normalizeLayerRecord,
  reconcileLayer,
  type LayerRecord,
  type SignalInputs,
} from './layer';

export const WIRED_LAYER_KEY = 'jp-wired-layer-v1';
export const WIRED_LAYER_CROSSED_EVENT = 'wired:layer-crossed';

export interface LayerCrossedDetail {
  from: number;
  to: number;
  crossed: number[];
  /** First calibration of this install — announced once, without a descent. */
  calibrated: boolean;
}

export interface WiredLayerState {
  /** Deepest layer reached (what every surface shows). */
  layer: number;
  /** Current computed depth (may be below `record.maxDepth` after a streak loss). */
  depth: number;
  /** Layer the current depth alone would give. */
  computedLayer: number;
  inputs: SignalInputs;
  record: LayerRecord | null;
}

function readRecord(): LayerRecord | null {
  try {
    const raw = localStorage.getItem(WIRED_LAYER_KEY);
    return raw ? normalizeLayerRecord(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeRecord(record: LayerRecord): void {
  try {
    writeLocalStorageJson(WIRED_LAYER_KEY, record);
  } catch {
    /* locked storage: the layer still holds for this session */
  }
}

export function readSignalInputs(): SignalInputs {
  let known = 0;
  let familiar = 0;
  try {
    const counts = knowledgeCounts();
    known = counts[3] ?? 0;
    familiar = counts[2] ?? 0;
  } catch {
    /* knowledge store unavailable */
  }
  let passedReviews = 0;
  let daysActive = 0;
  let streak = 0;
  try {
    const summary = getSummary();
    passedReviews = summary.totalReviewsPassed;
    daysActive = summary.daysActive;
    streak = summary.streak;
  } catch {
    /* stats unavailable */
  }
  return { known, familiar, passedReviews, daysActive, streak };
}

const EMPTY_INPUTS: SignalInputs = { known: 0, familiar: 0, passedReviews: 0, daysActive: 0, streak: 0 };

let state: WiredLayerState = (() => {
  const record = typeof localStorage === 'undefined' ? null : readRecord();
  return { layer: record?.maxLayer ?? 1, depth: record?.maxDepth ?? 0, computedLayer: record?.maxLayer ?? 1, inputs: EMPTY_INPUTS, record };
})();

const listeners = new Set<() => void>();

function publish(next: WiredLayerState): void {
  state = next;
  listeners.forEach((fn) => fn());
}

/**
 * Recompute now. Returns the crossing (if any) and dispatches it. Safe to call
 * any time; it is what the debounced tracker and the terminal's `layer` call.
 */
export function refreshWiredLayer(announce = true): LayerCrossedDetail | null {
  const inputs = readSignalInputs();
  const depth = computeSignalDepth(inputs);
  const stored = readRecord();
  const result = reconcileLayer(stored, depth);
  const changed =
    !stored || stored.maxLayer !== result.record.maxLayer || stored.maxDepth !== result.record.maxDepth;
  if (changed) writeRecord(result.record);
  publish({
    layer: result.record.maxLayer,
    depth,
    computedLayer: layerForDepth(depth),
    inputs,
    record: result.record,
  });
  if (!result.calibrated && result.crossed.length === 0) return null;
  const detail: LayerCrossedDetail = {
    from: result.calibrated ? result.record.maxLayer : stored?.maxLayer ?? 1,
    to: result.record.maxLayer,
    crossed: result.crossed,
    calibrated: result.calibrated,
  };
  if (announce) {
    try {
      window.dispatchEvent(new CustomEvent<LayerCrossedDetail>(WIRED_LAYER_CROSSED_EVENT, { detail }));
    } catch {
      /* non-browser */
    }
  }
  return detail;
}

export function getWiredLayerState(): WiredLayerState {
  return state;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function snapshot(): WiredLayerState {
  return state;
}

/** Live layer state; only re-renders when a recompute publishes. */
export function useWiredLayer(): WiredLayerState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Track progress while the Wired mechanics are mounted. Debounced so a burst of
 * reviews (one grade fires review-log + stats + knowledge events) costs one
 * recompute. Returns the teardown.
 */
export function startWiredLayerTracking(debounceMs = 1500): () => void {
  let timer: number | null = null;
  const schedule = (): void => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      refreshWiredLayer(true);
    }, debounceMs);
  };
  const events = [
    REVIEW_RECORDED_EVENT,
    STUDY_RECORDED_EVENT,
    MEDIA_STUDY_RECORDED_EVENT,
    READING_RECORDED_EVENT,
    WATCH_RECORDED_EVENT,
    STATS_RESET_EVENT,
  ];
  events.forEach((e) => window.addEventListener(e, schedule));
  const offKnowledge = onKnowledgeChanged(schedule);
  // First read happens right away so the badge is real on entry.
  refreshWiredLayer(true);
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    events.forEach((e) => window.removeEventListener(e, schedule));
    offKnowledge();
  };
}

export function onWiredLayerCrossed(cb: (detail: LayerCrossedDetail) => void): () => void {
  const handler = (event: Event): void => cb((event as CustomEvent<LayerCrossedDetail>).detail);
  window.addEventListener(WIRED_LAYER_CROSSED_EVENT, handler);
  return () => window.removeEventListener(WIRED_LAYER_CROSSED_EVENT, handler);
}
