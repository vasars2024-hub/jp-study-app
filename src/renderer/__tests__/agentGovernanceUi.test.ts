// @vitest-environment jsdom
/**
 * The main app's writer for the Agent's own governance.
 *
 * Before `AgentGovernancePanel` existed, the only writer for `localAgentSettings` or the profile
 * store in the entire repository was `BlancReadyToolPanels`, in Blanc's separate shell. The app
 * that owns the central Agent could read its permission ceiling, its active profile and its memory
 * switch and change none of them — while the capability directory in the same inspector told the
 * user an operation was unavailable for `permission-insufficient`, a reason with no route to
 * resolve it anywhere in that shell.
 *
 * So this file drives the real component over the real stores: a click here IS the write. A test
 * that called `saveLocalAgentSettings` itself would prove the store works and say nothing about
 * whether the panel reaches it, which is precisely the gap being closed.
 *
 * `.test.ts` rather than `.test.tsx`, because `vitest.config.ts` collects
 * `src/renderer/__tests__/**\/*.test.ts` and a `.tsx` file here is collected by nothing. The root
 * config is out of scope per `CLAUDE.md`, so the markup is `createElement` rather than JSX.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentGovernancePanel } from '../components/agent/AgentGovernancePanel';
import {
  activateLocalAgentProfile,
  loadLocalAgentProfiles,
  saveLocalAgentProfiles,
} from '../localAgentProfilesStore';
import { loadLocalAgentSettings } from '../localAgentSettingsStore';
import {
  getActiveAgentProfile,
  normalizeAgentProfiles,
  type AgentProfileStore,
} from '../../shared/localAgentProfiles';
import type { LocalAgentSettings } from '../../shared/localAgentSettings';

const PROFILES_KEY = 'jp-study-local-agent-profiles-v1';
const SETTINGS_KEY = 'jp-study-local-agent-settings-v1';
const TUTOR = 'study-tutor';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

/**
 * A custom profile the user has switched off. Custom rather than built-in because a built-in's
 * `enabled` is stored as an override over the factory record, and this suite is about the
 * `activeProfileId` fallback rather than about override merging.
 */
function disabledProfile(id = 'custom-off') {
  return {
    id,
    name: 'Switched off',
    description: 'A profile the user disabled.',
    role: 'custom' as const,
    preferredModelFileName: '',
    permission: 'read-only' as const,
    enabledOperations: ['dictionary.lookup' as const],
    responseLength: 'balanced' as const,
    explanationDepth: 'standard' as const,
    language: 'english' as const,
    teachingStyle: 'tutor' as const,
    correctionStyle: 'gentle' as const,
    enabled: false,
    builtIn: false,
  };
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  // Both stores keep the last value in a module-level `fallback` and only replace it when
  // localStorage HAS one. An empty stub is therefore a cache HIT on the previous test's value,
  // so each test seeds explicitly rather than relying on an empty store meaning "defaults".
  localStorage.setItem(PROFILES_KEY, JSON.stringify({ version: 1, activeProfileId: TUTOR, profiles: [] }));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1 }));
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function mountPanel(): Promise<{
  click: (testId: string) => Promise<void>;
  toggle: (testId: string) => Promise<void>;
  select: (testId: string, value: string) => Promise<void>;
  text: (testId: string) => string;
  options: () => string[];
  settings: () => LocalAgentSettings;
  store: () => AgentProfileStore;
}> {
  let currentSettings = loadLocalAgentSettings();
  let currentStore = loadLocalAgentProfiles();

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(AgentGovernancePanel, {
      onSettingsChange: (next: LocalAgentSettings) => { currentSettings = next; },
      onStoreChange: (next: AgentProfileStore) => { currentStore = next; },
    }));
  });

  const node = <T extends Element>(testId: string): T => {
    const found = container?.querySelector<T>(`[data-testid="${testId}"]`);
    if (!found) throw new Error(`no element with data-testid="${testId}"`);
    return found;
  };

  return {
    click: async (testId) => {
      await act(async () => { node<HTMLButtonElement>(testId).click(); });
    },
    // `.click()` rather than assigning `.checked` and dispatching `change`. React's input value
    // tracker hooks the instance property, so a direct assignment updates the tracker first and
    // React then decides nothing changed and swallows the event — the handler never runs and the
    // test reads back the value it seeded, which looks exactly like a broken write.
    toggle: async (testId) => {
      await act(async () => { node<HTMLInputElement>(testId).click(); });
    },
    select: async (testId, value) => {
      const element = node<HTMLSelectElement>(testId);
      await act(async () => {
        element.value = value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
    },
    text: (testId) => node(testId).textContent ?? '',
    options: () => [...node<HTMLSelectElement>('agent-governance-profile').options].map((o) => o.textContent ?? ''),
    settings: () => currentSettings,
    store: () => currentStore,
  };
}

describe('activateLocalAgentProfile', () => {
  it('enables the profile it activates, because a disabled one cannot be active at all', () => {
    const seeded = saveLocalAgentProfiles({
      version: 1,
      activeProfileId: TUTOR,
      profiles: [...loadLocalAgentProfiles().profiles, disabledProfile()],
    });
    expect(seeded.profiles.find((p) => p.id === 'custom-off')?.enabled).toBe(false);

    // The write every caller made before this helper existed. `normalizeAgentProfiles` refuses an
    // `activeProfileId` whose profile is not enabled and falls back to the built-in default, so
    // the picker reports a switch that did not happen.
    const naive = normalizeAgentProfiles({ ...seeded, activeProfileId: 'custom-off' });
    expect(naive.activeProfileId).toBe(TUTOR);

    const activated = activateLocalAgentProfile(seeded, 'custom-off');
    expect(activated.activeProfileId).toBe('custom-off');
    expect(getActiveAgentProfile(activated).id).toBe('custom-off');
    expect(activated.profiles.find((p) => p.id === 'custom-off')?.enabled).toBe(true);
  });

  it('leaves every other profile exactly as it found it', () => {
    const seeded = saveLocalAgentProfiles({
      version: 1,
      activeProfileId: TUTOR,
      profiles: [...loadLocalAgentProfiles().profiles, disabledProfile(), disabledProfile('custom-other')],
    });

    const activated = activateLocalAgentProfile(seeded, 'custom-off');
    expect(activated.profiles.find((p) => p.id === 'custom-other')?.enabled).toBe(false);
  });
});

describe('AgentGovernancePanel writes the authority the main app could only read', () => {
  it('persists a permission ceiling chosen in the panel', async () => {
    const panel = await mountPanel();
    expect(loadLocalAgentSettings().permission).toBe('read-only');

    await panel.click('agent-governance-permission-full-automation');

    expect(panel.settings().permission).toBe('full-automation');
    // Read back out of storage rather than off the callback, so this measures the write and not
    // the object the component happened to hand back.
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').permission).toBe('full-automation');
  });

  it('persists the memory switch in both directions', async () => {
    const panel = await mountPanel();
    expect(loadLocalAgentSettings().memoryEnabled).toBe(true);

    await panel.toggle('agent-governance-memory');
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').memoryEnabled).toBe(false);

    await panel.toggle('agent-governance-memory');
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').memoryEnabled).toBe(true);
  });

  it('activates a disabled profile chosen in the picker instead of silently switching to another', async () => {
    saveLocalAgentProfiles({
      version: 1,
      activeProfileId: TUTOR,
      profiles: [...loadLocalAgentProfiles().profiles, disabledProfile()],
    });
    const panel = await mountPanel();
    expect(panel.options().some((label) => label.includes('(disabled)'))).toBe(true);

    await panel.select('agent-governance-profile', 'custom-off');

    expect(panel.store().activeProfileId).toBe('custom-off');
    expect(getActiveAgentProfile(loadLocalAgentProfiles()).id).toBe('custom-off');
    expect(JSON.parse(localStorage.getItem(PROFILES_KEY) ?? '{}').activeProfileId).toBe('custom-off');
  });

  it('states the permission operations actually run at, not the ceiling that was clicked', async () => {
    const panel = await mountPanel();

    // `study-tutor` caps at `limited-actions`, so raising the global ceiling to full automation
    // changes nothing that runs. Saying "full automation" here would be the exact lie the
    // capability directory next to it contradicts.
    await panel.click('agent-governance-permission-full-automation');
    expect(loadLocalAgentSettings().permission).toBe('full-automation');

    const effective = panel.text('agent-governance-effective');
    expect(effective).toContain('Limited actions');
    expect(effective).not.toContain('Full automation');
    expect(effective).toContain(getActiveAgentProfile(loadLocalAgentProfiles()).name);
  });

  it('persists a narrowed memory scope and leaves the other categories alone', async () => {
    const panel = await mountPanel();
    expect(loadLocalAgentSettings().memoryScope)
      .toEqual(['user-preference', 'learning', 'application']);

    await panel.toggle('agent-governance-scope-learning');

    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').memoryScope)
      .toEqual(['user-preference', 'application']);
  });

  /**
   * The scope's one honest edge. Unticking every box is not a broken state to be
   * repaired back to "everything" — it is the user saying to send nothing, and
   * the note has to say that rather than leaving an empty group implying the
   * memory switch above it still applies.
   */
  it('says an emptied scope attaches nothing rather than silently restoring every category', async () => {
    const panel = await mountPanel();

    await panel.toggle('agent-governance-scope-user-preference');
    await panel.toggle('agent-governance-scope-learning');
    await panel.toggle('agent-governance-scope-application');

    expect(loadLocalAgentSettings().memoryScope).toEqual([]);
    expect(panel.text('agent-governance-scope-note')).toContain('nothing stored is attached');
  });

  it('persists a retained-chat policy and states what it sends', async () => {
    const panel = await mountPanel();
    expect(loadLocalAgentSettings().chatHistory).toBe('full');
    expect(panel.text('agent-governance-history-note')).toContain('12');

    await panel.click('agent-governance-history-off');

    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').chatHistory).toBe('off');
    // "Up to 0 turns" would be arithmetic, not an answer. The off state says what
    // happens to the turns that are still stored, because that is the question a
    // user turning this off is actually asking.
    expect(panel.text('agent-governance-history-note')).toContain('never replayed');

    await panel.click('agent-governance-history-recent');
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').chatHistory).toBe('recent');
    expect(panel.text('agent-governance-history-note')).toContain('4');
  });
});
