// @vitest-environment jsdom
/**
 * `translateTo`'s new half of the bridge: a per-sentence partial event reaches
 * `onSegment`, the result's engine reaches `onMeta`, the request carries the
 * engine and glossary only when given, and a routed failure is worded in the UI
 * language with the engine and the reason.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translateTo } from '../translator';

vi.mock('../i18n', () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key) }));

// The bridge is read lazily (on the first `translateTo`), so installing it after the import is enough.
type PartialListener = (p: { id: number; progress: number; segment?: { index: number; total: number; source: string; target: string } }) => void;
let partial: PartialListener = () => undefined;
const translateRun = vi.fn();

Object.defineProperty(window, 'api', {
  configurable: true,
  writable: true,
  value: {
    translateRun,
    onTranslateModelProgress: () => () => undefined,
    onTranslatePartial: (cb: PartialListener) => {
      partial = cb;
      return () => undefined;
    },
  },
});

beforeEach(() => {
  translateRun.mockReset();
});

describe('translateTo with engines', () => {
  it('routes per-sentence partials to onSegment and the result\'s engine to onMeta', async () => {
    translateRun.mockImplementation(async (req: { id: number }) => {
      partial({ id: req.id, progress: 0.5, segment: { index: 0, total: 2, source: '猫。', target: 'Cat.' } });
      partial({ id: req.id + 999, progress: 0.5, segment: { index: 1, total: 2, source: 'x', target: 'not ours' } });
      return { ok: true, text: 'Cat. Dog.', meta: { provider: 'gemini-2.5-flash' } };
    });
    const onSegment = vi.fn();
    const onMeta = vi.fn();
    const progress = vi.fn();
    const text = await translateTo('猫。犬。', 'ja', 'en', progress, undefined, { onSegment, onMeta });
    expect(text).toBe('Cat. Dog.');
    expect(onSegment).toHaveBeenCalledTimes(1);
    expect(onSegment).toHaveBeenCalledWith(0, { source: '猫。', target: 'Cat.' }, 2);
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(onMeta).toHaveBeenCalledWith({ provider: 'gemini-2.5-flash' });
  });

  it('sends the engine and glossary only when given', async () => {
    translateRun.mockResolvedValue({ ok: true, text: 'x' });
    await translateTo('猫', 'ja', 'en');
    expect(translateRun.mock.calls[0][0]).not.toHaveProperty('provider');
    expect(translateRun.mock.calls[0][0]).not.toHaveProperty('glossary');
    await translateTo('先輩', 'ja', 'en', undefined, undefined, { provider: 'deepl', glossary: [{ source: '先輩', target: 'senpai' }] });
    expect(translateRun.mock.calls[1][0]).toMatchObject({ provider: 'deepl', glossary: [{ source: '先輩', target: 'senpai' }] });
  });

  it('words a routed failure with the engine and the reason', async () => {
    translateRun.mockResolvedValue({ ok: false, error: 'x', errorKey: 'xlate2.error.cloud', failure: { provider: 'deepl', code: 'quota' } });
    await expect(translateTo('猫', 'ja', 'en')).rejects.toThrow(
      'xlate2.error.cloud{"provider":"DeepL API","reason":"xlate2.fallback.quota"}',
    );
  });
});
