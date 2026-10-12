// @vitest-environment jsdom
/**
 * The renderer side of the watching-and-reading AI helpers, on the real panels
 * with a FAKE bridge (nothing is ever sent anywhere):
 *
 * - the video brief: the deterministic best lines and quiz without AI; the AI
 *   summary + questions asked chunk by chunk with progress and Cancel; a click
 *   seeks; AI picks re-validated against known words; errors said by code;
 * - the VN line panel: hidden with AI off, E/Explain asks, the translate action
 *   only for a line without one, and its answer is saved only on "Use";
 * - the VN mining hook: automatic AI translation only when switched on;
 * - the Study command fallback: shows the parsed intent and runs NOTHING until
 *   confirmed;
 * - the immersion reader's tools: finds the page's i+1 sentences, Simplify only
 *   at low coverage, and every control sits under `data-ai-entry`.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({
  state: { loaded: true, enabled: true, ready: true, cloudReady: true, localReady: false, engine: 'cloud' },
}));
const known = vi.hoisted(() => ({ words: new Set<string>() }));

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key), lang: 'en' }),
}));
vi.mock('../aiSetupClient', () => ({
  useAiReadiness: () => ai.state,
  currentAiReadiness: () => ai.state,
  openAiSettings: () => undefined,
}));
vi.mock('../knownWords', () => ({
  getLevel: (word: string) => (known.words.has(word) ? 3 : 0),
  onKnowledgeChanged: () => () => undefined,
}));
vi.mock('../studyTokens', () => ({
  studyTokens: (text: string) => text.split(' ').filter(Boolean).map((lemma) => ({ lemma, surface: lemma, content: true, proper: false })),
  studyTokensReady: () => true,
}));
vi.mock('../tokenizer', () => ({ getTokenizer: () => Promise.resolve({}) }));
vi.mock('../studyEnvironment', async (importOriginal) => ({
  ...await importOriginal<typeof import('../studyEnvironment')>(),
  getStudyLang: () => 'ja',
}));
vi.mock('../translateTarget', () => ({ getTranslateTarget: () => 'en' }));
vi.mock('../agentContextHandoff', () => ({
  handOffToAgent: vi.fn(),
  routeAgentContext: () => ({}),
  selectedTextAgentContext: () => ({}),
}));

import MediaBriefPanel from '../components/media/MediaBriefPanel';
import VisualNovelAiAssist from '../components/immersion/VisualNovelAiAssist';
import StudyCommandAiFallback from '../components/media/StudyCommandAiFallback';
import ImmersionAiTools from '../components/immersion/ImmersionAiTools';
import { isVnAiExplainKey, vnLineForMining } from '../vnAiTranslate';
import { saveAiImmersePrefs } from '../aiImmersePrefs';
import type { Yt5VideoStudy } from '../../shared/youtubeStudy5';
import type { VisualNovelTextCapture } from '../../shared/visualNovel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
type Pending = { request: Record<string, unknown>; resolve: (value: unknown) => void };
let api: Record<string, ReturnType<typeof vi.fn>>;
const pending: Record<string, Pending[]> = {};

function deferred(name: string) {
  return vi.fn((request: Record<string, unknown>) => new Promise((resolve) => {
    (pending[name] ??= []).push({ request, resolve });
  }));
}

beforeEach(() => {
  ai.state = { loaded: true, enabled: true, ready: true, cloudReady: true, localReady: false, engine: 'cloud' };
  known.words = new Set(['猫', '外', '見る', '彼', '守る', '雨', '降る']);
  for (const key of Object.keys(pending)) delete pending[key];
  api = {
    aiImmerseBrief: deferred('brief'),
    aiImmersePickLines: deferred('pick'),
    aiImmerseExplainLine: deferred('explain'),
    aiImmerseSimplify: deferred('simplify'),
    aiImmerseTranslateLine: deferred('translate'),
    aiImmerseStudyCommand: deferred('command'),
    aiImmerseCancel: vi.fn(async () => true),
    visualNovelUpdateCapture: vi.fn(async () => ({ ok: true })),
  };
  (window as unknown as { api: unknown }).api = api;
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
}

// ---- the video brief ----------------------------------------------------------

const cues = [
  { start: 1, end: 3, text: '猫 窓 外 見る' },
  { start: 4, end: 6, text: '彼 約束 守る' },
  { start: 7, end: 9, text: '雨 降る' },
];
const study: Yt5VideoStudy = {
  cues: 3,
  tokens: 9,
  knownRatio: 0.78,
  band: 'hard',
  uniqueWords: 9,
  unknownUnique: 2,
  vocabulary: [
    { lemma: '窓', reading: 'まど', count: 3, level: 0, firstSec: 1, sentence: '猫 窓 外 見る' },
    { lemma: '約束', reading: 'やくそく', count: 1, level: 0, firstSec: 4, sentence: '彼 約束 守る' },
  ],
  iPlusOne: [
    { start: 1, end: 3, text: '猫 窓 外 見る', lemma: '窓' },
    { start: 4, end: 6, text: '彼 約束 守る', lemma: '約束' },
  ],
};

function renderBrief(onSeek = vi.fn()) {
  act(() => {
    root.render(
      <MediaBriefPanel cues={cues} title="Ep 1" studyLang="ja" variant="pre" study={study} onSeek={onSeek} onMineLine={vi.fn()} />,
    );
  });
  return onSeek;
}

describe('video brief', () => {
  it('without AI: the best lines and the vocabulary quiz still work, and a click seeks', () => {
    ai.state = { ...ai.state, enabled: false };
    const onSeek = renderBrief();
    expect(host.querySelector('[data-media-brief-best]')?.getAttribute('data-media-brief-best')).toBe('2');
    expect(host.querySelector('[data-media-brief-quiz]')).not.toBeNull();
    expect(host.querySelector('[data-media-brief-run]')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('[data-media-brief-best] .ai-immerse-seek')!.click());
    expect(onSeek).toHaveBeenCalledWith(1);
  });

  it('the AI brief is asked per chunk with the learner level, and its questions seek to their cue', async () => {
    const onSeek = renderBrief();
    act(() => host.querySelector<HTMLButtonElement>('[data-media-brief-run]')!.click());
    expect(pending.brief).toHaveLength(1);
    expect(pending.brief[0].request).toMatchObject({ studyLang: 'ja', answerLang: 'en', chunkIndex: 0, chunkCount: 1 });
    expect(String(pending.brief[0].request.level)).toContain('78%');
    expect(host.querySelector('.ai-immerse-busy')).not.toBeNull();
    await act(async () => {
      pending.brief[0].resolve({
        ok: true,
        result: { summary: 'A cat looks outside.', questions: [{ question: '猫は何を見ますか', answer: '外', cueId: 0 }] },
      });
    });
    await flush();
    expect(host.querySelector('[data-media-brief-result]')?.textContent).toContain('A cat looks outside.');
    act(() => host.querySelector<HTMLButtonElement>('[data-media-brief-question="0"] .ai-immerse-seek')!.click());
    expect(onSeek).toHaveBeenCalledWith(1);
  });

  it('Cancel aborts the request in main and drops its late answer', async () => {
    renderBrief();
    act(() => host.querySelector<HTMLButtonElement>('[data-media-brief-run]')!.click());
    act(() => buttonByText('aiImmerse.cancel')!.click());
    expect(api.aiImmerseCancel).toHaveBeenCalledWith(pending.brief[0].request.requestId);
    await act(async () => {
      pending.brief[0].resolve({ ok: true, result: { summary: 'late', questions: [{ question: 'q', answer: 'a', cueId: 0 }] } });
    });
    await flush();
    expect(host.querySelector('[data-media-brief-result]')).toBeNull();
    expect(host.textContent).toContain('aiError.cancelled');
  });

  it('a consent refusal shows the Settings prompt, an invalid answer its coded error', async () => {
    renderBrief();
    act(() => host.querySelector<HTMLButtonElement>('[data-media-brief-run]')!.click());
    await act(async () => pending.brief[0].resolve({ ok: false, code: 'consent', needsConsent: true }));
    await flush();
    expect(host.textContent).toContain('aiImmerse.needsConsent');
    act(() => host.querySelector<HTMLButtonElement>('[data-media-brief-pick]')!.click());
    await act(async () => pending.pick[0].resolve({ ok: false, code: 'invalid' }));
    await flush();
    expect(host.textContent).toContain('aiError.invalid');
  });

  it('AI line picks are re-checked against the CURRENT known words', async () => {
    renderBrief();
    act(() => host.querySelector<HTMLButtonElement>('[data-media-brief-pick]')!.click());
    const offered = (pending.pick[0].request.candidates as Array<{ id: number; target: string }>);
    const windowId = offered.find((c) => c.target === '窓')!.id;
    const promiseId = offered.find((c) => c.target === '約束')!.id;
    // The learner marks 約束 known meanwhile: that line has no unknown word left.
    known.words.add('約束');
    await act(async () => pending.pick[0].resolve({
      ok: true,
      result: { picks: [{ id: promiseId, reason: 'useful' }, { id: windowId, reason: 'common word' }] },
    }));
    await flush();
    expect(host.querySelector('[data-media-brief-picks]')?.getAttribute('data-media-brief-picks')).toBe('1');
    expect(host.textContent).toContain('common word');
    expect(host.textContent).not.toContain('useful');
  });

  it('no key: the setup prompt instead of AI buttons', () => {
    ai.state = { ...ai.state, ready: false, cloudReady: false };
    renderBrief();
    expect(host.querySelector('[data-media-brief-run]')).toBeNull();
    expect(host.textContent).toContain('aiImmerse.notReady');
  });
});

// ---- visual novels --------------------------------------------------------------

function capture(id: string, japanese: string, translation = '', at = 1_000): VisualNovelTextCapture {
  return {
    id,
    visualNovelId: 'vn',
    kind: 'dialogue',
    japanese,
    translation,
    speaker: '岡部',
    routeId: '',
    chapter: '',
    scene: '',
    source: 'manual',
    capturedAt: at,
  } as unknown as VisualNovelTextCapture;
}

describe('visual novel line panel', () => {
  const lines = [capture('a', '前の行。', '', 1_000), capture('b', 'まさか。', '', 2_000)];

  it('renders nothing while AI is off', () => {
    ai.state = { ...ai.state, enabled: false };
    act(() => root.render(<VisualNovelAiAssist line={lines[1]} captures={lines} onUseTranslation={vi.fn()} />));
    expect(host.innerHTML).toBe('');
  });

  it('the E signal explains with context; the AI translation is saved only on "Use"', async () => {
    const use = vi.fn();
    act(() => root.render(<VisualNovelAiAssist line={lines[1]} captures={lines} explainSignal={1} onUseTranslation={use} />));
    expect(pending.explain[0].request).toMatchObject({ surface: 'vn', text: 'まさか。', speaker: '岡部' });
    expect(String(pending.explain[0].request.context)).toContain('前の行。');
    act(() => host.querySelector<HTMLButtonElement>('[data-vn-ai-action="translate"]')!.click());
    await act(async () => pending.translate[0].resolve({ ok: true, result: { translation: 'No way.' } }));
    await flush();
    expect(use).not.toHaveBeenCalled();
    act(() => buttonByText('aiImmerse.vn.useTranslation')!.click());
    expect(use).toHaveBeenCalledWith('No way.');
  });

  it('a line that already has a translation is not offered one', () => {
    act(() => root.render(<VisualNovelAiAssist line={capture('c', 'はい。', 'Yes.')} captures={[]} onUseTranslation={vi.fn()} />));
    expect(host.querySelector('[data-vn-ai-action="translate"]')).toBeNull();
    expect(host.querySelector('[data-vn-ai-action="explain"]')).not.toBeNull();
  });

  it('E is the explain key only without modifiers and outside fields; M T R N C stay theirs', () => {
    expect(isVnAiExplainKey({ key: 'e' })).toBe(true);
    expect(isVnAiExplainKey({ key: 'E', ctrlKey: true })).toBe(false);
    expect(isVnAiExplainKey({ key: 'e', editable: true })).toBe(false);
    for (const key of ['m', 't', 'r', 'n', 'c']) expect(isVnAiExplainKey({ key })).toBe(false);
  });

  it('mining translates automatically ONLY when the learner switched it on', async () => {
    const line = capture('d', '行くぞ。');
    expect(await vnLineForMining(line, [line])).toBe(line);
    expect(api.aiImmerseTranslateLine).not.toHaveBeenCalled();

    saveAiImmersePrefs({ vnAutoTranslate: true });
    api.aiImmerseTranslateLine.mockImplementationOnce(async () => ({ ok: true, result: { translation: "Let's go." } }));
    const translated = await vnLineForMining(line, [line]);
    expect(translated.translation).toBe("Let's go.");
    expect(api.visualNovelUpdateCapture).toHaveBeenCalledWith('d', { translation: "Let's go." });

    // A failure never blocks the mine: the line goes through unchanged.
    api.aiImmerseTranslateLine.mockImplementationOnce(async () => ({ ok: false, code: 'timeout' }));
    expect(await vnLineForMining(line, [line])).toBe(line);
    ai.state = { ...ai.state, enabled: false };
    expect(await vnLineForMining(line, [line])).toBe(line);
  });
});

// ---- the Study command fallback ---------------------------------------------------

describe('Study command fallback', () => {
  it('shows the parsed intent and runs nothing until confirmed', async () => {
    const onConfirm = vi.fn();
    act(() => root.render(<StudyCommandAiFallback text="N3を外して" busy={false} onConfirm={onConfirm} onDismiss={vi.fn()} />));
    expect(pending.command[0].request).toMatchObject({ text: 'N3を外して' });
    const intent = { op: 'filter', args: { excludedJlptLevels: ['N3'] } };
    await act(async () => pending.command[0].resolve({ ok: true, result: intent }));
    await flush();
    expect(host.querySelector('[data-study-command-intent="filter"]')?.textContent)
      .toContain('study.command.intent.levels:{"levels":"N3"}');
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => host.querySelector<HTMLButtonElement>('[data-study-command-confirm]')!.click());
    expect(onConfirm).toHaveBeenCalledWith(intent);
  });

  it('"not understood" is said, with nothing to run', async () => {
    act(() => root.render(<StudyCommandAiFallback text="??" busy={false} onConfirm={vi.fn()} onDismiss={vi.fn()} />));
    await act(async () => pending.command[0].resolve({ ok: false, code: 'no-answer' }));
    await flush();
    expect(host.textContent).toContain('aiImmerse.command.notUnderstood');
    expect(host.querySelector('[data-study-command-confirm]')).toBeNull();
  });

  it('AI not ready: the setup prompt, and no request', () => {
    ai.state = { ...ai.state, ready: false };
    act(() => root.render(<StudyCommandAiFallback text="x" busy={false} onConfirm={vi.fn()} onDismiss={vi.fn()} />));
    expect(pending.command).toBeUndefined();
    expect(host.textContent).toContain('aiImmerse.notReady');
  });
});

// ---- the immersion reader ---------------------------------------------------------

describe('immersion reader AI tools', () => {
  function reader(): { current: HTMLDivElement } {
    const el = document.createElement('div');
    // One i+1 sentence: three words, one of them unknown (wk-0).
    el.innerHTML = '<p><span class="wk wk-3" data-lemma="彼">彼</span>は<span class="wk wk-0" data-lemma="約束">約束</span>を<span class="wk wk-3" data-lemma="守る">守った</span>。</p>';
    document.body.appendChild(el);
    return { current: el };
  }

  it('every control is an AI entry; Simplify only at low coverage; Explain lists the i+1 sentence', async () => {
    const ref = reader();
    act(() => root.render(
      <ImmersionAiTools readerRef={ref} readerHtml="x" coverage={{ tokens: 3, known: 2, knownPct: 95, unknownUnique: 1 }} studyLang="ja" currentUrl="https://example.jp/a" title="A" />,
    ));
    expect(host.querySelector('[data-imm5-ai-tools]')?.hasAttribute('data-ai-entry')).toBe(true);
    expect(host.querySelector('[data-imm5-action="ai-simplify"]')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('[data-imm5-action="ai-explain"]')!.click());
    expect(host.querySelectorAll('[data-imm5-ai-sentence]')).toHaveLength(1);
    act(() => buttonByText('aiImmerse.reader.explain')!.click());
    expect(pending.explain[0].request).toMatchObject({ surface: 'reader', target: '約束', text: '彼は約束を守った。' });
    await act(async () => pending.explain[0].resolve({
      ok: true,
      result: { translation: 'He kept his promise.', explanation: 'Plain past.', grammar: [], targetMeaning: 'promise' },
    }));
    await flush();
    expect(host.querySelector('[data-imm5-ai-answer]')?.textContent).toContain('He kept his promise.');
    ref.current.remove();
  });

  it('Simplify at low coverage shows the unknown words (no AI needed) and the rewrite beside the original', async () => {
    const ref = reader();
    act(() => root.render(
      <ImmersionAiTools readerRef={ref} readerHtml="y" coverage={{ tokens: 3, known: 2, knownPct: 67, unknownUnique: 1 }} studyLang="ja" currentUrl="" title="" />,
    ));
    act(() => host.querySelector<HTMLButtonElement>('[data-imm5-action="ai-simplify"]')!.click());
    expect(buttonByText('約束')).toBeDefined();
    act(() => buttonByText('aiImmerse.reader.simplify')!.click());
    expect(pending.simplify[0].request).toMatchObject({ unknownWords: ['約束'] });
    await act(async () => pending.simplify[0].resolve({ ok: true, result: { simplified: '彼は言ったことをした。', notes: [] } }));
    await flush();
    const compare = host.querySelector('.ai-immerse-compare');
    expect(compare?.textContent).toContain('彼は約束を守った。');
    expect(compare?.textContent).toContain('彼は言ったことをした。');
    expect(compare?.querySelector('.is-ai .ai-immerse-badge')).not.toBeNull();
    ref.current.remove();
  });
});
