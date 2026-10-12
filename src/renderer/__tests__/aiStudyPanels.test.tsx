// @vitest-environment jsdom
/**
 * The optional AI study panels as rendered, against a fake bridge (no provider,
 * no model): spinner + Cancel, errors from shared codes, the deterministic
 * fallbacks, and — the rule that matters most — nothing is written to a card
 * until the learner explicitly approves it.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const readiness = vi.hoisted(() => ({ loaded: true, enabled: true }));
vi.mock('../aiSetupClient', () => ({
  useAiReadiness: () => ({ ...readiness, ready: true, cloudReady: true, localReady: false }),
  openAiSettings: vi.fn(),
}));

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
    surface: word, lemma: word, content: true, proper: false, pos: '', posDetail: '',
  })),
}));

import AiWhyWrongPanel from '../components/flashcards/AiWhyWrongPanel';
import AiLeechRescuePanel from '../components/flashcards/AiLeechRescuePanel';
import AiCardExtras from '../components/flashcards/AiCardExtras';
import AiContextExplain from '../components/lexicon/AiContextExplain';
import { findDeckCard } from '../flashcardDeck';
import type { ExampleResult } from '../../shared/types';

const api = {
  aiStudyWhyWrong: vi.fn(),
  aiStudyExampleSentences: vi.fn(),
  aiStudyLeechRescue: vi.fn(),
  aiStudyContextExplain: vi.fn(),
  aiStudyCancel: vi.fn(async () => true),
  searchExamples: vi.fn(async (): Promise<ExampleResult> => ({ query: '', examples: [] })),
};

const CARDS = [
  { id: 'hot', word: '暑い', reading: 'あつい', meaning: 'hot (weather)', addedAt: 1, srs: { lapses: 9 } },
  { id: 'touch', word: '熱い', reading: 'あつい', meaning: 'hot (to the touch)', addedAt: 2 },
  { id: 'eat', word: '食べる', reading: 'たべる', meaning: 'to eat', addedAt: 3 },
];

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('jp-flashcard-deck', JSON.stringify({ folders: [], cards: CARDS }));
  for (const fn of Object.values(api)) fn.mockReset();
  api.aiStudyCancel.mockResolvedValue(true);
  api.searchExamples.mockResolvedValue({ query: '', examples: [] });
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

describe('"Why was I wrong?"', () => {
  const props = {
    card: { id: 'hot', word: '暑い', reading: 'あつい', meaning: 'hot (weather)' },
    typed: 'warm',
    expected: 'hot (weather)',
    direction: 'target-to-meaning' as const,
    verdict: 'wrong' as const,
  };

  it('shows the deck fallback at once and asks the AI on open', async () => {
    api.aiStudyWhyWrong.mockResolvedValue({ ok: true, result: {
      confusion: 'synonym', explanation: 'Weather vs. touch.', tip: '', acceptable: false, acceptableReason: '',
    } });
    await render(<AiWhyWrongPanel {...props} />);
    expect(host.querySelector('[data-ai-entry]')).not.toBeNull();
    await click(/Why was I wrong/);
    await flush();
    expect(host.textContent).toContain('熱い'); // the homophone from the deck
    expect(host.textContent).toContain('Weather vs. touch.');
    expect(host.textContent).toContain('AI suggestion');
    const request = api.aiStudyWhyWrong.mock.calls[0][0];
    expect(request).toMatchObject({ typed: 'warm', direction: 'target-to-meaning', answerLang: 'en' });
    expect(request.neighbours[0].word).toBe('熱い');
    expect(host.textContent).not.toMatch(/Accept/);
  });

  it('an acceptable verdict is only a button; the card changes on the press, not before', async () => {
    api.aiStudyWhyWrong.mockResolvedValue({ ok: true, result: {
      confusion: 'synonym', explanation: 'Close enough.', tip: '', acceptable: true, acceptableReason: 'Same meaning.',
    } });
    const onAccepted = vi.fn();
    await render(<AiWhyWrongPanel {...props} onAccepted={onAccepted} />);
    await click(/Why was I wrong/);
    await flush();
    expect(findDeckCard('hot')?.acceptedAnswers).toBeUndefined();
    await click(/Accept "warm" as correct/);
    expect(findDeckCard('hot')?.acceptedAnswers).toEqual({ meaning: ['warm'] });
    expect(onAccepted).toHaveBeenCalledWith('warm');
    expect(host.textContent).toContain('will be accepted');
  });

  it('a failure is said from its code, and the fallback stays', async () => {
    api.aiStudyWhyWrong.mockResolvedValue({ ok: false, code: 'rate-limit', error: 'HTTP 429 raw provider text' });
    await render(<AiWhyWrongPanel {...props} />);
    await click(/Why was I wrong/);
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/rate-limiting/);
    expect(host.textContent).not.toContain('HTTP 429');
    expect(host.textContent).toContain('熱い');
  });

  it('consent denied points to Settings > AI', async () => {
    api.aiStudyWhyWrong.mockResolvedValue({ ok: false, code: 'consent', needsConsent: true });
    await render(<AiWhyWrongPanel {...props} />);
    await click(/Why was I wrong/);
    await flush();
    expect(host.textContent).toContain('not allowed to use the cloud');
    expect(button(/Open Settings > AI/)).toBeTruthy();
  });

  it('Cancel aborts the request in main and drops the late reply', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    api.aiStudyWhyWrong.mockImplementation(() => new Promise((r) => {
      resolve = r;
    }));
    await render(<AiWhyWrongPanel {...props} />);
    await click(/Why was I wrong/);
    expect(host.querySelector('.ai-study-spinner')).not.toBeNull();
    await click(/^Cancel$/);
    const requestId = api.aiStudyWhyWrong.mock.calls[0][0].requestId;
    expect(api.aiStudyCancel).toHaveBeenCalledWith(requestId);
    await act(async () => resolve({ ok: true, result: { confusion: 'other', explanation: 'late', tip: '', acceptable: false, acceptableReason: '' } }));
    expect(host.textContent).not.toContain('late');
    expect(host.textContent).toContain('Cancelled.');
  });
});

describe('leech rescue', () => {
  const suggestion = { mnemonic: 'Summer sun.', clearerMeaning: 'hot (of weather, air)', distinction: '熱い is for things you touch.' };

  it('writes only the ticked parts, and only on Approve', async () => {
    api.aiStudyLeechRescue.mockResolvedValue({ ok: true, result: suggestion });
    await render(<AiLeechRescuePanel cardIds={['hot']} />);
    await click(/Suggest rescue/);
    await flush();
    expect(api.aiStudyLeechRescue.mock.calls[0][0]).toMatchObject({ card: { word: '暑い', lapses: 9 } });
    expect(findDeckCard('hot')?.mnemonic).toBeUndefined();
    // The clearer meaning replaces the learner's own: it starts unticked.
    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.map((box) => box.checked)).toEqual([true, false, true]);
    await click(/^Approve$/);
    const card = findDeckCard('hot');
    expect(card).toMatchObject({ mnemonic: 'Summer sun.', distinction: '熱い is for things you touch.', meaning: 'hot (weather)' });
  });

  it('Reject changes nothing', async () => {
    api.aiStudyLeechRescue.mockResolvedValue({ ok: true, result: suggestion });
    await render(<AiLeechRescuePanel cardIds={['hot']} />);
    await click(/Suggest rescue/);
    await flush();
    await click(/^Reject$/);
    expect(findDeckCard('hot')).toMatchObject({ meaning: 'hot (weather)' });
    expect(findDeckCard('hot')?.mnemonic).toBeUndefined();
    expect(host.textContent).toContain('nothing was changed');
  });

  it('without AI the deterministic rescue is offered: a partial hint and the similar cards', async () => {
    api.aiStudyLeechRescue.mockResolvedValue({ ok: false, code: 'no-local-model', needsLocalModel: true });
    await render(<AiLeechRescuePanel cardIds={['hot']} />);
    await click(/Suggest rescue/);
    await flush();
    expect(host.textContent).toContain('あ…');
    expect(host.textContent).toContain('熱い');
    await click(/Use the hint as memory aid/);
    expect(findDeckCard('hot')?.mnemonic).toBe('あ…');
  });

  it('batch: one request at a time, each approved on its own', async () => {
    api.aiStudyLeechRescue.mockResolvedValue({ ok: true, result: { ...suggestion, distinction: '' } });
    await render(<AiLeechRescuePanel cardIds={['hot', 'touch']} />);
    await click(/Suggest rescue for 2 leeches/);
    await click(/Suggest for all/);
    await flush();
    expect(api.aiStudyLeechRescue).toHaveBeenCalledTimes(2);
    const approves = [...host.querySelectorAll('button')].filter((b) => b.textContent === 'Approve');
    expect(approves).toHaveLength(2);
    await act(async () => approves[1].click());
    expect(findDeckCard('touch')?.mnemonic).toBe('Summer sun.');
    expect(findDeckCard('hot')?.mnemonic).toBeUndefined();
  });

  it('a batch stops at a failure every card would repeat', async () => {
    api.aiStudyLeechRescue.mockResolvedValue({ ok: false, code: 'consent', needsConsent: true });
    await render(<AiLeechRescuePanel cardIds={['hot', 'touch']} />);
    await click(/Suggest rescue for 2 leeches/);
    await click(/Suggest for all/);
    await flush();
    expect(api.aiStudyLeechRescue).toHaveBeenCalledTimes(1);
  });

  it('is not offered while AI is off', async () => {
    readiness.enabled = false;
    await render(<AiLeechRescuePanel cardIds={['hot']} />);
    expect(host.textContent).toBe('');
  });
});

describe('i+1 example sentences', () => {
  it('discards sentences with more than one unknown word and adds only the chosen ones', async () => {
    for (const word of ['私', 'は', 'パン', 'を', '毎日']) levels.set(word, 3);
    api.aiStudyExampleSentences.mockResolvedValue({ ok: true, result: { sentences: [
      { text: '私 は パン を 食べる', translation: 'I eat bread.' },
      { text: '彼女 は 寿司 を 食べる', translation: 'She eats sushi.' },
    ] } });
    await render(<AiCardExtras cardId="eat" />);
    await click(/i\+1 example sentences/);
    await click(/Write with AI/);
    await flush();
    const request = api.aiStudyExampleSentences.mock.calls[0][0];
    expect(request.knownWords).toEqual(expect.arrayContaining(['私', 'パン']));
    expect(host.textContent).toContain('1 sentence discarded');
    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes).toHaveLength(1);
    expect(boxes[0].checked).toBe(true);
    expect(findDeckCard('eat')?.exampleSentences).toBeUndefined();
    await click(/Add to card/);
    expect(findDeckCard('eat')?.exampleSentences).toEqual([{ text: '私 は パン を 食べる', translation: 'I eat bread.', origin: 'ai' }]);
    // The kept sentence is shown with the card, labelled as AI-written, and removable.
    expect(host.textContent).toContain('AI-written');
    await click(/Remove example/);
    expect(findDeckCard('eat')?.exampleSentences).toEqual([]);
  });

  it('the corpus fallback works with no model at all', async () => {
    for (const word of ['私', 'は', 'を']) levels.set(word, 3);
    api.aiStudyExampleSentences.mockResolvedValue({ ok: false, code: 'no-key', needsKey: true });
    api.searchExamples.mockResolvedValue({ query: '', examples: [{ jp: '私 は りんご を 食べる', en: 'I eat an apple.' }, { jp: '私 は 食べる', en: 'I eat.' }] });
    await render(<AiCardExtras cardId="eat" />);
    await click(/i\+1 example sentences/);
    await click(/Find in the example corpus/);
    await flush();
    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes).toHaveLength(1); // りんご is unknown: that one is discarded
    expect(boxes[0].checked).toBe(false); // corpus picks are never pre-ticked
    expect(api.aiStudyExampleSentences).not.toHaveBeenCalled();
  });

  it('kept extras show even with AI off; the generator does not', async () => {
    localStorage.setItem('jp-flashcard-deck', JSON.stringify({ folders: [], cards: [
      { ...CARDS[2], mnemonic: 'Tabe-ru: table.', exampleSentences: [{ text: 'パン を 食べる', origin: 'corpus' }] },
    ] }));
    readiness.enabled = false;
    const { resetDeckMemoryForTests } = await import('../flashcardDeck');
    resetDeckMemoryForTests();
    await render(<AiCardExtras cardId="eat" />);
    expect(host.textContent).toContain('Tabe-ru: table.');
    expect(host.textContent).toContain('パン を 食べる');
    expect(host.textContent).not.toContain('i+1 example sentences');
  });

  it('in the deck panel with AI off: saved extras are editable, the corpus lookup works, Generate is gone', async () => {
    localStorage.setItem('jp-flashcard-deck', JSON.stringify({ folders: [], cards: [
      { ...CARDS[2], mnemonic: 'Tabe-ru: table.', distinction: 'Not 食う.', acceptedAnswers: { meaning: ['to dine'] } },
    ] }));
    readiness.enabled = false;
    const { resetDeckMemoryForTests } = await import('../flashcardDeck');
    resetDeckMemoryForTests();
    await render(<AiCardExtras cardId="eat" inDeckPanel />);
    expect(host.textContent).toContain('Tabe-ru: table.');
    expect(host.textContent).toContain('to dine');
    // Nothing in the panel hides with the AI-off flag except the Generate action.
    expect(host.querySelector('[data-ai-entry]')).toBeNull();

    // Edit the memory aid; remove the distinction and the accepted answer.
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-extras-action="edit-mnemonic"]')!.click();
    });
    const area = host.querySelector('textarea')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(area, 'Tabe-ru: eat at the table.');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(/^Save$/);
    await click(/Remove the "not to confuse with" note/);
    await click(/Stop accepting "to dine"/);
    const saved = findDeckCard('eat');
    expect(saved?.mnemonic).toBe('Tabe-ru: eat at the table.');
    expect(saved?.distinction).toBeUndefined();
    expect(saved?.acceptedAnswers).toBeUndefined();

    // The examples tool opens without AI: corpus yes, Generate no.
    await click(/i\+1 example sentences/);
    expect(() => button(/Write with AI/)).toThrow();
    expect(button(/Find in the example corpus/)).toBeTruthy();
    expect(api.aiStudyExampleSentences).not.toHaveBeenCalled();
  });

  it('in the deck panel, a card with nothing saved says so instead of rendering nothing', async () => {
    readiness.enabled = false;
    await render(<AiCardExtras cardId="touch" inDeckPanel />);
    expect(host.textContent).toContain('Nothing saved for this card yet');
  });
});

describe('explain in context', () => {
  const senses = [{ definitions: ['to hang'] }, { definitions: ['to put on (glasses)'] }, { definitions: ['to call'] }];

  it('highlights the sense the AI picked, with its reason', async () => {
    api.aiStudyContextExplain.mockResolvedValue({ ok: true, result: { senseIndex: 1, explanation: '眼鏡を marks glasses.', confidence: 'high' } });
    await render(<AiContextExplain word="かける" reading="かける" lang="ja" sentence="眼鏡をかける。" senses={senses} />);
    await click(/Explain in context/);
    await flush();
    const fit = host.querySelector('[aria-current="true"]');
    expect(fit?.textContent).toContain('to put on (glasses)');
    expect(fit?.textContent).toContain('fits here');
    expect(host.textContent).toContain('眼鏡を marks glasses.');
    expect(api.aiStudyContextExplain.mock.calls[0][0]).toMatchObject({ sentence: '眼鏡をかける。', senses: ['to hang', 'to put on (glasses)', 'to call'] });
  });

  it('on an invalid reply, the first sense is marked as the most common (labelled heuristic)', async () => {
    api.aiStudyContextExplain.mockResolvedValue({ ok: false, code: 'invalid' });
    await render(<AiContextExplain word="かける" reading="かける" lang="ja" sentence="眼鏡をかける。" senses={senses} />);
    await click(/Explain in context/);
    await flush();
    const fit = host.querySelector('[aria-current="true"]');
    expect(fit?.textContent).toContain('to hang');
    expect(fit?.textContent).toContain('most common');
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/could not be read/);
  });

  it('renders nothing without a sentence', async () => {
    await render(<AiContextExplain word="かける" reading="" lang="ja" sentence="" senses={senses} />);
    expect(host.textContent).toBe('');
  });
});
