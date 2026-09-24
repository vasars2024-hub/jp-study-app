// @vitest-environment jsdom
/**
 * With nothing set up the Agent composer offers both ways in — the offline
 * model and a cloud key — each opening its own row of Settings > AI, instead of
 * naming only the side the default engine happens to be on.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const opened = vi.hoisted(() => [] as Array<string | undefined>);
vi.mock('../aiSetupClient', () => ({ openAiSettings: (id?: string) => opened.push(id) }));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key, lang: 'en' }) }));

import { AiSetupPrompt } from '../components/ai/AiSetupPrompt';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  opened.length = 0;
  document.body.replaceChildren();
});

async function render(node: React.ReactNode): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
}

describe('AiSetupPrompt', () => {
  it('offers the offline model and a cloud key when asked for both', async () => {
    await render(<AiSetupPrompt compact reasonKey="settings.ai.setup.notReady" offerBoth />);
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['settings.ai.setup.installModel', 'settings.ai.setup.addKey']);
    await act(async () => buttons[0].click());
    await act(async () => buttons[1].click());
    expect(opened).toEqual(['ai-model', 'ai-provider']);
  });

  it('keeps the single "Set up AI" button otherwise', async () => {
    await render(<AiSetupPrompt compact reasonKey="agent.execute.reason.cloudKeyMissing" />);
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['settings.ai.setup.action']);
  });
});
