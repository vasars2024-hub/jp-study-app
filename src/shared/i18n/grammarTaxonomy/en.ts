/**
 * Grammar taxonomy labels for one UI language.
 *
 * Split per language (2026-07-21) for the same reason as the catalogs: while all
 * four lived in one module, Rollup hoisted it into the entry chunk — the eager
 * English catalog and the lazy ja/zh/ru catalogs all imported it, so the shared
 * module landed in boot and every language's labels shipped to every session.
 * One module per language keeps each with its own catalog chunk.
 *
 * Kept out of the catalogs themselves because spreading ONE shared object into
 * all four would leave this block in English everywhere while
 * tools/i18n-check.cjs reported it fully translated —
 * that script compares key *presence* only. Four separate records make an
 * untranslated entry visible.
 *
 * Canonical ids live in src/renderer/data/grammar/taxonomy.ts and never change;
 * only these labels do.
 */

import type { Catalog } from '../core';

export const GRAMMAR_TAXONOMY_EN: Catalog = {
  // —— parent groups ——
  'grammar.catgroup.time': 'Time & sequence',
  'grammar.catgroup.cause': 'Cause & reason',
  'grammar.catgroup.purpose': 'Purpose & intention',
  'grammar.catgroup.condition': 'Condition & hypothesis',
  'grammar.catgroup.contrast': 'Contrast & concession',
  'grammar.catgroup.comparison': 'Comparison & similarity',
  'grammar.catgroup.degree': 'Degree & limitation',
  'grammar.catgroup.quantity': 'Quantity & frequency',
  'grammar.catgroup.state': 'State, action & result',
  'grammar.catgroup.possibility': 'Possibility & permission',
  'grammar.catgroup.obligation': 'Obligation & prohibition',
  'grammar.catgroup.request': 'Requests & suggestions',
  'grammar.catgroup.volition': 'Volition & commands',
  'grammar.catgroup.judgment': 'Judgment & certainty',
  'grammar.catgroup.emotion': 'Emotion & attitude',
  'grammar.catgroup.explanation': 'Explanation & conclusion',
  'grammar.catgroup.examples': 'Examples & listing',
  'grammar.catgroup.method': 'Method & perspective',
  'grammar.catgroup.space': 'Place, direction & range',
  'grammar.catgroup.emphasis': 'Emphasis & negation',
  'grammar.catgroup.evidence': 'Information source',
  'grammar.catgroup.register': 'Politeness & register',
  'grammar.catgroup.voice': 'Voice & transformation',
  'grammar.catgroup.discourse': 'Discourse & connection',

  // —— time ——
  'grammar.cat.time.point': 'Point in time',
  'grammar.cat.time.point.desc': 'Locates an event at a time — when it happens.',
  'grammar.cat.time.sequence': 'Sequence',
  'grammar.cat.time.sequence.desc': 'Orders events: before, after, then.',
  'grammar.cat.time.simultaneous': 'Simultaneous',
  'grammar.cat.time.simultaneous.desc': 'Two things happening at once.',
  'grammar.cat.time.immediate': 'Immediacy',
  'grammar.cat.time.immediate.desc': 'Right after or just before something.',
  'grammar.cat.time.duration': 'Duration',
  'grammar.cat.time.duration.desc': 'How long something lasts or continues.',
  'grammar.cat.time.repetition': 'Repetition & habit',
  'grammar.cat.time.repetition.desc': 'Recurring or habitual actions.',
  'grammar.cat.time.completion': 'Completion',
  'grammar.cat.time.completion.desc': 'Finishing, or having finished, an action.',
  'grammar.cat.time.experience': 'Experience',
  'grammar.cat.time.experience.desc': 'Having done something before.',

  // —— cause ——
  'grammar.cat.cause.reason': 'Reason',
  'grammar.cat.cause.reason.desc': 'Why something happens or is done.',
  'grammar.cat.cause.grounds': 'Grounds & basis',
  'grammar.cat.cause.grounds.desc': 'The evidence or basis a claim rests on.',
  'grammar.cat.cause.result': 'Consequence',
  'grammar.cat.cause.result.desc': 'What follows from a cause.',
  'grammar.cat.cause.premise': 'Premise',
  'grammar.cat.cause.premise.desc': 'An assumption the rest of the sentence builds on.',

  // —— purpose ——
  'grammar.cat.purpose.goal': 'Purpose',
  'grammar.cat.purpose.goal.desc': 'The aim an action serves — in order to.',
  'grammar.cat.purpose.intention': 'Intention',
  'grammar.cat.purpose.intention.desc': 'What the speaker means to do.',
  'grammar.cat.purpose.plan': 'Plan',
  'grammar.cat.purpose.plan.desc': 'Arrangements and scheduled intentions.',
  'grammar.cat.purpose.decision': 'Decision',
  'grammar.cat.purpose.decision.desc': 'Settling on a course of action.',

  // —— condition ——
  'grammar.cat.condition.general': 'Condition',
  'grammar.cat.condition.general.desc': 'General if-then relationships.',
  'grammar.cat.condition.hypothetical': 'Hypothesis',
  'grammar.cat.condition.hypothetical.desc': 'Supposing something that may or may not happen.',
  'grammar.cat.condition.counterfactual': 'Counterfactual',
  'grammar.cat.condition.counterfactual.desc': 'Contrary to fact — if things had been otherwise.',
  'grammar.cat.condition.requirement': 'Requirement',
  'grammar.cat.condition.requirement.desc': 'What must hold for something else to follow.',

  // —— contrast ——
  'grammar.cat.contrast.opposition': 'Opposition',
  'grammar.cat.contrast.opposition.desc': 'Setting two things against each other.',
  'grammar.cat.contrast.concession': 'Concession',
  'grammar.cat.contrast.concession.desc': 'Even though, despite, although.',
  'grammar.cat.contrast.unexpected': 'Unexpected outcome',
  'grammar.cat.contrast.unexpected.desc': 'A result that contradicts expectation.',
  'grammar.cat.contrast.exception': 'Exception',
  'grammar.cat.contrast.exception.desc': 'Cases set apart from a general rule.',

  // —— comparison ——
  'grammar.cat.comparison.compare': 'Comparison',
  'grammar.cat.comparison.compare.desc': 'More than, less than, rather than.',
  'grammar.cat.comparison.similarity': 'Similarity',
  'grammar.cat.comparison.similarity.desc': 'Likeness — as if, just like, seems.',
  'grammar.cat.comparison.proportion': 'Proportion',
  'grammar.cat.comparison.proportion.desc': 'The more X, the more Y; rates and ratios.',

  // —— degree ——
  'grammar.cat.degree.extent': 'Extent',
  'grammar.cat.degree.extent.desc': 'How far or how much something holds.',
  'grammar.cat.degree.extreme': 'Extreme',
  'grammar.cat.degree.extreme.desc': 'The highest or furthest case.',
  'grammar.cat.degree.limit': 'Limitation',
  'grammar.cat.degree.limit.desc': 'Only, merely, no more than.',
  'grammar.cat.degree.minimal': 'Minimizing',
  'grammar.cat.degree.minimal.desc': 'Downplaying — let alone, much less.',
  'grammar.cat.degree.approximation': 'Approximation',
  'grammar.cat.degree.approximation.desc': 'Roughly, about, more or less.',

  // —— quantity ——
  'grammar.cat.quantity.amount': 'Amount',
  'grammar.cat.quantity.amount.desc': 'How much or how many.',
  'grammar.cat.quantity.frequency': 'Frequency',
  'grammar.cat.quantity.frequency.desc': 'How often something occurs.',

  // —— state ——
  'grammar.cat.state.description': 'Description',
  'grammar.cat.state.description.desc': 'Describing how something is.',
  'grammar.cat.state.ongoing': 'Ongoing action',
  'grammar.cat.state.ongoing.desc': 'Actions in progress or in a continuing state.',
  'grammar.cat.state.change': 'Change',
  'grammar.cat.state.change.desc': 'Becoming, turning into, altering.',
  'grammar.cat.state.result': 'Resulting state',
  'grammar.cat.state.result.desc': 'The condition left behind by an action.',
  'grammar.cat.state.effort': 'Effort & attempt',
  'grammar.cat.state.effort.desc': 'Trying, managing, making an attempt.',

  // —— possibility ——
  'grammar.cat.possibility.ability': 'Ability',
  'grammar.cat.possibility.ability.desc': 'Can, be able to, capability.',
  'grammar.cat.possibility.permission': 'Permission',
  'grammar.cat.possibility.permission.desc': 'May, be allowed to.',

  // —— obligation ——
  'grammar.cat.obligation.necessity': 'Necessity',
  'grammar.cat.obligation.necessity.desc': 'Must, have to, need to.',
  'grammar.cat.obligation.prohibition': 'Prohibition',
  'grammar.cat.obligation.prohibition.desc': 'Must not, forbidden, warnings.',
  'grammar.cat.obligation.rules': 'Rules & standards',
  'grammar.cat.obligation.rules.desc': 'Norms, regulations, expected practice.',

  // —— request ——
  'grammar.cat.request.ask': 'Request',
  'grammar.cat.request.ask.desc': 'Asking someone to do something.',
  'grammar.cat.request.invite': 'Invitation & suggestion',
  'grammar.cat.request.invite.desc': 'Shall we, how about, let us.',
  'grammar.cat.request.advice': 'Advice',
  'grammar.cat.request.advice.desc': 'Recommending a course of action.',
  'grammar.cat.request.refusal': 'Refusal',
  'grammar.cat.request.refusal.desc': 'Declining or turning down.',

  // —— volition ——
  'grammar.cat.volition.will': 'Will',
  'grammar.cat.volition.will.desc': 'Determination and resolve.',
  'grammar.cat.volition.desire': 'Desire',
  'grammar.cat.volition.desire.desc': 'Wanting, wishing, hoping.',
  'grammar.cat.volition.command': 'Command',
  'grammar.cat.volition.command.desc': 'Direct orders and imperatives.',

  // —— judgment ——
  'grammar.cat.judgment.conjecture': 'Conjecture',
  'grammar.cat.judgment.conjecture.desc': 'Guessing — probably, it seems, might.',
  'grammar.cat.judgment.certainty': 'Certainty',
  'grammar.cat.judgment.certainty.desc': 'Confidence, confirmation, of course.',
  'grammar.cat.judgment.evaluation': 'Evaluation',
  'grammar.cat.judgment.evaluation.desc': 'Judging worth — praise, criticism, blame.',

  // —— emotion ——
  'grammar.cat.emotion.feeling': 'Feeling',
  'grammar.cat.emotion.feeling.desc': 'Expressing how the speaker feels.',
  'grammar.cat.emotion.surprise': 'Surprise',
  'grammar.cat.emotion.surprise.desc': 'Astonishment at something unforeseen.',
  'grammar.cat.emotion.exclamation': 'Exclamation',
  'grammar.cat.emotion.exclamation.desc': 'Emphatic emotional outbursts.',
  'grammar.cat.emotion.regret': 'Regret',
  'grammar.cat.emotion.regret.desc': 'Wishing things had gone differently.',

  // —— explanation ——
  'grammar.cat.explanation.definition': 'Definition',
  'grammar.cat.explanation.definition.desc': 'Stating what something means or is called.',
  'grammar.cat.explanation.explain': 'Explanation',
  'grammar.cat.explanation.explain.desc': 'Accounting for a situation.',
  'grammar.cat.explanation.conclusion': 'Conclusion',
  'grammar.cat.explanation.conclusion.desc': 'Summing up, arriving at a verdict.',

  // —— examples ——
  'grammar.cat.examples.instance': 'For example',
  'grammar.cat.examples.instance.desc': 'Introducing an instance of a wider point.',
  'grammar.cat.examples.listing': 'Listing',
  'grammar.cat.examples.listing.desc': 'Enumerating items, adding to a set.',
  'grammar.cat.examples.alternative': 'Alternatives',
  'grammar.cat.examples.alternative.desc': 'Choosing between options.',

  // —— method ——
  'grammar.cat.method.means': 'Means',
  'grammar.cat.method.means.desc': 'By what method something is done.',
  'grammar.cat.method.perspective': 'Perspective',
  'grammar.cat.method.perspective.desc': 'The standpoint a statement is made from.',
  'grammar.cat.method.communication': 'Communication',
  'grammar.cat.method.communication.desc': 'Ways of saying and conveying.',

  // —— space ——
  'grammar.cat.space.location': 'Location',
  'grammar.cat.space.location.desc': 'Where something is or happens.',
  'grammar.cat.space.direction': 'Direction',
  'grammar.cat.space.direction.desc': 'Toward, from, along.',
  'grammar.cat.space.range': 'Range',
  'grammar.cat.space.range.desc': 'From-to spans and boundaries.',
  'grammar.cat.space.relation': 'Relation',
  'grammar.cat.space.relation.desc': 'How entities stand in relation to each other.',

  // —— emphasis ——
  'grammar.cat.emphasis.emphasize': 'Emphasis',
  'grammar.cat.emphasis.emphasize.desc': 'Foregrounding or intensifying.',
  'grammar.cat.emphasis.negation': 'Negation',
  'grammar.cat.emphasis.negation.desc': 'Denial and negative forms.',

  // —— evidence ——
  'grammar.cat.evidence.hearsay': 'Hearsay',
  'grammar.cat.evidence.hearsay.desc': 'Reporting what was heard from elsewhere.',
  'grammar.cat.evidence.source': 'Information source',
  'grammar.cat.evidence.source.desc': 'Attributing where knowledge came from.',

  // —— register ——
  'grammar.cat.register.honorific': 'Honorific & humble',
  'grammar.cat.register.honorific.desc': 'Japanese 敬語 and 謙譲語 forms.',

  // —— voice ——
  'grammar.cat.voice.passive': 'Passive',
  'grammar.cat.voice.passive.desc': 'The subject undergoes rather than acts.',
  'grammar.cat.voice.benefactive': 'Giving & receiving',
  'grammar.cat.voice.benefactive.desc': 'Who benefits from an action.',
  'grammar.cat.voice.form': 'Form change',
  'grammar.cat.voice.form.desc': 'Conjugation and derived forms.',

  // —— discourse ——
  'grammar.cat.discourse.topic': 'Topic',
  'grammar.cat.discourse.topic.desc': 'Introducing and managing what is being discussed.',
  'grammar.cat.discourse.connection': 'Connection',
  'grammar.cat.discourse.connection.desc': 'Linking clauses and sentences.',
  'grammar.cat.discourse.vagueness': 'Vagueness',
  'grammar.cat.discourse.vagueness.desc': 'Hedging and leaving things unspecified.',

  // —— filter UI ——
  'grammar.filter.semantics': 'Any option within a group; all groups must match.',
  'grammar.filter.active': '{count} active',
  'grammar.filter.clearAll': 'Clear all',
  'grammar.filter.refine': 'Refine by function',
  'grammar.filter.reset': 'Reset',
  'grammar.filter.removeFilter': 'Remove filter {name}',
  'grammar.filter.categories': 'Function',
  'grammar.filter.categorySearch': 'Search functions…',
  'grammar.filter.selectedOnly': 'Selected only',
  'grammar.filter.noCategories': 'No functions match this search.',
  'grammar.filter.quality': 'Data quality',
  'grammar.filter.verifiedOnly': 'Verified tags only',
  'grammar.filter.verifiedOnly.desc':
    'Most tags were guessed from the English meaning. Off, results include those guesses.',
  'grammar.filter.studyReady': 'Ready to study',
  'grammar.filter.hasExamples': 'Has examples',
  'grammar.filter.levels.jlpt': 'JLPT level',
  'grammar.filter.levels.hsk': 'HSK level',
  'grammar.filter.unofficialLevel': 'HSK10 is a Gum-specific step, not an official band.',
  'grammar.register.neutral': 'Neutral',
  'grammar.register.casual': 'Casual',
  'grammar.register.business': 'Formal',
  'grammar.register.literary': 'Literary',
  'grammar.flag.incomplete': 'No examples',
  'grammar.flag.incomplete.desc': 'This entry has no example sentences yet.',
  'grammar.practice.hiddenSelected': '{count} selected but hidden',
  'grammar.practice.exporting': 'Exporting…',
  'grammar.practice.empty.hint': 'Try removing a filter, or turn off "Verified tags only".',
  // —— familiarity (learner state) ——
  'grammar.familiarity.legend': 'Familiarity',
  'grammar.familiarity.new': 'New',
  'grammar.familiarity.learning': 'Learning',
  'grammar.familiarity.familiar': 'Familiar',
  'grammar.familiarity.known': 'Known',
  'grammar.familiarity.hint': 'How well you know each point, from practice sessions or set by hand.',
  'grammar.familiarity.setLabel': 'I know this',
  'grammar.familiarity.manual': 'set by hand',
};
