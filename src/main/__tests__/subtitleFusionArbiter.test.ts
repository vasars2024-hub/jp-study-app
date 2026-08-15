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
    const outcome = await arbitrateFusionDecisions(many, many.map((_, i) => `line ${i}`), many.map(() => 'x'), {
      call: async () => {
        batch += 1;
        if (batch === 1) throw Object.assign(new Error('429'), { code: 'rate-limit' });
        if (batch === 2) return 'not json at all';
        throw Object.assign(new Error('429 again'), { code: 'rate-limit' });
      },
    });
    expect(outcome.failedBatches).toBe(3);
    expect(outcome.failures).toEqual({ 'rate-limit': 2, unparsable: 1 });
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

  it('leaves both fields empty on a clean run', async () => {
    const outcome = await arbitrateFusionDecisions(scored(), ENGLISH, REFERENCES, {
      call: async () => JSON.stringify({
        lines: [{ id: 1, text: '橋を渡ります', basis: 'whisper-as-is' }],
      }),
    });
    expect(outcome).toMatchObject({ applied: 1, failedBatches: 0, dropped: 0 });
    expect(outcome.failures).toEqual({});
  });
});
