// @vitest-environment jsdom
/**
 * Settings > AI, rendered for real.
 *
 * What the audit found missing, asserted from the user's side:
 *  - a master switch, and that switching it off hides AI entry points everywhere
 *    in the window (not greys them out);
 *  - a way to install the offline model — six messages pointed at an install
 *    control that did not exist;
 *  - the Agent's switch and model picker, which lived only in Blanc;
 *  - "Set up AI" landing here from any surface.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiPage from '../components/settings/pages/AiPage';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import {
  PENDING_SETTINGS_NAV_KEY,
  openAiSettings,
  readPendingSettingsNavigation,
  resetAiSetupClientForTests,
} from '../aiSetupClient';
import { loadLocalAgentSettings } from '../localAgentSettingsStore';
import type { AiSetupStatus } from '../../shared/aiSetup';
import { en } from '../../shared/i18n/catalogs';

let host: HTMLDivElement;
let root: Root | null = null;
let current: AiSetupStatus;
const calls: Array<[string, unknown]> = [];

const controller = () =>
  ({ advancedMode: false, focusSettingId: null }) as unknown as SettingsController;

function installApi(): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    aiSetupStatus: async () => current,
    aiSetupSetEnabled: async (enabled: boolean) => {
      calls.push(['aiSetupSetEnabled', enabled]);
      current = { ...current, enabled };
      return current;
    },
    onAiSetupChanged: () => () => undefined,
    onAssetStatus: () => () => undefined,
    assetsList: async () => ({ assets: [], statuses: [] }),
    assetsStart: async (id: string) => {
      calls.push(['assetsStart', id]);
      return { ok: true };
    },
    aiSetEngine: async (engine: string) => {
      calls.push(['aiSetEngine', engine]);
      return {};
    },
    aiSetProvider: async (providerId: string) => {
      calls.push(['aiSetProvider', providerId]);
      return {};
    },
    agentSpendLoad: async () => ({ ok: false, code: 'bridge-unavailable' }),
    onAgentSpendChanged: () => () => undefined,
    agentOperationalLoad: async () => ({ ok: false, code: 'bridge-unavailable' }),
    popOut: async () => undefined,
  };
}

async function render(): Promise<void> {
  await act(async () => {
    root = createRoot(host);
    root.render(
      <SettingsProvider value={controller()}>
        <AiPage />
      </SettingsProvider>,
    );
  });
  // One more turn for the status reply.
  await act(async () => { await Promise.resolve(); });
}

function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((node) => node.textContent?.includes(text));
  if (!found) throw new Error(`no button "${text}"`);
  return found as HTMLButtonElement;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  resetAiSetupClientForTests();
  document.documentElement.removeAttribute('data-ai-off');
  calls.length = 0;
  current = {
    enabled: true,
    engine: 'local-qwen',
    providerId: 'gemini-2.5-flash',
    apiKeysSet: { gemini: false, deepseek: false },
    localModelInstalled: false,
    models: [{ fileName: 'Qwen3-8B.gguf', sizeBytes: 5, location: 'downloads' }],
  };
  installApi();
  host = document.createElement('div');
  document.body.append(host);
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), writable: true, configurable: true });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

describe('Settings > AI', () => {
  it('offers the offline model install, which starts the pinned asset download', async () => {
    await render();
    await act(async () => { button('Install (').click(); });
    expect(calls).toContainEqual(['assetsStart', 'qwen3-1.7b']);
  });

  it('says what is missing for the engine that is chosen', async () => {
    await render();
    expect(host.querySelector('[data-testid="ai-readiness"]')?.textContent).toBe(en['settings.ai.notReady.model']);
  });

  it('turning AI off hides every AI entry point in the window', async () => {
    const entry = document.createElement('button');
    entry.setAttribute('data-ai-entry', '');
    document.body.append(entry);
    await render();
    expect(document.documentElement.hasAttribute('data-ai-off')).toBe(false);

    const toggle = host.querySelector<HTMLInputElement>('[data-testid="ai-enabled"]')!;
    await act(async () => { toggle.click(); });

    expect(calls).toContainEqual(['aiSetupSetEnabled', false]);
    expect(document.documentElement.hasAttribute('data-ai-off')).toBe(true);
    const rule = [...document.querySelectorAll('style')].map((style) => style.textContent).join('\n');
    expect(rule).toContain('html[data-ai-off] [data-ai-entry]');
    // The rest of the page folds away with it: nothing to configure while off.
    expect(host.querySelector('[data-testid="ai-readiness"]')).toBeNull();
    entry.remove();
  });

  it('owns the Agent switch and model picker that used to live only in Blanc', async () => {
    await render();
    const enable = host.querySelector<HTMLInputElement>('[data-testid="ai-agent-enabled"]')!;
    await act(async () => { enable.click(); });
    expect(loadLocalAgentSettings()).toMatchObject({ enabled: true, backend: 'local-gguf' });

    const picker = host.querySelector<HTMLSelectElement>('[data-testid="ai-agent-model"]')!;
    expect([...picker.options].map((option) => option.value)).toContain('Qwen3-8B.gguf');
    await act(async () => {
      picker.value = 'Qwen3-8B.gguf';
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(loadLocalAgentSettings().modelFileName).toBe('Qwen3-8B.gguf');
  });

  it('writes the engine through the one app-wide owner', async () => {
    await render();
    await act(async () => { button(en['settings.ai.engine.cloud']).click(); });
    expect(calls).toContainEqual(['aiSetEngine', 'cloud']);
  });
});

describe('"Set up AI" from any window', () => {
  it('leaves a short-lived navigation for a Settings window that opens afterwards', () => {
    openAiSettings('ai-model');
    const raw = localStorage.getItem(PENDING_SETTINGS_NAV_KEY);
    expect(readPendingSettingsNavigation(raw)).toEqual({ page: 'ai', settingId: 'ai-model' });
    // Stale by the time anyone could mistake it for a fresh request.
    expect(readPendingSettingsNavigation(raw, Date.now() + 60_000)).toBeNull();
    // Only the AI page is ever honoured from storage.
    expect(readPendingSettingsNavigation(JSON.stringify({ page: 'special', at: Date.now() }))).toBeNull();
  });
});
