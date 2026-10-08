/**
 * WIRED layer descent — the pure half.
 *
 * The archive is descended, not levelled: real study progress is folded into
 * one "signal depth" number, and that number maps onto LAYER:01 … LAYER:13.
 * Nothing in here reads a store; `layerStore.ts` gathers the inputs and owns
 * persistence, so the formula and the never-regress rule can be tested alone.
 *
 * THE FORMULA (documented in Settings > Special too):
 *
 *   depth = min(known, 2500)                     words at level Known
 *         + min(floor(familiar / 2), 500)        half credit for Familiar
 *         + floor(passedReviews / 4)             every 4 remembered reviews
 *         + 5 * daysActive                       every day anything was studied
 *         + 2 * min(streak, 30)                  the current run, capped
 *
 * Every term is non-decreasing in its input, so more study can never lower the
 * depth. The word terms are capped because one Anki sync can import tens of
 * thousands of Known words in a second; without the cap a long-time Anki user
 * would land on the floor of the archive on first boot and the descent would
 * mean nothing. Past the caps, only reviews and days keep pulling you down.
 *
 * The streak term CAN shrink (a missed day resets it) — which is exactly why the
 * shown layer is the MAXIMUM ever reached (`reconcileLayer`), never the current
 * computation. Losing a streak, wiping the knowledge store or restoring an old
 * deck never takes a layer away.
 */

export const LAYER_COUNT = 13;

/** Minimum depth for LAYER:01 … LAYER:13 (index 0 = LAYER:01). Strictly increasing. */
export const LAYER_THRESHOLDS: readonly number[] = [
  0, 30, 80, 160, 280, 450, 700, 1000, 1400, 2000, 2800, 3800, 5000,
];

export interface SignalInputs {
  /** Words at knowledge level Known (3). */
  known: number;
  /** Words at knowledge level Familiar (2). */
  familiar: number;
  /** Reviews graded anything but Again, across every recorded day. */
  passedReviews: number;
  /** Days with any recorded study activity. */
  daysActive: number;
  /** Current streak in days. */
  streak: number;
}

export const DEPTH_CAPS = { known: 2500, familiarHalf: 500, streak: 30 } as const;

function count(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Signal depth for the given progress. Pure, monotonic in every input. */
export function computeSignalDepth(inputs: SignalInputs): number {
  return (
    Math.min(count(inputs.known), DEPTH_CAPS.known) +
    Math.min(Math.floor(count(inputs.familiar) / 2), DEPTH_CAPS.familiarHalf) +
    Math.floor(count(inputs.passedReviews) / 4) +
    5 * count(inputs.daysActive) +
    2 * Math.min(count(inputs.streak), DEPTH_CAPS.streak)
  );
}

/** 1-based layer for a depth (1 … LAYER_COUNT). */
export function layerForDepth(depth: number): number {
  const d = count(depth);
  let layer = 1;
  for (let i = 0; i < LAYER_THRESHOLDS.length; i++) {
    if (d >= LAYER_THRESHOLDS[i]) layer = i + 1;
  }
  return layer;
}

/** Depth needed for the layer after `layer`, or null on the last one. */
export function nextLayerThreshold(layer: number): number | null {
  const l = clampLayer(layer);
  return l >= LAYER_COUNT ? null : LAYER_THRESHOLDS[l];
}

export function clampLayer(layer: number): number {
  if (!Number.isFinite(layer)) return 1;
  return Math.min(LAYER_COUNT, Math.max(1, Math.floor(layer)));
}

/** `LAYER:07` — a fiction code, content-neutral, never translated. */
export function formatLayer(layer: number): string {
  return `LAYER:${String(clampLayer(layer)).padStart(2, '0')}`;
}

/** 0..1 progress from the current layer's floor toward the next threshold. */
export function layerProgress(depth: number, layer: number): number {
  const l = clampLayer(layer);
  const next = nextLayerThreshold(l);
  if (next === null) return 1;
  const floor = LAYER_THRESHOLDS[l - 1];
  const span = next - floor;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (count(depth) - floor) / span));
}

export interface LayerRecord {
  /** Deepest layer ever reached. Never decreases. */
  maxLayer: number;
  /** Deepest depth ever computed. Never decreases. */
  maxDepth: number;
  /** When the record was first written (first Wired calibration). */
  calibratedAt: number;
}

export interface LayerReconcile {
  record: LayerRecord;
  /** Layers newly reached by this reconcile, ascending (empty when none). */
  crossed: number[];
  /** True when there was no stored record — a first calibration, not a descent. */
  calibrated: boolean;
}

/**
 * Fold a fresh computation into the stored record. The record only ever moves
 * down the archive: a lower computed depth (streak lost, knowledge store wiped)
 * leaves it untouched.
 */
export function reconcileLayer(stored: LayerRecord | null, depth: number, now = Date.now()): LayerReconcile {
  const computedLayer = layerForDepth(depth);
  if (!stored) {
    return {
      record: { maxLayer: computedLayer, maxDepth: count(depth), calibratedAt: now },
      crossed: [],
      calibrated: true,
    };
  }
  const prevLayer = clampLayer(stored.maxLayer);
  const maxLayer = Math.max(prevLayer, computedLayer);
  const maxDepth = Math.max(count(stored.maxDepth), count(depth));
  const crossed: number[] = [];
  for (let l = prevLayer + 1; l <= maxLayer; l++) crossed.push(l);
  return {
    record: { maxLayer, maxDepth, calibratedAt: stored.calibratedAt || now },
    crossed,
    calibrated: false,
  };
}

export function normalizeLayerRecord(raw: unknown): LayerRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<LayerRecord>;
  if (typeof r.maxLayer !== 'number' || !Number.isFinite(r.maxLayer)) return null;
  return {
    maxLayer: clampLayer(r.maxLayer),
    maxDepth: count(r.maxDepth),
    calibratedAt: typeof r.calibratedAt === 'number' && Number.isFinite(r.calibratedAt) ? r.calibratedAt : 0,
  };
}

// ---------------------------------------------------------------------------
// What each layer opens. Every entry is a real, working change — a terminal
// command that runs, a wallpaper depth the CSS draws, a review channel the
// decrypt console offers, a cursor the settings let you pick.
// ---------------------------------------------------------------------------

export type LayerUnlockKind = 'command' | 'wallpaper' | 'channel' | 'cursor';

export interface LayerUnlock {
  layer: number;
  kind: LayerUnlockKind;
  /** Stable id: command name, channel id, wallpaper depth, cursor id. */
  id: string;
  /** Catalog key for the human description. */
  descKey: string;
}

export const LAYER_UNLOCKS: readonly LayerUnlock[] = [
  { layer: 2, kind: 'command', id: 'trace', descKey: 'wiredMech.unlock.trace' },
  { layer: 3, kind: 'wallpaper', id: 'depth-1', descKey: 'wiredMech.unlock.depth1' },
  { layer: 4, kind: 'command', id: 'weak', descKey: 'wiredMech.unlock.weak' },
  { layer: 5, kind: 'channel', id: 'reverse', descKey: 'wiredMech.unlock.reverse' },
  { layer: 6, kind: 'wallpaper', id: 'depth-2', descKey: 'wiredMech.unlock.depth2' },
  { layer: 7, kind: 'command', id: 'echo', descKey: 'wiredMech.unlock.echo' },
  { layer: 8, kind: 'cursor', id: 'reticle', descKey: 'wiredMech.unlock.reticle' },
  { layer: 9, kind: 'wallpaper', id: 'depth-3', descKey: 'wiredMech.unlock.depth3' },
  { layer: 10, kind: 'command', id: 'forecast', descKey: 'wiredMech.unlock.forecast' },
  { layer: 11, kind: 'channel', id: 'cloze', descKey: 'wiredMech.unlock.cloze' },
  { layer: 12, kind: 'wallpaper', id: 'depth-4', descKey: 'wiredMech.unlock.depth4' },
  { layer: 13, kind: 'command', id: 'root', descKey: 'wiredMech.unlock.root' },
];

export function unlocksAt(layer: number): LayerUnlock[] {
  return LAYER_UNLOCKS.filter((u) => u.layer === layer);
}

export function requiredLayer(kind: LayerUnlockKind, id: string): number {
  return LAYER_UNLOCKS.find((u) => u.kind === kind && u.id === id)?.layer ?? 1;
}

export function isUnlocked(layer: number, kind: LayerUnlockKind, id: string): boolean {
  return clampLayer(layer) >= requiredLayer(kind, id);
}

/** Wallpaper depth 0..4 the CSS reads from `data-wired-depth`. */
export function wallpaperDepth(layer: number): number {
  return LAYER_UNLOCKS.filter((u) => u.kind === 'wallpaper' && u.layer <= clampLayer(layer)).length;
}
