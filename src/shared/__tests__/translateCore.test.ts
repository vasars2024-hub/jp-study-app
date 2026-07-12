import { describe, expect, it } from 'vitest';
import {
  buildBatchPrompt,
  buildSentencePrompt,
  buildStrictPrompt,
  cleanLlmOutput,
  parseBatchJson,
} from '../translateCore';

describe('cleanLlmOutput', () => {
  it('strips <think> blocks and leading whitespace', () => {
    expect(cleanLlmOutput('<think>reasoning...</think>\n\n  человек')).toBe('человек');
  });
});

describe('parseBatchJson', () => {
  const ids = new Set(['t0', 't1']);

  it('parses a well-formed array', () => {
    const map = parseBatchJson('[{"id":"t0","text":"человек"},{"id":"t1","text":"тростник"}]', ids);
    expect(map.get('t0')).toBe('человек');
    expect(map.get('t1')).toBe('тростник');
  });

  it('malformed JSON yields an empty map (items treated as failed)', () => {
    expect(parseBatchJson('sure! here are the translations:', ids).size).toBe(0);
    expect(parseBatchJson('[{"id":"t0","text":', ids).size).toBe(0);
  });

  it('rejects id echoes — the source of stray "t0" card values', () => {
    const map = parseBatchJson('[{"id":"t0","text":"t0"},{"id":"t1","text":"ok"}]', ids);
    expect(map.has('t0')).toBe(false);
    expect(map.get('t1')).toBe('ok');
  });

  it('ignores unknown ids and non-object items', () => {
    const map = parseBatchJson('[{"id":"t9","text":"x"}, 42, null, {"id":"t0","text":"y"}]', ids);
    expect(map.size).toBe(1);
    expect(map.get('t0')).toBe('y');
  });

  it('accepts {results: [...]} wrapper objects', () => {
    const map = parseBatchJson('{"results":[{"id":"t0","text":"человек"}]}', ids);
    expect(map.get('t0')).toBe('человек');
  });
});

describe('prompt builders', () => {
  it('batch prompt names the languages and lists items by id', () => {
    const prompt = buildBatchPrompt([
      { id: 't0', text: '人間', source: 'ja', target: 'ru' },
      { id: 't1', text: '葦', source: 'ja', target: 'ru' },
    ]);
    expect(prompt).toContain('Japanese');
    expect(prompt).toContain('Russian');
    expect(prompt).toContain('[t0] 人間');
    expect(prompt).toContain('[t1] 葦');
  });

  it('unknown language codes fall back to the raw code', () => {
    const prompt = buildBatchPrompt([{ id: 't0', text: 'x', source: 'ja', target: 'xx' }]);
    expect(prompt).toContain('XX');
  });

  it('strict prompt forbids source characters and romanization', () => {
    const prompt = buildStrictPrompt({ id: 't0', text: '人間', source: 'ja', target: 'ru' });
    expect(prompt).toContain('ONLY the Russian translation');
    expect(prompt).toContain('Term: 人間');
  });

  it('sentence prompt asks for the bare translation', () => {
    const prompt = buildSentencePrompt('人間は考える葦である。', 'ja', 'en');
    expect(prompt).toContain('Japanese');
    expect(prompt).toContain('English');
    expect(prompt).toContain('人間は考える葦である。');
  });
});
