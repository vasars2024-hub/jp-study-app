// Curated offline knowledge base for Japanese grammatical particles (助詞).
// Keyed by exact surface form; anything not listed falls back to a generic
// bucket derived from the token's IPADIC pos_detail_1 subtype, so no detected
// particle ever renders unclassified. Zero network dependency by design.

export type ParticleCategory =
  | 'case'
  | 'binding'
  | 'adverbial'
  | 'conjunctive'
  | 'sentence-final'
  | 'parallel'
  | 'other';

export interface ParticleRole {
  /**
   * Catalog id: the UI reads `particle.<key>.role` / `.label` / `.explanation`
   * in the interface language; the English fields below are the fallback.
   */
  key: string;
  /** Short grammatical role, e.g. "topic marker". */
  role: string;
  /** UI chip label, e.g. "topic". */
  label: string;
  /** One-sentence generic explanation of what the particle does. */
  explanation: string;
  category: ParticleCategory;
}

export const PARTICLE_ROLES: Record<string, ParticleRole> = {
  'は': {
    key: 'wa',
    role: 'topic marker',
    label: 'topic',
    explanation: 'Marks the topic of the sentence — what the sentence is about, with the rest as comment. Contrasts with が, which singles out the subject.',
    category: 'binding',
  },
  'が': {
    key: 'ga',
    role: 'subject marker',
    label: 'subject',
    explanation: 'Marks the grammatical subject, often introducing new information or emphasizing who/what performs the action.',
    category: 'case',
  },
  'を': {
    key: 'wo',
    role: 'direct-object marker',
    label: 'object',
    explanation: 'Marks the direct object — the thing the action is done to. Also marks the path traversed with motion verbs.',
    category: 'case',
  },
  'に': {
    key: 'ni',
    role: 'target/location marker',
    label: 'target',
    explanation: 'Marks a target, destination, point in time, location of existence, or indirect object ("to/at/in").',
    category: 'case',
  },
  'で': {
    key: 'de',
    role: 'means/location marker',
    label: 'means/place',
    explanation: 'Marks where an action happens or the means/instrument by which it is done ("at/by/with").',
    category: 'case',
  },
  'と': {
    key: 'to',
    role: 'companion/quotation marker',
    label: 'with/quote',
    explanation: 'Marks accompaniment ("with"), an exhaustive "and" between nouns, or a quotation before verbs like 言う and 思う.',
    category: 'case',
  },
  'も': {
    key: 'mo',
    role: 'inclusive marker',
    label: 'also',
    explanation: 'Means "also/too", replacing は or が to add the marked item to something previously mentioned. Doubled (〜も〜も) it means "both … and".',
    category: 'binding',
  },
  'の': {
    key: 'no',
    role: 'possessive/attributive marker',
    label: 'of',
    explanation: 'Links nouns ("X\'s Y", "Y of X"), nominalizes verbs, or softens questions at sentence end.',
    category: 'case',
  },
  'へ': {
    key: 'he',
    role: 'direction marker',
    label: 'toward',
    explanation: 'Marks the direction of movement ("toward"). Slightly more literary than に and focuses on the journey rather than arrival.',
    category: 'case',
  },
  'から': {
    key: 'kara',
    role: 'source/reason marker',
    label: 'from/because',
    explanation: 'After a noun: starting point ("from"). After a clause: reason ("because").',
    category: 'case',
  },
  'まで': {
    key: 'made',
    role: 'limit marker',
    label: 'until',
    explanation: 'Marks the end point in time or space ("until/as far as"), sometimes with a nuance of "even".',
    category: 'case',
  },
  'より': {
    key: 'yori',
    role: 'comparison marker',
    label: 'than',
    explanation: 'Marks the standard of comparison ("than"), or a formal starting point ("from") in written Japanese.',
    category: 'case',
  },
  'ば': {
    key: 'ba',
    role: 'conditional marker',
    label: 'if',
    explanation: 'Attaches to the conditional verb stem to mean "if/when" — a general, logical condition.',
    category: 'conjunctive',
  },
  'し': {
    key: 'shi',
    role: 'reason-listing connector',
    label: 'and also',
    explanation: 'Lists multiple reasons or qualities non-exhaustively ("…and what\'s more…").',
    category: 'conjunctive',
  },
  'ので': {
    key: 'node',
    role: 'reason connector',
    label: 'because',
    explanation: 'Gives an objective, softer-sounding reason ("because/since") — more polite than から.',
    category: 'conjunctive',
  },
  'のに': {
    key: 'noni',
    role: 'contrast connector',
    label: 'even though',
    explanation: 'Marks an unexpected contrast ("even though/despite"), often with a nuance of complaint or surprise.',
    category: 'conjunctive',
  },
  'ながら': {
    key: 'nagara',
    role: 'simultaneous-action connector',
    label: 'while',
    explanation: 'Attaches to a verb stem: two actions performed at the same time ("while doing").',
    category: 'conjunctive',
  },
  'たり': {
    key: 'tari',
    role: 'example-listing connector',
    label: 'things like',
    explanation: 'Lists representative actions non-exhaustively ("doing things like X and Y"), usually ending in する.',
    category: 'parallel',
  },
  'や': {
    key: 'ya',
    role: 'non-exhaustive "and"',
    label: 'and (etc.)',
    explanation: 'Joins nouns as an open-ended list ("X and Y, among others") — unlike と, which is exhaustive.',
    category: 'parallel',
  },
  'か': {
    key: 'ka',
    role: 'question/alternative marker',
    label: 'question/or',
    explanation: 'At sentence end: turns the sentence into a question. Between nouns: "or".',
    category: 'sentence-final',
  },
  'ね': {
    key: 'ne',
    role: 'agreement-seeking ending',
    label: 'right?',
    explanation: 'Sentence-final: seeks agreement or confirmation ("…, right?"), softening the statement.',
    category: 'sentence-final',
  },
  'よ': {
    key: 'yo',
    role: 'assertive ending',
    label: 'emphasis',
    explanation: 'Sentence-final: asserts information the speaker believes is new to the listener ("I\'m telling you…").',
    category: 'sentence-final',
  },
  'な': {
    key: 'na',
    role: 'emotive/prohibitive ending',
    label: 'emotive',
    explanation: 'Sentence-final: emotive self-directed remark ("…, huh"), or after a dictionary-form verb, a strong prohibition ("don\'t").',
    category: 'sentence-final',
  },
  'わ': {
    key: 'waFinal',
    role: 'soft assertive ending',
    label: 'soft emphasis',
    explanation: 'Sentence-final: adds gentle emphasis; in standard Japanese it reads as feminine speech.',
    category: 'sentence-final',
  },
  'ぞ': {
    key: 'zo',
    role: 'strong assertive ending',
    label: 'strong emphasis',
    explanation: 'Sentence-final: strong, rough emphasis, typically masculine or self-directed ("…for sure!").',
    category: 'sentence-final',
  },
  'かな': {
    key: 'kana',
    role: 'wondering ending',
    label: 'I wonder',
    explanation: 'Sentence-final: expresses wondering to oneself ("I wonder if…").',
    category: 'sentence-final',
  },
  'だけ': {
    key: 'dake',
    role: 'limiting marker',
    label: 'only',
    explanation: 'Means "only/just" — limits the marked item to exactly what is stated.',
    category: 'adverbial',
  },
  'しか': {
    key: 'shika',
    role: 'exclusive marker (with negative)',
    label: 'nothing but',
    explanation: 'Always pairs with a negative verb: "nothing but/only", stressing insufficiency.',
    category: 'adverbial',
  },
  'ばかり': {
    key: 'bakari',
    role: 'exclusivity/recency marker',
    label: 'just/only',
    explanation: 'Means "nothing but" (doing only that), or right after a た-form verb, "just finished doing".',
    category: 'adverbial',
  },
  'など': {
    key: 'nado',
    role: 'exemplifying marker',
    label: 'etc.',
    explanation: 'Means "and so on / things like", sometimes with a dismissive nuance.',
    category: 'adverbial',
  },
  'くらい': {
    key: 'kurai',
    role: 'approximation marker',
    label: 'about',
    explanation: 'Marks an approximate extent or amount ("about/to the extent that"), sometimes minimizing ("at least").',
    category: 'adverbial',
  },
  'ぐらい': {
    key: 'gurai',
    role: 'approximation marker',
    label: 'about',
    explanation: 'Variant of くらい: approximate extent or amount ("about/to the extent that").',
    category: 'adverbial',
  },
  'ほど': {
    key: 'hodo',
    role: 'extent marker',
    label: 'to the extent',
    explanation: 'Marks degree or extent ("so much that / not as … as" with a negative).',
    category: 'adverbial',
  },
  'こそ': {
    key: 'koso',
    role: 'emphatic marker',
    label: 'precisely',
    explanation: 'Emphasizes the marked word as the one that truly applies ("this, precisely, is…").',
    category: 'adverbial',
  },
  'さえ': {
    key: 'sae',
    role: '"even" marker',
    label: 'even',
    explanation: 'Means "even" (an extreme example), or with the conditional, "if only".',
    category: 'adverbial',
  },
  'でも': {
    key: 'demo',
    role: '"even/or something" marker',
    label: 'even/for example',
    explanation: 'After a noun: "even" or a softened example ("tea or something"). At sentence start it is the conjunction "but".',
    category: 'adverbial',
  },
  'って': {
    key: 'tte',
    role: 'colloquial quotation/topic marker',
    label: 'quote (casual)',
    explanation: 'Colloquial と/という: quotes speech or casually raises a topic ("speaking of…").',
    category: 'case',
  },
  'とか': {
    key: 'toka',
    role: 'vague-listing marker',
    label: 'like/such as',
    explanation: 'Lists examples vaguely ("things like X and Y"), common in casual speech.',
    category: 'parallel',
  },
  'なら': {
    key: 'nara',
    role: 'contextual conditional',
    label: 'if (as for)',
    explanation: 'Conditional "if it\'s the case that / as for X", picking up something from context.',
    category: 'conjunctive',
  },
  'けど': {
    key: 'kedo',
    role: 'contrast connector',
    label: 'but',
    explanation: 'Connects clauses with "but/although"; also softens the end of a sentence.',
    category: 'conjunctive',
  },
};

/**
 * Generic fallback per IPADIC pos_detail_1 subtype, so a particle missing from
 * the curated table still gets a sensible label. Subtype strings should be
 * spot-checked against the bundled dictionary when extending this list.
 */
export const PARTICLE_CATEGORY_FALLBACK: Record<string, ParticleRole> = {
  '格助詞': {
    key: 'case',
    role: 'case particle',
    label: 'case',
    explanation: 'A case particle — marks the grammatical role (subject, object, direction, etc.) of the word before it.',
    category: 'case',
  },
  '係助詞': {
    key: 'binding',
    role: 'binding particle',
    label: 'binding',
    explanation: 'A binding particle — highlights or contrasts the marked word, affecting the emphasis of the whole sentence.',
    category: 'binding',
  },
  '副助詞': {
    key: 'adverbial',
    role: 'adverbial particle',
    label: 'adverbial',
    explanation: 'An adverbial particle — adds a nuance such as limitation, degree, or example to the word before it.',
    category: 'adverbial',
  },
  '接続助詞': {
    key: 'conjunctive',
    role: 'conjunctive particle',
    label: 'connector',
    explanation: 'A conjunctive particle — links clauses, expressing condition, reason, contrast, or sequence.',
    category: 'conjunctive',
  },
  '終助詞': {
    key: 'final',
    role: 'sentence-final particle',
    label: 'sentence-final',
    explanation: 'A sentence-final particle — adds the speaker\'s attitude (question, emphasis, agreement-seeking) to the sentence.',
    category: 'sentence-final',
  },
  '並立助詞': {
    key: 'parallel',
    role: 'parallel particle',
    label: 'listing',
    explanation: 'A parallel particle — joins words of equal status into a list.',
    category: 'parallel',
  },
  '副助詞／並立助詞／終助詞': {
    key: 'multi',
    role: 'multi-role particle',
    label: 'particle',
    explanation: 'A particle that can act as adverbial, parallel, or sentence-final depending on position.',
    category: 'other',
  },
  '連体化': {
    key: 'attributive',
    role: 'attributive particle',
    label: 'attributive',
    explanation: 'Turns the preceding word into a modifier of the following noun (the の in noun-linking).',
    category: 'case',
  },
  '接続助詞的': {
    key: 'connectorLike',
    role: 'connector-like particle',
    label: 'connector',
    explanation: 'Functions like a conjunctive particle, linking what precedes to what follows.',
    category: 'conjunctive',
  },
  '特殊': {
    key: 'special',
    role: 'special particle',
    label: 'particle',
    explanation: 'A special-use particle with an idiomatic function in this construction.',
    category: 'other',
  },
};

const GENERIC_PARTICLE: ParticleRole = {
  key: 'generic',
  role: 'particle',
  label: 'particle',
  explanation: 'A grammatical particle — attaches to the previous word to show its function in the sentence.',
  category: 'other',
};

/** Resolve a particle's role: curated surface form first, then subtype bucket. */
export function particleRole(surface: string, posDetail?: string): ParticleRole {
  return (
    PARTICLE_ROLES[surface] ??
    (posDetail ? PARTICLE_CATEGORY_FALLBACK[posDetail] : undefined) ??
    GENERIC_PARTICLE
  );
}
