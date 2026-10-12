// @vitest-environment jsdom
/**
 * Audit E6/F7 on the real panel, with a fake bridge whose replies resolve out
 * of order: an answer asked for line N must never appear under line N+1, and
 * "Save as note" must save the line the answer belongs to. The request also
 * carries the study language and the UI language.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notes = vi.hoisted(() => [] as Array<{ detail: string }>);

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key), lang: 'ja' }),
}));
vi.mock('../aiSetupClient', () => ({
  useAiReadiness: () => ({ loaded: true, enabled: true, cloudReady: true }),
}));
vi.mock('../notebookTimeline', () => ({
  appendNotebookEvent: (event: { detail: string }) => notes.push(event),
}));
vi.mock('../useStudyLanguage', () => ({
  useStudyLanguage: () => ({ lang: 'zh', script: 'simplified', tag: 'zh-Hans' }),
}));

import MediaStudyAssistantPanel, {
  mediaAssistantAnswerForLine,
  mediaAssistantLineKey,
} from '../components/media/MediaStudyAssistantPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function answer(summary: string) {
  return {
    ok: true,
    result: {
      mode: 'explain-dialogue',
      summary,
      translation: `${summary} (translation)`,
      simplifiedJapanese: '',
      grammar: [],
      vocabulary: [],
      examples: [],
      notes: [],
    },
  };
}

let host: HTMLDivElement;
let root: Root;
const pending: Array<{ text: string; resolve: (value: unknown) => void; request: Record<string, unknown> }> = [];

beforeEach(() => {
  notes.length = 0;
  pending.length = 0;
  (window as unknown as { api: unknown }).api = {
    mediaStudyAssist: (request: Record<string, unknown>) => new Promise((resolve) => {
      pending.push({ text: String(request.text), resolve, request });
    }),
  };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(sentence: string, lineId: string): void {
  act(() => {
    root.render(<MediaStudyAssistantPanel mediaId="m1" mediaTitle="Show" sentence={sentence} lineId={lineId} jlptLevel={null} />);
  });
}

function clickFirstMode(): void {
  act(() => {
    host.querySelector<HTMLButtonElement>('.media-study-assistant-actions button')!.click();
  });
}

describe('media assistant answers stay with their line', () => {
  it('drops a late answer for the previous line and saves the matching pair', async () => {
    render('第一句。', 'cue-1');
    clickFirstMode();
    expect(pending[0].request).toMatchObject({ text: '第一句。', studyLang: 'zh', answerLang: 'ja' });

    // The line moves on before line 1's answer arrives.
    render('第二句。', 'cue-2');
    clickFirstMode();
    await act(async () => {
      pending[1].resolve(answer('second answer'));
      await Promise.resolve();
    });
    await act(async () => {
      pending[0].resolve(answer('first answer'));
      await Promise.resolve();
    });
    expect(host.textContent).toContain('second answer');
    expect(host.textContent).not.toContain('first answer');

    act(() => {
      [...host.querySelectorAll('button')].find((button) => button.textContent === 'mediaAssistant.saveToNotebook')!.click();
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].detail).toContain('第二句。');
    expect(notes[0].detail).toContain('second answer');
    expect(notes[0].detail).not.toContain('第一句。');
  });

  it('two lines with the same text are still two lines', async () => {
    render('はい', 'cue-1');
    clickFirstMode();
    await act(async () => {
      pending[0].resolve(answer('yes, line one'));
      await Promise.resolve();
    });
    expect(host.textContent).toContain('yes, line one');
    render('はい', 'cue-9');
    expect(host.textContent).not.toContain('yes, line one');
  });

  it('labels the simplify mode neutrally for a non-Japanese learner', () => {
    render('第一句。', 'cue-1');
    const labels = [...host.querySelectorAll('.media-study-assistant-actions button')].map((button) => button.textContent);
    expect(labels).toContain('aiAgent.assistant.mode.simplify');
    expect(labels).not.toContain('mediaAssistant.mode.simplify-japanese');
  });

  it('the pure matcher never returns another line', () => {
    const key = mediaAssistantLineKey('a', 'x');
    const stored = { lineKey: key, sentence: 'x', result: answer('r').result as never };
    expect(mediaAssistantAnswerForLine(stored, key)).toBe(stored);
    expect(mediaAssistantAnswerForLine(stored, mediaAssistantLineKey('b', 'x'))).toBeNull();
    expect(mediaAssistantAnswerForLine(null, key)).toBeNull();
  });
});
