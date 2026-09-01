/**
 * Gate 27 — what a scan may import by itself, and what has to be looked at.
 *
 * The gate: "Ambiguity goes to review, not into the library. A file the router
 * settles only by **guessing** lands in the review queue; a high-confidence
 * match may auto-import."
 *
 * The load-bearing finding here, and the reason this is a separate module from
 * `scan.ts`: **`placed` is not the same as "safe to import unattended".**
 * Gate 23's four buckets are arithmetic over the *report* — every considered
 * file lands in exactly one of them and they sum to `found`. But
 * `settlementOf` calls a single `likely` candidate `placed`, and `likely` is
 * defined by `fileRouting.ts` as "best guess, route but say what was assumed".
 * A `.csv` is `placed` and is also, in gate 27's exact word, a guess. Reusing
 * the scan's settlement as the auto-import test would put every guess straight
 * into the library, which is the one thing this gate forbids.
 *
 * So disposition is decided from the router's own **confidence**, not from the
 * settlement:
 *
 * - `exact`, one candidate → the router is certain → may auto-import.
 * - `likely`             → a guess → review, and the reason says it was guessed.
 * - `ambiguous`          → two valid homes → review, with the choice attached.
 * - target `unknown`     → refused: there is no destination to review it INTO,
 *                          which is a different thing to ask the user than a
 *                          choice between two, exactly as gate 23 keeps
 *                          `unplaced` separate from `ambiguous`.
 *
 * Nothing in this module touches the disk. It is a pure function of a scan
 * entry plus settings, so gate 36's "subtitles auto, video review, one scan"
 * is a table test rather than a live rehearsal.
 */
import type { DropCandidate, DropConfidence, DropTargetId } from '../fileRouting';
import { isAlreadyImported, type ImportLedger } from './importLedger';
import type { FilesScanEntry, FilesScanReport } from './scan';
import { DEFAULT_STABILITY_MS, MAX_STABILITY_MS } from './stability';

/**
 * The plan's "Auto-import confidence" setting, in its own three words.
 *
 * `everything` is the honest escape hatch and the only value that can put an
 * ambiguous file into the library unattended; entries it promotes carry
 * `warned: true` so the surface can say so rather than implying the router was
 * sure.
 */
export type IngestConfidencePolicy = 'always-review' | 'high-confidence' | 'everything';

export const INGEST_CONFIDENCE_POLICIES: readonly IngestConfidencePolicy[] = [
  'always-review',
  'high-confidence',
  'everything',
];

/**
 * Gate 36's per-category override.
 *
 * `auto` NARROWS, it never widens. A category set to `auto` still cannot
 * promote a guessed or ambiguous file — otherwise "auto-import subtitles"
 * would quietly repeal gate 27 for every `.zip` that happens to rank a
 * subtitle first. Widening is the global `everything` policy's job, and that
 * one warns. `review` does widen, deliberately: sending more to review is
 * never the unsafe direction.
 */
export type IngestCategoryPolicy = 'auto' | 'review' | 'inherit';

/**
 * The destinations a per-category override can name, in the order the settings
 * panel lists them.
 *
 * `unknown` is absent because there is nothing to route into — an override
 * there would be a control that cannot act, and `setIngestCategoryPolicy`
 * refuses it. `folder` is absent for the same reason from the other end: the
 * scan classifies files, never directories, so no scanned row can carry it.
 * The two the gates name lead, because they are the pair a user sets first.
 */
export const INGEST_OVERRIDABLE_TARGETS: readonly DropTargetId[] = [
  'subtitle',
  'media',
  'library-book',
  'library-manga',
  'dictionary-yomitan',
  'frequency-dict',
  'deck-csv',
  'anki-cards',
  'anki-level',
  'vn-script',
  'wallpaper',
  'shortcut',
  'backup',
];

export interface IngestSettings {
  confidence: IngestConfidencePolicy;
  /** Per-destination overrides. Absent means `inherit`. */
  byTarget: Partial<Record<DropTargetId, IngestCategoryPolicy>>;
  /** Gate 31's adjustable half: how long a size must hold before ingest. */
  stabilityMs: number;
  /**
   * Gate 25's watched folders. In the same document as the window on purpose:
   * a watched folder without the window that governs it is two settings that
   * have to agree, stored in two places that can disagree.
   */
  watchRoots: string[];
}

export const DEFAULT_INGEST_SETTINGS: IngestSettings = {
  confidence: 'high-confidence',
  byTarget: {},
  stabilityMs: DEFAULT_STABILITY_MS,
  // Nothing is watched until the user says so. Guessing at Downloads would
  // start a filesystem watcher nobody asked for, on the folder most likely to
  // be enormous.
  watchRoots: [],
};

/**
 * How many folders may be watched at once.
 *
 * Each root is a recursive `fs.watch` plus a tree walk per sweep, and the IPC
 * handler caps at the same number — a cap the renderer alone enforced would be
 * a cap in name only.
 */
export const MAX_WATCH_ROOTS = 8;

export const INGEST_SETTINGS_ERROR_EMPTY_ROOT = 'filesApp.settings.error.emptyRoot';
export const INGEST_SETTINGS_ERROR_DUPLICATE_ROOT = 'filesApp.settings.error.duplicateRoot';
export const INGEST_SETTINGS_ERROR_TOO_MANY_ROOTS = 'filesApp.settings.error.tooManyRoots';

/**
 * Gate 29's fourth answer. `known` is kept out of the other three rather than
 * folded into `refused`, because the user is being told something different:
 * not "nothing can open this" but "you already have this", which is a
 * successful outcome of a previous run rather than a failure of this one.
 */
export type IngestDisposition = 'auto' | 'review' | 'refused' | 'known';

export const INGEST_AUTO_HIGH_CONFIDENCE = 'filesApp.ingest.auto.highConfidence';
export const INGEST_AUTO_CATEGORY = 'filesApp.ingest.auto.category';
export const INGEST_AUTO_EVERYTHING = 'filesApp.ingest.auto.everything';
export const INGEST_REVIEW_GUESSED = 'filesApp.ingest.review.guessed';
export const INGEST_REVIEW_AMBIGUOUS = 'filesApp.ingest.review.ambiguous';
export const INGEST_REVIEW_ALWAYS = 'filesApp.ingest.review.alwaysReview';
export const INGEST_REVIEW_CATEGORY = 'filesApp.ingest.review.category';
export const INGEST_REFUSED_NO_DESTINATION = 'filesApp.ingest.refuse.noDestination';
export const INGEST_KNOWN_ALREADY_IMPORTED = 'filesApp.ingest.known.alreadyImported';

export interface IngestDecision {
  disposition: IngestDisposition;
  /** i18n key naming why. A disposition with no stated reason is not a pass. */
  reasonKey: string;
  /** True when a policy promoted something the router was not certain about. */
  warned: boolean;
}

function categoryPolicyFor(
  settings: IngestSettings,
  target: DropTargetId,
): IngestCategoryPolicy {
  return settings.byTarget[target] ?? 'inherit';
}

/**
 * Is the router *certain*, as opposed to merely having a favourite?
 *
 * Both halves matter. A single `exact` candidate is the router saying "this is
 * a subtitle". Two candidates where the first happens to be `exact` would mean
 * it also thinks something else is possible, and that is a choice, not an
 * answer.
 */
export function isHighConfidence(entry: {
  confidence: DropConfidence;
  candidateCount: number;
  target: DropTargetId;
}): boolean {
  return (
    entry.target !== 'unknown' && entry.confidence === 'exact' && entry.candidateCount === 1
  );
}

/** Gate 27's decision for one scanned file. */
export function dispositionFor(
  entry: Pick<
    FilesScanEntry,
    'target' | 'confidence' | 'candidateCount' | 'settlement' | 'path' | 'sizeBytes'
  >,
  settings: IngestSettings = DEFAULT_INGEST_SETTINGS,
  ledger?: ImportLedger,
): IngestDecision {
  /*
   * Gate 29, and it runs FIRST — before the refusal, before the policy. A file
   * already brought in is answered by history, not re-judged: if the router's
   * table changed since, re-classifying it here would offer an import that the
   * importers would then silently swallow, and the report would claim it landed.
   */
  if (ledger && entry.path && isAlreadyImported(ledger, { path: entry.path, sizeBytes: entry.sizeBytes })) {
    return { disposition: 'known', reasonKey: INGEST_KNOWN_ALREADY_IMPORTED, warned: false };
  }
  // No home at all. Nothing a review queue could ask about, so it is refused
  // by name rather than parked where a user would confirm it into nowhere.
  if (entry.target === 'unknown' || entry.settlement === 'unplaced') {
    return {
      disposition: 'refused',
      reasonKey: INGEST_REFUSED_NO_DESTINATION,
      warned: false,
    };
  }

  const category = categoryPolicyFor(settings, entry.target);
  if (category === 'review') {
    return { disposition: 'review', reasonKey: INGEST_REVIEW_CATEGORY, warned: false };
  }

  const certain = isHighConfidence(entry);

  if (settings.confidence === 'everything') {
    return {
      disposition: 'auto',
      reasonKey: certain ? INGEST_AUTO_HIGH_CONFIDENCE : INGEST_AUTO_EVERYTHING,
      // The plan asks for "an honest warning on the last". This flag is it.
      warned: !certain,
    };
  }

  if (settings.confidence === 'always-review') {
    return { disposition: 'review', reasonKey: INGEST_REVIEW_ALWAYS, warned: false };
  }

  if (certain) {
    return {
      disposition: 'auto',
      reasonKey: category === 'auto' ? INGEST_AUTO_CATEGORY : INGEST_AUTO_HIGH_CONFIDENCE,
      warned: false,
    };
  }

  // The gate's own sentence, in code: settled only by guessing → review.
  return {
    disposition: 'review',
    reasonKey:
      entry.confidence === 'ambiguous' || entry.candidateCount > 1
        ? INGEST_REVIEW_AMBIGUOUS
        : INGEST_REVIEW_GUESSED,
    warned: false,
  };
}

export interface IngestItem {
  entry: FilesScanEntry;
  decision: IngestDecision;
  /**
   * What a reviewer may pick from. Only present for `review` rows, and only
   * when there is genuinely more than one — a guessed single candidate is
   * confirmed or skipped, not re-chosen.
   */
  choices?: DropCandidate[];
}

export interface IngestPlan {
  auto: IngestItem[];
  review: IngestItem[];
  refused: IngestItem[];
  /** Gate 29: files a previous run already brought in. */
  known: IngestItem[];
  /** The lists' lengths, so a caller can print them without recounting. */
  autoCount: number;
  reviewCount: number;
  refusedCount: number;
  knownCount: number;
  /** How many auto rows were promoted past the router's own certainty. */
  warnedCount: number;
}

/**
 * Split a scan report into the three piles.
 *
 * `candidatesByPath` is the router's ranked list per file, which the scan
 * report deliberately does not carry (it stores a count, not the list, so a
 * 5,000-file report stays small). The review sheet needs the actual candidates
 * to offer a choice, so the caller supplies them for the rows it is showing.
 */
export function planIngest(
  report: Pick<FilesScanReport, 'entries'>,
  settings: IngestSettings = DEFAULT_INGEST_SETTINGS,
  candidatesByPath?: ReadonlyMap<string, readonly DropCandidate[]>,
  ledger?: ImportLedger,
): IngestPlan {
  const auto: IngestItem[] = [];
  const review: IngestItem[] = [];
  const refused: IngestItem[] = [];
  const known: IngestItem[] = [];
  let warnedCount = 0;

  for (const entry of report.entries) {
    const decision = dispositionFor(entry, settings, ledger);
    if (decision.warned) warnedCount += 1;
    const candidates = candidatesByPath?.get(entry.path);
    const item: IngestItem =
      decision.disposition === 'review' && candidates && candidates.length > 1
        ? { entry, decision, choices: [...candidates] }
        : { entry, decision };
    if (decision.disposition === 'auto') auto.push(item);
    else if (decision.disposition === 'review') review.push(item);
    else if (decision.disposition === 'known') known.push(item);
    else refused.push(item);
  }

  return {
    auto,
    review,
    refused,
    known,
    autoCount: auto.length,
    reviewCount: review.length,
    refusedCount: refused.length,
    knownCount: known.length,
    warnedCount,
  };
}

/** The plan's own invariant: every considered file is in exactly one pile. */
export function ingestPlanBalances(
  report: Pick<FilesScanReport, 'entries'>,
  plan: IngestPlan,
): boolean {
  return (
    plan.autoCount + plan.reviewCount + plan.refusedCount + plan.knownCount ===
    report.entries.length
  );
}

/**
 * The writer's refusals, as keys.
 *
 * A parser and a writer answer a bad value differently on purpose, and the
 * difference is the reason both exist. `normalizeIngestSettings` CLAMPS,
 * because a corrupted document still has to yield a usable app. A setter
 * REFUSES, because a number the user typed and watched change into a different
 * number is a control that lies about what it stored.
 */
export const INGEST_SETTINGS_ERROR_STABILITY_RANGE = 'filesApp.settings.error.stabilityRange';
export const INGEST_SETTINGS_ERROR_UNKNOWN_VALUE = 'filesApp.settings.error.unknownValue';

/** `{ doc, errorKey? }`, matching the other Files documents' writer shape. */
export interface IngestSettingsResult {
  doc: IngestSettings;
  errorKey?: string;
}

/** Gate 27's surface control: how much the router may act on unattended. */
export function setIngestConfidence(
  doc: IngestSettings,
  policy: IngestConfidencePolicy,
): IngestSettingsResult {
  if (!INGEST_CONFIDENCE_POLICIES.includes(policy)) {
    return { doc, errorKey: INGEST_SETTINGS_ERROR_UNKNOWN_VALUE };
  }
  if (doc.confidence === policy) return { doc };
  return { doc: { ...doc, confidence: policy } };
}

/**
 * Gate 36's surface control: one destination's own answer.
 *
 * `inherit` REMOVES the row rather than storing the word. A stored `inherit`
 * and an absent one would be the same behaviour with two shapes, and the next
 * reader of this document would have to know that — so the absence is the only
 * representation, exactly as `normalizeIngestSettings` already assumes.
 */
export function setIngestCategoryPolicy(
  doc: IngestSettings,
  target: DropTargetId,
  policy: IngestCategoryPolicy,
): IngestSettingsResult {
  if (policy !== 'auto' && policy !== 'review' && policy !== 'inherit') {
    return { doc, errorKey: INGEST_SETTINGS_ERROR_UNKNOWN_VALUE };
  }
  if (target === 'unknown') {
    // There is no destination to route INTO, so an override here would be a
    // control that cannot do anything. Refused by name rather than accepted.
    return { doc, errorKey: INGEST_SETTINGS_ERROR_UNKNOWN_VALUE };
  }
  const byTarget = { ...doc.byTarget };
  if (policy === 'inherit') {
    if (!(target in byTarget)) return { doc };
    delete byTarget[target];
  } else {
    if (byTarget[target] === policy) return { doc };
    byTarget[target] = policy;
  }
  return { doc: { ...doc, byTarget } };
}

/**
 * Gate 31's surface control: the stability window, in milliseconds.
 *
 * Out of range is refused rather than clamped — a user who types 9,999,999 and
 * is silently given 600,000 has been told their setting was accepted when a
 * different one was stored. The range itself is stated in the refusal's own
 * message so the field does not need a second source of truth.
 */
export function setIngestStabilityMs(doc: IngestSettings, raw: number): IngestSettingsResult {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { doc, errorKey: INGEST_SETTINGS_ERROR_STABILITY_RANGE };
  }
  if (raw < 0 || raw > MAX_STABILITY_MS) {
    return { doc, errorKey: INGEST_SETTINGS_ERROR_STABILITY_RANGE };
  }
  const value = Math.round(raw);
  if (doc.stabilityMs === value) return { doc };
  return { doc: { ...doc, stabilityMs: value } };
}

/**
 * Gate 25's writers.
 *
 * A duplicate is refused by name rather than deduplicated silently: a user who
 * adds the same folder twice and sees one row has been told nothing about why,
 * and the second add would look like a control that did not work.
 */
export function addIngestWatchRoot(doc: IngestSettings, root: string): IngestSettingsResult {
  const value = typeof root === 'string' ? root.trim() : '';
  if (!value) return { doc, errorKey: INGEST_SETTINGS_ERROR_EMPTY_ROOT };
  if (doc.watchRoots.some((existing) => sameRoot(existing, value))) {
    return { doc, errorKey: INGEST_SETTINGS_ERROR_DUPLICATE_ROOT };
  }
  if (doc.watchRoots.length >= MAX_WATCH_ROOTS) {
    return { doc, errorKey: INGEST_SETTINGS_ERROR_TOO_MANY_ROOTS };
  }
  return { doc: { ...doc, watchRoots: [...doc.watchRoots, value] } };
}

export function removeIngestWatchRoot(doc: IngestSettings, root: string): IngestSettingsResult {
  const next = doc.watchRoots.filter((existing) => !sameRoot(existing, root));
  if (next.length === doc.watchRoots.length) return { doc };
  return { doc: { ...doc, watchRoots: next } };
}

/**
 * Windows paths are case-insensitive and a trailing separator means the same
 * folder, so `C:\dl` and `c:\dl\` are one root. Comparing raw strings would
 * let the same folder be watched twice and announce every arrival twice.
 */
function sameRoot(a: string, b: string): boolean {
  // Both separators, and note the class must carry a real backslash: a `\/`
  // that lost its escape matches only the forward one, and `C:\dl\` would then
  // count as a different folder from `C:\dl`.
  const fold = (v: string) => v.trim().replace(/[\\/]+$/, '').toLowerCase();
  return fold(a) === fold(b);
}

/**
 * Settings normalisation, shared by the store and by anything reading a value
 * out of a settings file. Kept here rather than in the renderer store so the
 * clamp is one implementation and gate 31's "does not bypass the completeness
 * check entirely" cannot be defeated by a second, laxer parser.
 */
export function normalizeIngestSettings(raw: unknown): IngestSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<IngestSettings>;

  const confidence = INGEST_CONFIDENCE_POLICIES.includes(
    source.confidence as IngestConfidencePolicy,
  )
    ? (source.confidence as IngestConfidencePolicy)
    : DEFAULT_INGEST_SETTINGS.confidence;

  const byTarget: Partial<Record<DropTargetId, IngestCategoryPolicy>> = {};
  const rawByTarget = source.byTarget;
  if (rawByTarget && typeof rawByTarget === 'object') {
    for (const [target, policy] of Object.entries(rawByTarget)) {
      if (policy === 'auto' || policy === 'review') {
        byTarget[target as DropTargetId] = policy;
      }
      // `inherit` is the absence of a row, so it is never stored.
    }
  }

  const rawMs = source.stabilityMs;
  const stabilityMs =
    typeof rawMs === 'number' && Number.isFinite(rawMs)
      ? Math.min(MAX_STABILITY_MS, Math.max(0, Math.round(rawMs)))
      : DEFAULT_INGEST_SETTINGS.stabilityMs;

  const watchRoots: string[] = [];
  if (Array.isArray(source.watchRoots)) {
    for (const raw of source.watchRoots) {
      if (typeof raw !== 'string') continue;
      const value = raw.trim();
      if (!value || watchRoots.some((existing) => sameRoot(existing, value))) continue;
      if (watchRoots.length >= MAX_WATCH_ROOTS) break;
      watchRoots.push(value);
    }
  }

  return { confidence, byTarget, stabilityMs, watchRoots };
}
