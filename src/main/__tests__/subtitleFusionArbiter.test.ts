/**
 * Stage F5's orchestration — `src/main/subtitleFusionArbiter.ts`.
 *
 * The pure decision layer is covered in `shared/__tests__/subtitleFusionArbitration.test.ts`.
 * What is under test here is the property the plan makes a hard requirement: this
 * stage can fail in every way a network stage can, and the fused track must come
 * out of it identical to what F4 produced. Not "similar" — identical, because the
 * offline path is the shipping path and the cloud is an optional refinement.
 *
 * The provider call is injected (`options.call`). The real one needs a paid key,
 * so a test that used it would be a test that never runs.
 */
import { describe, expect, it, vi } from 'vitest';
import { decideFusedWindows, type FusedWindowDecision } from '../../shared/subtitleFusionCore';
import { arbitrateFusionDecisions } from '../subtitleFusionArbiter';

// `mining` reaches for electron's `app` at import time; this stage only needs the
// provider accessor, and every test here injects its own call anyway.
vi.mock('../mining', () => ({
  getConfiguredAiProvider: () => ({ providerId: 'gemini-2.5-flash', apiKey: '' }),
}));
vi.mock('../aiProviderClient', () => ({
  callAiProvider: () => Promise.reject(new Error('no network in tests')),
}));

const ENGLISH = ['i like cats', 'i cross the bridge'];
const REFERENCES = ['ねこがすきです', '全く関係のない参照文がここにあります'];
const scored = (): FusedWindowDecision[] => decideFusedWindows(
  ['猫が好きです', '橋を渡ります'],
  REFERENCES,
);

describe('arbitrateFusionDecisions', () => {
  it('returns F4 output untouched when there is no cloud key', async () => {
    const before = scored();
    const outcome = await arbitrateFusionDecisions(before, ENGLISH, REFERENCES);
    expect(outcome.skipped).toBe('no-key');
    expect(outcome.applied).toBe(0);
    expect(outcome.decisions).toEqual(before);
  });

  it('reports "no-candidates" separately, so a quiet run is not read as a missing key', async () => {
    const agreed = decideFusedWindows(['猫が好きです'], ['猫が好きです']);
    const outcome = await arbitrateFusionDecisions(agreed, ['i like cats'], ['猫が好きです'], {
      call: () => Promise.reject(new Error('must not be called')),
    });
    expect(outcome.skipped).toBe('no-candidates');
    expect(outcome.decisions).toEqual(agreed);
  });

  it('applies a verdict to the disputed window and leaves the agreeing one alone', async () => {
    const before = scored();
    const call = vi.fn(async (prompt: string) => {
      // Only the disputed window may be in the prompt at all.
      expect(prompt).toContain('橋を渡ります');
      expect(prompt).not.toContain('猫が好きです');
      return JSON.stringify({ lines: [{ id: 1, text: '端を渡ります', basis: 'whisper-corrected' }] });
    });

    const outcome = await arbitrateFusionDecisions(before, ENGLISH, REFERENCES, { call });
    expect(call).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ attempted: 1, applied: 1, failedBatches: 0, skipped: null });
    expect(outcome.decisions[0]).toEqual(before[0]);
    expect(outcome.decisions[1]).toMatchObject({ text: '端を渡ります', basis: 'whisper-corrected' });
  });

  it('degrades to F4 when the provider throws, and does not retry the batch', async () => {
    const before = scored();
    const call = vi.fn(() => Promise.reject(new Error('502 upstream')));
    const outcome = await arbitrateFusionDecisions(before, ENGLISH, REFERENCES, { call });
    expect(call).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ applied: 0, failedBatches: 1, skipped: null });
    expect(outcome.decisions).toEqual(before);
  });

  it('degrades to F4 when the provider answers with prose instead of the schema', async () => {
    const before = scored();
    const outcome = await arbitrateFusionDecisions(before, ENGLISH, REFERENCES, {
      call: async () => 'Sure! Here are the corrected lines:',
    });
    expect(outcome).toMatchObject({ applied: 0, failedBatches: 1 });
    expect(outcome.decisions).toEqual(before);
  });

  it('stops between batches when the job is cancelled, keeping the verdicts it has', async () => {
    const many = decideFusedWindows(
      Array.from({ length: 40 }, (_, i) => `台詞${i}です`),
      Array.from({ length: 40 }, () => '全く関係のない参照文がここにあります'),
    );
    const english = many.map((_, i) => `line ${i}`);
    const references = many.map(() => '全く関係のない参照文がここにあります');
    let batches = 0;
    const outcome = await arbitrateFusionDecisions(many, english, references, {
      isCancelled: () => batches >= 1,
      call: async (_prompt, itemCount) => {
        batches += 1;
        expect(itemCount).toBeLessThanOrEqual(16);
        return JSON.stringify({ lines: [{ id: 0, text: '台詞0です', basis: 'whisper-as-is' }] });
      },
    });
    // 40 disputes is three batches; cancellation after the first stops the rest.
    expect(batches).toBe(1);
    expect(outcome.applied).toBe(1);
    expect(outcome.decisions[0].basis).toBe('whisper-as-is');
    // Everything the cancelled batches would have covered is still F4's ruling.
    expect(outcome.decisions[20]).toEqual(many[20]);
  });

  it('refuses before spending anything when cancelled up front', async () => {
    const before = scored();
    const call = vi.fn();
    const outcome = await arbitrateFusionDecisions(before, ENGLISH, REFERENCES, {
      isCancelled: () => true,
      call,
    });
    expect(call).not.toHaveBeenCalled();
    expect(outcome.skipped).toBe('cancelled');
    expect(outcome.decisions).toEqual(before);
  });

  it('reports batch progress so a long cloud pass is not a frozen bar', async () => {
    const many = decideFusedWindows(
      Array.from({ length: 20 }, (_, i) => `台詞${i}です`),
      Array.from({ length: 20 }, () => '全く関係のない参照文がここにあります'),
    );
    const seen: Array<[number, number]> = [];
    await arbitrateFusionDecisions(many, many.map((_, i) => `line ${i}`), many.map(() => 'x'), {
      call: async () => '{"lines":[]}',
      onBatch: (done, total) => seen.push([done, total]),
    });
    expect(seen).toEqual([[1, 2], [2, 2]]);
  });
});

/**
 * A live run lost roughly a third of its batches on a real provider and the
 * sidecar could only say "one batch failed". These four causes are what the fix
 * for that has to tell apart — they are four different bugs, in four different
 * layers, and three of them used to look like the fourth.
 */
describe('arbitrateFusionDecisions failure diagnosis', () => {
  it('reports the provider error code, not the message, when a request throws', async () => {
    const before = scored();
    const outcome = await arbitrateFusionDecisions(before, ENGLISH, REFERENCES, {
      call: () => Promise.reject(Object.assign(
        new Error('AI request timed out after 90s. Try fewer items.'),
        { code: 'timeout' },
      )),
    });
    expect(outcome.failedBatches).toBe(1);
    expect(outcome.failures).toEqual({ timeout: 1 });
    expect(outcome.decisions).toEqual(before);
  });

  it('falls back to "error" for a plain throw rather than putting prose on disk', async () => {
    const outcome = await arbitrateFusionDecisions(scored(), ENGLISH, REFERENCES, {
      call: () => Promise.reject(new Error('502 upstream: <html>token=abc</html>')),
    });
    expect(outcome.failures).toEqual({ error: 1 });
    expect(JSON.stringify(outcome.failures)).not.toContain('token');
  });

  it('separates prose, an empty list, and rows the guard threw out', async () => {
    const cases: Array<[string, string]> = [
      ['Sure! Here are the corrected lines:', 'unparsable'],
      ['{"lines":[]}', 'empty'],
      // A well-formed row whose text resembles neither the transcript nor the
      // reference: the fidelity guard drops it, so the batch yields nothing.
      [JSON.stringify({ lines: [{ id: 1, text: 'まったく別の文章です', basis: 'whisper-corrected' }] }), 'rejected'],
    ];
    for (const [raw, reason] of cases) {
      const before = scored();
      const outcome = await arbitrateFusionDecisions(before, ENGLISH, REFERENCES, {
        call: async () => raw,
      });
      expect(outcome.failures, `${reason} case`).toEqual({ [reason]: 1 });
      expect(outcome.failedBatches).toBe(1);
      expect(outcome.decisions).toEqual(before);
    }
  });

  it('counts reasons per batch, so a mixed run says which failure dominated', async () => {
    const many = decideFusedWindows(
      Array.from({ length: 40 }, (_, i) => `台詞${i}です`),
      Array.from({ length: 40 }, () => '全く関係のない参照文がここにあります'),
    );
    let batch = 0;
    const call = vi.fn(async () => {
      batch += 1;
      // All three reasons are deliberately non-splittable, so this stays a test
      // about counting rather than about the split retry below.
      if (batch === 2) return '{"lines":[]}';
      throw Object.assign(new Error('429'), { code: 'rate-limit' });
    });
    const outcome = await arbitrateFusionDecisions(many, many.map((_, i) => `line ${i}`), many.map(() => 'x'), {
      call,
    });
    expect(call).toHaveBeenCalledTimes(3);
    expect(outcome.failedBatches).toBe(3);
    expect(outcome.failures).toEqual({ 'rate-limit': 2, empty: 1 });
  });

  it('counts rows the guard discarded from a batch that still succeeded', async () => {
    // Two verdicts back for a one-window batch: one usable, one for a window the
    // model was never shown. `failedBatches` cannot see this — `dropped` can.
    const before = scored();
    const outcome = await arbitrateFusionDecisions(before, ENGLISH, REFERENCES, {
      call: async () => JSON.stringify({
        lines: [
          { id: 1, text: '端を渡ります', basis: 'whisper-corrected' },
          { id: 99, text: 'この窓は存在しません', basis: 'whisper-as-is' },
        ],
      }),
    });
    expect(outcome).toMatchObject({ applied: 1, failedBatches: 0, dropped: 1 });
    expect(outcome.failures).toEqual({});
  });

  it('leaves the fields empty on a clean run', async () => {
    const outcome = await arbitrateFusionDecisions(scored(), ENGLISH, REFERENCES, {
      call: async () => JSON.stringify({
        lines: [{ id: 1, text: '橋を渡ります', basis: 'whisper-as-is' }],
      }),
    });
    expect(outcome).toMatchObject({ applied: 1, failedBatches: 0, dropped: 0, recovered: 0 });
    expect(outcome.failures).toEqual({});
  });
});

/**
 * The defect this whole slice exists for: a 16-window batch failed wholesale and
 * every verdict in it was lost, while the 6-window batch beside it went through.
 * A failure whose likelihood scales with how much was asked gets asked again in
 * halves — once, and only for reasons where a smaller question is a different
 * question.
 */
describe('arbitrateFusionDecisions split retry', () => {
  /** 20 disputes → two batches of 16 and 4 under FUSION_ARBITRATION_BATCH. */
  const many = (count: number): {
    decisions: FusedWindowDecision[];
    english: string[];
    references: string[];
  } => {
    const decisions = decideFusedWindows(
      Array.from({ length: count }, (_, i) => `台詞${i}です`),
      Array.from({ length: count }, () => '全く関係のない参照文がここにあります'),
    );
    return {
      decisions,
      english: decisions.map((_, i) => `line ${i}`),
      references: decisions.map(() => '全く関係のない参照文がここにあります'),
    };
  };

  /** Answers every window it is shown, but only below `limit` items. */
  const answersUnder = (limit: number) => async (prompt: string, itemCount: number) => {
    if (itemCount >= limit) {
      throw Object.assign(new Error('output limit'), { code: 'output-truncated' });
    }
    const ids = [...prompt.matchAll(/"id":(\d+)/g)].map((match) => Number(match[1]));
    return JSON.stringify({
      lines: ids.map((id) => ({ id, text: `台詞${id}です`, basis: 'whisper-as-is' })),
    });
  };

  it('recovers a batch the provider could not answer whole', async () => {
    const { decisions, english, references } = many(16);
    const call = vi.fn(answersUnder(16));
    const outcome = await arbitrateFusionDecisions(decisions, english, references, { call });

    // One full batch, then its two halves of 8.
    expect(call.mock.calls.map((args) => args[1])).toEqual([16, 8, 8]);
    expect(outcome.applied).toBe(16);
    expect(outcome.recovered).toBe(16);
    // The failure still happened and is still reported. A run that only ever
    // succeeds on the second try is a finding, not a clean run.
    expect(outcome.failures).toEqual({ 'output-truncated': 1 });
    expect(outcome.failedBatches).toBe(0);
    expect(outcome.decisions.every((decision) => decision.basis === 'whisper-as-is')).toBe(true);
  });

  it('splits only once, so a hopeless batch costs two extra calls and no more', async () => {
    const { decisions, english, references } = many(16);
    const call = vi.fn(() => Promise.reject(
      Object.assign(new Error('output limit'), { code: 'output-truncated' }),
    ));
    const outcome = await arbitrateFusionDecisions(decisions, english, references, { call });

    expect(call).toHaveBeenCalledTimes(3);
    expect(outcome.applied).toBe(0);
    expect(outcome.recovered).toBe(0);
    expect(outcome.failedBatches).toBe(1);
    expect(outcome.failures).toEqual({ 'output-truncated': 3 });
    expect(outcome.decisions).toEqual(decisions);
  });

  it('does not split a refusal — a smaller question gets the same no at twice the price', async () => {
    const { decisions, english, references } = many(16);
    for (const raw of ['{"lines":[]}', JSON.stringify({ lines: [{ id: 0, text: 'まったく別の文章です', basis: 'reference' }] })]) {
      const call = vi.fn(async () => raw);
      const outcome = await arbitrateFusionDecisions(decisions, english, references, { call });
      expect(call).toHaveBeenCalledTimes(1);
      expect(outcome.failedBatches).toBe(1);
      expect(outcome.recovered).toBe(0);
    }
  });

  it('does not split rate limiting, which more requests can only worsen', async () => {
    const { decisions, english, references } = many(16);
    const call = vi.fn(() => Promise.reject(
      Object.assign(new Error('429'), { code: 'rate-limit' }),
    ));
    await arbitrateFusionDecisions(decisions, english, references, { call });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('does not split a single-window batch, which has no smaller half', async () => {
    const before = scored();
    const call = vi.fn(() => Promise.reject(
      Object.assign(new Error('cut off'), { code: 'output-truncated' }),
    ));
    const outcome = await arbitrateFusionDecisions(before, ENGLISH, REFERENCES, { call });
    expect(call).toHaveBeenCalledTimes(1);
    expect(outcome.failedBatches).toBe(1);
  });

  it('counts a partial rescue as recovered without hiding the windows still lost', async () => {
    const { decisions, english, references } = many(16);
    let seen = 0;
    const call = vi.fn(async (prompt: string, itemCount: number) => {
      seen += 1;
      if (itemCount === 16) throw Object.assign(new Error('cut'), { code: 'output-truncated' });
      // The first half answers; the second half fails again.
      if (seen === 3) throw Object.assign(new Error('cut'), { code: 'timeout' });
      const ids = [...prompt.matchAll(/"id":(\d+)/g)].map((match) => Number(match[1]));
      return JSON.stringify({
        lines: ids.map((id) => ({ id, text: `台詞${id}です`, basis: 'whisper-as-is' })),
      });
    });
    const outcome = await arbitrateFusionDecisions(decisions, english, references, { call });

    expect(outcome.recovered).toBe(8);
    expect(outcome.applied).toBe(8);
    // Rescued overall, so not a failed batch — but both failures are on record.
    expect(outcome.failedBatches).toBe(0);
    expect(outcome.failures).toEqual({ 'output-truncated': 1, timeout: 1 });
    // The half that never came back is still exactly what F4 decided.
    expect(outcome.decisions[15]).toEqual(decisions[15]);
  });

  it('stops mid-split when the job is cancelled rather than paying for the other half', async () => {
    const { decisions, english, references } = many(16);
    let calls = 0;
    const call = vi.fn(async (_prompt: string, itemCount: number) => {
      calls += 1;
      if (itemCount === 16) throw Object.assign(new Error('cut'), { code: 'output-truncated' });
      return '{"lines":[]}';
    });
    const outcome = await arbitrateFusionDecisions(decisions, english, references, {
      call,
      // Cancelled once the first half has been paid for.
      isCancelled: () => calls >= 2,
    });
    expect(call).toHaveBeenCalledTimes(2);
    expect(outcome.decisions).toEqual(decisions);
  });
});
