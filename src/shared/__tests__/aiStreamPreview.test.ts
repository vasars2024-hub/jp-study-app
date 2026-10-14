// @vitest-environment node
/**
 * F9: a streamed JSON reply is previewed as its string values, read out of a
 * prefix that may be cut anywhere — never shown as JSON — and the preview of the
 * whole reply is exactly what the final parse sees.
 */
import { describe, expect, it } from 'vitest';
import { partialJsonStrings, streamItems, streamPreview } from '../aiStreamPreview';
import { parseJsonReply } from '../jsonReply';

const WHY = JSON.stringify({
  confusion: 'synonym',
  explanation: '暑い is about weather; "warm" is milder.\nThink of summer.',
  tip: 'Picture a hot day.',
  acceptable: true,
  acceptableReason: '',
});

describe('partialJsonStrings', () => {
  it('reads every string value of a complete reply, keys apart', () => {
    const fields = partialJsonStrings(WHY);
    expect(fields.map((f) => f.key)).toEqual(['confusion', 'explanation', 'tip', 'acceptableReason']);
    expect(fields.every((f) => f.complete)).toBe(true);
    expect(fields[1].value).toBe('暑い is about weather; "warm" is milder.\nThink of summer.');
  });

  it('survives a cut at every position, never yielding a key or JSON syntax as a value', () => {
    for (let n = 0; n <= WHY.length; n += 1) {
      const fields = partialJsonStrings(WHY.slice(0, n));
      for (const field of fields) {
        expect(['confusion', 'explanation', 'tip', 'acceptableReason']).toContain(field.key);
        expect(field.value).not.toMatch(/^[{[]|"explanation"/);
      }
      // The last field is the only one that may be unfinished.
      expect(fields.slice(0, -1).every((f) => f.complete)).toBe(true);
    }
  });

  it('keeps the start of a string the stream was cut inside', () => {
    const fields = partialJsonStrings('{"confusion":"other","explanation":"The word 暑');
    expect(fields.at(-1)).toMatchObject({ key: 'explanation', value: 'The word 暑', complete: false });
  });

  it('decodes escapes, and drops an escape the cut split', () => {
    expect(partialJsonStrings('{"a":"x\\u00e9\\"y\\\\"}')[0].value).toBe('xé"y\\');
    expect(partialJsonStrings('{"a":"ok\\u00')[0].value).toBe('ok');
    expect(partialJsonStrings('{"a":"ok\\')[0].value).toBe('ok');
  });

  it('paths nested objects and arrays', () => {
    const raw = '{"summary":"S","sections":[{"kind":"nuance","body":"B1"},{"kind":"usage","body":"B2"}],"n":3,"ok":true}';
    expect(partialJsonStrings(raw).map((f) => f.path)).toEqual([
      'summary', 'sections.0.kind', 'sections.0.body', 'sections.1.kind', 'sections.1.body',
    ]);
  });

  it('ignores prose and fences before the value, and a reasoning block', () => {
    expect(partialJsonStrings('<think>{"x":"no"}</think>Here:\n```json\n{"a":"yes"}')[0]).toMatchObject({ key: 'a', value: 'yes' });
    expect(partialJsonStrings('<think>still thinking {"x":"no"')).toEqual([]);
    expect(partialJsonStrings('no json yet')).toEqual([]);
  });
});

describe('streamPreview', () => {
  it('shows the prose only: label keys are left out', () => {
    expect(streamPreview(WHY)).toBe('暑い is about weather; "warm" is milder.\nThink of summer.\nPicture a hot day.');
  });

  it('can be limited to named keys', () => {
    expect(streamPreview('{"summary":"A cat.","sections":[{"kind":"nuance","body":"Unmarked."}]}', { keys: ['summary', 'body'] }))
      .toBe('A cat.\nUnmarked.');
  });

  it('is empty until a value has started, and never contains JSON punctuation of its own', () => {
    expect(streamPreview('')).toBe('');
    expect(streamPreview('{"confusion":"syn')).toBe('');
    expect(streamPreview('{"confusion":"synonym","explanation":"Wea')).toBe('Wea');
  });

  it('a prose reply streams as itself, minus its reasoning', () => {
    expect(streamPreview('<think>hmm</think>こんにちは', { prose: true })).toBe('こんにちは');
  });

  it('the whole reply previews the same strings the final parse reads', () => {
    const parsed = parseJsonReply(WHY) as Record<string, string>;
    expect(streamPreview(WHY, { keys: ['explanation', 'tip'] })).toBe(`${parsed.explanation}\n${parsed.tip}`);
  });
});

describe('streamItems', () => {
  it('groups a batch reply by element, as it arrives', () => {
    const raw = '{"items":[{"expression":"猫","reading":"ねこ","meaning":"cat"},{"expression":"犬","mean';
    expect(streamItems(raw, 'items')).toEqual([
      { expression: '猫', reading: 'ねこ', meaning: 'cat' },
      { expression: '犬' },
    ]);
  });
});
