// @vitest-environment jsdom
/**
 * A word mined from the Reading Lens' word panel is a companion card: it is
 * forwarded to the main window (whose deck and Anki queue own it) with the
 * scanned region as its picture and the window the Lens was opened over as its
 * source — never mined inside the Lens overlay's own renderer. Opening a word
 * also makes it "the last lookup" for the Mine-last-lookup hotkey.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CompanionMineOutcome, CompanionMineRequest } from '../../shared/companion';

const h = vi.hoisted(() => ({
  studyLang: 'ja' as 'ja' | 'zh' | 'ru',
  forwarded: [] as CompanionMineRequest[],
  noted: [] as unknown[],
  localMines: 0,
  answer: { status: 'added', anki: 'queued' } as CompanionMineOutcome,
}));

vi.mock('../studyEnvironment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../studyEnvironment')>()),
  getStudyLang: () => h.studyLang,
}));
vi.mock('../tokenizer', () => ({ lemmaOf: async (s: string) => s }));
vi.mock('../studyMining', () => ({
  mineToStudy: async () => {
    h.localMines += 1;
    return { card: { id: 'x' }, created: true, anki: 'local' };
  },
  requestStudyInput: () => ({}),
}));

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

let Panel: typeof import('../components/lens/LensReaderPanel').default;
let root: Root | null = null;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const entry = (word: string, reading: string, gloss: string) => ({
    entries: [{ word, reading, isCommon: false, jlpt: [], senses: [{ definitions: [gloss] }] }],
  });
  const api: Record<string, unknown> = {
    lookupTerm: async () => entry('猫', 'ねこ', 'cat'),
    lookupChinese: async () => entry('猫', 'māo', 'cat'),
    companionMine: async (req: CompanionMineRequest) => {
      h.forwarded.push(req);
      return h.answer;
    },
    companionNoteLookup: async (e: unknown) => {
      h.noted.push(e);
    },
    companionOpenPreview: async () => true,
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): void => undefined;
      return async (): Promise<unknown> => ({});
    },
  });
  Panel = (await import('../components/lens/LensReaderPanel')).default;
}, 60_000);

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
  h.forwarded.length = 0;
  h.noted.length = 0;
  h.localMines = 0;
  h.answer = { status: 'added', anki: 'queued' };
});

async function openPanel(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <Panel
        query="猫"
        context="猫が寝ている。"
        tokens={[]}
        x={100}
        y={100}
        onClose={() => undefined}
        screenshotDataUrl={PNG}
        sourceTitle="Some VN — Chapter 2"
        sourceApp="SomeVN"
      />,
    );
  });
  await vi.waitFor(() => expect(host.querySelector('.lens-reader-mine')).not.toBeNull());
  return host;
}

async function mine(host: HTMLElement): Promise<HTMLButtonElement> {
  const button = host.querySelector<HTMLButtonElement>('.lens-reader-mine')!;
  await act(async () => {
    button.click();
  });
  await vi.waitFor(() => expect(h.forwarded).toHaveLength(1));
  return button;
}

describe('Lens word panel mining', () => {
  it('forwards the card to the main window with the region picture and the source window', async () => {
    h.studyLang = 'ja';
    const host = await openPanel();
    await mine(host);
    expect(h.localMines).toBe(0);
    const req = h.forwarded[0]!;
    expect(req.attachImage).toBe(true);
    expect(req.draft).toMatchObject({
      kind: 'word',
      word: '猫',
      reading: 'ねこ',
      meaning: 'cat',
      sentence: '猫が寝ている。',
      sourceTitle: 'Some VN — Chapter 2',
      sourceApp: 'SomeVN',
      imageDataUrl: PNG,
      studyLang: 'ja',
      origin: 'lens',
    });
  });

  it('carries the study language for a Chinese learner', async () => {
    h.studyLang = 'zh';
    const host = await openPanel();
    await mine(host);
    expect(h.forwarded[0]!.draft).toMatchObject({ word: '猫', reading: 'māo', studyLang: 'zh', imageDataUrl: PNG });
    h.studyLang = 'ja';
  });

  it('says so when the main window is not up yet, and retries after a failure', async () => {
    h.answer = { status: 'waiting' };
    const host = await openPanel();
    const button = await mine(host);
    await vi.waitFor(() => expect(button.textContent).toBe('Added when Gum is up'));

    root?.unmount();
    document.body.replaceChildren();
    h.forwarded.length = 0;
    h.answer = { status: 'failed', error: 'x' };
    const again = await openPanel();
    const failed = await mine(again);
    await vi.waitFor(() => expect(failed.textContent).toBe('Retry mine'));
  });

  it('makes the opened word the last lookup, with its line and source', async () => {
    await openPanel();
    await vi.waitFor(() => expect(h.noted.length).toBeGreaterThan(0));
    expect(h.noted.at(-1)).toEqual({
      text: '猫',
      sentence: '猫が寝ている。',
      sourceTitle: 'Some VN — Chapter 2',
      sourceApp: 'SomeVN',
    });
  });
});
