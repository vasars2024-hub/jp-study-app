// @vitest-environment jsdom
/**
 * The card preview over other apps: it shows the drafted card with its source
 * and picture, fills a missing reading/meaning from the dictionary, lets the
 * card be edited, and Add hands exactly what is on screen to main.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CompanionDraft, CompanionMineOutcome, CompanionMineRequest } from '../../shared/companion';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const mined: CompanionMineRequest[] = [];
let closes = 0;
let outcome: CompanionMineOutcome = { status: 'added', anki: 'queued' };
let draft: CompanionDraft | null = null;
const lookups: string[] = [];

function installApiStub(): void {
  const api: Record<string, unknown> = {
    companionGetPreview: async () => draft,
    onCompanionPreview: () => () => undefined,
    companionPreviewClose: async () => {
      closes += 1;
    },
    companionMine: async (req: CompanionMineRequest) => {
      mined.push(req);
      return outcome;
    },
    lookupTerm: async (q: string) => {
      lookups.push(`ja:${q}`);
      return {
        entries: [{ word: q, reading: 'ねこ', senses: [{ definitions: ['cat'] }], jlpt: [], isCommon: true }],
      };
    },
    lookupChinese: async (q: string) => {
      lookups.push(`zh:${q}`);
      return { entries: [{ word: q, reading: 'xuéxí', senses: [{ definitions: ['to study'] }], jlpt: [] }] };
    },
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      return async (): Promise<unknown> => ({});
    },
  });
}

let Preview: typeof import('../components/companion/CardPreview').default;
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  Preview = (await import('../components/companion/CardPreview')).default;
});

async function render(next: CompanionDraft): Promise<void> {
  draft = next;
  await act(async () => {
    root?.render(<Preview />);
  });
  // The dictionary fill resolves on a microtask after mount.
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  mined.length = 0;
  lookups.length = 0;
  closes = 0;
  outcome = { status: 'added', anki: 'queued' };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

const WORD: CompanionDraft = {
  id: 'cd-1',
  kind: 'word',
  word: '猫',
  sentence: '猫が寝ている。',
  sourceTitle: 'Some VN — Chapter 2',
  imageDataUrl: PNG,
  studyLang: 'ja',
  origin: 'lens',
  createdAt: 1,
};

function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

describe('CardPreview', () => {
  it('shows the card, the window it came from and the picture', async () => {
    await render(WORD);
    expect(host.querySelector('.companion-preview-word')?.textContent).toBe('猫');
    expect(host.querySelector('.companion-preview-sentence')?.textContent).toBe('猫が寝ている。');
    expect(host.querySelector('.companion-preview-source')?.textContent).toContain('Some VN — Chapter 2');
    expect(host.querySelector('.companion-preview-picture img')?.getAttribute('src')).toBe(PNG);
  });

  it('fills a missing reading and meaning from the dictionary of the draft’s language', async () => {
    await render(WORD);
    expect(lookups).toEqual(['ja:猫']);
    expect(host.querySelector('.companion-preview-reading')?.textContent).toBe('ねこ');
    expect(host.querySelector('.companion-preview-meaning')?.textContent).toBe('cat');
  });

  it('a Chinese draft is looked up in the Chinese dictionary', async () => {
    await render({ ...WORD, id: 'cd-zh', word: '学习', sentence: undefined, studyLang: 'zh', imageDataUrl: undefined });
    expect(lookups).toEqual(['zh:学习']);
  });

  it('Add sends what is on screen, edits included, with the picture', async () => {
    await render(WORD);
    await act(async () => button('Edit').click());
    const meaning = host.querySelectorAll('textarea')[0] as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(meaning, 'a cat (animal)');
      meaning.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Add').click());
    expect(mined).toHaveLength(1);
    expect(mined[0]!.attachImage).toBe(true);
    expect(mined[0]!.draft).toMatchObject({ word: '猫', reading: 'ねこ', meaning: 'a cat (animal)', sourceTitle: 'Some VN — Chapter 2' });
    expect(host.querySelector('.companion-preview-status')?.textContent).toBe('Added to your deck. Anki gets it when it opens.');
  });

  it('the picture can be left off the card', async () => {
    await render(WORD);
    const toggle = host.querySelector('.companion-preview-picture input[type="checkbox"]') as HTMLInputElement;
    await act(async () => toggle.click());
    await act(async () => button('Add').click());
    expect(mined[0]!.attachImage).toBe(false);
  });

  it('says when Gum was still starting, and Esc closes', async () => {
    outcome = { status: 'waiting' };
    await render(WORD);
    await act(async () => button('Add').click());
    expect(host.querySelector('.companion-preview-status')?.textContent).toContain('Gum is starting');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(closes).toBe(1);
  });
});
