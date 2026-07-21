/**
 * Canonical grammar-function taxonomy.
 *
 * Replaces the flat 185-id list in `functions.ts` as the thing the UI shows and
 * the filters query. Those 185 ids were scraped Mazii category labels, machine
 * translated ("How to say the first", "Levels are few", "Much less volume"),
 * and a corpus audit found 96 of them match zero records — over half the filter
 * column could never return a result.
 *
 * Design rules that matter here:
 *
 *  - Canonical ids are stable and never localized. Display text lives in the
 *    i18n catalogs under `grammar.cat.*` / `grammar.catgroup.*`. Storing a
 *    label as an id is what made the old list untranslatable.
 *  - Every legacy id keeps working. `LEGACY_ALIASES` maps all 185 to canonical
 *    ids, so imported data and saved user filters resolve rather than break.
 *    A test asserts the mapping is total.
 *  - A legacy id may map to several canonical categories, and a grammar point
 *    may belong to several. Function is not a partition; forcing one category
 *    per point is what produced the 'other' bucket.
 *  - `langs` gates categories that only exist in one language (honorific and
 *    humble registers are Japanese; there is no Chinese equivalent to file
 *    under the same heading).
 */

import type { GrammarFunctionId } from './functions';
import type { GrammarLang } from './types';

export const CATEGORY_GROUP_IDS = [
  'time',
  'cause',
  'purpose',
  'condition',
  'contrast',
  'comparison',
  'degree',
  'quantity',
  'state',
  'possibility',
  'obligation',
  'request',
  'volition',
  'judgment',
  'emotion',
  'explanation',
  'examples',
  'method',
  'space',
  'emphasis',
  'evidence',
  'register',
  'voice',
  'discourse',
] as const;

export type CategoryGroupId = (typeof CATEGORY_GROUP_IDS)[number];

export interface GrammarCategory {
  id: string;
  group: CategoryGroupId;
  /** i18n key for the display name. Never a literal label. */
  labelKey: string;
  /** i18n key for the one-line "what belongs here" description. */
  descKey: string;
  /** Languages this category is meaningful for. */
  langs: GrammarLang[];
  /** Categories users commonly confuse this with; surfaced as UI hints. */
  confusableWith?: string[];
}

function cat(
  id: string,
  group: CategoryGroupId,
  opts: { langs?: GrammarLang[]; confusableWith?: string[] } = {},
): GrammarCategory {
  return {
    id,
    group,
    labelKey: `grammar.cat.${id}`,
    descKey: `grammar.cat.${id}.desc`,
    langs: opts.langs ?? ['ja', 'zh'],
    confusableWith: opts.confusableWith,
  };
}

export const GRAMMAR_CATEGORIES: GrammarCategory[] = [
  // —— Time and sequence ——
  cat('time.point', 'time'),
  cat('time.sequence', 'time', { confusableWith: ['discourse.connection'] }),
  cat('time.simultaneous', 'time'),
  cat('time.immediate', 'time', { confusableWith: ['time.sequence'] }),
  cat('time.duration', 'time'),
  cat('time.repetition', 'time'),
  cat('time.completion', 'time', { confusableWith: ['state.result'] }),
  cat('time.experience', 'time'),

  // —— Cause, reason, grounds ——
  cat('cause.reason', 'cause', { confusableWith: ['cause.grounds', 'purpose.goal'] }),
  cat('cause.grounds', 'cause', { confusableWith: ['cause.reason'] }),
  cat('cause.result', 'cause', { confusableWith: ['state.result'] }),
  cat('cause.premise', 'cause'),

  // —— Purpose, goal, intention ——
  cat('purpose.goal', 'purpose', { confusableWith: ['cause.reason'] }),
  cat('purpose.intention', 'purpose', { confusableWith: ['volition.will'] }),
  cat('purpose.plan', 'purpose'),
  cat('purpose.decision', 'purpose'),

  // —— Condition and hypothesis ——
  cat('condition.general', 'condition'),
  cat('condition.hypothetical', 'condition', { confusableWith: ['condition.counterfactual'] }),
  cat('condition.counterfactual', 'condition', { confusableWith: ['condition.hypothetical'] }),
  cat('condition.requirement', 'condition'),

  // —— Contrast and concession ——
  cat('contrast.opposition', 'contrast', { confusableWith: ['comparison.compare'] }),
  cat('contrast.concession', 'contrast'),
  cat('contrast.unexpected', 'contrast', { confusableWith: ['emotion.surprise'] }),
  cat('contrast.exception', 'contrast'),

  // —— Comparison and similarity ——
  cat('comparison.compare', 'comparison', { confusableWith: ['contrast.opposition'] }),
  cat('comparison.similarity', 'comparison'),
  cat('comparison.proportion', 'comparison'),

  // —— Degree, extent, limitation ——
  cat('degree.extent', 'degree'),
  cat('degree.extreme', 'degree'),
  cat('degree.limit', 'degree', { confusableWith: ['degree.minimal'] }),
  cat('degree.minimal', 'degree', { confusableWith: ['degree.limit'] }),
  cat('degree.approximation', 'degree'),

  // —— Quantity, frequency, proportion ——
  cat('quantity.amount', 'quantity'),
  cat('quantity.frequency', 'quantity', { confusableWith: ['time.repetition'] }),

  // —— State, action, process, result ——
  cat('state.description', 'state'),
  cat('state.ongoing', 'state'),
  cat('state.change', 'state'),
  cat('state.result', 'state', { confusableWith: ['cause.result', 'time.completion'] }),
  cat('state.effort', 'state'),

  // —— Possibility, ability, permission ——
  cat('possibility.ability', 'possibility'),
  cat('possibility.permission', 'possibility', { confusableWith: ['request.ask'] }),

  // —— Obligation, necessity, prohibition ——
  cat('obligation.necessity', 'obligation'),
  cat('obligation.prohibition', 'obligation'),
  cat('obligation.rules', 'obligation'),

  // —— Requests, invitations, suggestions, advice ——
  cat('request.ask', 'request'),
  cat('request.invite', 'request', { confusableWith: ['request.advice'] }),
  cat('request.advice', 'request', { confusableWith: ['request.invite'] }),
  cat('request.refusal', 'request'),

  // —— Commands and volition ——
  cat('volition.will', 'volition', { confusableWith: ['purpose.intention'] }),
  cat('volition.desire', 'volition'),
  cat('volition.command', 'volition'),

  // —— Judgment, conjecture, certainty ——
  cat('judgment.conjecture', 'judgment', { confusableWith: ['evidence.hearsay'] }),
  cat('judgment.certainty', 'judgment'),
  cat('judgment.evaluation', 'judgment'),

  // —— Emotion, evaluation, attitude ——
  cat('emotion.feeling', 'emotion'),
  cat('emotion.surprise', 'emotion', { confusableWith: ['contrast.unexpected'] }),
  cat('emotion.exclamation', 'emotion'),
  cat('emotion.regret', 'emotion'),

  // —— Explanation, definition, conclusion ——
  cat('explanation.definition', 'explanation'),
  cat('explanation.explain', 'explanation'),
  cat('explanation.conclusion', 'explanation'),

  // —— Examples, listing, alternatives ——
  cat('examples.instance', 'examples'),
  cat('examples.listing', 'examples'),
  cat('examples.alternative', 'examples'),

  // —— Perspective, method, means ——
  cat('method.means', 'method'),
  cat('method.perspective', 'method'),
  cat('method.communication', 'method'),

  // —— Direction, location, range, relationships ——
  cat('space.location', 'space'),
  cat('space.direction', 'space'),
  cat('space.range', 'space', { confusableWith: ['degree.limit'] }),
  cat('space.relation', 'space'),

  // —— Emphasis and exclamation ——
  cat('emphasis.emphasize', 'emphasis'),
  cat('emphasis.negation', 'emphasis'),

  // —— Information source and reported speech ——
  cat('evidence.hearsay', 'evidence', { confusableWith: ['judgment.conjecture'] }),
  cat('evidence.source', 'evidence'),

  // —— Register, politeness, honorific, humble ——
  // Japanese-only: 敬語/謙譲語 have no structural Chinese counterpart to file here.
  cat('register.honorific', 'register', { langs: ['ja'] }),

  // —— Voice and transformation ——
  cat('voice.passive', 'voice'),
  cat('voice.benefactive', 'voice', { langs: ['ja'] }),
  cat('voice.form', 'voice'),

  // —— Discourse, topic management, sentence connection ——
  cat('discourse.topic', 'discourse'),
  cat('discourse.connection', 'discourse', { confusableWith: ['time.sequence'] }),
  cat('discourse.vagueness', 'discourse'),
];

export type CanonicalCategoryId = string;

export const CATEGORY_BY_ID: ReadonlyMap<string, GrammarCategory> = new Map(
  GRAMMAR_CATEGORIES.map((c) => [c.id, c]),
);

export const CATEGORY_IDS: string[] = GRAMMAR_CATEGORIES.map((c) => c.id);

/**
 * Legacy Mazii id -> canonical id(s).
 *
 * Every one of the 185 ids in GRAMMAR_FUNCTION_IDS appears exactly once as a
 * key (enforced by taxonomy.test.ts). Mappings were assigned from what the
 * label actually denotes, not from its wording — several legacy labels are
 * mistranslations whose surface reading points at the wrong concept
 * ("innocent" is 罪がない-style blamelessness, i.e. an evaluation;
 * "levels are few" is a minimizing degree expression, not a quantity).
 */
export const LEGACY_ALIASES: Record<GrammarFunctionId, CanonicalCategoryId[]> = {
  // time
  time: ['time.point'],
  'time-situation': ['time.point', 'state.description'],
  'future-time': ['time.point'],
  period: ['time.duration'],
  'time-space': ['time.point', 'space.location'],
  'time-sequence': ['time.sequence'],
  'comes-next': ['time.sequence'],
  'relationships-in-time': ['time.sequence'],
  'relationships-follow': ['time.sequence'],
  'at-the-same-time': ['time.simultaneous'],
  simultaneous: ['time.simultaneous'],
  'immediately-after': ['time.immediate'],
  'shortly-before': ['time.immediate'],
  'short-time': ['time.immediate', 'time.duration'],
  continuity: ['time.duration', 'state.ongoing'],
  'repeat-habits': ['time.repetition'],
  finish: ['time.completion'],
  completed: ['time.completion'],
  'past-state': ['time.point', 'state.description'],
  'negative-in-the-past': ['time.point', 'emphasis.negation'],
  experience: ['time.experience'],
  'time-direction': ['time.sequence', 'space.direction'],
  'starting-point': ['time.point', 'space.range'],

  // cause
  'cause-reason': ['cause.reason'],
  grounds: ['cause.grounds'],
  'cause-time-relationship': ['cause.reason', 'time.sequence'],
  result: ['cause.result'],
  'results-state': ['cause.result', 'state.result'],
  achievement: ['cause.result'],
  reaching: ['cause.result'],
  premise: ['cause.premise'],
  assumptions: ['cause.premise', 'condition.hypothetical'],

  // purpose
  'purpose-goal': ['purpose.goal'],
  'purpose-target': ['purpose.goal'],
  'purpose-nouns': ['purpose.goal'],
  intent: ['purpose.intention'],
  'willpower-intention': ['purpose.intention', 'volition.will'],
  plan: ['purpose.plan'],
  'planning-rules': ['purpose.plan', 'obligation.rules'],
  decision: ['purpose.decision'],
  'determination-decision': ['purpose.decision'],
  'determination-decisive': ['purpose.decision', 'volition.will'],
  aspiration: ['volition.desire', 'purpose.intention'],

  // condition
  condition: ['condition.general'],
  'condition-general': ['condition.general'],
  'condition-assumption': ['condition.hypothetical'],
  'condition-contrary': ['condition.counterfactual'],
  'conditions-contrary-to-reality': ['condition.counterfactual'],
  'condition-requirement': ['condition.requirement'],
  'condition-sufficient': ['condition.requirement'],

  // contrast
  contrast: ['contrast.opposition'],
  'state-contrast': ['contrast.opposition', 'state.description'],
  concessions: ['contrast.concession'],
  unexpected: ['contrast.unexpected'],
  'unexpected-outcome': ['contrast.unexpected', 'cause.result'],
  surprise: ['emotion.surprise'],
  exception: ['contrast.exception'],
  invariant: ['contrast.exception'],

  // comparison
  compare: ['comparison.compare'],
  'compare-contrast': ['comparison.compare', 'contrast.opposition'],
  similarities: ['comparison.similarity'],
  'similarity-degree': ['comparison.similarity', 'degree.extent'],
  as: ['comparison.similarity'],
  'as-expected': ['comparison.similarity', 'judgment.certainty'],
  expected: ['judgment.certainty'],
  proportional: ['comparison.proportion'],
  'percentage-parallel': ['comparison.proportion'],
  'rate-parallel': ['comparison.proportion'],
  ratio: ['comparison.proportion'],
  'related-respectively': ['comparison.proportion', 'space.relation'],

  // degree
  level: ['degree.extent'],
  'emphasize-on-level': ['degree.extent', 'emphasis.emphasize'],
  'highest-level': ['degree.extreme'],
  extremes: ['degree.extreme'],
  'limit-extreme': ['degree.extreme', 'degree.limit'],
  'extreme-example': ['degree.extreme', 'examples.instance'],
  limit: ['degree.limit'],
  'much-less-volume': ['degree.minimal'],
  'much-less-on-level': ['degree.minimal'],
  'levels-are-few': ['degree.minimal'],
  'amount-roughly': ['degree.approximation', 'quantity.amount'],
  vague: ['discourse.vagueness', 'degree.approximation'],

  // quantity
  amount: ['quantity.amount'],
  value: ['quantity.amount', 'judgment.evaluation'],
  frequency: ['quantity.frequency'],

  // state
  described: ['state.description'],
  describe: ['state.description'],
  characteristics: ['state.description'],
  adjective: ['state.description'],
  situation: ['state.description'],
  status: ['state.description'],
  'status-action': ['state.description', 'state.ongoing'],
  'action-status': ['state.ongoing', 'state.description'],
  process: ['state.ongoing'],
  act: ['state.ongoing'],
  halfway: ['state.ongoing'],
  trend: ['state.change'],
  'change-the-way': ['state.change', 'method.communication'],
  modify: ['state.change'],
  corrections: ['state.change'],
  'conjugated-from': ['voice.form'],
  'action-effort': ['state.effort'],

  // possibility
  ability: ['possibility.ability'],
  allow: ['possibility.permission'],
  'request-permission': ['possibility.permission', 'request.ask'],
  'approve-agree': ['possibility.permission', 'judgment.certainty'],

  // obligation
  'necessary-obligation': ['obligation.necessity'],
  obligatory: ['obligation.necessity'],
  forced: ['obligation.necessity'],
  ban: ['obligation.prohibition'],
  warning: ['obligation.prohibition', 'request.advice'],
  refuse: ['request.refusal'],
  orders: ['volition.command'],
  order: ['volition.command'],
  standard: ['obligation.rules'],

  // request
  request: ['request.ask'],
  asked: ['request.ask'],
  'request-suggestion': ['request.ask', 'request.invite'],
  'invite-suggest': ['request.invite'],
  'invite-advise': ['request.invite', 'request.advice'],
  'invite-to-invite': ['request.invite'],
  suggest: ['request.invite'],
  advice: ['request.advice'],
  remind: ['request.advice'],

  // volition / emotion
  wish: ['volition.desire'],
  desire: ['volition.desire'],
  affection: ['emotion.feeling'],
  feel: ['emotion.feeling'],
  regret: ['emotion.regret'],
  exclamatory: ['emotion.exclamation'],

  // judgment
  speculation: ['judgment.conjecture'],
  deductive: ['judgment.conjecture'],
  judge: ['judgment.evaluation', 'judgment.conjecture'],
  confirm: ['judgment.certainty'],
  'of-course': ['judgment.certainty'],
  'arguments-affirmative': ['judgment.certainty'],
  evaluate: ['judgment.evaluation'],
  criticize: ['judgment.evaluation'],
  blame: ['judgment.evaluation'],
  contemptuous: ['judgment.evaluation'],
  innocent: ['judgment.evaluation'],
  'taste-point-of-view': ['judgment.evaluation', 'method.perspective'],

  // explanation
  definition: ['explanation.definition'],
  'order-definition': ['explanation.definition'],
  'description-explanation': ['explanation.explain'],
  explain: ['explanation.explain'],
  conclude: ['explanation.conclusion'],

  // examples
  'for-example': ['examples.instance'],
  'denote-by-example': ['examples.instance'],
  'represented-by-example': ['examples.instance'],
  listed: ['examples.listing'],
  'queue-listing': ['examples.listing'],
  add: ['examples.listing'],
  attach: ['examples.listing'],
  'how-to-say-the-first': ['examples.listing', 'discourse.connection'],
  selective: ['examples.alternative'],

  // method
  'means-methods': ['method.means'],
  method: ['method.means'],
  through: ['method.means', 'space.range'],
  'perspective-way': ['method.perspective'],
  'story-topic': ['discourse.topic', 'method.perspective'],
  'communication-skillful': ['method.communication'],
  speak: ['method.communication'],
  'transfer-the-story': ['method.communication', 'evidence.hearsay'],

  // space
  place: ['space.location'],
  'space-relations': ['space.location', 'space.relation'],
  'location-method-cause': ['space.location', 'method.means', 'cause.reason'],
  direction: ['space.direction'],
  range: ['space.range'],
  'origin-and-end-point': ['space.range'],
  'point-of-departure-receipt': ['space.range', 'voice.benefactive'],
  'relationships-behind': ['space.relation'],
  companion: ['space.relation'],

  // emphasis
  emphasize: ['emphasis.emphasize'],
  'emphasize-negative': ['emphasis.emphasize', 'emphasis.negation'],
  'emphasize-the-negative': ['emphasis.emphasize', 'emphasis.negation'],
  negative: ['emphasis.negation'],

  // evidence
  heard: ['evidence.hearsay'],
  'information-resource': ['evidence.source'],

  // register / voice
  'reverent-humble': ['register.honorific'],
  passive: ['voice.passive'],
  benefit: ['voice.benefactive'],
  give: ['voice.benefactive'],

  // discourse
  case: ['discourse.topic'],

  /*
   * 'other' deliberately maps to nothing. 987 records (44% of the corpus) carry
   * it as their only tag — it is the regex tagger's fallback, not a category.
   * Resolving it to a real category would launder a non-answer into data; these
   * records surface as uncategorized in the audit instead.
   */
  other: [],
};

/** Resolve legacy function ids to canonical category ids, deduped. */
export function resolveCategories(
  legacy: readonly GrammarFunctionId[] | undefined,
): CanonicalCategoryId[] {
  if (!legacy || legacy.length === 0) return [];
  const out: string[] = [];
  for (const id of legacy) {
    const mapped = LEGACY_ALIASES[id];
    if (!mapped) continue;
    for (const c of mapped) if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** Categories available for a study language, in declaration order. */
/**
 * Category id -> the legacy function ids that map into it.
 *
 * The 82 canonical categories are deliberately broad, which leaves the big ones
 * (negation, condition) holding 150+ points each — accurate, but too coarse to
 * filter with. Inverting the alias map gives the filter panel a finer second
 * level to offer underneath each category without changing what a category
 * *means*.
 */
export const FUNCTIONS_BY_CATEGORY: ReadonlyMap<CanonicalCategoryId, GrammarFunctionId[]> =
  (() => {
    const out = new Map<CanonicalCategoryId, GrammarFunctionId[]>();
    for (const [fn, cats] of Object.entries(LEGACY_ALIASES) as [
      GrammarFunctionId,
      CanonicalCategoryId[],
    ][]) {
      for (const c of cats) {
        const list = out.get(c);
        if (list) list.push(fn);
        else out.set(c, [fn]);
      }
    }
    return out;
  })();

export function categoriesForLang(lang: GrammarLang): GrammarCategory[] {
  return GRAMMAR_CATEGORIES.filter((c) => c.langs.includes(lang));
}

/** Group id -> its categories, for the collapsible filter UI. */
export function categoriesByGroup(
  lang?: GrammarLang,
): Array<{ group: CategoryGroupId; categories: GrammarCategory[] }> {
  const source = lang ? categoriesForLang(lang) : GRAMMAR_CATEGORIES;
  return CATEGORY_GROUP_IDS.map((group) => ({
    group,
    categories: source.filter((c) => c.group === group),
  })).filter((g) => g.categories.length > 0);
}
