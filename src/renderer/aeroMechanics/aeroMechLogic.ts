/**
 * Aero mechanics — the pure half.
 * -----------------------------------------------------------------------------
 * Everything the Aero study mechanics decide (Memory Defragmenter, Vocabulary
 * Update, balloon tips, the study screensaver) is decided here, with no DOM,
 * storage or clock of its own, so each rule is unit-testable.
 *
 * None of this schedules anything. The SRS arithmetic stays in
 * `shared/flashcardScheduling` behind `reviewDeckCard`; these functions only
 * READ card states and the profile's new-card budget and arrange them.
 */
import { isLocalSrsState, limitNewCards, type LocalSrsState } from '../../shared/localSrs';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Interval (days) at which a card counts as mature — Anki's convention. */
export const MATURE_INTERVAL_DAYS = 21;
/** Lapses at which a card is a leech (mirrors `flashcardDeck.LEECH_LAPSE_THRESHOLD`). */
export const LEECH_LAPSES = 8;
/** A due card this many days past its date reads as "overdue", not just due. */
export const OVERDUE_DAYS = 1;

/** The minimum a mechanic needs to know about a card. */
export interface MechCard {
  id: string;
  word: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
  folder?: string;
  srs?: unknown;
  introducedAt?: number;
}

/**
 * One block on the defragmenter's map.
 *
 * - `new`       never reviewed — unallocated space;
 * - `due`       scheduled and due now — a fragment;
 * - `overdue`   due for more than a day — a badly fragmented block;
 * - `learning`  in a sub-day relearning / hard step;
 * - `young`     scheduled, not due, interval under 21 days;
 * - `mature`    scheduled, not due, 21 days or more — contiguous;
 * - `leech`     eight lapses or more — unmovable, whatever its due date.
 */
export type BlockState = 'new' | 'due' | 'overdue' | 'learning' | 'young' | 'mature' | 'leech';

export const BLOCK_STATES: readonly BlockState[] = ['mature', 'young', 'learning', 'new', 'due', 'overdue', 'leech'];

/** Which state a bucket shows when it holds several: the most urgent wins. */
const URGENCY: Record<BlockState, number> = {
  leech: 6,
  overdue: 5,
  due: 4,
  learning: 3,
  new: 2,
  young: 1,
  mature: 0,
};

function srsOf(card: Pick<MechCard, 'srs'>): LocalSrsState | null {
  return isLocalSrsState(card.srs) ? card.srs : null;
}

export function classifyCard(card: Pick<MechCard, 'srs'>, now: number): BlockState {
  const srs = srsOf(card);
  if (!srs) return 'new';
  if (srs.lapses >= LEECH_LAPSES) return 'leech';
  if (srs.dueAt <= now) return now - srs.dueAt >= OVERDUE_DAYS * DAY_MS ? 'overdue' : 'due';
  if (srs.intervalDays < 1) return 'learning';
  return srs.intervalDays >= MATURE_INTERVAL_DAYS ? 'mature' : 'young';
}

export interface DeckAnalysis {
  total: number;
  counts: Record<BlockState, number>;
  /** Scheduled cards (anything with an SRS state). */
  scheduled: number;
  /** Scheduled cards due now, leeches included when they are due. */
  dueReviews: number;
  /** Percentage of scheduled cards that are due: the "fragmentation". */
  fragmentation: number;
  /** Whether a defragment is worth running (any due review at all). */
  recommend: boolean;
}

function emptyCounts(): Record<BlockState, number> {
  return { new: 0, due: 0, overdue: 0, learning: 0, young: 0, mature: 0, leech: 0 };
}

export function analyzeDeck(cards: readonly MechCard[], now: number): DeckAnalysis {
  const counts = emptyCounts();
  let scheduled = 0;
  let dueReviews = 0;
  for (const card of cards) {
    counts[classifyCard(card, now)] += 1;
    const srs = srsOf(card);
    if (!srs) continue;
    scheduled += 1;
    if (srs.dueAt <= now) dueReviews += 1;
  }
  const fragmentation = scheduled > 0 ? Math.round((dueReviews / scheduled) * 100) : 0;
  return {
    total: cards.length,
    counts,
    scheduled,
    dueReviews,
    fragmentation,
    recommend: dueReviews > 0,
  };
}

/**
 * The cards a defragment pass reviews: scheduled cards that are due, most
 * overdue first (the worst fragments are moved first). New cards are not
 * here — they belong to the Vocabulary Update, which honours the daily budget.
 *
 * `focusId` puts one card at the front even when it is not due yet (a balloon
 * tip's "Review now" on a leech): reviewing early is the same call the regular
 * "review all" path makes.
 */
export function defragQueue(cards: readonly MechCard[], now: number, focusId?: string | null): string[] {
  const due = cards
    .map((card) => ({ card, srs: srsOf(card) }))
    .filter((row): row is { card: MechCard; srs: LocalSrsState } => !!row.srs && row.srs.dueAt <= now)
    .sort((a, b) => a.srs.dueAt - b.srs.dueAt)
    .map((row) => row.card.id);
  if (!focusId || !cards.some((card) => card.id === focusId)) return due;
  return [focusId, ...due.filter((id) => id !== focusId)];
}

export interface BlockCell {
  state: BlockState;
  /** Cards this block stands for (1 unless the deck is larger than the map). */
  size: number;
  /** True when the block holds a card answered in the running pass. */
  written: boolean;
  /** True when the block holds the card being reviewed right now. */
  reading: boolean;
}

export interface BlockMapOptions {
  /** Upper bound on drawn blocks; larger decks are bucketed. */
  maxBlocks?: number;
  /** Card ids answered in this pass, in answer order — compacted to the front. */
  written?: readonly string[];
  /** The card under review. */
  readingId?: string | null;
}

/**
 * The map: one block per card in deck order, or per bucket of cards when the
 * deck is bigger than `maxBlocks`.
 *
 * During a pass, cards already answered are moved to the front in answer
 * order. That is the "consolidation" the user watches: a contiguous run of
 * freshly written blocks grows from the start of the volume while the red
 * fragments further on disappear.
 */
export function buildBlockMap(cards: readonly MechCard[], now: number, options: BlockMapOptions = {}): BlockCell[] {
  const maxBlocks = Math.max(1, Math.floor(options.maxBlocks ?? 720));
  const written = options.written ?? [];
  const writtenSet = new Set(written);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const front = written.map((id) => byId.get(id)).filter((card): card is MechCard => !!card);
  const ordered = [...front, ...cards.filter((card) => !writtenSet.has(card.id))];
  const per = Math.max(1, Math.ceil(ordered.length / maxBlocks));
  const cells: BlockCell[] = [];
  for (let i = 0; i < ordered.length; i += per) {
    const slice = ordered.slice(i, i + per);
    let state: BlockState = classifyCard(slice[0], now);
    let anyWritten = false;
    let anyReading = false;
    for (const card of slice) {
      const s = classifyCard(card, now);
      if (URGENCY[s] > URGENCY[state]) state = s;
      if (writtenSet.has(card.id)) anyWritten = true;
      if (options.readingId && card.id === options.readingId) anyReading = true;
    }
    cells.push({ state, size: slice.length, written: anyWritten, reading: anyReading });
  }
  return cells;
}

/* ------------------------------------------------------------ Update Center */

export interface UpdatePlan<T extends MechCard> {
  /** Today's allowance for new cards (profile `newPerDay`), or null for no cap. */
  budget: number | null;
  /** Allowance left after the cards already introduced today. */
  remaining: number | null;
  /** New cards inside today's allowance — installed by default. */
  important: T[];
  /** The next new cards past the allowance — offered, unticked. */
  optional: T[];
  /** Every never-reviewed card in the deck. */
  pendingTotal: number;
}

/** No profile cap still needs a sane batch size for one sitting. */
export const UNCAPPED_BATCH = 20;
export const OPTIONAL_UPDATES = 10;

/**
 * Split the new-card queue the way a Vista update list is split.
 *
 * The important list is exactly what `limitNewCards` lets into a review
 * session today (same order, same budget), so installing it spends the same
 * allowance the Flashcards app would. Optional updates are the next cards in
 * line; ticking one is the user's explicit choice to go past the budget.
 */
export function planUpdates<T extends MechCard>(
  cards: readonly T[],
  newPerDay: number | undefined,
  introducedToday: number,
  optionalCount = OPTIONAL_UPDATES,
): UpdatePlan<T> {
  const fresh = cards.filter((card) => !isLocalSrsState(card.srs));
  const capped = newPerDay !== undefined && Number.isFinite(newPerDay);
  const important = capped
    ? limitNewCards(fresh, newPerDay, introducedToday)
    : fresh.slice(0, UNCAPPED_BATCH);
  const taken = new Set(important.map((card) => card.id));
  const optional = fresh.filter((card) => !taken.has(card.id)).slice(0, Math.max(0, optionalCount));
  const budget = capped ? Math.max(0, Math.floor(newPerDay as number)) : null;
  return {
    budget,
    remaining: budget === null ? null : Math.max(0, budget - Math.max(0, introducedToday)),
    important,
    optional,
    pendingTotal: fresh.length,
  };
}

/** Cards whose first review happened on the local day containing `now`. */
export function installedToday<T extends MechCard>(cards: readonly T[], now: number): T[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  return cards
    .filter((card) => typeof card.introducedAt === 'number' && card.introducedAt >= from && card.introducedAt <= now)
    .sort((a, b) => (b.introducedAt ?? 0) - (a.introducedAt ?? 0));
}

/**
 * A stable, period-flavoured identifier for an update row ("KB" + 6 digits),
 * derived from the card id so the same card always carries the same number.
 */
export function updateKbNumber(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `KB${(900000 + ((h >>> 0) % 99999)).toString()}`;
}

/** A plausible "download size" in KB: what the card actually carries. */
export function updateSizeKb(card: MechCard): number {
  const chars = (card.word?.length ?? 0) + (card.reading?.length ?? 0) + (card.meaning?.length ?? 0) + (card.sentence?.length ?? 0);
  return Math.max(1, Math.round(chars * 0.9 + 4));
}

/* ------------------------------------------------------------- Balloon tips */

export interface BalloonGate {
  enabled: boolean;
  now: number;
  /** Epoch ms of the last balloon shown, or 0. */
  lastShownAt: number;
  /** Minimum minutes between two balloons. */
  intervalMin: number;
  /** Any interruption gate (focus mode, review, video, lock screen…). */
  blocked: boolean;
}

export const MIN_BALLOON_INTERVAL_MIN = 5;

export function canShowBalloon(gate: BalloonGate): boolean {
  if (!gate.enabled || gate.blocked) return false;
  const interval = Math.max(MIN_BALLOON_INTERVAL_MIN, Number.isFinite(gate.intervalMin) ? gate.intervalMin : 20);
  if (!Number.isFinite(gate.lastShownAt) || gate.lastShownAt <= 0) return true;
  // A clock that moved backwards must not lock the tips out until it catches up.
  if (gate.now < gate.lastShownAt) return true;
  return gate.now - gate.lastShownAt >= interval * 60_000;
}

export interface BalloonPick<T extends MechCard> {
  card: T;
  reason: 'leech' | 'due';
}

/**
 * The word a "Did you know?" balloon is about: a leech first (the words that
 * keep failing earn the extra exposure), then any due review. Only cards that
 * have something to teach — a meaning — are eligible. `seed` rotates the pick.
 */
export function pickBalloonCard<T extends MechCard>(cards: readonly T[], now: number, seed: number): BalloonPick<T> | null {
  const usable = cards.filter((card) => card.word && card.meaning);
  const leeches = usable.filter((card) => classifyCard(card, now) === 'leech');
  const due = usable.filter((card) => {
    const s = classifyCard(card, now);
    return s === 'due' || s === 'overdue';
  });
  const index = (length: number): number => ((Math.floor(seed) % length) + length) % length;
  if (leeches.length) return { card: leeches[index(leeches.length)], reason: 'leech' };
  if (due.length) return { card: due[index(due.length)], reason: 'due' };
  return null;
}

/* -------------------------------------------------------------- Screensaver */

export interface ScreensaverGate {
  enabled: boolean;
  /** Idle minutes before the screensaver starts. 0 means never. */
  minutes: number;
  idleMs: number;
  aero: boolean;
  /** Any `<video>` playing. */
  videoPlaying: boolean;
  /** Focus is in an editable field. */
  typing: boolean;
  /** A review / learn session is on screen. */
  reviewing: boolean;
  /** `data-perf='battery'`. */
  battery: boolean;
  /** Lock screen, boot / sleep overlays, focus mode. */
  suspended: boolean;
  /** `document.hidden`. */
  hidden: boolean;
}

export const SCREENSAVER_MINUTES = [0, 1, 3, 5, 10, 15, 30] as const;

export function screensaverShouldStart(gate: ScreensaverGate): boolean {
  if (!gate.enabled || !gate.aero) return false;
  if (!Number.isFinite(gate.minutes) || gate.minutes <= 0) return false;
  if (gate.videoPlaying || gate.typing || gate.reviewing || gate.battery || gate.suspended || gate.hidden) return false;
  return gate.idleMs >= gate.minutes * 60_000;
}

/**
 * The words the screensaver's bubbles carry: due cards first (the passive
 * exposure is worth most there), topped up with known ones, deduplicated by
 * word, never more than `limit`.
 */
export function screensaverWords<T extends MechCard>(cards: readonly T[], now: number, limit = 18): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const push = (card: T): void => {
    const word = card.word?.trim();
    if (!word || word.length > 14 || seen.has(word) || out.length >= limit) return;
    seen.add(word);
    out.push(card);
  };
  const rank = (card: T): number => {
    const s = classifyCard(card, now);
    if (s === 'due' || s === 'overdue' || s === 'leech') return 0;
    if (s === 'learning' || s === 'young') return 1;
    if (s === 'mature') return 2;
    return 3;
  };
  [...cards].sort((a, b) => rank(a) - rank(b)).forEach(push);
  return out;
}

/* --------------------------------------------------------------- formatting */

/** A whole percentage (0..100) in the UI locale, e.g. "23%" / "23 %". */
export function formatPct(pct: number, locale: string): string {
  const value = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) / 100 : 0;
  try {
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${Math.round(value * 100)}%`;
  }
}

/** A size in kilobytes in the UI locale ("12 kB", "12 КБ"…). */
export function formatKb(kb: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilobyte', unitDisplay: 'short' }).format(kb);
  } catch {
    return `${kb} KB`;
  }
}

/* ----------------------------------------------------------- Welcome Center */

/** Local YYYY-MM-DD of `now` — the key for "once per day" gates. */
export function aeroDayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** True when a once-a-day surface has not run yet today. */
export function isFirstTimeToday(lastDay: string | null | undefined, now: number): boolean {
  return lastDay !== aeroDayKey(now);
}
