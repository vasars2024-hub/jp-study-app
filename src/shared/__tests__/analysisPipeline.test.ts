import { describe, expect, it } from 'vitest';
import {
  buildSentenceAnalysisPrompt,
  buildSentenceAnalysisSchema,
  parseSentenceAnalysis,
  type SentenceAnalysisResult,
  type SentenceAnnotation,
} from '../sentenceAnalysisCore';
import {
  analysisPrefsFingerprint,
  DEFAULT_ANALYSIS_PREFS,
  normalizeAnalysisPrefs,
  type SentenceAnalysisPrefs,
} from '../sentenceAnalysisPrefs';
import { buildAnalysisSnapshot, markedSentence } from '../analysisSnapshot';
import { buildAnalysisMineRequest, buildSentenceMineRequest } from '../analysisMining';
import {
  analysisCommandForKey,
  isTextEntryTarget,
  ANALYSIS_SHORTCUT_HINTS,
} from '../analysisShortcuts';

const SENTENCE = '人生は選択の連続だ。';

function prefs(over: Partial<SentenceAnalysisPrefs> = {}): SentenceAnalysisPrefs {
  return normalizeAnalysisPrefs({ ...DEFAULT_ANALYSIS_PREFS, ...over });
}

function annotation(over: Partial<SentenceAnnotation> = {}): SentenceAnnotation {
  return {
    text: '人生は',
    start: 0,
    end: 3,
    category: 'particle',
    meaning: 'marks 人生 as the topic',
    explanation: 'は sets what the sentence is about.',
    examples: [],
    vocabulary: [],
    ...over,
  };
}

function result(over: Partial<SentenceAnalysisResult> = {}): SentenceAnalysisResult {
  return {
    sentence: SENTENCE,
    translations: { en: 'Life is a series of choices.', zh: '人生是一连串的选择。' },
    formality: { level: 'Casual (plain form)', note: 'Said to a peer.' },
    difficulty: 'N3',
    structure: 'Single clause with a topic.',
    annotations: [annotation()],
    nuance: ['Reads as a maxim.'],
    pitfalls: ['Do not read だ as polite.'],
    ...over,
  };
}

describe('normalizeAnalysisPrefs', () => {
  it('fills defaults from an empty object', () => {
    expect(normalizeAnalysisPrefs({})).toEqual(DEFAULT_ANALYSIS_PREFS);
  });

  it('pins section order regardless of how they were stored', () => {
    const p = normalizeAnalysisPrefs({ sections: ['pitfalls', 'translations', 'translations'] });
    expect(p.sections).toEqual(['translations', 'pitfalls']);
  });

  it('drops section ids it does not recognize', () => {
    expect(normalizeAnalysisPrefs({ sections: ['translations', 'sparkle'] }).sections).toEqual([
      'translations',
    ]);
  });

  it('accepts an empty section list rather than silently restoring defaults', () => {
    expect(normalizeAnalysisPrefs({ sections: [] }).sections).toEqual([]);
  });

  it('normalizes tags into single tokens', () => {
    const p = normalizeAnalysisPrefs({ anki: { extraTags: ['ai analysis', '  ', 'jp'] } });
    expect(p.anki.extraTags).toEqual(['ai-analysis', 'jp']);
  });

  it('clamps custom instructions', () => {
    const p = normalizeAnalysisPrefs({ customInstructions: 'x'.repeat(900) });
    expect(p.customInstructions).toHaveLength(600);
  });
});

describe('analysisPrefsFingerprint', () => {
  it('changes when what the model returns changes', () => {
    const a = analysisPrefsFingerprint(prefs(), 'en');
    expect(analysisPrefsFingerprint(prefs({ depth: 'brief' }), 'en')).not.toBe(a);
    expect(analysisPrefsFingerprint(prefs(), 'ja')).not.toBe(a);
    expect(analysisPrefsFingerprint(prefs({ sections: ['translations'] }), 'en')).not.toBe(a);
  });

  it('ignores what happens after the call, so a good analysis stays cached', () => {
    const a = analysisPrefsFingerprint(prefs(), 'en');
    const changed = prefs({
      anki: { ...DEFAULT_ANALYSIS_PREFS.anki, deck: 'Mining', auto: true },
      snapshot: { ...DEFAULT_ANALYSIS_PREFS.snapshot, auto: true },
    });
    expect(analysisPrefsFingerprint(changed, 'en')).toBe(a);
  });
});

describe('buildSentenceAnalysisSchema', () => {
  it('omits switched-off sections so they are not generated', () => {
    const schema = buildSentenceAnalysisSchema(prefs({ sections: ['translations'] })) as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties.translations).toBeDefined();
    expect(schema.properties.formality).toBeUndefined();
    expect(schema.properties.nuance).toBeUndefined();
    expect(schema.properties.annotations).toBeDefined();
  });

  it('only requests the translation languages that are enabled', () => {
    const schema = buildSentenceAnalysisSchema(prefs({ translations: ['en'] })) as {
      properties: { translations: { properties: Record<string, unknown>; required: string[] } };
    };
    expect(Object.keys(schema.properties.translations.properties)).toEqual(['en']);
    expect(schema.properties.translations.required).toEqual(['en']);
  });

  it('drops the translations object entirely when no language is selected', () => {
    const schema = buildSentenceAnalysisSchema(prefs({ translations: [] })) as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.properties.translations).toBeUndefined();
    expect(schema.required).toEqual(['annotations']);
  });

  it('strips per-annotation examples and vocabulary when those are off', () => {
    const schema = buildSentenceAnalysisSchema(
      prefs({ sections: ['translations'] }),
    ) as { properties: { annotations: { items: { properties: Record<string, unknown> } } } };
    const props = schema.properties.annotations.items.properties;
    expect(props.examples).toBeUndefined();
    expect(props.vocabulary).toBeUndefined();
    expect(props.meaning).toBeDefined();
  });
});

describe('buildSentenceAnalysisPrompt with preferences', () => {
  it('does not mention sections that are switched off', () => {
    const prompt = buildSentenceAnalysisPrompt(
      { text: SENTENCE, lang: 'ja' },
      prefs({ sections: ['translations'] }),
    );
    expect(prompt).not.toContain('"pitfalls"');
    expect(prompt).not.toContain('"formality"');
    expect(prompt).toContain('"translations"');
  });

  it('asks only for the enabled translation languages', () => {
    const prompt = buildSentenceAnalysisPrompt(
      { text: SENTENCE, lang: 'ja' },
      prefs({ translations: ['zh'] }),
    );
    expect(prompt).toContain('"zh": a natural, idiomatic Simplified Chinese translation.');
    expect(prompt).not.toContain('"en":');
  });

  it('puts custom instructions last so they win', () => {
    const prompt = buildSentenceAnalysisPrompt(
      { text: SENTENCE, lang: 'ja' },
      prefs({ customInstructions: 'Compare with Korean.' }),
    );
    const custom = prompt.indexOf('Compare with Korean.');
    expect(custom).toBeGreaterThan(prompt.indexOf('"annotations"'));
  });

  it('carries the depth setting into the annotation instructions', () => {
    const brief = buildSentenceAnalysisPrompt({ text: SENTENCE, lang: 'ja' }, prefs({ depth: 'brief' }));
    expect(brief).toContain('Keep "explanation" to a single sentence');
    const deep = buildSentenceAnalysisPrompt({ text: SENTENCE, lang: 'ja' }, prefs({ depth: 'deep' }));
    expect(deep).not.toContain('Keep "explanation" to a single sentence');
  });

  it('uses the stored learner level when the request does not override it', () => {
    const prompt = buildSentenceAnalysisPrompt(
      { text: SENTENCE, lang: 'ja' },
      prefs({ learnerLevel: 'N4' }),
    );
    expect(prompt).toContain('around N4');
  });
});

describe('parseSentenceAnalysis with a partial provider response', () => {
  it('accepts a response that only carries the sections that were requested', () => {
    const raw = JSON.stringify({
      translations: { en: 'Life is a series of choices.' },
      annotations: [
        { text: '人生は', category: 'particle', meaning: 'topic marker', explanation: 'x' },
      ],
    });
    const parsed = parseSentenceAnalysis(raw, SENTENCE);
    expect(parsed.formality).toBeUndefined();
    expect(parsed.nuance).toEqual([]);
    expect(parsed.annotations).toHaveLength(1);
  });
});

describe('markedSentence', () => {
  it('keys each span to its numbered entry without losing characters', () => {
    expect(markedSentence(result())).toBe('[人生は](1)選択の連続だ。');
  });

  it('leaves an un-annotated sentence untouched', () => {
    expect(markedSentence(result({ annotations: [] }))).toBe(SENTENCE);
  });
});

describe('buildAnalysisSnapshot', () => {
  it('carries the annotations, which is the point of a snapshot', () => {
    const snapshot = buildAnalysisSnapshot(result(), prefs(), { lang: 'ja', source: 'lens' });
    expect(snapshot.body).toContain('[人生は](1)');
    expect(snapshot.body).toContain('は sets what the sentence is about.');
    expect(snapshot.meta.annotations).toBe(1);
  });

  it('honours the snapshot section list, not the on-screen one', () => {
    const p = prefs({
      sections: [...DEFAULT_ANALYSIS_PREFS.sections],
      snapshot: { ...DEFAULT_ANALYSIS_PREFS.snapshot, sections: ['translations'] },
    });
    const snapshot = buildAnalysisSnapshot(result(), p, { lang: 'ja', source: 'lens' });
    expect(snapshot.body).toContain('Life is a series of choices.');
    expect(snapshot.body).not.toContain('Reads as a maxim.');
    expect(snapshot.body).not.toContain('Casual (plain form)');
  });

  it('truncates the title but keeps the full sentence in meta', () => {
    const long = 'あ'.repeat(120);
    const snapshot = buildAnalysisSnapshot(
      result({ sentence: long, annotations: [] }),
      prefs(),
      { lang: 'ja', source: 'lens' },
    );
    expect(snapshot.title.length).toBeLessThanOrEqual(64);
    expect(snapshot.meta.sentence).toBe(long);
  });

  it('does not open with a wall of blank lines when most sections are off', () => {
    const p = prefs({ snapshot: { ...DEFAULT_ANALYSIS_PREFS.snapshot, sections: [] } });
    const snapshot = buildAnalysisSnapshot(result(), p, { lang: 'ja', source: 'lens' });
    expect(snapshot.body.startsWith('[人生は](1)')).toBe(true);
    expect(snapshot.body).not.toMatch(/\n{3}/);
  });
});

describe('buildAnalysisMineRequest', () => {
  const opts = { lang: 'ja', uiLang: 'en' };

  it('routes like a dictionary mine so profile rules behave identically', () => {
    const req = buildAnalysisMineRequest(annotation(), result(), prefs(), opts);
    expect(req.route).toEqual({ source: 'dictionary', cardKind: 'word', language: 'ja' });
    expect(req.sentence).toBe(SENTENCE);
    expect(req.surface).toBe('人生は');
  });

  it('carries the in-depth explanation onto the card when asked', () => {
    const req = buildAnalysisMineRequest(annotation(), result(), prefs(), opts);
    expect(req.meaning).toContain('は sets what the sentence is about.');
  });

  it('keeps the card terse when the explanation is switched off', () => {
    const p = prefs({ anki: { ...DEFAULT_ANALYSIS_PREFS.anki, includeExplanation: false } });
    const req = buildAnalysisMineRequest(annotation(), result(), p, opts);
    expect(req.meaning).toBe('marks 人生 as the topic');
  });

  it('applies the deck override only when one is set', () => {
    expect(buildAnalysisMineRequest(annotation(), result(), prefs(), opts).deckName).toBeUndefined();
    const p = prefs({ anki: { ...DEFAULT_ANALYSIS_PREFS.anki, deck: 'Mining::AI' } });
    expect(buildAnalysisMineRequest(annotation(), result(), p, opts).deckName).toBe('Mining::AI');
  });

  it('inverts term and meaning for a sentence card', () => {
    const req = buildAnalysisMineRequest(annotation(), result(), prefs(), {
      ...opts,
      cardKind: 'sentence',
    });
    expect(req.term).toBe(SENTENCE);
    expect(req.meaning).toBe('Life is a series of choices.');
    expect(req.surface).toBeUndefined();
  });

  it('prefers the UI language for the card translation', () => {
    const req = buildAnalysisMineRequest(annotation(), result(), prefs(), {
      lang: 'ja',
      uiLang: 'zh',
    });
    expect(req.sentenceTranslation).toBe('人生是一连串的选择。');
  });
});

describe('buildSentenceMineRequest', () => {
  it('falls back to the first annotation when no translation was requested', () => {
    const req = buildSentenceMineRequest(result({ translations: {} }), prefs(), {
      lang: 'ja',
      uiLang: 'en',
    });
    expect(req.meaning).toContain('marks 人生 as the topic');
  });

  it('is never blank on the back even with no annotations and no translation', () => {
    const req = buildSentenceMineRequest(
      result({ translations: {}, annotations: [] }),
      prefs(),
      { lang: 'ja', uiLang: 'en' },
    );
    expect(req.term).toBe(SENTENCE);
    expect(req.meaning).toBe('');
  });
});

describe('analysisCommandForKey', () => {
  it('maps the letter shortcuts', () => {
    expect(analysisCommandForKey({ key: 'c' })).toBe('copy');
    expect(analysisCommandForKey({ key: 'A' })).toBe('mine');
    expect(analysisCommandForKey({ key: 's' })).toBe('snapshot');
  });

  it('maps digits to a span index', () => {
    expect(analysisCommandForKey({ key: '1' })).toEqual({ select: 0 });
    expect(analysisCommandForKey({ key: '9' })).toEqual({ select: 8 });
    expect(analysisCommandForKey({ key: '0' })).toBeNull();
  });

  it('never steals a modified chord', () => {
    expect(analysisCommandForKey({ key: 'c', ctrlKey: true })).toBeNull();
    expect(analysisCommandForKey({ key: 'c', metaKey: true })).toBeNull();
    expect(analysisCommandForKey({ key: 'd', altKey: true })).toBeNull();
  });

  it('handles arrows and escape', () => {
    expect(analysisCommandForKey({ key: 'ArrowRight' })).toBe('next');
    expect(analysisCommandForKey({ key: 'ArrowLeft' })).toBe('prev');
    expect(analysisCommandForKey({ key: 'Escape' })).toBe('close');
  });

  it('ignores keys it does not own', () => {
    expect(analysisCommandForKey({ key: 'q' })).toBeNull();
    expect(analysisCommandForKey({ key: 'F5' })).toBeNull();
  });

  it('documents every mapped command in the legend', () => {
    const listed = new Set(ANALYSIS_SHORTCUT_HINTS.map((h) => h.command));
    for (const command of ['copy', 'mine', 'snapshot', 'listen', 'dictionary', 'close']) {
      expect(listed.has(command)).toBe(true);
    }
  });
});

describe('isTextEntryTarget', () => {
  it('recognizes fields where a keystroke means a character', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(
      isTextEntryTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget),
    ).toBe(true);
  });

  it('lets shortcuts through everywhere else', () => {
    expect(isTextEntryTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
