/**
 * Bug 13: five places dug the JSON out of a model reply by looking for a ```
 * fence FIRST, so a valid reply whose string held a fence was cut down to the
 * inside of that string. They now share `shared/jsonReply.ts`; this suite pins
 * the helper and each of the five call sites against the audit's probe and a
 * real fenced reply.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '' },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  net: { isOnline: () => true },
}));

import { extractJsonReply, findJsonValues, jsonValueEnd, parseJsonReply } from '../jsonReply';
import { extractJsonBlock, parseExplanationReply } from '../lexiconExplainPrompt';
import { extractJsonPayload } from '../subtitleDiscoveryTranslate';
import { parseAiReplyJson, stripJsonFences } from '../../main/aiStructuredOutput';
import { extractJsonish } from '../../main/translate';
import { evaluateMirrorWriting } from '../../renderer/games/mirrorWriting/evaluator';
import { MIRROR_TEXTS } from '../../renderer/data/mirrorTexts';
import { DEFAULT_GAME_ARENA_SETTINGS } from '../../renderer/games/settings';

/** The audit's probe (gum-v1-audit/b13.cjs). */
const PROBE = '{"explanation":"Use ```code``` like this","ok":true}';
/** What models actually send: a sentence, then a fenced block. */
const FENCED = 'Here you go:\n```json\n{"explanation":"plain","ok":true}\n```\nHope that helps.';
/** Both at once: a fenced reply whose string holds a fence of its own. */
const FENCED_PROBE = `Sure!\n\`\`\`json\n${PROBE}\n\`\`\``;

describe('shared/jsonReply', () => {
  it('keeps a reply whose string holds a fence (the probe)', () => {
    expect(extractJsonReply(PROBE)).toBe(PROBE);
    expect(JSON.parse(extractJsonReply(PROBE))).toEqual({ explanation: 'Use ```code``` like this', ok: true });
  });

  it('unwraps a real fenced reply with prose around it', () => {
    expect(JSON.parse(extractJsonReply(FENCED))).toEqual({ explanation: 'plain', ok: true });
  });

  it('unwraps a fence whose JSON string holds another fence', () => {
    expect(JSON.parse(extractJsonReply(FENCED_PROBE))).toEqual({ explanation: 'Use ```code``` like this', ok: true });
  });

  it('ignores braces and quotes inside strings when finding the end', () => {
    const text = '{"a":"}{]","b":["x\\"]"]} trailing } prose';
    expect(jsonValueEnd(text, 0)).toBe(text.indexOf(' trailing'));
    expect(extractJsonReply(text)).toBe('{"a":"}{]","b":["x\\"]"]}');
  });

  it('steps over prose in brackets instead of returning something inside it', () => {
    expect(extractJsonReply('[note] {"ok":1}')).toBe('{"ok":1}');
    expect(extractJsonReply('I {think} so: {"ok":1}')).toBe('{"ok":1}');
    // A balanced but invalid object is skipped whole: its inner object is not the answer.
    expect(findJsonValues('{"a": {"b":1}, "c": oops}')).toEqual([]);
  });

  it('chooses by kind when asked', () => {
    const both = '{"note":"x"} [1,2]';
    expect(extractJsonReply(both)).toBe('{"note":"x"}');
    expect(extractJsonReply(both, { prefer: 'array' })).toBe('[1,2]');
    expect(extractJsonReply('[1,2] {"a":1}', { prefer: 'object' })).toBe('{"a":1}');
    // Prefer is a preference: the other kind still comes back when it is all there is.
    expect(extractJsonReply('[1,2]', { prefer: 'object' })).toBe('[1,2]');
    expect(parseJsonReply('[1,2]', { only: 'object' })).toBeUndefined();
  });

  it('hands a truncated reply back whole so the caller fails (or repairs) it', () => {
    const cut = 'Result: {"a": {"b": 1}, "c": "unfinish';
    expect(extractJsonReply(cut)).toBe('{"a": {"b": 1}, "c": "unfinish');
    expect(() => JSON.parse(extractJsonReply(cut))).toThrow();
    // An unclosed fence body that does not parse is still the best guess.
    expect(extractJsonReply('```json\n{"a":1,}\n```')).toBe('{"a":1,}');
    expect(extractJsonReply('no json here')).toBe('no json here');
  });
});

describe('the five call sites (bug 13)', () => {
  it('aiStructuredOutput', () => {
    expect(stripJsonFences(PROBE)).toBe(PROBE);
    expect(parseAiReplyJson(FENCED, 'Test')).toEqual({ explanation: 'plain', ok: true });
    expect(parseAiReplyJson(FENCED_PROBE, 'Test')).toEqual({ explanation: 'Use ```code``` like this', ok: true });
  });

  it('translate.ts extractJsonish (every local JSON caller)', () => {
    expect(extractJsonish(PROBE)).toBe(PROBE);
    expect(JSON.parse(extractJsonish(FENCED))).toEqual({ explanation: 'plain', ok: true });
  });

  it('lexiconExplainPrompt', () => {
    expect(extractJsonBlock(PROBE)).toBe(PROBE);
    expect(JSON.parse(extractJsonBlock(FENCED))).toEqual({ explanation: 'plain', ok: true });
    expect(extractJsonBlock('[1,2]')).toBe('');
    const reply = '{"summary":"A quote mark.","sections":[{"kind":"grammar","body":"Write ```x``` to quote."}]}';
    expect(parseExplanationReply(reply)?.sections[0]?.body).toBe('Write ```x``` to quote.');
  });

  it('subtitleDiscoveryTranslate', () => {
    const lines = '[{"id":"1","text":"Type ```ls``` here"},{"id":"2","text":"ok"}]';
    expect(extractJsonPayload(lines)).toBe(lines);
    expect(JSON.parse(extractJsonPayload(`\`\`\`json\n${lines}\n\`\`\``))).toHaveLength(2);
  });

  describe('mirrorWriting evaluator', () => {
    const g = globalThis as unknown as { window?: unknown };
    afterEach(() => {
      delete g.window;
    });
    const evaluateWith = async (content: string) => {
      g.window = {
        api: { gamesMirrorEvaluate: async () => ({ ok: true, data: { choices: [{ message: { content } }] } }) },
      };
      const settings = {
        ...DEFAULT_GAME_ARENA_SETTINGS,
        mirrorBackend: 'api' as const,
        mirrorBackendChosen: true,
        mirrorApiUrl: 'http://127.0.0.1:9/v1',
        mirrorApiModel: 'm',
      };
      return evaluateMirrorWriting(settings, MIRROR_TEXTS[0], '今日は公園へ行きました。');
    };
    const axis = { score: 80, tips: [] };
    const evaluation = { total: 80, axes: { grammar: axis, vocabulary: axis, flow: axis, fidelity: axis } };

    it('reads a summary that quotes a fence', async () => {
      const result = await evaluateWith(JSON.stringify({ ...evaluation, summary: 'Use ```は``` here.' }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.evaluation.summary).toBe('Use ```は``` here.');
    });

    it('reads a fenced reply', async () => {
      const result = await evaluateWith(`Here:\n\`\`\`json\n${JSON.stringify({ ...evaluation, summary: 'ok' })}\n\`\`\``);
      expect(result.ok).toBe(true);
    });
  });
});
