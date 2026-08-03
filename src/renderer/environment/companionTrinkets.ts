/**
 * Companion trinkets — small, purely cosmetic keepsakes tied to the reading
 * streak the desktop already tracks (Phase 5 · M12).
 *
 * Deliberately additive, not a lock: every companion, wallpaper, and icon
 * shipped so far in Phase 5 is available from first run, and this module never
 * takes any of that away. A trinket is a tiny badge a companion can wear once
 * earned — nothing is withheld to manufacture engagement (see the milestone's
 * own "manipulative progression" risk note). Six trinkets, one per the streak
 * milestone `environment/achievements.ts` already celebrates — no new metric,
 * no new grind.
 */
import type { IconName } from '../components/Icons';

const KEY = 'jp-os-trinkets-v1';

/**
 * The reading-streak ladder. Lives here, not in achievements.ts, on purpose:
 * `TRINKETS` below needs it at module-eval time, and achievements.ts already
 * imports from this module (for `unlockTrinketsForStreak`) — defining it there
 * instead would make the two modules import each other, which is a real
 * circular-import TDZ crash in Vite's dev server, not just a style nit (this
 * exact ordering shipped broken once: "Cannot access 'STREAK_MILESTONES'
 * before initialization"). achievements.ts imports it from here.
 */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

export interface TrinketDef {
  id: string;
  streakDays: number;
  icon: IconName;
  /** i18n keys, resolved by the settings UI — this module stays translation-free. */
  labelKey: string;
  descKey: string;
}

export const TRINKETS: readonly TrinketDef[] = STREAK_MILESTONES.map((days) => ({
  id: `streak-${days}`,
  streakDays: days,
  icon: 'trophy',
  labelKey: `companion.trinket.${days}.label`,
  descKey: `companion.trinket.${days}.desc`,
}));

interface TrinketState {
  unlockedIds: string[];
  /** id → epoch ms, for a "New" cue and for stable sort order. */
  unlockedAt: Record<string, number>;
}

function empty(): TrinketState {
  return { unlockedIds: [], unlockedAt: {} };
}

export function loadTrinketState(): TrinketState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<TrinketState>;
    return {
      unlockedIds: Array.isArray(parsed.unlockedIds)
        ? parsed.unlockedIds.filter((id) => typeof id === 'string')
        : [],
      unlockedAt:
        parsed.unlockedAt && typeof parsed.unlockedAt === 'object' ? parsed.unlockedAt : {},
    };
  } catch {
    return empty();
  }
}

function save(state: TrinketState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full/unavailable — unlocks just won't persist this run */
  }
}

export function isTrinketUnlocked(id: string, state = loadTrinketState()): boolean {
  return state.unlockedIds.includes(id);
}

export function unlockedTrinketCount(state = loadTrinketState()): number {
  return state.unlockedIds.length;
}

/**
 * Unlock every trinket newly earned at `streakDays`. Returns the ones that
 * were freshly granted this call (empty on repeat calls at the same streak),
 * so the caller can decide whether to toast — this module never dispatches
 * events itself, matching companionCatalog/achievements' separation of
 * "what changed" from "how the desktop reacts to it".
 */
export function unlockTrinketsForStreak(streakDays: number, now = Date.now()): TrinketDef[] {
  const state = loadTrinketState();
  const newly: TrinketDef[] = [];
  for (const t of TRINKETS) {
    if (t.streakDays > streakDays) continue;
    if (state.unlockedIds.includes(t.id)) continue;
    state.unlockedIds.push(t.id);
    state.unlockedAt[t.id] = now;
    newly.push(t);
  }
  if (newly.length) save(state);
  return newly;
}

/** Test/reset hook — also used by the Memory & storage "reset" action. */
export function resetTrinkets(): void {
  save(empty());
}
