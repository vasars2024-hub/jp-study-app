// @vitest-environment jsdom
/**
 * The speaking and writing panels as rendered, against a fake bridge and fake
 * speech capture — no provider, no model, no microphone, no download:
 *
 * - shadowing feedback: the Whisper install notice when the model is missing
 *   (and no download until the button), the deterministic score with AI off,
 *   Cancel, and the optional AI explanation;
 * - writing help: quick checks with AI off, and corrections that reach the note
 *   only after the learner accepts and applies them (Undo restores);
 * - the conversation partner: scripted drills with AI off, the AI reply with the
 *   learner's own text kept beside its correction, mining a word, the fallback.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const readiness = vi.hoisted(() => ({ loaded: true, enabled: true }));
vi.mock('../aiSetupClient', () => ({
  useAiReadiness: () => ({ ...readiness, ready: true, cloudReady: true, localReady: false }),
  openAiSettings: vi.fn(),
}));

const speech = vi.hoisted(() => ({
  whisperReadiness: vi.fn(),
  transcribeRecording: vi.fn(),
  startMicRecording: vi.fn(),
}));
vi.mock('../speechCapture', () => speech);

const prefetch = vi.hoisted(() => vi.fn(() => ({ done: new Promise<void>(() => undefined), cancel: vi.fn() })));
vi.mock('../whisperModelCache', () => ({ prefetchWhisperModel: prefetch }));
vi.mock('../whisperSettings', () => ({ loadWhisperDevice: () => 'auto' }));

const mining = vi.hoisted(() => ({ mineToStudy: vi.fn(async () => ({ created: true })) }));
vi.mock('../studyMining', () => mining);

const levels = vi.hoisted(() => new Map<string, number>());
vi.mock('../knownWords', async (importOriginal) => ({
  ...await importOriginal<typeof import('../knownWords')>(),
  getLevel: (word: string) => levels.get(word) ?? 0,
  listKnownEntries: () => [...levels.entries()].map(([word, level]) => ({ word, level })),
}));
vi.mock('../tokenizer', async (importOriginal) => ({
  ...await importOriginal<typeof import('../tokenizer')>(),
  getTokenizer: () => Promise.resolve({}),
}));
// Space-separated "sentences" stand in for kuromoji: every word is a content word.
vi.mock('../studyTokens', async (importOriginal) => ({
  ...await importOriginal<typeof import('../studyTokens')>(),
  studyTokens: (text: string) => text.split(/\s+/).filter(Boolean).map((word) => ({
    surface: word, lemma: word, content: !/^[。、？]$/.test(word), proper: false, pos: '', posDetail: '',
  })),
}));
// One token per kana character for the shadowing comparison.
vi.mock('../components/speak/speakText', async (importOriginal) => ({
  ...await importOriginal<typeof import('../components/speak/speakText')>(),
  shadowTokensFor: async (text: string) => [...text].map((surface) => ({ surface })),
}));

import ShadowingFeedback from '../components/speak/ShadowingFeedback';
import WritingCorrection from '../components/speak/WritingCorrection';
import ConversationPartner from '../components/speak/ConversationPartner';

const api = {
  aiSpeakShadowing: vi.fn(),
  aiSpeakConversation: vi.fn(),
  aiSpeakCorrect: vi.fn(),
  aiSpeakJournal: vi.fn(),
  aiStudyCancel: vi.fn(async () => true),
};

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
  // The recording is an object URL; reading it back is all `fetch` does here.
  Object.defineProperty(globalThis, 'fetch', {
    value: vi.fn(async () => ({ blob: async () => new Blob(['x']) })),
    configurable: true,
    writable: true,
  });
});

beforeEach(() => {
  localStorage.clear();
  for (const fn of Object.values(api)) fn.mockReset();
  api.aiStudyCancel.mockResolvedValue(true);
  for (const fn of Object.values(speech)) fn.mockReset();
  prefetch.mockClear();
  mining.mineToStudy.mockClear();
  levels.clear();
  readiness.loaded = true;
  readiness.enabled = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function render(node: ReactElement): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

function button(name: RegExp): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => name.test(b.textContent ?? '') || name.test(b.getAttribute('aria-label') ?? ''));
  if (!found) throw new Error(`no button ${name}: ${[...host.querySelectorAll('button')].map((b) => b.textContent).join(' | ')}`);
  return found as HTMLButtonElement;
}

async function click(name: RegExp): Promise<void> {
  await act(async () => {
    button(name).click();
  });
}

const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

function typeInto(element: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('shadowing feedback', () => {
  const props = { audioUrl: 'blob:take', expected: 'ねこがすき', cueSec: 1.5, studyLang: 'ja' as const, onReplayOriginal: vi.fn() };

  it('no Whisper model: says so with the install button, and nothing downloads until it is pressed', async () => {
    speech.whisperReadiness.mockResolvedValue({ ready: false, tier: 'kotoba-whisper', sizeBytes: 1_500_000_000 });
    await render(<ShadowingFeedback {...props} />);
    await flush();
    expect(host.querySelector('[data-whisper-install="kotoba-whisper"]')).not.toBeNull();
    expect(speech.transcribeRecording).not.toHaveBeenCalled();
    expect(prefetch).not.toHaveBeenCalled();
    await click(/Download the speech model/);
    await flush();
    expect(prefetch).toHaveBeenCalledWith('kotoba-whisper', 'auto', expect.any(Function));
    expect(host.textContent).toContain('Downloading the speech model');
  });

  it('with AI off the deterministic check still scores and marks the line', async () => {
    readiness.enabled = false;
    speech.whisperReadiness.mockResolvedValue({ ready: true, tier: 'kotoba-whisper', sizeBytes: 1 });
    speech.transcribeRecording.mockResolvedValue({ ok: true, text: 'ねこすき', durationSec: 2, spokenSec: 1.4 });
    await render(<ShadowingFeedback {...props} />);
    await flush();
    await flush();
    expect(host.textContent).toContain('Sound match: 80%');
    expect(host.querySelector('.speak-tok.is-miss')?.textContent).toBe('が');
    expect(host.textContent).toContain('Not heard clearly: が');
    expect(host.textContent).toContain('Pace: close to the original');
    expect(host.textContent).not.toContain('Explain with AI');
  });

  it('Cancel stops the transcription', async () => {
    speech.whisperReadiness.mockResolvedValue({ ready: true, tier: 'kotoba-whisper', sizeBytes: 1 });
    speech.transcribeRecording.mockReturnValue(new Promise(() => undefined));
    await render(<ShadowingFeedback {...props} />);
    await flush();
    await click(/^Cancel$/);
    expect(host.textContent).toContain('Check cancelled.');
  });

  it('"Explain with AI" sends text only and shows the answer as AI-labelled plain text', async () => {
    speech.whisperReadiness.mockResolvedValue({ ready: true, tier: 'kotoba-whisper', sizeBytes: 1 });
    speech.transcribeRecording.mockResolvedValue({ ok: true, text: 'ねこすき', durationSec: 2, spokenSec: 1.4 });
    api.aiSpeakShadowing.mockResolvedValue({ ok: true, result: {
      summary: '<b>が</b> was skipped.', issues: [{ focus: 'word', explanation: 'Say every particle.', tip: '' }],
    } });
    await render(<ShadowingFeedback {...props} />);
    await flush();
    await flush();
    await click(/Explain with AI/);
    await flush();
    const request = api.aiSpeakShadowing.mock.calls[0][0];
    expect(request).toMatchObject({ lang: 'ja', expected: 'ねこがすき', heard: 'ねこすき', score: 80, missed: ['が'] });
    expect(JSON.stringify(request)).not.toContain('blob:');
    expect(host.textContent).toContain('AI suggestion');
    expect(host.querySelector('.ai-study-answer b')).toBeNull();
    expect(host.textContent).toContain('<b>が</b> was skipped.');
  });

  it('Russian is not compared by sound', async () => {
    await render(<ShadowingFeedback {...props} studyLang="ru" />);
    expect(host.querySelector('[data-shadow-feedback="unsupported"]')).not.toBeNull();
    expect(speech.whisperReadiness).not.toHaveBeenCalled();
  });
});

describe('writing help', () => {
  const note = '昨日は雨がふるでした。私はは家にいました。';

  it('quick checks work with AI off, and there is no AI button', async () => {
    readiness.enabled = false;
    await render(<WritingCorrection text={note} studyLang="ja" onApply={vi.fn()} />);
    await click(/Writing help/);
    expect(host.textContent).toContain('Doubled word or particle: "はは"');
    expect(host.textContent).not.toContain('Correct my Japanese');
  });

  it('nothing reaches the note until a change is accepted and applied; Undo restores', async () => {
    const onApply = vi.fn();
    api.aiSpeakCorrect.mockResolvedValue({ ok: true, result: {
      text: note,
      overall: 'Two slips.',
      edits: [
        { id: 'e1', start: 5, original: 'ふるでした', corrected: '降りました', explanation: 'Past of 降る.', kind: 'conjugation' },
        { id: 'e2', start: 11, original: '私はは', corrected: '私は', explanation: 'Doubled は.', kind: 'particle' },
      ],
    } });
    await render(<WritingCorrection text={note} studyLang="ja" onApply={onApply} />);
    await click(/Writing help/);
    await click(/Correct my Japanese/);
    await flush();
    expect(api.aiSpeakCorrect.mock.calls[0][0]).toMatchObject({ text: note, studyLang: 'ja', answerLang: 'en' });
    expect(host.querySelectorAll('.speak-edit')).toHaveLength(2);
    expect(host.querySelector('.speak-diff-del')?.textContent).toContain('ふる');
    expect(onApply).not.toHaveBeenCalled();
    expect(button(/Apply accepted changes/).disabled).toBe(true);

    const checkbox = host.querySelectorAll<HTMLInputElement>('.speak-edit input[type="checkbox"]')[1];
    await act(async () => {
      checkbox.click();
    });
    await click(/Apply accepted changes \(1\)/);
    expect(onApply).toHaveBeenCalledWith('昨日は雨がふるでした。私は家にいました。');
    await click(/Undo the changes/);
    expect(onApply).toHaveBeenLastCalledWith(note);
  });

  it('a selection is checked on its own and spliced back in place', async () => {
    const onApply = vi.fn();
    const text = 'Notes: 私はは学生です。';
    api.aiSpeakCorrect.mockResolvedValue({ ok: true, result: {
      text: '私はは学生です。', overall: '',
      edits: [{ id: 'e1', start: 0, original: '私はは', corrected: '私は', explanation: 'Doubled.', kind: 'particle' }],
    } });
    await render(<WritingCorrection text={text} selection={{ start: 6, end: text.length }} studyLang="ja" onApply={onApply} />);
    await click(/Writing help/);
    expect(host.textContent).toContain('Works on the selected text.');
    await click(/Correct my Japanese/);
    await flush();
    expect(api.aiSpeakCorrect.mock.calls[0][0].text).toBe('私はは学生です。');
    await click(/Apply all changes/);
    expect(onApply).toHaveBeenCalledWith('Notes: 私は学生です。');
  });

  it('refuses to apply to a text that changed after the check', async () => {
    const onApply = vi.fn();
    api.aiSpeakCorrect.mockResolvedValue({ ok: true, result: {
      text: note, overall: '',
      edits: [{ id: 'e1', start: 5, original: 'ふるでした', corrected: '降りました', explanation: 'x', kind: 'conjugation' }],
    } });
    await render(<WritingCorrection text={note} studyLang="ja" onApply={onApply} />);
    await click(/Writing help/);
    await click(/Correct my Japanese/);
    await flush();
    await act(async () => {
      root?.render(<WritingCorrection text={note.replace('雨', '雪')} studyLang="ja" onApply={onApply} />);
    });
    await click(/Apply all changes/);
    expect(onApply).not.toHaveBeenCalled();
    expect(host.textContent).toContain('The text changed after it was checked');
  });

  it('a failure is said in the UI language from its code, with Cancel while running', async () => {
    let finish: (value: unknown) => void = () => undefined;
    api.aiSpeakCorrect.mockReturnValue(new Promise((resolve) => {
      finish = resolve;
    }));
    await render(<WritingCorrection text={note} studyLang="ja" onApply={vi.fn()} />);
    await click(/Writing help/);
    await click(/Correct my Japanese/);
    expect(host.textContent).toContain('Checking your writing');
    await act(async () => {
      finish({ ok: false, code: 'invalid', error: 'raw English from main' });
    });
    await flush();
    expect(host.textContent).not.toContain('raw English from main');
    expect(host.querySelector('.ai-study-error')).not.toBeNull();
  });
});

describe('conversation partner', () => {
  it('with AI off, scripted drills answer and no request is made', async () => {
    readiness.enabled = false;
    await render(<ConversationPartner />);
    await click(/Start the conversation/);
    expect(host.textContent).toContain('こんにちは。今日は何をしましたか？');
    expect(host.textContent).toContain('Scripted line');
    expect(api.aiSpeakConversation).not.toHaveBeenCalled();
  });

  it('the AI reply is coloured by known words, the learner keeps their text beside the correction, words can be mined', async () => {
    levels.set('水', 3);
    api.aiSpeakConversation
      .mockResolvedValueOnce({ ok: true, engine: 'local', result: { reply: 'いらっしゃいませ 何 に しますか', translation: 'Welcome.', correction: null, knownSampleSent: true } })
      .mockResolvedValueOnce({ ok: true, engine: 'local', result: {
        reply: 'お水 です ね', translation: 'Water, right?',
        correction: { corrected: '水をください', explanation: 'ください takes を.' }, knownSampleSent: true,
      } });
    await render(<ConversationPartner />);
    await click(/Start the conversation/);
    await flush();
    const first = api.aiSpeakConversation.mock.calls[0][0];
    expect(first).toMatchObject({ message: '', studyLang: 'ja', scenario: 'free', shareStudyData: 'unset' });
    expect(first.knownWords).toEqual(['水']);
    expect(host.querySelectorAll('.speak-word.is-new').length).toBeGreaterThan(0);
    expect(host.textContent).toMatch(/New words: \d+ of \d+/);

    const box = host.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      typeInto(box, '水がください');
    });
    await click(/^Send$/);
    await flush();
    const second = api.aiSpeakConversation.mock.calls[1][0];
    expect(second).toMatchObject({ message: '水がください', correct: true });
    expect(second.history).toEqual([{ role: 'partner', text: 'いらっしゃいませ 何 に しますか' }]);
    const userTurn = host.querySelector('.speak-turn.is-user') as HTMLElement;
    expect(userTurn.querySelector('p')?.textContent).toBe('水がください');
    expect(userTurn.querySelector('.speak-diff-ins')?.textContent).toContain('を');
    expect(userTurn.textContent).toContain('ください takes を.');

    const word = [...host.querySelectorAll<HTMLButtonElement>('.speak-word')].find((b) => b.textContent === 'お水');
    await act(async () => {
      word?.click();
    });
    await click(/Mine “お水”/);
    await flush();
    expect(mining.mineToStudy).toHaveBeenCalledWith(expect.objectContaining({
      word: 'お水', sentence: 'お水 です ね', studyLang: 'ja', studyKind: 'vocabulary',
    }));
    expect(host.textContent).toContain('Saved to your deck: お水');

    const stored = Object.keys(localStorage).find((key) => key.startsWith('jp-study.conversation.v1.'));
    expect(stored).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(stored as string) ?? '{}').turns).toHaveLength(3);
  });

  it('a failed AI turn keeps the message and offers the scripted line', async () => {
    api.aiSpeakConversation.mockResolvedValue({ ok: false, code: 'no-local-model', needsLocalModel: true });
    await render(<ConversationPartner />);
    await click(/Start the conversation/);
    await flush();
    expect(host.textContent).toContain('Continue with a scripted line');
    await click(/Continue with a scripted line/);
    expect(host.textContent).toContain('こんにちは。今日は何をしましたか？');
  });

  it('voice input asks for the Whisper model instead of downloading it', async () => {
    api.aiSpeakConversation.mockResolvedValue({ ok: true, result: { reply: 'こんにちは', translation: 'Hi', correction: null, knownSampleSent: false } });
    speech.whisperReadiness.mockResolvedValue({ ready: false, tier: 'whisper-small', sizeBytes: 490_000_000 });
    await render(<ConversationPartner />);
    await click(/Start the conversation/);
    await flush();
    await click(/Speak instead/);
    await flush();
    expect(speech.startMicRecording).not.toHaveBeenCalled();
    expect(host.querySelector('[data-whisper-install="whisper-small"]')).not.toBeNull();
    expect(prefetch).not.toHaveBeenCalled();
  });
});
