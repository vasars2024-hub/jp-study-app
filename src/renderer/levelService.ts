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
import { loadFamiliarity, onFamiliarityChanged } from './grammarFamiliarity';
import {
  blendGrammarCoverage,
  getLoadedGrammarCorpus,
  grammarCoverageBySlot,
  grammarLevelProgress,
  loadGrammarCorpus,
  type GrammarLevelProgress,
} from './grammarProgress';

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

/**
 * v1.0 audit 5.1 — `slots` is threaded through rather than recomputed. Every
 * entry costs a tokenizer pass per word (`listProgress` → `toLemma`), and
 * `getLevelReport` used to build the same coverage twice: once inside
 * `buildInput` and once for its own `slots` field.
 */
/**
 * Grammar progress per level for `lang`, or null while the corpus has not been
 * loaded. An empty familiarity store never loads it: with nothing assessed,
 * grammar cannot move the estimate, so the 1.8 MB chunk is not worth pulling.
 * Otherwise the first call starts the load and announces a level change when
 * it lands, so every subscriber recomputes with grammar included.
 */
export function grammarProgressFor(lang: StudyLang): GrammarLevelProgress[] | null {
  const familiarity = loadFamiliarity();
  if (Object.keys(familiarity).length === 0) return null;
  const corpus = getLoadedGrammarCorpus();
  if (!corpus) {
    void loadGrammarCorpus().then(
      () => window.dispatchEvent(new CustomEvent(LEVEL_CHANGED_EVENT)),
      () => undefined,
    );
    return null;
  }
  return grammarLevelProgress(corpus, familiarity, lang);
}

function buildInput(lang: StudyLang, slots: SlotCoverage[] = slotCoverage(lang)): DeriveLevelInput {
  const vocabularyBySlot: Partial<Record<LevelSlotId, number>> = {};
  for (const c of slots) {
    if (c.total > 0) vocabularyBySlot[c.slot] = c.pct / 100;
  }
  // Grammar is a weighted input next to vocabulary — the weighting and when it
  // applies are documented at GRAMMAR_LEVEL_WEIGHT in ./grammarProgress.
  const grammar = grammarProgressFor(lang);
  const coverageBySlot = grammar
    ? blendGrammarCoverage(vocabularyBySlot, grammarCoverageBySlot(grammar))
    : vocabularyBySlot;

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
  const slots = slotCoverage(lang);
  const derived = deriveUserLevel(lang, buildInput(lang, slots));
  return { ...derived, lang, slots };
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

export interface TargetProgress {
  /** Vocabulary coverage of the target level's word list; total 0 when there is none. */
  vocabulary: SlotCoverage;
  /** Grammar at the target level; null until the corpus has loaded. */
  grammar: { known: number; learning: number; total: number; pct: number } | null;
}

/**
 * Progress toward a JLPT goal (the profile's `jlptTarget`): vocabulary and
 * grammar coverage at that level, each on its own. Only the one slot is
 * computed, since `listProgress` lemmatizes every word of a list.
 */
export function getTargetProgress(
  target: 'N5' | 'N4' | 'N3' | 'N2' | 'N1',
  corpus: Parameters<typeof grammarLevelProgress>[0] | null = getLoadedGrammarCorpus(),
): TargetProgress {
  const slot = `jlpt-${target.toLowerCase()}` as LevelSlotId;
  const list = getSlotList(slot);
  const p = list ? listProgress(list) : { learned: 0, total: 0, pct: 0 };
  const row = corpus ? grammarLevelProgress(corpus, loadFamiliarity(), 'ja').find((r) => r.level === target) : undefined;
  return {
    vocabulary: { slot, learned: p.learned, total: p.total, pct: p.pct },
    grammar: row
      ? { known: row.known, learning: row.learning, total: row.total, pct: row.total ? (row.known / row.total) * 100 : 0 }
      : null,
  };
}

/**
 * Subscribe to anything that can change the computed level: the level lists,
 * the knowledge store (manual grades or an Anki sync), grammar familiarity,
 * the threshold, and the active study language. Returns an unsubscribe function.
 */
export function onLevelChange(cb: () => void): () => void {
  const unlists = onLevelListsChanged(cb);
  const ungrammar = onFamiliarityChanged(cb);
  const h = (): void => cb();
  window.addEventListener('word-knowledge-changed', h);
  window.addEventListener(LEVEL_CHANGED_EVENT, h);
  window.addEventListener('storage', h);
  window.addEventListener('study-lang-changed', h);
  return () => {
    unlists();
    ungrammar();
    window.removeEventListener('word-knowledge-changed', h);
    window.removeEventListener(LEVEL_CHANGED_EVENT, h);
    window.removeEventListener('storage', h);
    window.removeEventListener('study-lang-changed', h);
  };
}
