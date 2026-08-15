import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined },
}));
vi.mock('../aiProviderClient', () => ({ callAiProvider: async () => '{}' }));
vi.mock('../mining', () => ({
  getConfiguredAiEngine: () => 'cloud',
  getConfiguredAiProvider: () => ({ providerId: 'gemini-2.5-flash', apiKey: 'k' }),
}));

const { runAiAdditions } = await import('../anki/aiAdditions');
const { AI_ADDITIONS_CHUNK_SIZE, normalizeAiAdditionsRequest } = await import(
  '../../shared/ankiAiPrompt'
);

function request(count: number) {
  const normalized = normalizeAiAdditionsRequest({
    kind: 'example-sentence',
    notes: Array.from({ length: count }, (_, i) => ({ noteId: `n${i}`, term: '語' })),
    variantCount: 1,
    sendGloss: false,
    explainLanguage: 'en',
  });
  if (!normalized) throw new Error('fixture did not normalize');
  return normalized;
}

/** A provider that answers every word in the chunk it was given. */
function answerAll(prompt: string): string {
  const indices = [...prompt.matchAll(/^(\d+)\. /gmu)].map((m) => Number(m[1]));
  return JSON.stringify({ results: indices.map((index) => ({ index, variants: [`v${index}`] })) });
}

describe('runAiAdditions', () => {
  it('chunks the selection instead of sending one enormous request', async () => {
    const sizes: number[] = [];
    const { results } = await runAiAdditions(request(AI_ADDITIONS_CHUNK_SIZE * 2 + 3), {
      call: async (prompt, itemCount) => {
        sizes.push(itemCount);
        return answerAll(prompt);
      },
      isCancelled: () => false,
    });
    expect(sizes).toEqual([AI_ADDITIONS_CHUNK_SIZE, AI_ADDITIONS_CHUNK_SIZE, 3]);
    expect(results).toHaveLength(AI_ADDITIONS_CHUNK_SIZE * 2 + 3);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  // Cancelling stops the spend, not the work already paid for.
  it('keeps the answers received before a cancel and stops calling', async () => {
    let calls = 0;
    let stop = false;
    const { results, cancelled } = await runAiAdditions(request(AI_ADDITIONS_CHUNK_SIZE * 3), {
      call: async (prompt) => {
        calls += 1;
        stop = true;
        return answerAll(prompt);
      },
      isCancelled: () => stop,
    });
    expect(calls).toBe(1);
    expect(cancelled).toBe(true);
    expect(results).toHaveLength(AI_ADDITIONS_CHUNK_SIZE);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('makes no call at all when the cancel lands before the first chunk', async () => {
    let calls = 0;
    const { results, cancelled } = await runAiAdditions(request(4), {
      call: async () => {
        calls += 1;
        return '{}';
      },
      isCancelled: () => true,
    });
    expect(calls).toBe(0);
    expect(cancelled).toBe(true);
    expect(results).toEqual([]);
  });

  // One timeout must not lose a long run.
  it('fails only the chunk that failed and keeps running', async () => {
    let call = 0;
    const { results } = await runAiAdditions(request(AI_ADDITIONS_CHUNK_SIZE + 2), {
      call: async (prompt) => {
        call += 1;
        if (call === 1) throw new Error('AI request timed out after 60s');
        return answerAll(prompt);
      },
      isCancelled: () => false,
    });
    const failed = results.filter((r) => !r.ok);
    expect(failed).toHaveLength(AI_ADDITIONS_CHUNK_SIZE);
    expect(failed[0]).toMatchObject({ ok: false, error: 'AI request timed out after 60s' });
    expect(results.slice(AI_ADDITIONS_CHUNK_SIZE).every((r) => r.ok)).toBe(true);
  });

  it('reports a word the provider skipped as failed, not as an empty success', async () => {
    const { results } = await runAiAdditions(request(2), {
      call: async () => JSON.stringify({ results: [{ index: 1, variants: ['v1'] }] }),
      isCancelled: () => false,
    });
    expect(results[0]).toMatchObject({ noteId: 'n0', ok: true });
    expect(results[1]).toEqual({ noteId: 'n1', ok: false, error: 'no-answer' });
  });

  it('reports every chunk as it lands so a long run can be reviewed while it runs', async () => {
    const chunks: number[] = [];
    await runAiAdditions(request(AI_ADDITIONS_CHUNK_SIZE + 1), {
      call: async (prompt) => answerAll(prompt),
      isCancelled: () => false,
      onChunk: (batch) => chunks.push(batch.length),
    });
    expect(chunks).toEqual([AI_ADDITIONS_CHUNK_SIZE, 1]);
  });
});
