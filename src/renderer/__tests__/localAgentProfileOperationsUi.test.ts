// @vitest-environment jsdom
/**
 * Slice 63 — the narrowing has to be reachable from the UI, not just correct underneath it.
 *
 * Phase 7 proved against shipped bytes that a narrowed built-in profile makes the executor
 * refuse a step. It proved it by hand-editing localStorage, because that was the only way:
 * `disabledOperations` appeared nowhere in `src/renderer`. The panel rendered the allow-list
 * as a COUNT (`blanc.agent.approvedTools.count`) and offered no way to change it. A security
 * control no user can operate is not a control.
 *
 * So this file drives the real components and the real store, not a model of them:
 *   - it mounts `AgentProfileOperationsEditor` in jsdom and clicks actual checkboxes;
 *   - the editor itself calls `setLocalAgentProfileOperations`, so the click IS the write —
 *     a test that wired its own save would prove the store works and say nothing about
 *     whether the UI reaches it;
 *   - the reload assertions re-import the store module after `vi.resetModules()`, which
 *     discards its in-memory `fallback` and forces the parse-from-localStorage path. Without
 *     that, "it survived a reload" only means the function handed back the object it was
 *     just given.
 *
 * `.test.ts` rather than `.test.tsx` on purpose: `vitest.config.ts` includes
 * `src/renderer/__tests__/**\/*.test.ts`, so a `.tsx` file here is collected by NOTHING (see
 * the header of `externalPlayerPanel.test.tsx`, which sat unrun for months). The root config
 * is out of scope per `CLAUDE.md`, so the markup below is `createElement` rather than JSX.
 */
import { act } from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentProfileOperationsEditor } from '../components/blanc/AgentProfileOperations';
import { loadLocalAgentProfiles } from '../localAgentProfilesStore';
import {
  DEFAULT_AGENT_PROFILES,
  type AgentProfileStore,
} from '../../shared/localAgentProfiles';
import type { AgentToolOperationId } from '../../shared/localAgent';
import {
  availableAgentToolOperationIds,
  createCentralAgentToolRegistry,
} from '../agentToolRegistry';

const STORAGE_KEY = 'jp-study-local-agent-profiles-v1';
const TUTOR = 'study-tutor';
const AVAILABLE = new Set(availableAgentToolOperationIds(createCentralAgentToolRegistry((key) => key)));

function factoryTutor() {
  const found = DEFAULT_AGENT_PROFILES.find((profile) => profile.id === TUTOR);
  if (!found) throw new Error('the study-tutor built-in is gone; this suite is measuring nothing');
  return found;
}

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

beforeAll(() => {
  // React only treats `act` as configured when this is set; without it every render logs
  // "The current testing environment is not configured to support act(...)".
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.resetModules();
  // `loadLocalAgentProfiles` caches the last store in a module-level `fallback` and only
  // replaces it when localStorage HAS a value:
  //
  //     if (raw) fallback = normalizeAgentProfiles(JSON.parse(raw));
  //     return fallback;
  //
  // `vi.resetModules()` does not help: the editor imported that module at the top of this file,
  // so it keeps using the instance whose cache is already populated. With an EMPTY stub the read
  // is a miss and the previous test's store is handed back — so a test would start already
  // narrowed and its two toggles would run backwards (off->on, on->off), ending at 18 rather
  // than 19. Seeding an empty store forces the parse path and resets the cache to the factory
  // profiles, which is what every test here assumes it is starting from.
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, activeProfileId: TUTOR, profiles: [] }));
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/**
 * Mount the editor over a live store and hand back a driver.
 *
 * The harness holds the store in the same place the panel does — component state updated from
 * the editor's `onStoreChange` — so a click here goes through exactly the sequence a click in
 * the panel does.
 */
async function mountEditor(): Promise<{
  toggle: (operation: AgentToolOperationId) => Promise<void>;
  click: (testId: string) => Promise<void>;
  checked: () => AgentToolOperationId[];
  store: () => AgentProfileStore;
}> {
  let current = loadLocalAgentProfiles();

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  const render = (): void => {
    root?.render(createElement(AgentProfileOperationsEditor, {
      store: current,
      profileId: TUTOR,
      onStoreChange: (next: AgentProfileStore) => {
        current = next;
        render();
      },
    }));
  };
  await act(async () => { render(); });

  const box = (operation: string): HTMLInputElement => {
    const found = container?.querySelector<HTMLInputElement>(`input[data-operation="${operation}"]`);
    if (!found) throw new Error(`no checkbox rendered for ${operation} — the editor is not showing the allow-list`);
    return found;
  };

  return {
    toggle: async (operation) => { await act(async () => { box(operation).click(); }); },
    click: async (testId) => {
      const button = container?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
      if (!button) throw new Error(`no control rendered for ${testId}`);
      await act(async () => { button.click(); });
    },
    // Read off the `checked` PROPERTY rather than a `:checked` selector — the property is what
    // React writes, and it is the thing under test; a selector would add jsdom's CSS engine as
    // a second instrument between the assertion and the fact.
    checked: () => Array.from(
      container?.querySelectorAll<HTMLInputElement>('input[data-operation]') ?? [],
    ).filter((input) => input.checked).map((input) => input.dataset.operation as AgentToolOperationId),
    store: () => current,
  };
}

/** What a restart sees: a fresh module registry parsing the bytes actually on disk. */
async function afterRestart() {
  vi.resetModules();
  const { loadLocalAgentProfiles } = await import('../localAgentProfilesStore');
  const store = loadLocalAgentProfiles();
  const tutor = store.profiles.find((profile) => profile.id === TUTOR);
  if (!tutor) throw new Error('study-tutor missing after a restart');
  return tutor;
}

function storedTutor(): Record<string, unknown> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('nothing was written to localStorage at all');
  const parsed = JSON.parse(raw) as { profiles: Record<string, unknown>[] };
  const found = parsed.profiles.find((profile) => profile.id === TUTOR);
  if (!found) throw new Error('study-tutor is not in the persisted store');
  return found;
}

describe('the editor renders the allow-list, not a count of it', () => {
  it('shows one checkbox per operation in the catalogue', async () => {
    const editor = await mountEditor();
    const boxes = container?.querySelectorAll('input[data-operation]') ?? [];
    // Every operation must be listed, including the ones this profile does NOT have —
    // otherwise a user can only ever narrow, never restore or widen.
    expect(boxes.length).toBeGreaterThan(factoryTutor().enabledOperations.length);
    expect(editor.checked().sort()).toEqual(
      factoryTutor().enabledOperations.filter((operation) => AVAILABLE.has(operation)).sort(),
    );
  });

  it('enables real adapters and identifies unavailable declarations', async () => {
    // Slice 56's defect was scoped to built-ins, and the four built-ins are all a fresh user
    // has. An editor disabled for `builtIn: true` would reproduce it exactly.
    await mountEditor();
    const lookup = container?.querySelector<HTMLInputElement>('input[data-operation="dictionary.lookup"]');
    // Grammar explanation has an adapter now (the study coach); the declaration still held
    // back is the review-scheduling one whose false-success stub was removed.
    const grammar = container?.querySelector<HTMLInputElement>('input[data-operation="dictionary.explain-grammar"]');
    const schedule = container?.querySelector<HTMLInputElement>('input[data-operation="flashcard.schedule-reviews"]');
    expect(lookup?.disabled).toBe(false);
    expect(grammar?.disabled).toBe(false);
    expect(schedule?.disabled).toBe(true);
    expect(schedule?.checked).toBe(false);
    expect(schedule?.closest('label')?.getAttribute('title')).toBe('false-success-stub-removed');
  });
});

describe('a narrowing made through the UI survives a restart', () => {
  it('persists as a delta and comes back narrowed', async () => {
    const factory = factoryTutor();
    const removed = factory.enabledOperations[0];

    const editor = await mountEditor();
    await editor.toggle(removed);

    expect(editor.checked()).not.toContain(removed);
    // The delta form, written directly — never a whole `enabledOperations` list leaning on
    // the legacy conversion in `applyBuiltInOverride`.
    expect(storedTutor().disabledOperations).toEqual(factory.enabledOperations.filter(
      (operation) => operation === removed || !AVAILABLE.has(operation),
    ));

    const reloaded = await afterRestart();
    expect(reloaded.enabledOperations).not.toContain(removed);
    expect(reloaded.enabledOperations).toEqual(factory.enabledOperations.filter(
      (operation) => operation !== removed && AVAILABLE.has(operation),
    ));
  });

  it('lets a user turn an operation back on while retaining unavailable-operation pruning', async () => {
    const factory = factoryTutor();
    const removed = factory.enabledOperations[0];

    const editor = await mountEditor();
    await editor.toggle(removed);
    await editor.toggle(removed);

    // An empty delta is stored as no key at all (see `setLocalAgentProfileOperations`); with
    // every study-tutor operation installed now, the pruned list can be exactly that.
    expect(storedTutor().disabledOperations ?? []).toEqual(factory.enabledOperations.filter(
      (operation) => !AVAILABLE.has(operation),
    ));
    expect((await afterRestart()).enabledOperations).toEqual(
      factory.enabledOperations.filter((operation) => AVAILABLE.has(operation)),
    );
  });

  it('lets a user widen a built-in beyond its factory set', async () => {
    const added = 'settings.read' as AgentToolOperationId;
    expect(factoryTutor().enabledOperations).not.toContain(added);

    const editor = await mountEditor();
    await editor.toggle(added);

    expect(storedTutor().addedOperations).toEqual([added]);
    expect((await afterRestart()).enabledOperations).toContain(added);
  });
});

describe('turning every operation off is allowed and sticks', () => {
  it('persists an empty allow-list through the disable-all control', async () => {
    const editor = await mountEditor();
    await editor.click('agent-operations-disable-all');

    expect(editor.checked()).toEqual([]);
    const reloaded = await afterRestart();
    expect(reloaded.enabledOperations).toEqual([]);
  });

  it('still reads as empty after a second restart, because normalize eats its own output', async () => {
    const editor = await mountEditor();
    await editor.click('agent-operations-disable-all');

    await afterRestart();
    expect((await afterRestart()).enabledOperations).toEqual([]);
  });
});

describe('the panel actually reaches the editor', () => {
  /**
   * A source check, deliberately. Everything above proves the editor works; none of it proves
   * the panel renders one — and "correct but unreachable" is the exact defect this slice
   * exists to close, twice over now (slice 56 for built-ins, this slice for the whole
   * allow-list). Mounting `LocalAgentPanel` itself would drag in `window.api`, the tokenizer
   * and the Study OS stylesheet for one assertion.
   */
  it('renders AgentProfileOperationsEditor in the agent profile section', async () => {
    const { readFileSync } = await import('node:fs');
    // Relative to the vitest cwd (the project root), not `import.meta.url`: the root
    // `tsconfig.json` predates ESM module resolution and flags `import.meta` as an error.
    const source = readFileSync('src/renderer/components/blanc/BlancReadyToolPanels.tsx', 'utf8');
    expect(source).toContain('AgentProfileOperationsEditor');
    expect(source).toMatch(/<AgentProfileOperationsEditor\b/);
  });
});

describe('controls — so none of the above can pass vacuously', () => {
  it('an untouched profile persists no empty delta fields', async () => {
    // The slice 58 bug. `disabledOperations: []` on disk reads as "already a delta" on the
    // next load and silently drops the edit after it.
    const editor = await mountEditor();
    const removed = factoryTutor().enabledOperations[0];
    await editor.toggle(removed);

    for (const profile of JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').profiles as Record<string, unknown>[]) {
      if (profile.id === TUTOR) continue;
      expect(Object.hasOwn(profile, 'disabledOperations')).toBe(false);
      expect(Object.hasOwn(profile, 'addedOperations')).toBe(false);
    }
  });

  it('an untouched store still yields the exact factory list', async () => {
    // Passes before this slice and after it. Without it, an editor that reported the factory
    // list no matter what was stored would be green forever.
    const tutor = await afterRestart();
    expect(tutor.enabledOperations).toEqual(factoryTutor().enabledOperations);
    expect(tutor.builtIn).toBe(true);
  });

  it('the other three built-ins are untouched by an edit to this one', async () => {
    const editor = await mountEditor();
    await editor.click('agent-operations-disable-all');

    vi.resetModules();
    const { loadLocalAgentProfiles } = await import('../localAgentProfilesStore');
    for (const profile of loadLocalAgentProfiles().profiles) {
      if (profile.id === TUTOR) continue;
      const factory = DEFAULT_AGENT_PROFILES.find((entry) => entry.id === profile.id);
      if (factory) expect(profile.enabledOperations).toEqual(factory.enabledOperations);
    }
  });
});
