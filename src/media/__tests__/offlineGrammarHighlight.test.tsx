// @vitest-environment jsdom
/**
 * Subtitle audit 9b: grammar highlight did nothing in a fresh profile — every line said
 * "needs a cloud API key". The Grammar app's own library can find the patterns a line
 * contains without any AI, so the highlight now works offline and the AI adds the detail.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { localSentenceAnalysis } from '../../renderer/localGrammarAnalysis';
import { useCueAnalysis, type CueAnalysisState } from '../useCueAnalysis';

describe('the offline grammar highlight', () => {
  it('finds the library pattern in a subtitle line, at the right characters', () => {
    const line = 'いいですよ。駅の近くの公園に行きましょう。';
    const result = localSentenceAnalysis(line, 'ja');
    expect(result).not.toBeNull();
    const hit = result!.annotations.find((annotation) => annotation.text === 'ましょう');
    expect(hit).toBeDefined();
    expect(result!.sentence.slice(hit!.start, hit!.end)).toBe('ましょう');
    expect(hit!.headword).toMatch(/ましょう/);
    expect(hit!.level).toBe('N5');
    expect(hit!.meaning.length).toBeGreaterThan(0);
    expect(hit!.category).toBe('grammar');
  });

  it('keeps the spans in reading order and never overlapping', () => {
    const result = localSentenceAnalysis('そうですね。散歩に行きませんか？', 'ja');
    expect(result!.annotations.some((annotation) => annotation.text.startsWith('ませんか'))).toBe(true);
    const spans = result!.annotations;
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
    }
  });

  it('claims nothing it cannot place safely: a bare particle is not a grammar point', () => {
    expect(localSentenceAnalysis('猫に', 'ja')).toBeNull();
    expect(localSentenceAnalysis('', 'ja')).toBeNull();
  });
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function analyze(text: string, auto: boolean, offline = true): Promise<CueAnalysisState[]> {
  const seen: CueAnalysisState[] = [];
  function Probe(): null {
    const { state } = useCueAnalysis({ text, lang: 'ja', uiLang: 'en', auto, offline, errorLabel: 'failed' });
    seen.push(state);
    return null;
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<Probe />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return seen;
}

describe('useCueAnalysis without an AI key', () => {
  it('shows the offline highlight while playing, before anything is asked', async () => {
    const sentenceAnalyze = vi.fn();
    (window as unknown as { api: unknown }).api = { sentenceAnalyze };
    const states = await analyze('明日また来ましょう。', false);
    const last = states[states.length - 1];
    expect(last.kind).toBe('ready');
    expect(last.kind === 'ready' && last.offline).toEqual({ ai: 'idle' });
    expect(sentenceAnalyze).not.toHaveBeenCalled();
  });

  it('paused with no key: the highlight stays and says why it is offline', async () => {
    const sentenceAnalyze = vi.fn(async () => ({ ok: false, needsKey: true, error: 'No AI API key configured.' }));
    (window as unknown as { api: unknown }).api = { sentenceAnalyze };
    const states = await analyze('いいですよ。駅の近くの公園に行きましょう。', true);
    const last = states[states.length - 1];
    expect(sentenceAnalyze).toHaveBeenCalledTimes(1);
    expect(last.kind).toBe('ready');
    if (last.kind !== 'ready') return;
    expect(last.offline).toEqual({ ai: 'needsKey' });
    expect(last.result.annotations.some((annotation) => annotation.text === 'ましょう')).toBe(true);
  });

  it('the AI result replaces the offline one when there is an AI', async () => {
    const aiResult = {
      sentence: 'いいですよ。駅の近くの公園に行きましょう。',
      translations: { en: "Sure. Let's go to the park near the station." },
      annotations: [],
      nuance: [],
      pitfalls: [],
    };
    (window as unknown as { api: unknown }).api = {
      sentenceAnalyze: vi.fn(async () => ({ ok: true, result: aiResult })),
    };
    const states = await analyze('いいですよ。駅の近くの公園に行きましょう。 ', true);
    const last = states[states.length - 1];
    expect(last).toEqual({ kind: 'ready', result: aiResult });
  });

  it('with highlighting off, nothing is computed', async () => {
    (window as unknown as { api: unknown }).api = { sentenceAnalyze: vi.fn() };
    const states = await analyze('いいですよ。公園に行きましょう。', false, false);
    expect(states[states.length - 1]).toEqual({ kind: 'idle' });
  });
});
