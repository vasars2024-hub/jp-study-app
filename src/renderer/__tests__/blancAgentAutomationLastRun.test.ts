// @vitest-environment jsdom
/**
 * The schedule table's *Last run* column, rendered by the real panel.
 *
 * Why it is worth a render test rather than a unit test on the selector: the
 * column exists to make one specific state visible, and that state is produced
 * in another process. Main records a run when a scheduled automation comes due —
 * `missed` when the fire reached no claiming renderer — pushes the document, and
 * the panel is the only surface in the app that shows a schedule at all. A green
 * selector proves nothing about whether the user can ever see the word.
 *
 * The three states are deliberately distinct in the assertions, because two of
 * them are easy to conflate and the product's honesty depends on not conflating
 * them: an automation that has NOT come due yet, and one that came due and
 * reached nobody.
 *
 * `.test.ts` with `createElement`, matching `blancAgentStepConfirmGate.test.ts`
 * next door, so the root JSX config stays untouched.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = 1_700_000_000_000;

/**
 * `window.api` before the imports: the panel's import graph reaches `playerBus`,
 * which calls `window.api.onPlayerSync` at module scope. See the sibling suite.
 */
const BOOT_API = vi.hoisted(() => {
  const api = {
    onPlayerSync: () => () => undefined,
    onPlayerCommand: () => () => undefined,
    playerWindowId: () => Promise.resolve('test-window'),
    playerGetSnapshot: () => Promise.resolve(null),
  };
  (globalThis as Record<string, unknown>).api = api;
  return api;
});

import { LocalAgentPanel } from '../components/blanc/BlancReadyToolPanels';
import { resetAgentOperationalStateForTests } from '../agentOperationalClient';
import { emptyAgentOperationalState } from '../../shared/agentOperationalState';
import type { AgentAutomationRun } from '../../shared/localAgentAutomationRuns';
import type { AgentAutomation } from '../../shared/localAgentAutomation';
import { en } from '../../shared/i18n/catalogs';

const SETTINGS_KEY = 'jp-study-local-agent-settings-v1';

function automation(id: string, name: string): AgentAutomation {
  return {
    id,
    name,
    objective: 'Review due cards',
    frequency: 'daily',
    time: '09:00',
    enabled: true,
    permission: 'read-only',
    createdAt: NOW,
  };
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

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    enabled: true,
    backend: 'local-gguf',
    permission: 'read-only',
  }));
  vi.stubGlobal('api', {
    ...BOOT_API,
    onLocalAgentTrigger: () => () => undefined,
    localAgentClaimTriggers: () => Promise.resolve(true),
    localAgentReleaseTriggers: () => Promise.resolve(true),
    localAgentStatus: () => Promise.resolve({ loaded: false, busy: false }),
    localAgentModels: () => Promise.resolve([]),
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

/**
 * Seeds the main-owned document directly. The bridge degrades with no
 * `window.api.agentOperational*`, so this is the whole authoritative state the
 * panel will read — exactly as if main had just pushed it.
 */
async function mountWith(
  automations: AgentAutomation[],
  runs: AgentAutomationRun[],
): Promise<void> {
  resetAgentOperationalStateForTests({
    ...emptyAgentOperationalState(),
    automations,
    automationRuns: { version: 1, runs },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container as HTMLDivElement);
    root.render(createElement(LocalAgentPanel));
  });
}

/** The schedule row for one automation, found by its user-visible name. */
function scheduleRow(name: string): HTMLTableRowElement {
  const found = Array.from(container?.querySelectorAll('tr') ?? [])
    .find((row) => row.querySelector('td')?.textContent?.trim() === name);
  if (!found) throw new Error(`no schedule row named "${name}" — the panel changed shape`);
  return found as HTMLTableRowElement;
}

function lastRunText(name: string): string {
  const cells = scheduleRow(name).querySelectorAll('td');
  // Name, When, Permission, Last run, Remove.
  return cells[3]?.textContent?.trim() ?? '';
}

describe('the schedule table reports what actually happened', () => {
  it('says a fire reached nobody, in the user’s own words', async () => {
    await mountWith(
      [automation('a1', 'Morning review')],
      [{ automationId: 'a1', at: NOW, outcome: 'missed', handlers: 0 }],
    );

    const text = lastRunText('Morning review');
    // Compared against the catalog, so a missing key fails here instead of
    // rendering a raw key at the user.
    expect(text).toContain(en['blanc.agent.run.missed'].split('{time}')[1].trim());
    expect(text).not.toBe('');
  });

  it('says a fire was delivered', async () => {
    await mountWith(
      [automation('a1', 'Morning review')],
      [{ automationId: 'a1', at: NOW, outcome: 'delivered', handlers: 1 }],
    );

    const text = lastRunText('Morning review');
    expect(text).toContain(en['blanc.agent.run.delivered'].split('{time}')[0].trim());
    expect(text).not.toContain(en['blanc.agent.run.missed'].split('{time}')[1].trim());
  });

  /**
   * The state most easily conflated with `missed`. An automation with no run row
   * has not been shown to have failed — the log only keeps fourteen days — so the
   * cell must not claim it never ran, and must not borrow the missed wording.
   */
  it('distinguishes "has not fired" from "fired and reached nobody"', async () => {
    await mountWith([automation('a1', 'Morning review')], []);

    expect(lastRunText('Morning review')).toBe(en['blanc.agent.run.never']);
  });

  /**
   * NEGATIVE CONTROL. The cell must be keyed to its own automation. Without this
   * a column that rendered the newest run in the log, whoever it belonged to,
   * would pass every assertion above — and would tell the user that a schedule
   * they have never seen fire had just run.
   */
  it('does not attribute one automation’s run to another', async () => {
    await mountWith(
      [automation('a1', 'Morning review'), automation('a2', 'Evening mining')],
      [{ automationId: 'a1', at: NOW, outcome: 'delivered', handlers: 1 }],
    );

    expect(lastRunText('Evening mining')).toBe(en['blanc.agent.run.never']);
    expect(lastRunText('Morning review')).not.toBe(en['blanc.agent.run.never']);
  });

  it('shows the newest run when an automation has fired more than once', async () => {
    await mountWith(
      [automation('a1', 'Morning review')],
      [
        { automationId: 'a1', at: NOW - 86_400_000, outcome: 'delivered', handlers: 1 },
        { automationId: 'a1', at: NOW, outcome: 'missed', handlers: 0 },
      ],
    );

    expect(lastRunText('Morning review'))
      .toContain(en['blanc.agent.run.missed'].split('{time}')[1].trim());
  });
});
