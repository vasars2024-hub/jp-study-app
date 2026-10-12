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
import { pendingAiSetupStatus, type AiSetupStatus } from '../../shared/aiSetup';
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
      current = { ...current, providerId: providerId as AiSetupStatus['providerId'] };
      return {};
    },
    aiSetupUpdate: async (patch: Record<string, unknown>) => {
      calls.push(['aiSetupUpdate', patch]);
      return current;
    },
    aiSetupTestConnection: async (providerId: string) => {
      calls.push(['aiSetupTestConnection', providerId]);
      return { ok: false, code: 'authentication', status: 401 };
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

/** A plain (non-plural) English catalog string. */
function enText(key: string): string {
  const entry = en[key];
  if (typeof entry !== 'string') throw new Error(`no plain catalog string "${key}"`);
  return entry;
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
    ...pendingAiSetupStatus(),
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
    await act(async () => { button(enText('settings.ai.engine.cloud')).click(); });
    expect(calls).toContainEqual(['aiSetEngine', 'cloud']);
  });

  it('says so when main refuses a write, instead of swallowing it', async () => {
    (window as unknown as { api: Record<string, unknown> }).api.aiSetEngine = async () => {
      throw new Error('refused');
    };
    await render();
    await act(async () => { button(enText('settings.ai.engine.cloud')).click(); });
    expect(host.querySelector('[data-testid="ai-save-failed"]')?.textContent).toBe(en['aiProv.saveFailed']);
  });
});

describe('Settings > AI: providers, models, test, cloud opt-ins', () => {
  async function select(testId: string, value: string): Promise<void> {
    const node = host.querySelector<HTMLSelectElement>(`[data-testid="${testId}"]`)!;
    await act(async () => {
      node.value = value;
      node.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
  }

  it('offers every vendor, and Claude\'s three models once Anthropic is picked', async () => {
    await render();
    const vendors = [...host.querySelector<HTMLSelectElement>('[data-testid="ai-vendor"]')!.options].map((o) => o.value);
    expect(vendors).toEqual(['gemini', 'deepseek', 'anthropic', 'openai', 'openai-compatible']);
    await select('ai-vendor', 'anthropic');
    // The cheapest model is the default for a new vendor.
    expect(calls).toContainEqual(['aiSetProvider', 'claude-haiku-5-5']);
    const models = [...host.querySelector<HTMLSelectElement>('[data-testid="ai-model"]')!.options].map((o) => o.value);
    expect(models).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
    expect(host.querySelector('[data-testid="ai-model-hint"]')?.textContent).toBe(en['aiProv.modelHint.haiku']);
  });

  it('sets up a local server from a preset, with no key required', async () => {
    current = { ...current, providerId: 'openai-compatible' };
    await render();
    await act(async () => { button('Ollama').click(); });
    expect(calls).toContainEqual(['aiSetupUpdate', { compatBaseUrl: 'http://localhost:11434/v1' }]);
    expect(host.textContent).toContain(en['aiProv.key.optional'] as string);
  });

  it('tests the connection and names the failure in the UI language', async () => {
    current = { ...current, engine: 'cloud', apiKeysSet: { gemini: true, deepseek: false } };
    await render();
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="ai-test-connection"]')!.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(calls).toContainEqual(['aiSetupTestConnection', 'gemini-2.5-flash']);
    expect(host.querySelector('[data-testid="ai-test-result"]')?.textContent)
      .toBe(`${en['aiProv.error.authentication']} (HTTP 401)`);
  });

  it('lists the per-feature cloud opt-ins with their defaults, and writes a change', async () => {
    await render();
    const subtitle = host.querySelector<HTMLInputElement>('[data-testid="ai-cloud-subtitleTranslate"]')!;
    expect(subtitle.checked).toBe(false);
    expect(host.querySelector<HTMLInputElement>('[data-testid="ai-cloud-cardGen"]')!.checked).toBe(true);
    await act(async () => { subtitle.click(); });
    expect(calls).toContainEqual(['aiSetupUpdate', { cloudFeatures: { subtitleTranslate: true } }]);
  });

  it('gives each optional study helper its own cloud toggle, off by default', async () => {
    await render();
    for (const id of ['whyWrong', 'exampleSentences', 'leechRescue', 'contextExplain']) {
      const toggle = host.querySelector<HTMLInputElement>(`[data-testid="ai-cloud-${id}"]`);
      expect(toggle, id).not.toBeNull();
      expect(toggle?.checked, id).toBe(false);
    }
    await act(async () => { host.querySelector<HTMLInputElement>('[data-testid="ai-cloud-leechRescue"]')?.click(); });
    expect(calls).toContainEqual(['aiSetupUpdate', { cloudFeatures: { leechRescue: true } }]);
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
