import { describe, expect, it } from 'vitest';
import {
  BLANC_VERBS,
  parseBlancVerb,
  verbActionKey,
  verbDescriptionKey,
  verbSyntax,
} from '../components/blanc/blancVerbs';
import { CATALOGS } from '../../shared/i18n/catalogs/all';

describe('parseBlancVerb', () => {
  it('reads a verb letter, a space and the argument', () => {
    expect(parseBlancVerb('d 猫')).toEqual({ verb: 'd', arg: '猫', ready: true });
    expect(parseBlancVerb('t  今日は いい天気  ')).toEqual({ verb: 't', arg: '今日は いい天気', ready: true });
    expect(parseBlancVerb('m 猫が好きです。')).toEqual({ verb: 'm', arg: '猫が好きです。', ready: true });
  });

  it('accepts the ideographic space an IME types, and either case', () => {
    expect(parseBlancVerb('d　猫')).toEqual({ verb: 'd', arg: '猫', ready: true });
    expect(parseBlancVerb('D cat')).toEqual({ verb: 'd', arg: 'cat', ready: true });
  });

  it('is not ready until a required argument is typed', () => {
    expect(parseBlancVerb('d')).toEqual({ verb: 'd', arg: '', ready: false });
    expect(parseBlancVerb('g ')).toEqual({ verb: 'g', arg: '', ready: false });
  });

  it('runs argument-free verbs alone', () => {
    expect(parseBlancVerb('r')).toEqual({ verb: 'r', arg: '', ready: true });
    expect(parseBlancVerb('i')).toEqual({ verb: 'i', arg: '', ready: true });
    expect(parseBlancVerb('?')).toEqual({ verb: '?', arg: '', ready: true });
    expect(parseBlancVerb('c')).toEqual({ verb: 'c', arg: '', ready: true });
    expect(parseBlancVerb('c 猫')).toEqual({ verb: 'c', arg: '猫', ready: true });
  });

  it('never swallows an ordinary search', () => {
    expect(parseBlancVerb('')).toBeNull();
    expect(parseBlancVerb('   ')).toBeNull();
    expect(parseBlancVerb('dictionary')).toBeNull();
    expect(parseBlancVerb('do')).toBeNull();
    expect(parseBlancVerb('猫')).toBeNull();
    expect(parseBlancVerb('x files')).toBeNull();
    // An argument-free verb with text after it is a search for that text.
    expect(parseBlancVerb('r abc')).toBeNull();
    expect(parseBlancVerb('i love')).toBeNull();
  });

  it('keeps the argument as typed, multi-line included', () => {
    expect(parseBlancVerb('n line one\nline two')?.arg).toBe('line one\nline two');
  });
});

describe('verb presentation', () => {
  it('shows literal syntax', () => {
    expect(verbSyntax('d', 'word')).toBe('d <word>');
    expect(verbSyntax('c', 'text')).toBe('c [text]');
    expect(verbSyntax('r', '')).toBe('r');
  });

  it('has a description and an action line for every verb in all four languages', () => {
    const keys = new Set<string>();
    for (const verb of BLANC_VERBS) {
      keys.add(verbDescriptionKey(verb.id));
      if (verb.id === '?') continue;
      if (verb.takesArg) keys.add(verbActionKey(verb.id, true));
      if (!verb.needsArg) keys.add(verbActionKey(verb.id, false));
      if (verb.takesArg) keys.add(`blanc.mech.verb.arg.${verb.id}`);
    }
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      const catalog = CATALOGS[lang] as Record<string, unknown>;
      expect([...keys].filter((key) => catalog[key] === undefined), lang).toEqual([]);
    }
  });
});
