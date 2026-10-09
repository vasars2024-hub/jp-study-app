// @vitest-environment jsdom
/**
 * `dict:frequency` answers null when no frequency corpus is installed (or the
 * dictionary is still being prepared). The panel must render nothing then —
 * reading `result.entries` off null used to throw and take the entry down.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WordFrequency from '../components/lexicon/WordFrequency';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;

afterEach(() => {
  host?.remove();
  host = null;
});

async function render(answer: unknown): Promise<HTMLDivElement> {
  (window as unknown as { api: Record<string, unknown> }).api = {
    dictFrequency: vi.fn(async () => answer),
  };
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<WordFrequency query="食べる" lang="ja" />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

describe('WordFrequency with no frequency data', () => {
  it('renders nothing (and does not throw) when the IPC answers null', async () => {
    const el = await render(null);
    expect(el.textContent).toBe('');
  });

  it('renders nothing for a result without an entries array', async () => {
    const el = await render({ query: '食べる' });
    expect(el.textContent).toBe('');
  });
});
