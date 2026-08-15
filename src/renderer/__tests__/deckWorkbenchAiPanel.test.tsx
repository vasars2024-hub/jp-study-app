// @vitest-environment jsdom
//
// The request model is covered in `shared/__tests__/ankiAiPrompt.test.ts` and the
// review model in `shared/__tests__/ankiAiAdditions.test.ts`. What only a mounted
// test can prove is the plan's exclusion — that the surface states the provider,
// what leaves the machine, and the cost BEFORE the button that spends money, and
// that what the bridge receives is exactly what the disclosure promised.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
    lang: 'en',
  }),
}));

import type { AiBatch } from '../../shared/ankiAiAdditions';
import type { AiAdditionsRunResult } from '../../shared/ankiAiPrompt';
import DeckWorkbenchAiPanel, { type AiPanelNote } from '../components/anki/DeckWorkbenchAiPanel';

const NOTES: AiPanelNote[] = [
  { noteId: 'n1', term: '猫', gloss: 'cat' },
  { noteId: 'n2', term: '走る', gloss: 'to run' },
];

let container: HTMLDivElement;
let root: Root;
let sent: unknown[] = [];
let response: AiAdditionsRunResult;
let batch: AiBatch | undefined;

function api(): Record<string, unknown> {
  return {
    aiGetConfig: async () => ({ providerId: 'gemini-2.5-flash', apiKeySet: true }),
    ankiAiGenerateAdditions: async (request: unknown) => {
      sent.push(request);
      return response;
    },
    ankiAiCancelAdditions: async () => ({ ok: true }),
    onAnkiAiAdditionsProgress: () => () => undefined,
  };
}

async function mount(notes = NOTES): Promise<void> {
  await act(async () => {
    root.render(
      <DeckWorkbenchAiPanel
        notes={notes}
        onBatch={(next) => {
          batch = next;
        }}
      />,
    );
  });
}

/** Let the generate promise chain — invoke, record, settle, finally — run out. */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

function text(): string {
  return container.textContent ?? '';
}

function click(label: string, index = 0): void {
  const buttons = [...container.querySelectorAll('button')].filter((b) => b.textContent === label);
  const button = buttons[index];
  if (!button) throw new Error(`no button ${label}[${index}] in: ${text()}`);
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  sent = [];
  batch = undefined;
  localStorage.clear();
  (window as unknown as { api: unknown }).api = api();
  response = {
    ok: true,
    batchId: '',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    cancelled: false,
    results: [
      { noteId: 'n1', ok: true, variants: ['猫が寝ている。', '猫を飼っている。'] },
      { noteId: 'n2', ok: false, error: 'no-answer' },
    ],
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DeckWorkbenchAiPanel disclosure', () => {
  it('names the provider and the request count before anything is generated', async () => {
    await mount();
    expect(text()).toContain('ankiWorkbench.ai.disclosure:Google Gemini 2.5 Flash,gemini-2.5-flash,2,1');
    expect(sent).toEqual([]);
  });

  it('says only the word is sent until the user opts the gloss in', async () => {
    await mount();
    expect(text()).toContain('ankiWorkbench.ai.sends:ankiWorkbench.ai.sends.term');
    expect(text()).not.toContain('ankiWorkbench.ai.sends.gloss');
    const box = container.querySelector('.wb-ai-flag input') as HTMLInputElement;
    await act(async () => {
      box.click();
    });
    expect(text()).toContain('ankiWorkbench.ai.sends.gloss');
  });

  // An unpriced provider must not print a reassuring $0.00.
  it('reports the cost as unknown when no price is stored', async () => {
    await mount();
    expect(text()).toContain('ankiWorkbench.ai.costUnknown');
    expect(text()).not.toContain('ankiWorkbench.ai.cost:');
  });

  it('reports a real amount once the user has entered a price', async () => {
    localStorage.setItem(
      'jp-agent-provider-pricing-v1',
      JSON.stringify({ 'gemini-2.5-flash': { inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 } }),
    );
    await mount();
    expect(text()).toContain('ankiWorkbench.ai.cost:');
    expect(text()).not.toContain('ankiWorkbench.ai.costUnknown');
  });

  it('says so rather than offering a run when no selected note declares a word', async () => {
    await mount([{ noteId: 'n1', term: '' }]);
    expect(text()).toContain('ankiWorkbench.ai.noWords');
    const generate = [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'ankiWorkbench.ai.generate') as HTMLButtonElement;
    expect(generate.disabled).toBe(true);
  });
});

describe('DeckWorkbenchAiPanel generation', () => {
  it('sends exactly what the disclosure promised, with no gloss while the box is off', async () => {
    await mount();
    click('ankiWorkbench.ai.generate');
    await flush();
    expect(sent).toHaveLength(1);
    const request = sent[0] as { notes: { noteId: string; gloss?: string }[]; sendGloss: boolean };
    expect(request.sendGloss).toBe(false);
    expect(request.notes.map((n) => n.gloss)).toEqual([undefined, undefined]);
    expect(request.notes.map((n) => n.noteId)).toEqual(['n1', 'n2']);
  });

  it('shows the variants for review and writes nothing on its own', async () => {
    await mount();
    click('ankiWorkbench.ai.generate');
    await flush();
    expect(text()).toContain('猫が寝ている。');
    expect(text()).toContain('猫を飼っている。');
    // n2 came back unanswered: failed and named, not a silent blank.
    expect(text()).toContain('ankiWorkbench.ai.status.failed');
    expect(text()).toContain('no-answer');
    expect(batch?.notes.every((n) => !n.approvedVariantId)).toBe(true);
  });

  it('records an approval on the note it was clicked for', async () => {
    await mount();
    click('ankiWorkbench.ai.generate');
    await flush();
    click('ankiWorkbench.ai.approve');
    expect(batch?.notes[0].approvedVariantId).toBe('n1-v0');
    const pressed = [...container.querySelectorAll('button[aria-pressed="true"]')];
    expect(pressed).toHaveLength(1);
  });

  it('offers a retry sized to the failures only', async () => {
    await mount();
    click('ankiWorkbench.ai.generate');
    await flush();
    expect(text()).toContain('ankiWorkbench.ai.retry:1');
  });

  // A refusal is not an empty generation: nothing was sent, so nothing is shown
  // to review, and the reason is named.
  it('withdraws the batch and names the refusal when no key is configured', async () => {
    response = {
      ok: false,
      batchId: 'x',
      provider: '',
      model: 'gemini-2.5-flash',
      cancelled: false,
      results: [],
      error: 'no-api-key',
    };
    await mount();
    click('ankiWorkbench.ai.generate');
    await flush();
    expect(text()).toContain('ankiWorkbench.ai.error.no-api-key');
    expect(batch).toBeUndefined();
    expect(container.querySelector('.wb-ai-notes')).toBeNull();
  });

  it('shows a provider message verbatim rather than a missing translation key', async () => {
    (window as unknown as { api: Record<string, unknown> }).api.ankiAiGenerateAdditions = async () => {
      throw new Error('AI request timed out after 60s');
    };
    await mount();
    click('ankiWorkbench.ai.generate');
    await flush();
    expect(text()).toContain('ankiWorkbench.ai.error.provider:AI request timed out after 60s');
  });
});
