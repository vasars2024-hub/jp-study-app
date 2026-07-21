// LevelService (Plan 0.5) — the single source of truth for the user's language
// level (1..7). Consumed by the Reading Finder defaults, the Game Arena
// difficulty, media/reader sorting, and the Statistics meter. Wires the pure
// scale math in shared/levelScale.ts to the app's per-slot level lists
// (levelLists.ts) and the knowledge store (knownWords.ts).

import { knowledgeCounts } from './knownWords';
import { getSlotList, listProgress, loadLevelLists, onLevelListsChanged } from './levelLists';
import {
  DEFAULT_LEVEL_THRESHOLD,
  deriveUserLevel,
  slotsForLang,
  type DeriveLevelInput,
  type DerivedLevel,
  type LevelSlotId,
  type LevelTier,
  type StudyLang,
} from '../shared/levelScale';
import { estimateUserLevel, type LevelEstimate } from '../shared/levelEstimate';
import { getStudyLang } from './studyEnvironment';

const THRESHOLD_KEY = 'jp-level-threshold';
export const LEVEL_CHANGED_EVENT = 'level-changed';

export function getActiveStudyLang(): StudyLang {
  return getStudyLang();
}

/** Coverage a list must reach to prove its level (0..1). User-configurable. */
export function getLevelThreshold(): number {
  const raw = Number(localStorage.getItem(THRESHOLD_KEY));
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : DEFAULT_LEVEL_THRESHOLD;
}

export function setLevelThreshold(value: number): void {
  const clamped = Math.min(1, Math.max(0.1, value));
  localStorage.setItem(THRESHOLD_KEY, String(clamped));
  window.dispatchEvent(new CustomEvent(LEVEL_CHANGED_EVENT));
}

export interface SlotCoverage {
  slot: LevelSlotId;
  learned: number;
  total: number;
  /** Percentage 0..100. */
  pct: number;
}

/** Per-slot Familiar-or-better coverage for a language, in scale order. */
export function slotCoverage(lang: StudyLang): SlotCoverage[] {
  return slotsForLang(lang).map((s) => {
    const list = getSlotList(s.id);
    if (!list) return { slot: s.id, learned: 0, total: 0, pct: 0 };
    const p = listProgress(list);
    return { slot: s.id, learned: p.learned, total: p.total, pct: p.pct };
  });
}

function buildInput(lang: StudyLang): DeriveLevelInput {
  const coverageBySlot: Partial<Record<LevelSlotId, number>> = {};
  for (const c of slotCoverage(lang)) {
    if (c.total > 0) coverageBySlot[c.slot] = c.pct / 100;
  }

  // Any free-form custom list acts as an "advanced / post-top-level" signal.
  let advancedCoverage = 0;
  for (const l of loadLevelLists()) {
    if (l.kind === 'custom' && !l.slot && l.words.length > 0) {
      advancedCoverage = Math.max(advancedCoverage, listProgress(l).pct / 100);
    }
  }

  const counts = knowledgeCounts();
  const totalKnown = counts[2] + counts[3]; // familiar + known

  return { coverageBySlot, advancedCoverage, totalKnown, threshold: getLevelThreshold() };
}

export interface LevelReport extends DerivedLevel {
  lang: StudyLang;
  slots: SlotCoverage[];
}

/** Full breakdown for the meter UI. */
export function getLevelReport(lang: StudyLang = getActiveStudyLang()): LevelReport {
  const derived = deriveUserLevel(lang, buildInput(lang));
  return { ...derived, lang, slots: slotCoverage(lang) };
}

/** The user's level 1..7 for a language (defaults to the active study language). */
export function getUserLevel(lang: StudyLang = getActiveStudyLang()): LevelTier {
  return deriveUserLevel(lang, buildInput(lang)).level;
}

/**
 * Badge-ready estimate (short "N3" / "HSK 4") for Statistics and any chrome
 * that should match EPUB cover labeling. Same math as getUserLevel.
 */
export function getLevelEstimate(lang: StudyLang = getActiveStudyLang()): LevelEstimate {
  return estimateUserLevel(lang, buildInput(lang));
}

export type { LevelEstimate };

/**
 * Subscribe to anything that can change the computed level: the level lists,
 * the knowledge store (manual grades or an Anki sync), the threshold, and the
 * active study language. Returns an unsubscribe function.
 */
export function onLevelChange(cb: () => void): () => void {
  const unlists = onLevelListsChanged(cb);
  const h = (): void => cb();
  window.addEventListener('word-knowledge-changed', h);
  window.addEventListener(LEVEL_CHANGED_EVENT, h);
  window.addEventListener('storage', h);
  window.addEventListener('study-lang-changed', h);
  return () => {
    unlists();
    window.removeEventListener('word-knowledge-changed', h);
    window.removeEventListener(LEVEL_CHANGED_EVENT, h);
    window.removeEventListener('storage', h);
    window.removeEventListener('study-lang-changed', h);
  };
}
