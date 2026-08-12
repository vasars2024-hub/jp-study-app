import { describe, expect, it } from 'vitest';
import type { LexiconInterlinearMatch, LexiconInterlinearResult } from '../lexiconInterlinear';
import { applySensePin } from '../lexiconSensePin';
import { collectSenseHints } from '../lexiconRetranslate';
import {
  MAX_SENSE_HINTS,
  SENSE_HINT_MARKER,
  buildSenseHintBlock,
  buildSentencePrompt,
  buildStrictPrompt,
  looksLikeSenseHintEcho,
  sanitizeSenseHints,
} from '../translateCore';

function match(over: Partial<LexiconInterlinearMatch> = {}): LexiconInterlinearMatch {
  return {
    query: '見た',
    headwordId: 3,
    dictId: 'jmdict-en',
    dictTitle: 'JMdict (English)',
    text: '見る',
    reading: 'みる',
    via: 'deinflected',
    score: 8,
    glosses: [
      { lang: 'en', text: 'to see' },
      { lang: 'en', text: 'to look after' },
    ],
    senses: [
      { index: 0, glosses: [{ lang: 'en', text: 'to see' }] },
      { index: 1, glosses: [{ lang: 'en', text: 'to look after' }, { lang: 'en', text: 'to attend to' }] },
    ],
    hasTargetGloss: true,
    ...over,
  };
}

function token(m: LexiconInterlinearMatch | undefined, start: number): LexiconInterlinearResult['parts'][number] {
  return { kind: 'token', text: m?.query ?? '×', start, end: start + 2, match: m };
}

function passage(parts: LexiconInterlinearResult['parts']): LexiconInterlinearResult {
  return {
    text: '猫を見た。',
    detectedLangs: ['ja'],
    glossLangs: ['en'],
    parts,
    tokenCount: parts.filter((part) => part.kind === 'token').length,
    matchedCount: parts.filter((part) => part.kind === 'token' && part.match).length,
    truncated: false,
  };
}

describe('collecting the reader\'s pins as translator constraints', () => {
  it('emits nothing at all until something is pinned', () => {
    expect(collectSenseHints(passage([token(match(), 0)]), 'en')).toEqual([]);
    expect(collectSenseHints(null, 'en')).toEqual([]);
  });

  it('states the pinned sense, not the entry\'s full gloss line', () => {
    const hints = collectSenseHints(passage([token(applySensePin(match(), 1), 0)]), 'en');
    expect(hints).toEqual([
      { text: '見る', reading: 'みる', gloss: 'to look after; to attend to' },
    ]);
    // The unpinned sense must not leak in: that is the ambiguity being removed.
    expect(hints[0].gloss).not.toContain('to see');
  });

  it('states one constraint per headword however often the word occurs', () => {
    const pinned = applySensePin(match(), 1);
    const hints = collectSenseHints(
      passage([token(pinned, 0), { kind: 'separator', text: 'を', start: 2, end: 3 }, token(pinned, 3)]),
      'en',
    );
    expect(hints).toHaveLength(1);
  });

  it('speaks the language being translated into, not whichever gloss came first', () => {
    const parallel = applySensePin(
      match({
        senses: [
          { index: 0, glosses: [{ lang: 'en', text: 'to see' }, { lang: 'ru', text: 'видеть' }] },
          {
            index: 1,
            glosses: [{ lang: 'en', text: 'to look after' }, { lang: 'ru', text: 'присматривать' }],
          },
        ],
        parallel: [
          { lang: 'en', dictId: 'jmdict-en', dictTitle: 'JMdict (English)', glosses: [{ lang: 'en', text: 'to see' }] },
          { lang: 'ru', dictId: 'jmdict-en', dictTitle: 'JMdict (English)', glosses: [{ lang: 'ru', text: 'видеть' }] },
        ],
      }),
      1,
    );
    expect(collectSenseHints(passage([token(parallel, 0)]), 'ru')[0].gloss).toBe('присматривать');
    expect(collectSenseHints(passage([token(parallel, 0)]), 'EN')[0].gloss).toBe('to look after');
  });

  it('drops a pin that says nothing in the target language rather than emitting a blank rule', () => {
    const ruOnly = applySensePin(
      match({
        senses: [
          { index: 0, glosses: [{ lang: 'ru', text: 'видеть' }] },
          { index: 1, glosses: [{ lang: 'ru', text: 'присматривать' }] },
        ],
        parallel: [
          { lang: 'ru', dictId: 'jmdict-en', dictTitle: 'JMdict (English)', glosses: [{ lang: 'ru', text: 'видеть' }] },
        ],
      }),
      1,
    );
    expect(collectSenseHints(passage([token(ruOnly, 0)]), 'en')).toEqual([]);
  });

  it('keeps the definitional core of a long sense and drops its cross-reference tail', () => {
    // JMdict's real sense 3 of 見る, as read off the user's own dictionary live.
    const long = applySensePin(
      match({
        senses: [
          { index: 0, glosses: [{ lang: 'en', text: 'to see' }] },
          {
            index: 1,
            glosses: [
              { lang: 'en', text: 'to look after' },
              { lang: 'en', text: 'to attend to' },
              { lang: 'en', text: 'to take care of' },
              { lang: 'en', text: 'to keep an eye on' },
              { lang: 'en', text: 'see: 看る to look after (often medically)' },
            ],
          },
        ],
      }),
      1,
    );
    expect(collectSenseHints(passage([token(long, 0)]), 'en')[0].gloss)
      .toBe('to look after; to attend to; to take care of');
  });

  it('omits a reading that only repeats the headword', () => {
    const kana = applySensePin(match({ text: 'みる', reading: 'みる' }), 1);
    expect(collectSenseHints(passage([token(kana, 0)]), 'en')[0]).not.toHaveProperty('reading');
  });

  it('caps the list so the passage itself is never crowded out of the prompt', () => {
    const parts = Array.from({ length: MAX_SENSE_HINTS + 5 }, (_, i) => (
      token(applySensePin(match({ text: `語${i}`, headwordId: i }), 1), i * 2)
    ));
    expect(collectSenseHints(passage(parts), 'en')).toHaveLength(MAX_SENSE_HINTS);
  });
});

describe('sense hints crossing the IPC boundary', () => {
  it('drops a hint missing either half of the rule', () => {
    expect(sanitizeSenseHints([
      { text: '見る', gloss: '' },
      { text: '', gloss: 'to see' },
      { gloss: 'to see' },
      null,
      'nope',
      { text: '見る', gloss: 'to look after' },
    ])).toEqual([{ text: '見る', gloss: 'to look after' }]);
  });

  it('refuses a non-array and bounds an oversized list', () => {
    expect(sanitizeSenseHints(undefined)).toEqual([]);
    expect(sanitizeSenseHints({ text: 'x', gloss: 'y' })).toEqual([]);
    const many = Array.from({ length: 50 }, (_, i) => ({ text: `w${i}`, gloss: 'g' }));
    expect(sanitizeSenseHints(many)).toHaveLength(MAX_SENSE_HINTS);
  });

  it('truncates a hint long enough to displace the text being translated', () => {
    const [hint] = sanitizeSenseHints([{ text: '見る', gloss: 'g'.repeat(5000) }]);
    expect(hint.gloss.length).toBe(160);
  });
});

describe('the prompt the constraints produce', () => {
  it('leaves an unconstrained prompt byte-identical to what it always was', () => {
    expect(buildSentencePrompt('猫を見た。', 'ja', 'en')).toBe(
      '/no_think\nTranslate the following Japanese text to English. Output ONLY the translation, nothing else.\n\nText: 猫を見た。',
    );
    expect(buildSentencePrompt('猫を見た。', 'ja', 'en', [])).toBe(
      buildSentencePrompt('猫を見た。', 'ja', 'en'),
    );
    expect(buildSenseHintBlock(undefined)).toBe('');
  });

  it('states the constraints in one line, before the instruction and the text', () => {
    const prompt = buildSentencePrompt('猫を見た。', 'ja', 'en', [
      { text: '見る', reading: 'みる', gloss: 'to look after' },
      { text: '猫', gloss: 'cat' },
    ]);
    // Driven live against Qwen3-1.7B, a multi-line bulleted block made the model
    // echo its own instructions back as the translation. One line, and the
    // imperative plus `Text:` last, is what that run settled on.
    expect(prompt).toBe(
      '/no_think\nWord meanings to use: 見る = to look after / 猫 = cat\n'
      + 'Translate the following Japanese text to English. Output ONLY the translation, nothing else.'
      + '\n\nText: 猫を見た。',
    );
  });

  it('carries the same constraints into the strict retry, so a pin cannot lapse on the second pass', () => {
    const hints = [{ text: '見る', reading: 'みる', gloss: 'to look after' }];
    expect(buildStrictPrompt({ id: 's0', text: '見た', source: 'ja', target: 'en' }, hints))
      .toContain('Word meanings to use: 見る = to look after');
    expect(buildStrictPrompt({ id: 's0', text: '見た', source: 'ja', target: 'en' })).toBe(
      '/no_think\nTranslate this Japanese term into English. Respond with ONLY the English translation written in English — no Japanese characters, no romanization, no explanations, no quotes.\n\nTerm: 見た',
    );
  });

  it('recognises the model repeating its own constraints as an echo, not a translation', () => {
    // Observed verbatim from Qwen3-1.7B before the block was shortened: fluent
    // English, no Japanese in it, so the cross-language validator passed it.
    const echoed = 'Word meanings to use: 見る = to look after / 猫 = cat\nText: 猫を見た。';
    expect(looksLikeSenseHintEcho(echoed)).toBe(true);
    expect(looksLikeSenseHintEcho('I looked after the cat.')).toBe(false);
    // The second live run dropped the marker and echoed only the pairs, which
    // the marker check alone passed as a translation.
    const pairsOnly = '見る = to look after; to attend to\n猫 = cat The text provided is incomplete.';
    expect(looksLikeSenseHintEcho(pairsOnly)).toBe(false);
    expect(looksLikeSenseHintEcho(pairsOnly, [{ text: '見る', gloss: 'to look after' }])).toBe(true);
    expect(looksLikeSenseHintEcho('I looked after the cat.', [{ text: '見る', gloss: 'x' }])).toBe(false);
    // Whatever the block's wording becomes, the detector must key off it.
    expect(buildSenseHintBlock([{ text: '猫', gloss: 'cat' }])).toContain(SENSE_HINT_MARKER);
  });
});
