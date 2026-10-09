// @vitest-environment node
/**
 * dict3 — Yomitan parity, the pure halves: the conjugation trace, JMdict priority
 * codes, per-sense structured content, the grouped/merged layout, the audio
 * source list and the "in Anki" target set.
 */
import { describe, expect, it } from 'vitest';
import { deinflect } from '../deinflect';
import {
  DEINFLECT_KNOWN_REASONS,
  deinflectStepInfo,
  deinflectTraceSteps,
  sameDeinflectChain,
} from '../deinflectTrace';
import {
  isJmdictCommon,
  isJmdictPriorityCode,
  jmdictPriorityCodes,
  jmdictPriorityExplanation,
} from '../jmdictPriority';
import { extractStructuredSenses } from '../structuredSenses';
import {
  arrangeWireEntries,
  buildDictCards,
  dictionaryRanker,
  normalizeDictDisplayPrefs,
  visibleSections,
} from '../dictDisplay';
import {
  localAudioFileKeys,
  localAudioLookupKeys,
  normalizeAudioSourcesPrefs,
  nextLocalAudioSourceId,
} from '../audioSources';
import { ankiPresenceTargets } from '../ankiPresenceTargets';
import type { DictEntry } from '../types';

describe('conjugation trace', () => {
  it('names every step of 食べさせられなかった in order, innermost first', () => {
    const hit = deinflect('食べさせられなかった').find((d) => d.term === '食べる');
    expect(hit?.reasons).toEqual(['causative', 'passive/potential', 'negative', 'past']);
    const steps = deinflectTraceSteps(hit?.reasons);
    expect(steps.map((s) => s.labelKey)).toEqual([
      'deinflect.reason.causative',
      'deinflect.reason.passivePotential',
      'deinflect.reason.negative',
      'deinflect.reason.past',
    ]);
    // Causative and passive are taught by a grammar point; plain negative and past are not.
    expect(steps.map((s) => s.grammarId)).toEqual(['n4-causative', 'n4-passive', null, null]);
  });

  it('keeps an unknown reason as written, and drops empty and repeated steps', () => {
    expect(deinflectTraceSteps(['', 'gen. pl.', 'gen. pl.', 'past'])).toEqual([
      { reason: 'gen. pl.', labelKey: null, grammarId: null },
      { reason: 'past', labelKey: 'deinflect.reason.past', grammarId: null },
    ]);
    expect(deinflectStepInfo('nope')).toEqual({ labelKey: null, grammarId: null });
  });

  it('names every reason the de-inflector can produce', () => {
    // Every reason string used by a rule in shared/deinflect.ts must have a label.
    const probes = ['食べます', '食べません', '食べました', '食べませんでした', '食べましょう', '食べて', '食べさせる',
      '飲まれる', '食べられる', '飲める', '食べよう', '食べろ', '食べれば', '食べたら', '食べたり', '食べたい',
      '食べすぎる', '高く', '食べている', '食べてしまう', '食べちゃう', '食べておく', '食べない', '食べた'];
    const seen = new Set(probes.flatMap((p) => deinflect(p).flatMap((d) => d.reasons)));
    for (const reason of seen) expect(DEINFLECT_KNOWN_REASONS).toContain(reason);
  });

  it('tells a repeated chain from a different one', () => {
    expect(sameDeinflectChain(['past'], ['past'])).toBe(true);
    expect(sameDeinflectChain(['past'], ['negative', 'past'])).toBe(false);
    expect(sameDeinflectChain(undefined, [])).toBe(true);
  });
});

describe('JMdict priority codes', () => {
  it('recognises exactly the JMdict codes', () => {
    for (const code of ['news1', 'news2', 'ichi1', 'ichi2', 'spec1', 'spec2', 'gai1', 'gai2', 'nf01', 'nf48']) {
      expect(isJmdictPriorityCode(code)).toBe(true);
    }
    for (const code of ['P', '★', 'news3', 'nf00', 'nf49', 'nf5', 'common', '']) {
      expect(isJmdictPriorityCode(code)).toBe(false);
    }
  });

  it('keeps only the codes, deduplicated, in JMdict order', () => {
    expect(jmdictPriorityCodes(['P', 'nf04', 'ichi1', 'news1', 'v1', 'news1'])).toEqual(['news1', 'ichi1', 'nf04']);
    expect(jmdictPriorityCodes(undefined)).toEqual([]);
  });

  it('counts only the lists JMdict itself calls common', () => {
    expect(isJmdictCommon(['news1'])).toBe(true);
    expect(isJmdictCommon(['spec2'])).toBe(true);
    expect(isJmdictCommon(['news2', 'nf30'])).toBe(false);
  });

  it('explains a band with its rank range', () => {
    expect(jmdictPriorityExplanation('nf05')).toEqual({ key: 'dict3.prio.nf', params: { from: 2001, to: 2500 } });
    expect(jmdictPriorityExplanation('gai1')).toEqual({ key: 'dict3.prio.gai1' });
    expect(jmdictPriorityExplanation('xyz')).toBeNull();
  });
});

/** A Jitendex-style structured definition: two sense groups, POS on the group, misc on a sense. */
const JITENDEX = {
  type: 'structured-content',
  content: [
    {
      tag: 'ul',
      data: { content: 'sense-groups' },
      content: [
        {
          tag: 'li',
          data: { content: 'sense-group' },
          content: [
            { tag: 'span', title: 'Ichidan verb', data: { content: 'part-of-speech-info', code: 'v1' }, content: 'ichidan' },
            { tag: 'span', title: 'transitive verb', data: { content: 'part-of-speech-info', code: 'vt' }, content: 'transitive' },
            {
              tag: 'ol',
              content: [
                {
                  tag: 'li',
                  data: { content: 'sense' },
                  content: [
                    { tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: 'to eat' }] },
                  ],
                },
                {
                  tag: 'li',
                  data: { content: 'sense' },
                  content: [
                    { tag: 'span', title: 'colloquialism', data: { content: 'misc-info', code: 'col' }, content: 'col' },
                    { tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: 'to live on' }, { tag: 'li', content: 'to make a living' }] },
                  ],
                },
              ],
            },
          ],
        },
        {
          tag: 'li',
          data: { content: 'sense-group' },
          content: [
            { tag: 'span', data: { content: 'part-of-speech-info', code: 'n' }, content: 'noun' },
            { tag: 'div', data: { content: 'sense' }, content: [{ tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: 'eating' }] }] },
          ],
        },
      ],
    },
  ],
};

describe('structured senses', () => {
  it('splits marked senses and keeps each one’s part of speech and usage tags', () => {
    const senses = extractStructuredSenses(JITENDEX);
    expect(senses?.map(({ partsOfSpeech, tags, definitions }) => ({ partsOfSpeech, tags, definitions }))).toEqual([
      { partsOfSpeech: ['v1', 'vt'], tags: [], definitions: ['to eat'] },
      { partsOfSpeech: ['v1', 'vt'], tags: ['colloquialism'], definitions: ['to live on', 'to make a living'] },
      { partsOfSpeech: ['n'], tags: [], definitions: ['eating'] },
    ]);
  });

  it('removes the tag nodes from the sense it hands back for rendering', () => {
    const senses = extractStructuredSenses(JITENDEX);
    expect(JSON.stringify(senses?.[1].content)).not.toContain('misc-info');
    expect(JSON.stringify(senses?.[1].content)).toContain('to live on');
  });

  it('declines content that marks no senses, or senses with no tags', () => {
    expect(extractStructuredSenses({ type: 'structured-content', content: { tag: 'ul', content: [{ tag: 'li', content: 'cat' }] } })).toBeNull();
    expect(extractStructuredSenses({ tag: 'div', data: { content: 'sense' }, content: 'plain' })).toBeNull();
    expect(extractStructuredSenses('cat')).toBeNull();
  });
});

const entry = (word: string, reading: string, source: string, defs: string[], extra: Partial<DictEntry> = {}): DictEntry => ({
  word, reading, isCommon: false, jlpt: [], source,
  senses: [{ partsOfSpeech: [], definitions: defs, tags: [] }],
  ...extra,
});

describe('result layout', () => {
  it('normalizes anything into a valid preference set', () => {
    expect(normalizeDictDisplayPrefs(null)).toEqual({ mode: 'grouped', collapseSecondary: true });
    expect(normalizeDictDisplayPrefs({ mode: 'merged', collapseSecondary: false })).toEqual({ mode: 'merged', collapseSecondary: false });
    expect(normalizeDictDisplayPrefs({ mode: 'split' }).mode).toBe('grouped');
  });

  it('folds one headword from several dictionaries into one card, sections in dictionary order', () => {
    const entries = [
      entry('猫', 'ねこ', 'JMdict', ['cat']),
      entry('猫舌', 'ねこじた', 'JMdict', ['cat tongue']),
      entry('猫', 'ねこ', 'Jitendex', ['feline']),
    ];
    const cards = buildDictCards(entries.map((e, index) => ({ entry: e, index })), dictionaryRanker(['Jitendex', 'JMdict']));
    expect(cards.map((c) => c.entryIndexes)).toEqual([[0, 2], [1]]);
    expect(cards[0].sections.map((s) => s.source)).toEqual(['Jitendex', 'JMdict']);
  });

  it('splits a database-merged entry by the dictionary each sense came from', () => {
    const merged = entry('猫', 'ねこ', 'JMdict', [], {
      senses: [
        { partsOfSpeech: ['n'], definitions: ['cat'], tags: [], source: 'JMdict' },
        { partsOfSpeech: [], definitions: ['кошка'], tags: [], source: 'JMdict RU' },
      ],
    });
    const [card] = buildDictCards([{ entry: merged, index: 0 }]);
    expect(card.sections.map((s) => [s.source, s.senses.length])).toEqual([['JMdict', 1], ['JMdict RU', 1]]);
  });

  it('collapses every section after the first until expanded, grouped mode only', () => {
    const [card] = buildDictCards([
      { entry: entry('猫', 'ねこ', 'A', ['a']), index: 0 },
      { entry: entry('猫', 'ねこ', 'B', ['b']), index: 1 },
      { entry: entry('猫', 'ねこ', 'C', ['c']), index: 2 },
    ]);
    expect(visibleSections(card, { mode: 'grouped', collapseSecondary: true }, false)).toMatchObject({ hidden: 2 });
    expect(visibleSections(card, { mode: 'grouped', collapseSecondary: true }, true).hidden).toBe(0);
    expect(visibleSections(card, { mode: 'grouped', collapseSecondary: false }, false).shown).toHaveLength(3);
    expect(visibleSections(card, { mode: 'merged', collapseSecondary: true }, false).shown).toHaveLength(3);
  });

  it('arranges the extension’s entries: grouped marks secondaries collapsed, merged folds them', () => {
    const list = [
      entry('猫', 'ねこ', 'B', ['b'], { isCommon: true }),
      entry('犬', 'いぬ', 'A', ['dog']),
      entry('猫', 'ねこ', 'A', ['a'], { frequency: 9 }),
    ];
    const grouped = arrangeWireEntries(list, { mode: 'grouped', collapseSecondary: true }, ['A', 'B']);
    expect(grouped.map((e) => [e.word, e.source, e.collapsed === true])).toEqual([
      ['猫', 'A', false], ['猫', 'B', true], ['犬', 'A', false],
    ]);
    const merged = arrangeWireEntries(list, { mode: 'merged', collapseSecondary: true }, ['A', 'B']);
    expect(merged).toHaveLength(2);
    expect(merged[0].senses.map((s) => [s.source, s.definitions[0]])).toEqual([['A', 'a'], ['B', 'b']]);
    expect(merged[0].isCommon).toBe(true);
    expect(merged[0].frequency).toBe(9);
  });
});

describe('audio sources', () => {
  it('always keeps the CDN source and drops malformed rows', () => {
    expect(normalizeAudioSourcesPrefs(undefined)).toEqual({ sources: [{ id: 'jpod101', kind: 'jpod101', enabled: true }] });
    const prefs = normalizeAudioSourcesPrefs({
      sources: [
        { kind: 'local', folder: ' D:/audio ', enabled: true, id: 'local-1' },
        { kind: 'local', folder: '' },
        { kind: 'jpod101', enabled: false },
        { kind: 'jpod101' },
        { kind: 'evil', folder: 'x' },
      ],
    });
    expect(prefs.sources).toEqual([
      { id: 'local-1', kind: 'local', enabled: true, folder: 'D:/audio' },
      { id: 'jpod101', kind: 'jpod101', enabled: false },
    ]);
    expect(nextLocalAudioSourceId(prefs)).toBe('local-2');
  });

  it('reads both common local-audio file layouts', () => {
    expect(localAudioFileKeys('たべる - 食べる')).toEqual(['pair:食べる\u0001たべる']);
    expect(localAudioFileKeys('食べる')).toEqual(['word:食べる']);
  });

  it('probes the exact pair first and a bare reading only for a kana word', () => {
    expect(localAudioLookupKeys('食べる', 'たべる')).toEqual(['pair:食べる\u0001たべる', 'pair:食べる\u0001食べる', 'word:食べる']);
    expect(localAudioLookupKeys('ねこ', 'ねこ')).toEqual(['pair:ねこ\u0001ねこ', 'word:ねこ']);
  });
});

describe('Anki presence targets', () => {
  const profile = (id: string, targetLang: 'ja' | 'zh' | 'ru', deckName: string, modelName: string, term?: string) => ({
    id, label: id.toUpperCase(), targetLang,
    anki: { deckName, modelName, ...(term ? { fieldMap: { term } } : {}) },
  });

  it('asks the routed profile, the active one and every profile for the language, once each', () => {
    const profiles = [
      profile('p1', 'ja', 'Vocab', 'Lapis'),
      profile('p2', 'ja', 'Sentences', 'Sentence', 'Word'),
      profile('p3', 'zh', 'Hanzi', 'Basic'),
      profile('p4', 'ja', 'Vocab', 'Lapis'),
      profile('p5', 'ja', 'Mined', 'Lapis'),
    ];
    const rules = [{ id: 'r', enabled: true, label: 'r', match: { source: 'dictionary' as const, language: 'ja' as const }, profileId: 'p5' }];
    const targets = ankiPresenceTargets(profiles, rules, 'p1', 'ja');
    expect(targets.map((t) => `${t.deckName}/${t.modelName}/${t.termField ?? ''}`)).toEqual([
      'Mined/Lapis/', 'Vocab/Lapis/', 'Sentences/Sentence/Word',
    ]);
  });

  it('skips profiles with no deck or note type', () => {
    expect(ankiPresenceTargets([profile('p1', 'ja', '', 'Lapis')], [], 'p1', 'ja')).toEqual([]);
  });
});
