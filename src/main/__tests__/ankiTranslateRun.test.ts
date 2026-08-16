// Gate 2's loop. The properties are the same three `runAiAdditions` has, and
// they are re-proven here rather than assumed from the shared helper: a
// translation cancel has to keep the paid-for chunks, one chunk's timeout must
// not lose the run, and a text the provider skipped is a retryable failure.
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined },
}));
vi.mock('../aiProviderClient', () => ({ callAiProvider: async () => '{}' }));
vi.mock('../mining', () => ({
  getConfiguredAiEngine: () => 'cloud',
  getConfiguredAiProvider: () => ({ providerId: 'gemini-2.5-flash', apiKey: 'k' }),
}));

const { runTranslateField } = await import('../anki/aiAdditions');
const { TRANSLATE_CHUNK_SIZE, normalizeTranslateRequest } = await import(
  '../../shared/ankiTranslate'
);

function request(count: number) {
  const normalized = normalizeTranslateRequest({
    fromField: 'Back',
    targetLanguage: 'ru',
    variantCount: 1,
    notes: Array.from({ length: count }, (_, i) => ({ noteId: `n${i}`, text: `source ${i}` })),
  });
  if (!normalized) throw new Error('fixture did not normalize');
  return normalized;
}

/** A provider that answers every text in the chunk it was given. */
function answerAll(prompt: string): string {
  const indices = [...prompt.matchAll(/^(\d+)\. /gmu)].map((m) => Number(m[1]));
  return JSON.stringify({ results: indices.map((index) => ({ index, variants: [`перевод ${index}`] })) });
}

describe('runTranslateField', () => {
  it('chunks at the translation size, not the additions size', async () => {
    const sizes: number[] = [];
    const { results } = await runTranslateField(request(TRANSLATE_CHUNK_SIZE * 2 + 2), {
      call: async (prompt, itemCount) => {
        sizes.push(itemCount);
        return answerAll(prompt);
      },
      isCancelled: () => false,
    });
    expect(sizes).toEqual([TRANSLATE_CHUNK_SIZE, TRANSLATE_CHUNK_SIZE, 2]);
    expect(results).toHaveLength(TRANSLATE_CHUNK_SIZE * 2 + 2);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('keeps the translations received before a cancel and stops calling', async () => {
    let calls = 0;
    let stop = false;
    const { results, cancelled } = await runTranslateField(request(TRANSLATE_CHUNK_SIZE * 3), {
      call: async (prompt) => {
        calls += 1;
        stop = true;
        return answerAll(prompt);
      },
      isCancelled: () => stop,
    });
    expect(calls).toBe(1);
    expect(cancelled).toBe(true);
    expect(results).toHaveLength(TRANSLATE_CHUNK_SIZE);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('makes no call at all when the cancel lands before the first chunk', async () => {
    let calls = 0;
    const { results, cancelled } = await runTranslateField(request(3), {
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

  it('fails only the chunk that failed and keeps running', async () => {
    let call = 0;
    const { results } = await runTranslateField(request(TRANSLATE_CHUNK_SIZE + 2), {
      call: async (prompt) => {
        call += 1;
        if (call === 1) throw new Error('AI request timed out after 60s');
        return answerAll(prompt);
      },
      isCancelled: () => false,
    });
    const failed = results.filter((r) => !r.ok);
    expect(failed).toHaveLength(TRANSLATE_CHUNK_SIZE);
    expect(failed[0]).toMatchObject({ ok: false, error: 'AI request timed out after 60s' });
    expect(results.slice(TRANSLATE_CHUNK_SIZE).every((r) => r.ok)).toBe(true);
  });

  it('reports a text the provider skipped as failed, not as an empty success', async () => {
    const { results } = await runTranslateField(request(2), {
      call: async () => JSON.stringify({ results: [{ index: 1, variants: ['перевод'] }] }),
      isCancelled: () => false,
    });
    expect(results[0]).toMatchObject({ noteId: 'n0', ok: true });
    expect(results[1]).toEqual({ noteId: 'n1', ok: false, error: 'no-answer' });
  });

  // The negative control for "a translation happened": an echo is not one.
  it('reports an echoed source as failed rather than writing the original back', async () => {
    const { results } = await runTranslateField(request(1), {
      call: async () => JSON.stringify({ results: [{ index: 1, variants: ['source 0'] }] }),
      isCancelled: () => false,
    });
    expect(results[0]).toEqual({ noteId: 'n0', ok: false, error: 'no-answer' });
  });

  it('reports every chunk as it lands so a long run can be reviewed while it runs', async () => {
    const chunks: number[] = [];
    await runTranslateField(request(TRANSLATE_CHUNK_SIZE + 1), {
      call: async (prompt) => answerAll(prompt),
      isCancelled: () => false,
      onChunk: (batch) => chunks.push(batch.length),
    });
    expect(chunks).toEqual([TRANSLATE_CHUNK_SIZE, 1]);
  });
});
