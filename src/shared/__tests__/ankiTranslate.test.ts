// Gate 2's request half: what a field translation sends, what it refuses to
// send, and what the user is told it costs.
import { describe, it, expect } from 'vitest';
import {
  TRANSLATE_CHUNK_SIZE,
  TRANSLATE_MAX_FIELD_CHARS,
  TRANSLATE_MAX_NOTES,
  TRANSLATE_MAX_VARIANTS,
  buildTranslatePrompt,
  describeTranslateDisclosure,
  normalizeTranslateRequest,
  parseTranslateResponse,
  prepareTranslateNotes,
  translateDestinationProblem,
  type TranslateFieldRequest,
} from '../ankiTranslate';
import { beginAiBatch, recordAiResult, approveAiVariant, approvedAiAdditions } from '../ankiAiAdditions';

function request(over: Partial<TranslateFieldRequest> = {}): TranslateFieldRequest {
  return {
    fromField: 'Back',
    targetLanguage: 'ru',
    variantCount: 1,
    notes: [{ noteId: 'n1', text: 'a cat sleeps on the sofa' }],
    ...over,
  };
}

describe('prepareTranslateNotes', () => {
  it('strips markup and media tags from what leaves the machine', () => {
    const { notes, skipped } = prepareTranslateNotes([
      { noteId: 'n1', raw: '<div>a cat  sleeps</div>[sound:cat.mp3]' },
    ]);
    expect(skipped).toEqual([]);
    expect(notes).toEqual([{ noteId: 'n1', text: 'a cat sleeps' }]);
    expect(notes[0].text).not.toContain('sound:');
  });

  it('refuses a cloze source rather than translating a marker into pieces', () => {
    const { notes, skipped } = prepareTranslateNotes([
      { noteId: 'n1', raw: '{{c1::猫}}が寝ている' },
      { noteId: 'n2', raw: '<b>{{c2::犬}}</b>' },
    ]);
    expect(notes).toEqual([]);
    expect(skipped).toEqual([
      { noteId: 'n1', reason: 'cloze-source' },
      { noteId: 'n2', reason: 'cloze-source' },
    ]);
  });

  it('reports a field that held only markup as empty-source, not as a request', () => {
    const { notes, skipped } = prepareTranslateNotes([
      { noteId: 'n1', raw: '<br><div>  </div>[sound:only.mp3]' },
      { noteId: 'n2', raw: '' },
    ]);
    expect(notes).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['empty-source', 'empty-source']);
  });

  it('caps one note at TRANSLATE_MAX_FIELD_CHARS', () => {
    const { notes } = prepareTranslateNotes([{ noteId: 'n1', raw: 'あ'.repeat(2_000) }]);
    expect(notes[0].text).toHaveLength(TRANSLATE_MAX_FIELD_CHARS);
  });
});

describe('translateDestinationProblem', () => {
  it('blocks a translation that would overwrite its own source', () => {
    expect(translateDestinationProblem('Back', 'Back')).toBe('same-field');
    expect(translateDestinationProblem(' Back ', 'Back')).toBe('same-field');
  });

  it('names the missing half rather than a generic refusal', () => {
    expect(translateDestinationProblem('', 'Russian')).toBe('no-source');
    expect(translateDestinationProblem('Back', '  ')).toBe('no-destination');
  });

  it('allows a distinct destination, which is how the original is retained', () => {
    expect(translateDestinationProblem('Back', 'Russian')).toBeNull();
  });
});

describe('normalizeTranslateRequest', () => {
  it('returns null when there is nothing to ask', () => {
    expect(normalizeTranslateRequest(null)).toBeNull();
    expect(normalizeTranslateRequest(request({ notes: [] }))).toBeNull();
    expect(normalizeTranslateRequest(request({ fromField: '   ' }))).toBeNull();
    expect(normalizeTranslateRequest(request({ targetLanguage: '' }))).toBeNull();
  });

  it('drops a note whose text is blank even when a caller supplied it', () => {
    const out = normalizeTranslateRequest(request({
      notes: [{ noteId: 'n1', text: '   ' }, { noteId: 'n2', text: 'hello' }],
    }));
    expect(out?.notes).toEqual([{ noteId: 'n2', text: 'hello' }]);
  });

  it('clamps the variant count and the selection size', () => {
    const many = Array.from({ length: TRANSLATE_MAX_NOTES + 25 }, (_, i) => ({
      noteId: `n${i}`,
      text: 'text',
    }));
    const out = normalizeTranslateRequest(request({ notes: many, variantCount: 99 }));
    expect(out?.notes).toHaveLength(TRANSLATE_MAX_NOTES);
    expect(out?.variantCount).toBe(TRANSLATE_MAX_VARIANTS);
  });
});

describe('buildTranslatePrompt', () => {
  it('numbers the chunk from 1 and never puts a note id on the wire', () => {
    const req = request({
      notes: [{ noteId: 'note-42', text: 'first' }, { noteId: 'note-43', text: 'second' }],
    });
    const prompt = buildTranslatePrompt(req, req.notes);
    expect(prompt).toContain('1. first');
    expect(prompt).toContain('2. second');
    expect(prompt).not.toContain('note-42');
    expect(prompt).toContain('code: ru');
  });
});

describe('parseTranslateResponse', () => {
  const notes = [
    { noteId: 'n1', text: 'a cat sleeps' },
    { noteId: 'n2', text: 'a dog runs' },
  ];

  it('maps chunk-relative indices back onto the notes', () => {
    const out = parseTranslateResponse(
      JSON.stringify({ results: [{ index: 2, variants: ['собака бежит'] }, { index: 1, variants: ['кот спит'] }] }),
      notes,
      1,
    );
    expect(out).toEqual([
      { noteId: 'n1', variants: ['кот спит'] },
      { noteId: 'n2', variants: ['собака бежит'] },
    ]);
  });

  it('drops an echo of the source, so an untranslated note fails instead of lying', () => {
    const out = parseTranslateResponse(
      JSON.stringify({ results: [{ index: 1, variants: ['a cat sleeps'] }] }),
      notes,
      1,
    );
    expect(out[0]).toEqual({ noteId: 'n1', variants: [] });
  });

  it('drops an index the chunk never asked about and still answers for every note', () => {
    const out = parseTranslateResponse(
      JSON.stringify({ results: [{ index: 9, variants: ['x'] }] }),
      notes,
      1,
    );
    expect(out.map((a) => a.noteId)).toEqual(['n1', 'n2']);
    expect(out.every((a) => a.variants.length === 0)).toBe(true);
  });
});

describe('describeTranslateDisclosure', () => {
  it('names the field by name and counts the user text exactly', () => {
    const req = request({
      notes: [{ noteId: 'n1', text: 'abcde' }, { noteId: 'n2', text: 'fghij' }],
    });
    const out = describeTranslateDisclosure(req, 'gemini-2.5-flash');
    expect(out.fromField).toBe('Back');
    expect(out.targetLanguage).toBe('ru');
    expect(out.noteCount).toBe(2);
    expect(out.charsSent).toBe(10);
    expect(out.model).toBe('gemini-2.5-flash');
    expect(out.provider).not.toBe('');
  });

  it('reports no cost rather than zero when the provider has no entered price', () => {
    const out = describeTranslateDisclosure(request(), 'gemini-2.5-flash');
    expect(out.estimatedCostUsd).toBeUndefined();
  });

  it('counts one request per chunk', () => {
    const notes = Array.from({ length: TRANSLATE_CHUNK_SIZE + 1 }, (_, i) => ({
      noteId: `n${i}`,
      text: 'text',
    }));
    expect(describeTranslateDisclosure(request({ notes }), 'gemini-2.5-flash').requests).toBe(2);
  });
});

describe('a translation batch reuses gate 12\'s review', () => {
  it('is a proposal until approved, and then writes exactly the approved text', () => {
    let batch = beginAiBatch('b1', 'translate-field', 'google', 'gemini-2.5-flash', [
      { noteId: 'n1', term: 'a cat sleeps' },
    ]);
    batch = recordAiResult(batch, 'n1', { ok: true, variants: [{ id: 'v1', text: 'кот спит' }] });
    expect(approvedAiAdditions(batch)).toEqual([]);
    batch = approveAiVariant(batch, 'n1', 'v1');
    expect(approvedAiAdditions(batch)).toEqual([{ noteId: 'n1', text: 'кот спит' }]);
    // The source text is retained on the batch: it is the "before" of the diff.
    expect(batch.notes[0].term).toBe('a cat sleeps');
  });
});
