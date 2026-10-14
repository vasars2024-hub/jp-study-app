// @vitest-environment jsdom
/**
 * F9 in the renderer, against a fake bridge: a study helper's reply appears as it
 * streams (as prose, never JSON), Cancel keeps what had arrived, the final answer
 * replaces the draft, and chunks for another request are ignored. Explain does
 * the same through its own cancel channel.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiStreamChunk } from '../../main/aiStreamRelay';

vi.mock('../aiSetupClient', () => ({
  useAiReadiness: () => ({ loaded: true, enabled: true, ready: true, cloudReady: true, localReady: false }),
  openAiSettings: vi.fn(),
}));

import AiWhyWrongPanel from '../components/flashcards/AiWhyWrongPanel';
import EntryExplain from '../components/lexicon/EntryExplain';

let listeners: Array<(chunk: AiStreamChunk) => void> = [];
const emit = (chunk: AiStreamChunk) => act(async () => {
  for (const listener of [...listeners]) listener(chunk);
});

const api = {
  aiStudyWhyWrong: vi.fn(),
  aiStudyCancel: vi.fn(async () => true),
  aiGetConfig: vi.fn(),
  dictExplain: vi.fn(),
  dictExplainCancel: vi.fn(async () => true),
  dictExplanationGet: vi.fn(async () => null),
  dictExplanationClear: vi.fn(),
  onAiStreamChunk: vi.fn((cb: (chunk: AiStreamChunk) => void) => {
    listeners.push(cb);
    return () => {
      listeners = listeners.filter((l) => l !== cb);
    };
  }),
};

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

beforeEach(() => {
  listeners = [];
  localStorage.clear();
  localStorage.setItem('jp-flashcard-deck', JSON.stringify({ folders: [], cards: [] }));
  api.aiStudyWhyWrong.mockReset();
  api.dictExplain.mockReset();
  api.aiStudyCancel.mockClear();
  api.dictExplainCancel.mockClear();
  api.aiGetConfig.mockResolvedValue({ engine: 'cloud', providerId: 'gemini-2.5-flash', apiKeysSet: { gemini: true }, localModelAvailable: false });
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

async function click(name: RegExp): Promise<void> {
  const found = [...host.querySelectorAll('button')].find((b) => name.test(b.textContent ?? '') || name.test(b.getAttribute('aria-label') ?? ''));
  if (!found) throw new Error(`no button ${name}: ${[...host.querySelectorAll('button')].map((b) => b.textContent).join(' | ')}`);
  await act(async () => {
    found.click();
  });
}

const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const whyProps = {
  card: { id: 'hot', word: '暑い', reading: 'あつい', meaning: 'hot (weather)' },
  typed: 'warm',
  direction: 'target-to-meaning' as const,
  verdict: 'wrong' as const,
};

describe('a study helper streams', () => {
  it('shows the prose as it arrives, ignores other requests, and the answer replaces the draft', async () => {
    let finish: (value: unknown) => void = () => undefined;
    api.aiStudyWhyWrong.mockImplementation(() => new Promise((resolve) => {
      finish = resolve;
    }));
    await render(<AiWhyWrongPanel {...whyProps} />);
    await click(/Why was I wrong/);
    const { requestId } = api.aiStudyWhyWrong.mock.calls[0][0] as { requestId: string };
    await emit({ requestId, text: '{"confusion":"synonym","explanation":"Weather, not ' });
    await emit({ requestId: 'someone-else', text: 'NOT MINE' });
    const draft = host.querySelector('[data-ai-stream="drafting"]');
    expect(draft?.textContent).toContain('Weather, not');
    expect(host.textContent).not.toContain('NOT MINE');
    expect(host.textContent).not.toContain('"explanation"');
    await act(async () => finish({ ok: true, result: { confusion: 'synonym', explanation: 'Weather, not touch.', tip: '', acceptable: false, acceptableReason: '' } }));
    await flush();
    expect(host.querySelector('[data-ai-stream]')).toBeNull();
    expect(host.querySelector('.ai-study-answer')?.textContent).toContain('Weather, not touch.');
    expect(listeners).toHaveLength(0);
  });

  it('Cancel keeps the partial text, marked as stopped, and a late reply is dropped', async () => {
    let finish: (value: unknown) => void = () => undefined;
    api.aiStudyWhyWrong.mockImplementation(() => new Promise((resolve) => {
      finish = resolve;
    }));
    await render(<AiWhyWrongPanel {...whyProps} />);
    await click(/Why was I wrong/);
    const { requestId } = api.aiStudyWhyWrong.mock.calls[0][0] as { requestId: string };
    await emit({ requestId, text: '{"confusion":"synonym","explanation":"The first half' });
    await click(/^Cancel$/);
    expect(api.aiStudyCancel).toHaveBeenCalledWith(requestId);
    const stopped = host.querySelector('[data-ai-stream="stopped"]');
    expect(stopped?.textContent).toContain('The first half');
    expect(stopped?.textContent).toContain('Stopped');
    await act(async () => finish({ ok: false, code: 'cancelled' }));
    await flush();
    expect(host.querySelector('[data-ai-stream="stopped"]')?.textContent).toContain('The first half');
  });
});

describe('Explain streams', () => {
  it('drafts the summary and bodies, and Stop keeps them', async () => {
    let finish: (value: unknown) => void = () => undefined;
    api.dictExplain.mockImplementation(() => new Promise((resolve) => {
      finish = resolve;
    }));
    await render(<EntryExplain word="猫" reading="ねこ" lang="ja" senses={[{ definitions: ['cat'] }]} />);
    await flush();
    await click(/Explain this word|Explain/);
    await flush();
    const { requestId } = api.dictExplain.mock.calls[0][0] as { requestId: string };
    expect(requestId).toMatch(/^exp-/);
    await emit({ requestId, text: '{"summary":"A small cat.","sections":[{"kind":"nuance","body":"Neutral' });
    const draft = host.querySelector('[data-ai-stream="drafting"]')?.textContent ?? '';
    expect(draft).toContain('A small cat.');
    expect(draft).toContain('Neutral');
    expect(draft).not.toContain('nuance');
    await click(/^Stop$/);
    expect(api.dictExplainCancel).toHaveBeenCalledWith(requestId);
    expect(host.querySelector('[data-ai-stream="stopped"]')?.textContent).toContain('A small cat.');
    await act(async () => finish({ ok: false, cached: false, explanation: null, error: 'cancelled' }));
    await flush();
    expect(host.querySelector('[data-ai-stream="stopped"]')).not.toBeNull();
    expect(host.querySelector('.lexicon-explain-error')).toBeNull();
  });
});
