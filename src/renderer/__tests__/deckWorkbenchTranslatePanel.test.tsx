// @vitest-environment jsdom
//
// Gate 2's surface. The request model is covered in
// `shared/__tests__/ankiTranslate.test.ts`; what only a mounted test can prove
// is that the panel refuses to spend money on a translation that would destroy
// its own source, that the disclosure names the field and the character count
// before the button, and that what the bridge receives is exactly the stripped
// text the disclosure counted.
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
  { noteId: 'n1', term: '猫' },
  { noteId: 'n2', term: '' },
  { noteId: 'n3', term: '犬' },
];

const FIELDS: Record<string, Record<string, string>> = {
  n1: { Back: '<div>a cat  sleeps</div>[sound:cat.mp3]', Russian: '' },
  n2: { Back: 'a dog runs', Russian: '' },
  n3: { Back: '{{c1::猫}}が寝ている', Russian: '' },
};

let container: HTMLDivElement;
let root: Root;
let sent: unknown[] = [];
let response: AiAdditionsRunResult;
let batch: AiBatch | undefined;

function api(): Record<string, unknown> {
  return {
    aiGetConfig: async () => ({ providerId: 'gemini-2.5-flash', apiKeySet: true }),
    ankiAiTranslateField: async (request: unknown) => {
      sent.push(request);
      return response;
    },
    ankiAiCancelAdditions: async () => ({ ok: true }),
    onAnkiAiAdditionsProgress: () => () => undefined,
  };
}

async function mount(destination = 'Russian'): Promise<void> {
  await act(async () => {
    root.render(
      <DeckWorkbenchAiPanel
        notes={NOTES}
        fieldNames={['Back', 'Russian']}
        readField={(noteId, field) => FIELDS[noteId]?.[field] ?? ''}
        destinationField={destination}
        onBatch={(next) => {
          batch = next;
        }}
      />,
    );
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

function text(): string {
  return container.textContent ?? '';
}

function click(label: string): void {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === label);
  if (!button) throw new Error(`no button ${label} in: ${text()}`);
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function selectField(name: string): void {
  const select = container.querySelector('select') as HTMLSelectElement;
  act(() => {
    select.value = name;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function intoTranslateMode(destination = 'Russian'): Promise<void> {
  await mount(destination);
  click('ankiWorkbench.ai.mode.translate');
  selectField('Back');
  await flush();
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
      { noteId: 'n1', ok: true, variants: ['кот спит'] },
      { noteId: 'n2', ok: true, variants: ['собака бежит'] },
    ],
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the translate mode is opt-in', () => {
  it('does not offer translation at all without a way to read a field', async () => {
    await act(async () => {
      root.render(<DeckWorkbenchAiPanel notes={NOTES} onBatch={() => undefined} />);
    });
    expect(text()).not.toContain('ankiWorkbench.ai.mode.translate');
  });

  it('starts on the additions question', async () => {
    await mount();
    expect(text()).toContain('ankiWorkbench.ai.kind');
    expect(text()).not.toContain('ankiWorkbench.translate.fromField');
  });
});

describe('what the panel says before it spends anything', () => {
  it('names the field, the character count and the target language', async () => {
    await intoTranslateMode();
    // "a cat sleeps" (12) + "a dog runs" (10) = 22 characters, the cloze note
    // excluded. The markup and the [sound:] tag are not in the count because
    // they are not in what is sent.
    expect(text()).toContain('ankiWorkbench.translate.sends:Back,22,');
    expect(text()).toContain('ankiWorkbench.translate.disclosure:');
  });

  it('counts the notes it will not ask about, before the run rather than after', async () => {
    await intoTranslateMode();
    expect(text()).toContain('ankiWorkbench.translate.skipped.cloze-source:1');
  });

  it('reports no cost rather than a reassuring zero', async () => {
    await intoTranslateMode();
    expect(text()).toContain('ankiWorkbench.ai.costUnknown:');
    expect(text()).not.toContain('$0.00');
  });
});

describe('the refusals', () => {
  // The negative control for "the original is retained".
  it('blocks a destination equal to the source and sends nothing', async () => {
    await intoTranslateMode('Back');
    expect(text()).toContain('ankiWorkbench.translate.problem.same-field');
    click('ankiWorkbench.ai.generate');
    await flush();
    expect(sent).toEqual([]);
    expect(batch).toBeUndefined();
  });

  it('asks for a destination rather than guessing one', async () => {
    await intoTranslateMode('');
    expect(text()).toContain('ankiWorkbench.translate.problem.no-destination');
  });

  it('asks for a source field before anything else', async () => {
    await mount();
    click('ankiWorkbench.ai.mode.translate');
    await flush();
    expect(text()).toContain('ankiWorkbench.translate.problem.no-source');
  });
});

describe('the run', () => {
  it('sends exactly the stripped text the disclosure counted, and no cloze note', async () => {
    await intoTranslateMode();
    click('ankiWorkbench.ai.generate');
    await flush();
    expect(sent).toHaveLength(1);
    const request = sent[0] as {
      fromField: string;
      targetLanguage: string;
      notes: { noteId: string; text: string }[];
    };
    expect(request.fromField).toBe('Back');
    expect(request.targetLanguage).toBe('en');
    expect(request.notes).toEqual([
      { noteId: 'n1', text: 'a cat sleeps' },
      { noteId: 'n2', text: 'a dog runs' },
    ]);
  });

  it('makes a translate-field batch whose term is the before half of the diff', async () => {
    await intoTranslateMode();
    click('ankiWorkbench.ai.generate');
    await flush();
    expect(batch?.kind).toBe('translate-field');
    expect(batch?.notes.map((n) => n.term)).toEqual(['a cat sleeps', 'a dog runs']);
    expect(batch?.notes.map((n) => n.status)).toEqual(['generated', 'generated']);
  });

  it('is a proposal until approved: no approval, nothing to write', async () => {
    await intoTranslateMode();
    click('ankiWorkbench.ai.generate');
    await flush();
    expect(batch?.notes.every((n) => n.approvedVariantId === undefined)).toBe(true);
    click('ankiWorkbench.ai.approve');
    expect(batch?.notes[0].approvedVariantId).toBeTruthy();
  });
});
