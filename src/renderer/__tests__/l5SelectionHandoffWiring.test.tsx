// @vitest-environment jsdom
/**
 * L5 bullet 1, the half that is not a module: the two apps that had **no** agent
 * producer at all now have a control that calls one.
 *
 * `f18d1ddb` landed `shared/liquidSelection.ts` plus `grammarPatternAgentContext`
 * and `translateSpanAgentContext`, and nothing in the product called either — a
 * contract nothing invokes is invisible, which this repo has paid for before with
 * an i18n module no surface imported. These tests are the wiring proof: they mount
 * the real views, click the real buttons, and read what the *real* producers
 * emitted. `handOffToAgent` is the only thing stubbed, because it opens a window.
 *
 * The identity assertions are the point rather than decoration. L5's Gate is that
 * a cross-app handoff **retains** context, and retention is keyed by
 * `kind:identity` on the agent's shelf — so `grammar/pattern/<id>` staying stable
 * across a rename is the difference between one shelf item and two.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentContextInput } from '../../shared/agentContext';
import type { GrammarPoint } from '../data/grammar';

const handoff = vi.hoisted(() => ({
  calls: [] as Array<{ input: AgentContextInput; title: string; place?: AgentContextInput }>,
}));

vi.mock('../agentContextHandoff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../agentContextHandoff')>();
  return {
    ...actual,
    handOffToAgent: async (input: AgentContextInput, title: string, place?: AgentContextInput) => {
      handoff.calls.push({ input, title, place });
      return 'attached' as const;
    },
  };
});

vi.mock('../components/SentenceAnalysisPanel', () => ({
  default: () => <div data-testid="analysis" />,
}));
vi.mock('../components/lexicon/LexiconWorkbenchResults', () => ({
  default: () => <div data-testid="results" />,
}));
vi.mock('../lexiconHandoffClient', () => ({
  takeLexiconHandoff: vi.fn(async () => ({ ok: true, handoff: null })),
  onLexiconHandoffStaged: vi.fn(() => () => undefined),
}));
vi.mock('../components/ui', () => ({
  AppChrome: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarField: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarSpacer: () => null,
  Toolbar: ({ children }: { children: ReactNode }) => <>{children}</>,
  ToolbarSpacer: () => null,
  useAeroMaterials: () => false,
  useWiredMaterials: () => false,
}));
vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));

import TranslateView from '../views/TranslateView';
import { GrammarDetail } from '../components/grammar/GrammarContent';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  handoff.calls.length = 0;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to be present`);
  return value;
}

async function mount(node: ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const created = createRoot(host);
  root = created;
  await act(async () => created.render(node));
  return host;
}

function point(overrides: Partial<GrammarPoint> = {}): GrammarPoint {
  return {
    id: 'g-0042',
    title: '〜ばかりに',
    level: 'N2',
    meaning: 'simply because',
    structure: 'V-plain + ばかりに',
    explanation: 'Marks the one cause that led to an unwanted result.',
    examples: [],
    ...overrides,
  } as GrammarPoint;
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('Grammar — the pattern selection reaches the agent', () => {
  it('hands off with the contract identity, not a hand-written one', async () => {
    const host = await mount(<GrammarDetail point={point()} />);
    const button = must(host.querySelector('.gram-ask-agent'), 'the ask-agent button');
    await click(button);

    expect(handoff.calls.length, 'one handoff per click').toBe(1);
    const { input, place } = handoff.calls[0];
    // `app/kind/entityId`, derived by `agentContextInputFromSelection`.
    expect(input.identity).toBe('grammar/pattern/g-0042');
    expect(input.source?.app).toBe('grammar');
    // Reference data, so the ORDINARY floor — the mapping table's call, asserted
    // here so a later edit to it cannot quietly loosen Grammar's classification.
    expect(input.kind).toBe('dictionary-entry');
    expect(input.label).toBe('〜ばかりに');
    expect(input.preview).toContain('V-plain + ばかりに');
    // Where the user was, so the Agent can offer to take them back.
    expect(place?.kind).toBe('route');
    expect(place?.source?.app).toBe('grammar');
  });

  it('keys on the id, so a retitled pattern is still one shelf item', async () => {
    const host = await mount(<GrammarDetail point={point({ title: 'ばかりに (regret)' })} />);
    await click(must(host.querySelector('.gram-ask-agent'), 'the ask-agent button'));
    // Same id, different title: retention depends on this NOT being the label.
    expect(handoff.calls[0].input.identity).toBe('grammar/pattern/g-0042');
    expect(handoff.calls[0].input.label).toBe('ばかりに (regret)');
  });
});

describe('Translate — the span selection reaches the agent', () => {
  it('sends the whole input when nothing is highlighted', async () => {
    const host = await mount(<TranslateView />);
    const area = must(
      host.querySelector<HTMLTextAreaElement>('.tr-textarea'),
      'the source textarea',
    );
    await act(async () => {
      const setter = must(
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set,
        'the native value setter',
      );
      setter.call(area, '猫が好きです');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const button = must(host.querySelector('.tr-ask-agent'), 'the ask-agent button');
    expect((button as HTMLButtonElement).disabled, 'enabled once there is text').toBe(false);
    expect(button.textContent).toBe('translate.askAgent');
    await click(button);

    expect(handoff.calls.length).toBe(1);
    const { input, place } = handoff.calls[0];
    expect(input.identity).toBe('translate/span/猫が好きです');
    // The user's own words, so the PERSONAL floor — the agent store keeps this in
    // session memory rather than writing it to disk. Opposite of Grammar above,
    // which is what makes that assertion a control rather than a restatement.
    expect(input.kind).toBe('selected-text');
    expect(input.source?.app).toBe('translate');
    expect(place?.source?.app).toBe('translate');
  });

  it('sends only the highlighted span, and says so on the label', async () => {
    const host = await mount(<TranslateView />);
    const area = must(
      host.querySelector<HTMLTextAreaElement>('.tr-textarea'),
      'the source textarea',
    );
    await act(async () => {
      const setter = must(
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set,
        'the native value setter',
      );
      setter.call(area, '猫が好きです');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    /*
     * React does not forward the native `select` event: `onSelect` is a synthetic
     * event its SelectEventPlugin *derives* from focus plus `keyup`/`mouseup`/
     * `selectionchange`, and it bails unless the element is the document's active
     * one. Dispatching a bare `select` here changes nothing and the assertion below
     * reads the feature as dead — the same shape as this repo's `onBlur`-is-
     * `focusout` trap. Focus first, then a keyup, which is how a user makes a
     * keyboard selection anyway.
     */
    await act(async () => {
      area.focus();
      area.selectionStart = 0;
      area.selectionEnd = 1;
      area.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
    });

    const button = must(host.querySelector('.tr-ask-agent'), 'the ask-agent button');
    expect(button.textContent, 'the label names which of the two is sent')
      .toBe('translate.askAgent.selection');
    await click(button);
    // 猫, not 猫が好きです — the whole point of tracking the range.
    expect(handoff.calls[0].input.identity).toBe('translate/span/猫');
    expect(handoff.calls[0].input.preview).toBe('猫');
  });

  it('is disabled with nothing to send, and clicking it hands off nothing', async () => {
    const host = await mount(<TranslateView />);
    const button = must(
      host.querySelector<HTMLButtonElement>('.tr-ask-agent'),
      'the ask-agent button',
    );
    // The vacuity guard: an empty input must not shelf a nameless row.
    expect(button.disabled).toBe(true);
    await click(button);
    expect(handoff.calls.length, 'no handoff from an empty source').toBe(0);
  });
});
