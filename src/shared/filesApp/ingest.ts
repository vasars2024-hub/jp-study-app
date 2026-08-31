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

export interface IngestSettings {
  confidence: IngestConfidencePolicy;
  /** Per-destination overrides. Absent means `inherit`. */
  byTarget: Partial<Record<DropTargetId, IngestCategoryPolicy>>;
  /** Gate 31's adjustable half: how long a size must hold before ingest. */
  stabilityMs: number;
}

export const DEFAULT_INGEST_SETTINGS: IngestSettings = {
  confidence: 'high-confidence',
  byTarget: {},
  stabilityMs: DEFAULT_STABILITY_MS,
};

export type IngestDisposition = 'auto' | 'review' | 'refused';

export const INGEST_AUTO_HIGH_CONFIDENCE = 'filesApp.ingest.auto.highConfidence';
export const INGEST_AUTO_CATEGORY = 'filesApp.ingest.auto.category';
export const INGEST_AUTO_EVERYTHING = 'filesApp.ingest.auto.everything';
export const INGEST_REVIEW_GUESSED = 'filesApp.ingest.review.guessed';
export const INGEST_REVIEW_AMBIGUOUS = 'filesApp.ingest.review.ambiguous';
export const INGEST_REVIEW_ALWAYS = 'filesApp.ingest.review.alwaysReview';
export const INGEST_REVIEW_CATEGORY = 'filesApp.ingest.review.category';
export const INGEST_REFUSED_NO_DESTINATION = 'filesApp.ingest.refuse.noDestination';

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
  entry: Pick<FilesScanEntry, 'target' | 'confidence' | 'candidateCount' | 'settlement'>,
  settings: IngestSettings = DEFAULT_INGEST_SETTINGS,
): IngestDecision {
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
  /** The three lists' lengths, so a caller can print them without recounting. */
  autoCount: number;
  reviewCount: number;
  refusedCount: number;
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
): IngestPlan {
  const auto: IngestItem[] = [];
  const review: IngestItem[] = [];
  const refused: IngestItem[] = [];
  let warnedCount = 0;

  for (const entry of report.entries) {
    const decision = dispositionFor(entry, settings);
    if (decision.warned) warnedCount += 1;
    const candidates = candidatesByPath?.get(entry.path);
    const item: IngestItem =
      decision.disposition === 'review' && candidates && candidates.length > 1
        ? { entry, decision, choices: [...candidates] }
        : { entry, decision };
    if (decision.disposition === 'auto') auto.push(item);
    else if (decision.disposition === 'review') review.push(item);
    else refused.push(item);
  }

  return {
    auto,
    review,
    refused,
    autoCount: auto.length,
    reviewCount: review.length,
    refusedCount: refused.length,
    warnedCount,
  };
}

/** The plan's own invariant: every considered file is in exactly one pile. */
export function ingestPlanBalances(
  report: Pick<FilesScanReport, 'entries'>,
  plan: IngestPlan,
): boolean {
  return plan.autoCount + plan.reviewCount + plan.refusedCount === report.entries.length;
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

  return { confidence, byTarget, stabilityMs };
}
