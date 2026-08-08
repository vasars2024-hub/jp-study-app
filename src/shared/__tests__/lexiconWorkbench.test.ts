import { describe, expect, it } from 'vitest';
import {
  classifyLexiconInput,
  LEXICON_COMPATIBILITY_ALIASES,
  normalizeLexiconText,
  resolveLexiconInput,
  resolveLexiconRoute,
} from '../lexiconWorkbench';

describe('Lexicon Workbench compatibility routes', () => {
  it('maps legacy Dictionary and Translate routes to the canonical route and lens', () => {
    expect(resolveLexiconRoute(' dictionary ')).toEqual({
      route: 'lexicon',
      lens: 'lookup',
      compatibilityAlias: 'dictionary',
    });
    expect(resolveLexiconRoute('TRANSLATE')).toEqual({
      route: 'lexicon',
      lens: 'translate',
      compatibilityAlias: 'translate',
    });
    expect(resolveLexiconRoute('lexicon-workbench')).toEqual({ route: 'lexicon', lens: 'auto' });
    expect(resolveLexiconRoute('media')).toBeNull();
    expect(LEXICON_COMPATIBILITY_ALIASES.dictionary.route).toBe('lexicon');
  });
});

describe('Lexicon Workbench input scale selection', () => {
  it('normalizes line endings and keeps the input content intact', () => {
    expect(normalizeLexiconText('  猫\r\n\r\n犬  ')).toBe('猫\n\n犬');
  });

  it('selects lookup for a character or lexical unit', () => {
    expect(classifyLexiconInput('猫')).toBe('character');
    expect(resolveLexiconInput('to eat')).toMatchObject({ kind: 'word', lens: 'lookup', automatic: true });
  });

  it('selects translation for sentences and longer passages', () => {
    expect(resolveLexiconInput('猫が窓辺で寝ている。')).toMatchObject({
      kind: 'sentence',
      lens: 'translate',
    });
    expect(resolveLexiconInput('First sentence. Second sentence.')).toMatchObject({
      kind: 'paragraph',
      lens: 'translate',
    });
    expect(classifyLexiconInput('one\n\ntwo\n\nthree')).toBe('document');
  });

  it('allows a manual analysis lens for ambiguous input', () => {
    expect(resolveLexiconInput('to eat', 'analysis')).toMatchObject({
      kind: 'word',
      lens: 'analysis',
      automatic: false,
    });
  });
});
