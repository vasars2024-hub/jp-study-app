/**
 * How a conjugated form was traced back to its dictionary form, step by step.
 *
 * The de-inflector (`shared/deinflect.ts`) reports a chain of stable reason
 * identifiers, inner (closest to the stem) to outer (the surface suffix):
 * 食べさせられなかった → 食べる is `causative · passive/potential · negative · past`.
 * Yomitan shows that chain with each rule named; this module is the one table
 * that names a step (a catalog key) and, where the grammar corpus has a point
 * for that construction, which point teaches it.
 *
 * The grammar ids are literal strings rather than a lookup into the grammar
 * data: that data is ~2 MB and must never reach the dictionary's startup graph
 * (Blanc's boot guard forbids it). `deinflectTrace.test.ts` checks every id here
 * against the real corpus, so a renamed point fails the suite instead of
 * leaving a link that opens nothing. A step with no point (plain negative and
 * past have none) is shown as a label, not as a control that goes nowhere.
 */

export interface DeinflectStepInfo {
  /** Catalog key naming the step, or null for a reason this table does not know. */
  labelKey: string | null;
  /** Grammar point that teaches the construction, when the corpus has one. */
  grammarId: string | null;
}

const STEPS: Readonly<Record<string, DeinflectStepInfo>> = {
  polite: { labelKey: 'deinflect.reason.polite', grammarId: 'n5-masu' },
  'polite negative': { labelKey: 'deinflect.reason.politeNegative', grammarId: 'n5-masu' },
  'polite past': { labelKey: 'deinflect.reason.politePast', grammarId: 'n5-mashita' },
  'polite past negative': { labelKey: 'deinflect.reason.politePastNegative', grammarId: 'n5-mashita' },
  'polite volitional': { labelKey: 'deinflect.reason.politeVolitional', grammarId: 'n5-mashou' },
  negative: { labelKey: 'deinflect.reason.negative', grammarId: null },
  past: { labelKey: 'deinflect.reason.past', grammarId: null },
  '-te': { labelKey: 'deinflect.reason.te', grammarId: 'n5-te-form' },
  causative: { labelKey: 'deinflect.reason.causative', grammarId: 'n4-causative' },
  passive: { labelKey: 'deinflect.reason.passive', grammarId: 'n4-passive' },
  'passive/potential': { labelKey: 'deinflect.reason.passivePotential', grammarId: 'n4-passive' },
  potential: { labelKey: 'deinflect.reason.potential', grammarId: 'n4-potential' },
  volitional: { labelKey: 'deinflect.reason.volitional', grammarId: 'n4-volitional' },
  imperative: { labelKey: 'deinflect.reason.imperative', grammarId: 'n4-imperative' },
  'conditional (–ば)': { labelKey: 'deinflect.reason.conditionalBa', grammarId: 'n4-ba' },
  'conditional (–たら)': { labelKey: 'deinflect.reason.conditionalTara', grammarId: 'n4-tara' },
  '–たり': { labelKey: 'deinflect.reason.tari', grammarId: 'n5-tari-tari' },
  '–たい': { labelKey: 'deinflect.reason.tai', grammarId: 'n5-tai' },
  '–すぎる': { labelKey: 'deinflect.reason.sugiru', grammarId: 'n4-sugiru' },
  adverbial: { labelKey: 'deinflect.reason.adverbial', grammarId: 'n5-adverbial' },
  'progressive (–ている)': { labelKey: 'deinflect.reason.progressive', grammarId: 'n5-te-iru' },
  'completion (–てしまう)': { labelKey: 'deinflect.reason.shimau', grammarId: 'n4-te-shimau' },
  'completion (–ちゃう)': { labelKey: 'deinflect.reason.chau', grammarId: 'n4-te-shimau' },
  '–ておく': { labelKey: 'deinflect.reason.teoku', grammarId: 'n4-te-oku' },
};

/** What the trace knows about one reason. Unknown reasons (an importer's own names) keep their text. */
export function deinflectStepInfo(reason: string): DeinflectStepInfo {
  return Object.prototype.hasOwnProperty.call(STEPS, reason)
    ? STEPS[reason]
    : { labelKey: null, grammarId: null };
}

/** Every grammar id the trace can link to, for the corpus check. */
export const DEINFLECT_GRAMMAR_IDS: readonly string[] = [
  ...new Set(Object.values(STEPS).map((step) => step.grammarId).filter((id): id is string => Boolean(id))),
];

/** Every reason the trace names, for the catalog check. */
export const DEINFLECT_KNOWN_REASONS: readonly string[] = Object.keys(STEPS);

export interface DeinflectTraceStep {
  reason: string;
  labelKey: string | null;
  grammarId: string | null;
}

/**
 * The chain as displayed: surface first, then each step innermost-first, then the
 * dictionary form — `食べさせられなかった ← causative ← passive ← negative ← past ← 食べる`.
 * Empty and duplicate-adjacent reasons are dropped (an inflection table can name
 * the same form twice); the order is otherwise the de-inflector's own.
 */
export function deinflectTraceSteps(reasons: readonly string[] | undefined): DeinflectTraceStep[] {
  const out: DeinflectTraceStep[] = [];
  for (const raw of reasons ?? []) {
    const reason = String(raw ?? '').trim();
    if (!reason || out[out.length - 1]?.reason === reason) continue;
    const info = deinflectStepInfo(reason);
    out.push({ reason, labelKey: info.labelKey, grammarId: info.grammarId });
  }
  return out;
}

/** True when two chains name the same steps, so a per-entry trace is not a repeat of the result's. */
export function sameDeinflectChain(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((reason, i) => reason === y[i]);
}
