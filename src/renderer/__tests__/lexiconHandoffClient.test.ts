// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeReadingLensCapture } from '../../shared/readingLens';
import {
  handOffCaptureToLexicon,
  onLexiconHandoffStaged,
  takeLexiconHandoff,
} from '../lexiconHandoffClient';

function capture(text: string) {
  const result = normalizeReadingLensCapture({ source: 'clipboard', text }, 100);
  if (!result) throw new Error('expected capture');
  return result;
}

function installApi(api: Record<string, unknown>): void {
  (window as unknown as { api: unknown }).api = api;
}

afterEach(() => {
  delete (window as unknown as { api?: unknown }).api;
});

describe('lexicon handoff renderer client', () => {
  it('stages before opening Dictionary', async () => {
    const calls: string[] = [];
    installApi({
      lexiconHandoffStage: async () => {
        calls.push('stage');
        return { ok: true, kind: 'word', lens: 'lookup' };
      },
      popOut: async (section: string) => calls.push(`open:${section}`),
    });

    await expect(handOffCaptureToLexicon(capture('食べる'))).resolves.toBe('handed-off');
    expect(calls).toEqual(['stage', 'open:dictionary']);
  });

  it('does not stage a sentence or paragraph with no receiving surface', async () => {
    const stage = vi.fn();
    installApi({ lexiconHandoffStage: stage, popOut: vi.fn() });

    await expect(handOffCaptureToLexicon(capture('今日は寒いですね。')))
      .resolves.toBe('not-lexicon-scale');
    expect(stage).not.toHaveBeenCalled();
  });

  it('does not open after a refused or unavailable stage', async () => {
    const popOut = vi.fn();
    installApi({
      lexiconHandoffStage: async () => ({ ok: false, code: 'invalid-request' }),
      popOut,
    });
    await expect(handOffCaptureToLexicon(capture('猫'))).resolves.toBe('stage-failed');
    expect(popOut).not.toHaveBeenCalled();
  });

  it('normalizes claims and subscriptions at the renderer boundary', async () => {
    const off = vi.fn();
    const subscribe = vi.fn(() => off);
    installApi({
      lexiconHandoffTake: async () => ({
        ok: true,
        handoff: {
          route: 'lexicon',
          text: '猫',
          kind: 'word',
          lens: 'lookup',
          source: 'screen',
          sourceLabel: 'screen',
          stagedAt: 10,
        },
      }),
      onLexiconHandoffStaged: subscribe,
    });

    await expect(takeLexiconHandoff()).resolves.toMatchObject({
      ok: true,
      handoff: { text: '猫', kind: 'word' },
    });
    const callback = vi.fn();
    expect(onLexiconHandoffStaged(callback)).toBe(off);
    expect(subscribe).toHaveBeenCalledWith(expect.any(Function));
  });
});
