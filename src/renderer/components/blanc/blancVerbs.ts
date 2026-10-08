/**
 * Master search command verbs: a letter, a space, an argument — and the action
 * runs on Enter, with no tool to open first and no field to find.
 *
 *   d <word>      dictionary lookup        t <text>   translate
 *   m <sentence>  mine to the deck          r          start a Flow run
 *   g <point>     grammar point             n <text>   quick note
 *   o <tool>      open a tool               c [text]   capture to the inbox
 *   i             open the Capture inbox    ?          list the verbs
 *
 * The verbs themselves are literal (they are keys, not words), and only their
 * descriptions are translated. A query is a verb only when the letter is the
 * whole first token: `d 猫` and `d` are verbs, `do` and `dog` are searches.
 * Pure: blancVerbs.test.ts.
 */

export type BlancVerbId = 'd' | 't' | 'm' | 'r' | 'g' | 'n' | 'o' | 'c' | 'i' | '?';

export interface BlancVerbDef {
  id: BlancVerbId;
  /** Whether the verb needs an argument before Enter can run it. */
  needsArg: boolean;
  /** Whether an argument is accepted at all. */
  takesArg: boolean;
}

export const BLANC_VERBS: readonly BlancVerbDef[] = [
  { id: 'd', needsArg: true, takesArg: true },
  { id: 't', needsArg: true, takesArg: true },
  { id: 'm', needsArg: true, takesArg: true },
  { id: 'r', needsArg: false, takesArg: false },
  { id: 'g', needsArg: true, takesArg: true },
  { id: 'n', needsArg: true, takesArg: true },
  { id: 'o', needsArg: true, takesArg: true },
  { id: 'c', needsArg: false, takesArg: true },
  { id: 'i', needsArg: false, takesArg: false },
  { id: '?', needsArg: false, takesArg: false },
];

const VERB_BY_ID = new Map(BLANC_VERBS.map((verb) => [verb.id, verb]));

export interface ParsedBlancVerb {
  verb: BlancVerbId;
  /** Trimmed argument ('' when none). Internal whitespace is kept. */
  arg: string;
  /** False while a required argument is still missing (Enter does nothing yet). */
  ready: boolean;
}

/**
 * Parse a Master search query as a verb, or return null for an ordinary search.
 *
 * Accepted: `x`, `x ` and `x <arg>` for a verb letter x (case-insensitive, any
 * Unicode space including the ideographic one an IME types), plus `?` alone.
 * A verb that takes no argument stops being a verb when one follows (`r abc`
 * is a search for "r abc"), so a search can never be swallowed by accident.
 */
export function parseBlancVerb(query: string): ParsedBlancVerb | null {
  const text = query.replace(/^\s+/, '');
  if (!text) return null;
  const match = /^(\S)(?:[\s\u3000]+([\s\S]*))?$/u.exec(text);
  if (!match) return null;
  const letter = match[1].toLowerCase();
  const def = VERB_BY_ID.get(letter as BlancVerbId);
  if (!def) return null;
  const arg = (match[2] ?? '').replace(/[\s\u3000]+$/u, '');
  if (arg && !def.takesArg) return null;
  return { verb: def.id, arg, ready: !def.needsArg || arg.length > 0 };
}

/** Catalog key of a verb's one-line description (`blanc.mech.verb.<x>.desc`). */
export function verbDescriptionKey(verb: BlancVerbId): string {
  return `blanc.mech.verb.${verb === '?' ? 'help' : verb}.desc`;
}

/** Catalog key of a verb's action line, which may carry `{arg}`. */
export function verbActionKey(verb: BlancVerbId, hasArg: boolean): string {
  const id = verb === '?' ? 'help' : verb;
  return hasArg ? `blanc.mech.verb.${id}.run` : `blanc.mech.verb.${id}.empty`;
}

/** Catalog key naming a verb's argument ("word", "text"), for verbs that take one. */
const VERB_ARG_KEYS: Partial<Record<BlancVerbId, string>> = {
  d: 'blanc.mech.verb.arg.d',
  t: 'blanc.mech.verb.arg.t',
  m: 'blanc.mech.verb.arg.m',
  g: 'blanc.mech.verb.arg.g',
  n: 'blanc.mech.verb.arg.n',
  o: 'blanc.mech.verb.arg.o',
  c: 'blanc.mech.verb.arg.c',
};

export function verbArgKey(verb: BlancVerbId): string | null {
  return VERB_ARG_KEYS[verb] ?? null;
}

/** The literal syntax shown in the hint row and the `?` list (`d <word>`). */
export function verbSyntax(verb: BlancVerbId, argLabel: string): string {
  const def = VERB_BY_ID.get(verb);
  if (!def || !def.takesArg) return verb;
  return def.needsArg ? `${verb} <${argLabel}>` : `${verb} [${argLabel}]`;
}
