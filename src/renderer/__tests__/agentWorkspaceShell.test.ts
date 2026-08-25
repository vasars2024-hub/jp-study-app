// @vitest-environment jsdom
/**
 * The Agent shell, rendered.
 *
 * Client render with `createElement`, as `videoCoreMiningPanelStructure.test.ts`
 * does and for the same reasons: `vitest.config.ts` is root config this track
 * does not own, `.test.tsx` is not in its include globs, and the surface derives
 * its state in an effect, so a static render would assert nothing.
 *
 * `../i18n` is mocked to the key itself. Not for convenience — at this commit
 * `shared/i18n/catalogs/en.ts` imports six split catalog modules that exist only
 * as uncommitted files in the primary tree, so importing the real hook here
 * fails to resolve before a single assertion runs (the same inherited breakage
 * takes `i18n.test.ts` and `tools/i18n-check.cjs` down). Echoing the key also
 * makes each assertion name the string it expects, which a rendered English
 * sentence would not.
 *
 * The bridge is NOT mocked: `window.api` is stubbed and the production client
 * runs, so these tests prove the shell consumes the production workspace and
 * execution clients.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SETTINGS_KEY = 'jp-study-local-agent-settings-v1';

// `section` is echoed alongside `count` because the navigation review step
// resolves a section's own label key and interpolates it. Swallowing that var
// would make "the destination text names what main resolved" unassertable.
// `objective`/`step`/`operation` are echoed for the same reason on the approval
// side: they are the whole content of the review step, read from the live queue.
vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) => {
      if (vars && 'count' in vars) return `${key}=${vars.count}`;
      if (vars && 'section' in vars) return `${key}:${vars.section}`;
      if (vars && 'control' in vars) return `${key}:${vars.control}`;
      if (vars && 'objective' in vars) return `${key}:${vars.objective}`;
      if (vars && 'step' in vars) return `${key}:${vars.step}`;
      if (vars && 'operation' in vars) return `${key}:${vars.operation}`;
      if (vars && 'word' in vars) return `${key}:${vars.word}`;
      return key;
    },
    lang: 'en',
  }),
}));

/**
 * Only the approval's two live seams are stubbed: what the queue and profile
 * currently say, and the one side effect a grant performs. `resolveAgentStepApproval`
 * itself is deliberately NOT mocked — it runs for real inside the component, so
 * these tests prove the shell shows what the gate decided rather than what the
 * stored card claims.
 */
vi.mock('../agentStepApprovalClient', () => ({
  readAgentStepApprovalContext: () => approvalContext,
  observeAgentStepApprovalContext: (
    _t: unknown,
    listener: (context: typeof approvalContext) => void,
  ) => {
    approvalObservers.add(listener);
    if (approvalObserverHydrated) listener(approvalContext);
    return () => approvalObservers.delete(listener);
  },
  grantAgentStepApproval: (...args: unknown[]) => {
    grantCalls.push(args);
    return Promise.resolve(grantResult);
  },
}));

// Same seam for the save gate: the deck and the profile are stubbed, the one
// write is recorded, and `resolveAgentSave` runs for real inside the component.
vi.mock('../agentSaveClient', () => ({
  readAgentSaveContext: () => ({
    permission: saveContext.permission,
    allowedOperations: saveContext.allowedOperations,
    savedWords: new Set(saveContext.savedWords),
  }),
  grantAgentSave: (...args: unknown[]) => {
    saveCalls.push(args);
    return saveResult;
  },
}));

vi.mock('../agentUndoClient', () => ({
  // Async, and the live ids are resolved per entity type — the media set comes
  // from main, so the whole read had to become a promise.
  readAgentUndoContext: () => Promise.resolve({
    permission: undoContext.permission,
    allowedOperations: undoContext.allowedOperations,
    liveEntityIds: () => new Set(undoContext.liveEntityIds),
  }),
  performAgentUndo: (...args: unknown[]) => {
    undoCalls.push(args);
    return Promise.resolve(undoResult);
  },
}));

vi.mock('../agentConversationPlanner', () => ({
  AGENT_CONVERSATION_PLAN_OBJECTIVE_LIMIT: 500,
  createAgentConversationPlan: (...args: unknown[]) => {
    plannerCalls.push(args);
    return Promise.resolve(plannerResult);
  },
  updateAgentConversationPlanQueue: (...args: unknown[]) => {
    planQueueActionCalls.push(args);
    return planQueueActionResult;
  },
  runAgentConversationPlan: () => Promise.resolve({ ok: false, code: 'task-not-found' }),
  isAgentConversationPlanQuarantined: () => false,
  retryAgentConversationPlanSave: () => Promise.resolve({ ok: false, code: 'task-not-found' }),
}));

import { AGENT_WORKSPACE_SCHEMA_VERSION, type AgentWorkspaceState } from '../../shared/agentWorkspace';
import { agentExecutionMessageIds } from '../../shared/agentExecutionBridge';
import AgentWorkspaceShell from '../components/agent/AgentWorkspaceShell';
import {
  getAgentOperationHistorySnapshot,
  resetAgentOperationalStateForTests,
} from '../agentOperationalClient';

interface BridgeCall {
  method: string;
  args: unknown[];
}

let host: HTMLDivElement;
let root: Root;
let calls: BridgeCall[];
let stored: AgentWorkspaceState;
let loadResult: unknown = null;
let executionListener: ((event: unknown) => void) | null;
let workspaceListener: ((state: unknown) => void) | null;
let navigationReview: unknown;
let navigationApproved: unknown;
let approvalContext: {
  queue: { version: 1; items: unknown[] };
  permission: string;
  allowedOperations: string[];
  handlers: Record<string, unknown>;
};
let grantResult: unknown;
let grantCalls: unknown[][];
let approvalObserverHydrated: boolean;
let approvalObservers: Set<(context: typeof approvalContext) => void>;
let saveContext: {
  permission: string;
  allowedOperations: string[];
  savedWords: string[];
};
let saveResult: unknown;
let saveCalls: unknown[][];
let undoContext: {
  permission: string;
  allowedOperations: string[];
  liveEntityIds: string[];
};
let undoResult: unknown;
let undoCalls: unknown[][];
let plannerResult: unknown;
let plannerCalls: unknown[][];
let planQueueActionResult: unknown;
let planQueueActionCalls: unknown[][];
/**
 * What main is holding for each conversation, and what it was asked for.
 *
 * A staged capture is single-use in main, so the stub deletes what it hands
 * back: a test that claimed twice and got the image twice would be asserting
 * against a store the production one does not resemble.
 */
let stagedImages: Map<string, unknown[]>;
let takeCalls: string[];
let stagedListener: ((conversationId: string) => void) | null;

function state(overrides: Partial<AgentWorkspaceState> = {}): AgentWorkspaceState {
  return {
    version: AGENT_WORKSPACE_SCHEMA_VERSION,
    revision: 0,
    activeConversationId: null,
    conversations: [],
    ...overrides,
  };
}

function populated(): AgentWorkspaceState {
  return state({
    activeConversationId: 'chat-1',
    conversations: [{
      id: 'chat-1',
      title: 'Particle question',
      mode: 'analyze',
      createdAt: 10,
      updatedAt: 20,
      pinned: false,
      archived: false,
      context: [{
        id: 'ctx-1',
        kind: 'reading-passage',
        label: 'Passage',
        preview: '窓辺の猫',
        source: { app: 'reading' },
        sensitivity: 'ordinary',
        retained: true,
        createdAt: 10,
      }],
      messages: [{
        id: 'msg-1',
        conversationId: 'chat-1',
        role: 'assistant',
        status: 'complete',
        text: 'The particle marks the topic.',
        createdAt: 12,
        updatedAt: 12,
        contextIds: ['ctx-1'],
        attachments: [],
        cards: [],
        provider: {
          target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
          cloud: true,
          contextIds: ['ctx-1'],
          attachmentIds: [],
          inputChars: 20,
          startedAt: 12,
        },
      }],
    }, {
      id: 'chat-2',
      title: 'Second thread',
      mode: 'ask',
      createdAt: 5,
      updatedAt: 6,
      pinned: false,
      archived: false,
      context: [],
      messages: [],
    }],
  });
}

/**
 * A conversation carrying one route context and the navigation card derived
 * from it — the shape `main/agentExecutionIpc.ts` actually produces.
 */
function navigationWorkspace(): AgentWorkspaceState {
  const base = populated();
  base.conversations[0].context = [{
    id: 'ctx-route',
    kind: 'route',
    label: 'Dictionary',
    preview: 'Where you were',
    source: { app: 'dictionary', route: 'entry/猫' },
    sensitivity: 'ordinary',
    retained: true,
    createdAt: 10,
  }];
  base.conversations[0].messages[0].cards = [{
    id: 'navigation-card',
    kind: 'navigation',
    title: 'Dictionary suggestion',
    sourceContextIds: ['ctx-route'],
    actions: [{
      id: 'navigate',
      label: 'Model-authored route label',
      effect: { type: 'navigate', section: 'dictionary', page: 'entry/猫' },
    }],
  }];
  return base;
}

/**
 * A conversation carrying the approval card `main/agentExecutionIpc.ts` produces:
 * a `plan` card whose action names two ids and whose stored label names nothing.
 */
function approvalWorkspace(): AgentWorkspaceState {
  const base = populated();
  base.conversations[0].messages[0].cards = [{
    id: 'approval-card',
    kind: 'plan',
    title: 'Passage',
    sourceContextIds: ['ctx-1'],
    actions: [{
      id: 'approve',
      label: 'Stored label nobody reads',
      effect: { type: 'approve-step', taskId: 'task-1', stepId: 'step-1' },
    }],
  }];
  return base;
}

function waitingQueue(): { version: 1; items: unknown[] } {
  return {
    version: 1,
    items: [{
      id: 'task-1',
      task: {
        id: 'task-1',
        objective: 'Live objective from the queue',
        status: 'waiting-confirmation',
        steps: [{
          id: 'step-1',
          label: 'Live step from the queue',
          request: {
            callId: 'call-1',
            operation: 'flashcard.add-cards',
            arguments: { cards: [{ front: 'a', back: 'b' }] },
          },
          status: 'waiting-confirmation',
        }],
        currentStepId: 'step-1',
        createdAt: 10,
        updatedAt: 10,
      },
      priority: 0,
      status: 'running',
      createdAt: 10,
      updatedAt: 10,
    }],
  };
}

/**
 * A conversation carrying the dictionary source card with its save action —
 * the shape `resultCardsForContext` produces for a disclosed dictionary entry.
 */
function saveWorkspace(kind = 'dictionary-entry'): AgentWorkspaceState {
  const base = populated();
  base.conversations[0].context = [{
    id: 'ctx-word',
    kind,
    label: '積ん読',
    preview: 'books bought and left unread',
    source: { app: 'dictionary', entityId: '積ん読' },
    sensitivity: 'ordinary',
    retained: true,
    createdAt: 10,
  }] as AgentWorkspaceState['conversations'][number]['context'];
  base.conversations[0].messages[0].cards = [{
    id: 'entry-card',
    kind: 'dictionary',
    title: '積ん読',
    sourceContextIds: ['ctx-word'],
    actions: [{
      id: 'save',
      label: 'Stored save label nobody reads',
      effect: { type: 'save', entityType: 'flashcard', entityId: 'ctx-word' },
    }],
  }];
  return base;
}

/** A stand-in for main: it answers from `stored` and records what it was asked. */
function installBridge(): void {
  calls = [];
  executionListener = null;
  workspaceListener = null;
  const record = (method: string, handle: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve(handle(...args));
    };
  (window as unknown as { api: Record<string, unknown> }).api = {
    agentWorkspaceLoad: record('load', () => loadResult ?? { ok: true, state: stored }),
    agentWorkspaceSave: record('save', (next) => {
      stored = next as AgentWorkspaceState;
      return { ok: true, state: stored };
    }),
    agentWorkspaceDeleteConversation: record('delete', (id) => {
      stored = {
        ...stored,
        activeConversationId: null,
        conversations: stored.conversations.filter((item) => item.id !== id),
      };
      return { ok: true, state: stored };
    }),
    agentWorkspaceClear: record('clear', () => {
      stored = state();
      return { ok: true, state: stored };
    }),
    onAgentWorkspaceChanged: (cb: (state: unknown) => void) => {
      workspaceListener = cb;
      return () => {
        workspaceListener = null;
      };
    },
    onAgentExecutionEvent: (cb: (event: unknown) => void) => {
      executionListener = cb;
      return () => {
        executionListener = null;
      };
    },
    agentExecutionRun: record('execute', (raw) => ({
      ok: false,
      code: 'provider-failed',
      requestId: (raw as { requestId: string }).requestId,
      state: stored,
    })),
    agentExecutionCancel: record('cancelExecution', () => ({ ok: true, cancelled: true })),
    agentImageTake: (conversationId: string) => {
      takeCalls.push(conversationId);
      const images = stagedImages.get(conversationId) ?? [];
      stagedImages.delete(conversationId);
      return Promise.resolve({ ok: true, images });
    },
    onAgentImageStaged: (cb: (conversationId: string) => void) => {
      stagedListener = cb;
      return () => {
        stagedListener = null;
      };
    },
    // Main owns every navigation decision, so the stub answers from a fixture
    // the test sets rather than resolving anything itself. That is the point:
    // the shell must show what main resolved, not what the stored card says.
    agentNavigationRun: record('navigate', (raw) => {
      const request = raw as { approved: boolean };
      return request.approved ? navigationApproved : navigationReview;
    }),
    // Both cloud providers hold a key here, so the picker's "no API key" marker
    // stays off and every existing label assertion reads the plain name. The
    // marker's own behaviour is covered live and in `aiProviderHealth.test.ts`;
    // what this stub is for is that the shell now *asks* on mount.
    aiProviderHealth: record('providerHealth', () => [
      { providerId: 'gemini-2.5-flash', model: 'gemini-2.5-flash', credentialBucket: 'gemini', configured: true },
      { providerId: 'deepseek-v4-flash', model: 'deepseek-v4-flash', credentialBucket: 'deepseek', configured: true },
      { providerId: 'deepseek-v4-pro', model: 'deepseek-v4-pro', credentialBucket: 'deepseek', configured: true },
    ]),
  };
}

const text = (): string => host.textContent ?? '';
const buttons = (): HTMLButtonElement[] => [...host.querySelectorAll('button')];
const buttonWith = (label: string): HTMLButtonElement => {
  const found = buttons().find((button) => button.textContent?.includes(label));
  if (!found) throw new Error(`no button containing "${label}" in: ${text()}`);
  return found;
};

async function mount(): Promise<void> {
  await act(async () => {
    root.render(createElement(AgentWorkspaceShell));
  });
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
  });
}

async function publishApprovalContext(): Promise<void> {
  await act(async () => {
    for (const listener of approvalObservers) listener(approvalContext);
  });
}

async function setTextarea(value: string): Promise<void> {
  const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      ?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function selectFile(name: string, content: string): Promise<void> {
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  const selected = {
    name,
    type: 'text/plain',
    size: new TextEncoder().encode(content).length,
    text: async () => content,
  } as File;
  Object.defineProperty(input, 'files', { configurable: true, value: [selected] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  // React 19 warns on any state update `act` schedules asynchronously unless the
  // environment declares itself. The navigation gate resolves through the bridge
  // before it renders, so it is the first test here that needs it.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1 }));
  stored = state();
  loadResult = null;
  stagedImages = new Map();
  takeCalls = [];
  stagedListener = null;
  navigationReview = {
    ok: true,
    destination: { section: 'dictionary', page: 'entry/猫' },
    opened: false,
  };
  navigationApproved = {
    ok: true,
    destination: { section: 'dictionary', page: 'entry/猫' },
    opened: true,
  };
  approvalContext = {
    queue: waitingQueue(),
    permission: 'full-automation',
    allowedOperations: ['flashcard.add-cards'],
    handlers: {},
  };
  grantResult = { ok: true };
  grantCalls = [];
  approvalObserverHydrated = true;
  approvalObservers = new Set();
  saveContext = {
    permission: 'full-automation',
    allowedOperations: ['flashcard.add-cards'],
    savedWords: [],
  };
  saveResult = {
    ok: true,
    operation: {
      operation: 'flashcard.add-cards',
      claim: 'created',
      entityType: 'flashcard',
      entityIds: ['saved-card-1'],
      callId: 'save|chat-1|msg-1|entry-card|save',
    },
  };
  saveCalls = [];
  undoContext = {
    permission: 'full-automation',
    allowedOperations: ['flashcard.delete-cards'],
    liveEntityIds: ['saved-card-1'],
  };
  undoResult = {
    ok: true,
    operation: {
      operation: 'flashcard.delete-cards',
      claim: 'deleted',
      entityType: 'flashcard',
      entityIds: ['saved-card-1'],
      callId: 'undo|save|chat-1|msg-1|entry-card|save|0',
      invertsSequence: 0,
    },
  };
  undoCalls = [];
  plannerResult = {
    ok: true,
    taskId: 'task-plan',
    summary: 'One safe step',
    queue: { version: 1, items: [{ id: 'task-plan', task: { steps: [{}] } }] },
  };
  plannerCalls = [];
  planQueueActionResult = { ok: true, queue: { version: 1, items: [] } };
  planQueueActionCalls = [];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  installBridge();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { api?: unknown }).api;
});

describe('Agent workspace shell', () => {
  it('loads once on mount and labels the surface for a screen reader', async () => {
    await mount();
    expect(calls.map((call) => call.method)).toEqual(['load', 'providerHealth']);
    expect(host.querySelector('.agent-shell')?.getAttribute('aria-label'))
      .toBe('agent.shell.aria');
    expect(host.querySelector('.agent-rail')?.getAttribute('aria-label'))
      .toBe('agent.rail.aria');
  });

  it('offers the empty state, then creates and saves a real conversation', async () => {
    await mount();
    expect(text()).toContain('agent.state.emptyTitle');

    await click(buttonWith('agent.state.emptyAction'));

    const save = calls.find((call) => call.method === 'save');
    expect(save).toBeTruthy();
    const saved = save?.args[0] as AgentWorkspaceState;
    expect(saved.version).toBe(AGENT_WORKSPACE_SCHEMA_VERSION);
    expect(saved.conversations).toHaveLength(1);
    expect(saved.activeConversationId).toBe(saved.conversations[0].id);
    expect(saved.conversations[0].title).toBe('agent.conversation.untitled');
    // The store's answer is what renders, so the surface shows the saved thread.
    expect(text()).toContain('agent.conversation.empty');
  });

  it('renders the selected conversation with its retention and cloud disclosure', async () => {
    stored = populated();
    await mount();

    expect(text()).toContain('Particle question');
    expect(text()).toContain('The particle marks the topic.');
    expect(text()).toContain('agent.mode.analyze');
    expect(text()).toContain('agent.message.role.assistant');
    expect(text()).toContain('agent.message.providerCloud');
    expect(text()).toContain('agent.context.retained');
    // Provider and retention boundaries are stated on the surface.
    expect(text()).toContain('agent.notice.scope');
    expect(text()).toContain('agent.notice.retention');
    expect(host.querySelector('textarea')).not.toBeNull();
    expect(host.querySelector('select')?.getAttribute('value')).toBeNull();
    expect(text()).toContain('agent.execute.localNotice');

    const selected = host.querySelector('.agent-rail-entry.is-selected');
    expect(selected?.getAttribute('aria-current')).toBe('true');
    expect(selected?.textContent).toContain('Particle question');
  });

  it('prefills the composer from attached-context suggestions without executing', async () => {
    stored = populated();
    await mount();

    const suggestion = host.querySelector<HTMLButtonElement>('.agent-context-suggestion');
    expect(suggestion?.textContent).toContain('agent.suggestions.action.reading');
    await click(suggestion as HTMLButtonElement);

    expect((host.querySelector('textarea') as HTMLTextAreaElement).value)
      .toBe('agent.suggestions.prompt.reading');
    expect(calls.map((call) => call.method)).toEqual(['load', 'providerHealth']);
  });

  it('defaults to a clean Simple view and reveals advanced controls in Full view', async () => {
    stored = populated();
    await mount();

    const simple = buttonWith('agent.view.simple');
    const full = buttonWith('agent.view.full');
    expect(simple.getAttribute('aria-pressed')).toBe('true');
    expect(full.getAttribute('aria-pressed')).toBe('false');
    expect((host.querySelector('.agent-composer-options') as HTMLElement).hidden).toBe(true);
    expect((host.querySelector('.agent-full-inspector') as HTMLElement).hidden).toBe(true);

    await click(full);

    expect(simple.getAttribute('aria-pressed')).toBe('false');
    expect(full.getAttribute('aria-pressed')).toBe('true');
    expect((host.querySelector('.agent-composer-options') as HTMLElement).hidden).toBe(false);
    expect((host.querySelector('.agent-full-inspector') as HTMLElement).hidden).toBe(false);
  });

  it('reaches the governance panel from Full view, which is the only route the main app has', async () => {
    stored = populated();
    await mount();

    // The panel writes `localAgentSettings` and the profile store. Until it was wired here the
    // only writer for either in the whole repository lived in Blanc's separate shell, so the app
    // that owns the Agent could read its permission ceiling and change nothing. An import alone
    // does not prove that — `architecture-audit` is satisfied by a module being referenced, not
    // rendered — so this walks the same path a user does: Full view, then the disclosure button.
    expect(host.querySelector('.agent-governance')).toBeNull();

    await click(buttonWith('agent.view.full'));
    const open = buttonWith('agent.governance.title');
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.agent-governance')).toBeNull();

    await click(open);

    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.agent-governance')).not.toBeNull();
    // The three controls the plan bullet names, reachable rather than merely present in a module.
    expect(host.querySelector('[data-testid="agent-governance-permission-full-automation"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="agent-governance-profile"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="agent-governance-memory"]')).not.toBeNull();
    // It lives inside the Full-mode inspector, so Simple view does not expose the ceiling.
    expect((host.querySelector('.agent-full-inspector') as HTMLElement).hidden).toBe(false);
  });

  it('collapses the context and activity inspector without persisting a workspace change', async () => {
    stored = populated();
    await mount();

    const toggle = buttonWith('agent.inspector.title');
    const contentId = toggle.getAttribute('aria-controls');
    const content = contentId ? document.getElementById(contentId) : null;
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('agent.inspector.collapse');
    expect(content?.hidden).toBe(false);
    expect(content?.querySelector('.agent-context')).not.toBeNull();

    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('agent.inspector.expand');
    expect(content?.hidden).toBe(true);
    expect(host.querySelector('.agent-conversation-workspace')?.classList)
      .toContain('is-inspector-collapsed');
    expect(calls.map((call) => call.method)).toEqual(['load', 'providerHealth']);

    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(content?.hidden).toBe(false);
    expect(calls.map((call) => call.method)).toEqual(['load', 'providerHealth']);
  });

  it('switches the inspector shelf and filtered activity with the selected conversation', async () => {
    stored = navigationWorkspace();
    await mount();
    navigationApproved = { ok: false, code: 'open-failed' };
    await click(buttonWith('agent.card.navigate.review'));
    await click(buttonWith('agent.card.navigate.approve'));

    expect(host.querySelector('[data-agent-context="ctx-route"]')).not.toBeNull();
    expect(host.querySelector('.agent-timeline')?.closest('.agent-inspector')).not.toBeNull();

    const second = [...host.querySelectorAll<HTMLButtonElement>('[data-agent-conversation]')]
      .find((entry) => entry.dataset.agentConversation === 'chat-2');
    await click(second as HTMLButtonElement);
    expect(host.querySelector('[data-agent-context="ctx-route"]')).toBeNull();
    expect(text()).toContain('agent.context.empty');
    expect(host.querySelector('.agent-timeline')).toBeNull();

    const first = [...host.querySelectorAll<HTMLButtonElement>('[data-agent-conversation]')]
      .find((entry) => entry.dataset.agentConversation === 'chat-1');
    await click(first as HTMLButtonElement);
    expect(host.querySelector('[data-agent-context="ctx-route"]')).not.toBeNull();
    expect(host.querySelector('.agent-timeline')).not.toBeNull();
  });

  it('opens a collapsed inspector, then scrolls to and focuses the exact context shelf item', async () => {
    stored = populated();
    stored.conversations[0].messages[0].cards = [{
      id: 'card-1',
      kind: 'reading',
      title: 'Passage source',
      sourceContextIds: ['ctx-1'],
      actions: [{
        id: 'open-source',
        label: 'Model supplied label',
        effect: { type: 'open-context', contextId: 'ctx-1' },
      }, {
        id: 'navigate',
        label: 'Do not navigate',
        effect: { type: 'navigate', section: 'dictionary' },
      }],
    }];
    await mount();

    const contextItem = host.querySelector<HTMLElement>('[data-agent-context="ctx-1"]');
    const scrollIntoView = vi.fn();
    Object.defineProperty(contextItem, 'scrollIntoView', { value: scrollIntoView });
    const action = buttonWith('agent.context.source');
    const inspectorToggle = buttonWith('agent.inspector.title');
    await click(inspectorToggle);
    expect(inspectorToggle.getAttribute('aria-expanded')).toBe('false');

    expect(text()).not.toContain('Model supplied label');
    expect(text()).not.toContain('Do not navigate');
    // The navigation action is present but gated: a review affordance and
    // nothing else. No destination is shown until main resolves one.
    expect(text()).toContain('agent.card.navigate.review');
    expect(text()).not.toContain('agent.card.navigate.destination');
    await click(action);

    expect(inspectorToggle.getAttribute('aria-expanded')).toBe('true');
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'nearest',
      inline: 'nearest',
    });
    expect(document.activeElement).toBe(contextItem);
    expect(contextItem?.classList.contains('is-opened')).toBe(true);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(calls.map((call) => call.method)).toEqual(['load', 'providerHealth']);
  });

  it('keeps navigation suggestions inert and resolves provenance from live selected context', async () => {
    stored = populated();
    stored.conversations[0].context[0] = {
      ...stored.conversations[0].context[0],
      label: 'Live selected passage',
      source: { app: 'live-reader' },
    };
    stored.conversations[1].context = [{
      id: 'ctx-other',
      kind: 'dictionary-entry',
      label: 'Other conversation source',
      preview: '別',
      source: { app: 'dictionary' },
      sensitivity: 'ordinary',
      retained: true,
      createdAt: 5,
    }];
    stored.conversations[0].messages[0].cards = [{
      id: 'navigation-card',
      kind: 'navigation',
      title: 'Dictionary suggestion',
      sourceContextIds: ['ctx-1', 'ctx-other', 'ctx-stale'],
      actions: [{
        id: 'navigate',
        label: 'Model-authored route label',
        effect: { type: 'navigate', section: 'dictionary', page: 'entry' },
      }],
    }];
    await mount();

    const card = host.querySelector<HTMLElement>('.agent-card');
    const gate = card?.querySelector<HTMLElement>('.agent-card-navigate');
    const sources = card?.querySelector<HTMLElement>('.agent-card-sources');
    // Before review: one button, no destination, and nothing asked of main.
    expect(gate?.getAttribute('role')).toBe('group');
    expect(card?.querySelectorAll('button')).toHaveLength(1);
    expect(card?.textContent).toContain('agent.card.navigate.review');
    expect(card?.textContent).not.toContain('Model-authored route label');
    expect(sources?.getAttribute('aria-label')).toBe('agent.context.title');
    expect(sources?.textContent).toContain('Live selected passage');
    expect(sources?.textContent).toContain('agent.context.source');
    expect(sources?.textContent).not.toContain('Other conversation source');
    expect(host.textContent).not.toContain('ctx-stale');
    expect(calls.map((call) => call.method)).toEqual(['load', 'providerHealth']);
  });

  it('reviews a destination, opens it only on approval, and never sends one', async () => {
    stored = navigationWorkspace();
    await mount();

    await click(buttonWith('agent.card.navigate.review'));

    const review = calls.find((call) => call.method === 'navigate');
    // The whole security property of the channel, asserted at the call site.
    expect(review?.args[0]).toEqual({
      conversationId: 'chat-1',
      messageId: 'msg-1',
      cardId: 'navigation-card',
      actionId: 'navigate',
      approved: false,
    });
    // The destination names the section main resolved, through that section's
    // own label key — not through anything the stored card carried.
    expect(text()).toContain('agent.card.navigate.destination:palette.section.dictionary');
    expect(text()).toContain('agent.card.navigate.page');
    // Reviewing opened nothing, and the stored label never became a destination.
    expect(text()).not.toContain('agent.card.navigate.opened');
    expect(text()).not.toContain('Model-authored route label');

    await click(buttonWith('agent.card.navigate.approve'));

    const approval = calls.filter((call) => call.method === 'navigate')[1];
    expect(approval?.args[0]).toMatchObject({ approved: true });
    expect(Object.keys(approval?.args[0] as object).sort())
      .toEqual(['actionId', 'approved', 'cardId', 'conversationId', 'messageId']);
    expect(text()).toContain('agent.card.navigate.opened');
    expect(text()).not.toContain('agent.card.navigate.approve');
  });

  it('reviews an exact Settings page/control link while sending only action coordinates', async () => {
    stored = navigationWorkspace();
    stored.conversations[0].context[0].label = 'Theme setting';
    stored.conversations[0].context[0].source = {
      app: 'settings',
      route: 'appearance',
      controlId: 'theme',
      highlight: true,
    };
    stored.conversations[0].messages[0].cards[0].actions[0].effect = {
      type: 'navigate',
      section: 'settings',
      page: 'appearance',
      controlId: 'theme',
      highlight: true,
    };
    const destination = {
      section: 'settings',
      page: 'appearance',
      controlId: 'theme',
      highlight: true,
    };
    navigationReview = { ok: true, destination, opened: false };
    navigationApproved = { ok: true, destination, opened: true };
    await mount();

    await click(buttonWith('agent.card.navigate.review'));
    expect(text()).toContain('agent.card.navigate.destination:palette.section.settings');
    expect(text()).toContain('agent.card.navigate.page');
    expect(text()).toContain('agent.card.navigate.control:theme');
    expect(text()).toContain('agent.card.navigate.highlight');
    const review = calls.find((call) => call.method === 'navigate');
    expect(review?.args[0]).toEqual({
      conversationId: 'chat-1',
      messageId: 'msg-1',
      cardId: 'navigation-card',
      actionId: 'navigate',
      approved: false,
    });
    expect(JSON.stringify(review?.args[0])).not.toContain('appearance');
    expect(JSON.stringify(review?.args[0])).not.toContain('theme');

    await click(buttonWith('agent.card.navigate.approve'));
    const approval = calls.filter((call) => call.method === 'navigate')[1];
    expect(approval?.args[0]).toMatchObject({ approved: true });
    expect(Object.keys(approval?.args[0] as object).sort())
      .toEqual(['actionId', 'approved', 'cardId', 'conversationId', 'messageId']);
    expect(text()).toContain('agent.card.navigate.opened');
  });

  it('records each attempt on the activity timeline, keeping the failure a retry follows', async () => {
    stored = navigationWorkspace();
    await mount();

    // Nothing attempted yet, so there is nothing to review.
    expect(host.querySelector('.agent-timeline')).toBeNull();

    navigationApproved = { ok: false, code: 'open-failed' };
    await click(buttonWith('agent.card.navigate.review'));
    await click(buttonWith('agent.card.navigate.approve'));

    const timeline = host.querySelector<HTMLElement>('.agent-timeline');
    expect(timeline?.getAttribute('aria-label')).toBe('agent.timeline.title');
    expect(timeline?.textContent).toContain('agent.timeline.status.failed');
    expect(timeline?.textContent).toContain('agent.navigate.error.open-failed');

    // A retry is a second attempt beside the first, not a rewrite of it.
    navigationApproved = {
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
      opened: true,
    };
    await click(buttonWith('agent.card.navigate.retry'));
    await click(buttonWith('agent.card.navigate.approve'));

    const rows = [...host.querySelectorAll('.agent-timeline-entry')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('agent.timeline.status.succeeded');
    expect(rows[0].textContent).toContain('agent.timeline.attempt');
    expect(rows[1].textContent).toContain('agent.timeline.status.failed');
    // Ids only: no destination string reaches the record.
    expect(host.querySelector('.agent-timeline')?.textContent)
      .not.toContain('palette.section.dictionary');
  });

  it('cancels a reviewed destination without opening it', async () => {
    stored = navigationWorkspace();
    await mount();

    await click(buttonWith('agent.card.navigate.review'));
    await click(buttonWith('agent.card.navigate.cancel'));

    expect(text()).toContain('agent.card.navigate.cancelled');
    expect(text()).not.toContain('agent.card.navigate.opened');
    // Only the review resolution crossed the bridge. Nothing was approved.
    expect(calls.filter((call) => call.method === 'navigate')).toHaveLength(1);
  });

  it('reports a refused destination and offers a retry that asks again', async () => {
    navigationReview = { ok: false, code: 'stale-provenance' };
    stored = navigationWorkspace();
    await mount();

    await click(buttonWith('agent.card.navigate.review'));
    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain('agent.navigate.error.stale-provenance');
    expect(text()).not.toContain('agent.card.navigate.approve');

    navigationReview = {
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
      opened: false,
    };
    await click(buttonWith('agent.card.navigate.retry'));
    expect(text()).toContain('agent.card.navigate.destination');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('reports an approval that did not open a window, and counts the attempt', async () => {
    navigationApproved = { ok: false, code: 'open-failed' };
    stored = navigationWorkspace();
    await mount();

    await click(buttonWith('agent.card.navigate.review'));
    await click(buttonWith('agent.card.navigate.approve'));

    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain('agent.navigate.error.open-failed');
    expect(text()).not.toContain('agent.card.navigate.opened');

    // A retry re-resolves and asks for a second approval rather than reusing
    // the first one, and the attempt count says so.
    navigationApproved = {
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
      opened: true,
    };
    await click(buttonWith('agent.card.navigate.retry'));
    expect(text()).toContain('agent.card.navigate.destination');
    await click(buttonWith('agent.card.navigate.approve'));
    expect(text()).toContain('agent.card.navigate.opened');
    expect(text()).toContain('agent.card.navigate.attempt=2');
  });

  it('reviews a step from the live queue, never from the stored card label', async () => {
    stored = approvalWorkspace();
    await mount();
    await click(buttonWith('agent.card.approve.review'));

    expect(text()).toContain('Live objective from the queue');
    expect(text()).toContain('Live step from the queue');
    expect(text()).toContain('agent.card.approve.operation:flashcard.add-cards');
    // The persisted action label names nothing and is never shown.
    expect(text()).not.toContain('Stored label nobody reads');
    // Review resolves; it does not run.
    expect(grantCalls).toHaveLength(0);
  });

  it('runs the step only after the grant, and records the attempt as succeeded', async () => {
    stored = approvalWorkspace();
    await mount();
    await click(buttonWith('agent.card.approve.review'));
    await click(buttonWith('agent.card.approve.grant'));

    expect(grantCalls).toHaveLength(1);
    // The grant is handed the conversation and the action's coordinates, not the
    // approval the review captured — it re-resolves the whole gate itself.
    expect((grantCalls[0][0] as { id: string }).id).toBe('chat-1');
    expect(grantCalls[0].slice(1, 4)).toEqual(['msg-1', 'approval-card', 'approve']);
    expect(text()).toContain('agent.card.approve.granted');
    expect(text()).toContain('agent.timeline.effect.approve-step');
    expect(text()).toContain('agent.timeline.status.succeeded');
  });

  it('shows a passive refusal when the profile no longer permits a step', async () => {
    stored = approvalWorkspace();
    // The card was produced while the operation was enabled; the profile has
    // since been narrowed. The real gate is what decides this.
    approvalContext.allowedOperations = ['flashcard.list-decks'];
    await mount();

    expect(text()).toContain('agent.approve.error.operation-denied');
    expect(buttons().some((button) => button.textContent?.includes('agent.card.approve.review')))
      .toBe(false);
    expect(text()).not.toContain('agent.card.approve.grant');
    expect(grantCalls).toHaveLength(0);
    expect(text()).not.toContain('agent.timeline.effect.approve-step');
    expect(text()).not.toContain('Live objective from the queue');
    expect(text()).not.toContain('Live step from the queue');
    expect(text()).not.toContain('flashcard.add-cards');
    expect(text()).not.toContain('Stored label nobody reads');
  });

  it('shows a passive refusal when a step stopped waiting', async () => {
    stored = approvalWorkspace();
    const queue = waitingQueue();
    (queue.items[0] as { task: { steps: { status: string }[] } }).task.steps[0].status = 'completed';
    approvalContext.queue = queue;
    await mount();

    expect(text()).toContain('agent.approve.error.step-not-awaiting');
    expect(grantCalls).toHaveLength(0);
    expect(text()).not.toContain('agent.timeline.effect.approve-step');
  });

  it('checks availability passively until operational hydration completes', async () => {
    stored = approvalWorkspace();
    approvalObserverHydrated = false;
    await mount();

    expect(text()).toContain('agent.card.approve.checking');
    expect(buttons().some((button) => button.textContent?.includes('agent.card.approve.review')))
      .toBe(false);
    expect(text()).not.toContain('agent.timeline.effect.approve-step');

    approvalObserverHydrated = true;
    await publishApprovalContext();
    expect(buttonWith('agent.card.approve.review')).toBeTruthy();
    expect(text()).not.toContain('agent.timeline.effect.approve-step');
  });

  it('updates an idle approval in place when live authority narrows and widens', async () => {
    stored = approvalWorkspace();
    await mount();
    expect(buttonWith('agent.card.approve.review')).toBeTruthy();

    approvalContext = { ...approvalContext, allowedOperations: ['flashcard.list-decks'] };
    await publishApprovalContext();
    expect(text()).toContain('agent.approve.error.operation-denied');
    expect(buttons().some((button) => button.textContent?.includes('agent.card.approve.review')))
      .toBe(false);
    expect(text()).not.toContain('Live objective from the queue');
    expect(text()).not.toContain('flashcard.add-cards');
    expect(text()).not.toContain('agent.timeline.effect.approve-step');

    approvalContext = { ...approvalContext, allowedOperations: ['flashcard.add-cards'] };
    await publishApprovalContext();
    expect(buttonWith('agent.card.approve.review')).toBeTruthy();
    expect(text()).not.toContain('agent.timeline.effect.approve-step');
  });

  it('keeps a failed run in the record beneath the retry that follows it', async () => {
    stored = approvalWorkspace();
    grantResult = { ok: false, code: 'approve-failed' };
    await mount();
    await click(buttonWith('agent.card.approve.review'));
    await click(buttonWith('agent.card.approve.grant'));
    expect(text()).toContain('agent.approve.error.approve-failed');

    grantResult = { ok: true };
    await click(buttonWith('agent.card.approve.retry'));
    await click(buttonWith('agent.card.approve.grant'));

    // Two attempts, and the first one's failure is still there: a retry appends
    // beside the refusal rather than erasing it.
    const rows = [...host.querySelectorAll('.agent-timeline-entry')];
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.className.includes('agent-timeline-failed'))).toBe(true);
    expect(rows.some((row) => row.className.includes('agent-timeline-succeeded'))).toBe(true);
    expect(text()).toContain('agent.card.approve.granted');
  });

  it('cancels a reviewed step without running it', async () => {
    stored = approvalWorkspace();
    await mount();
    await click(buttonWith('agent.card.approve.review'));
    await click(buttonWith('agent.card.approve.cancel'));

    expect(grantCalls).toHaveLength(0);
    expect(text()).toContain('agent.card.approve.cancelled');
    expect(text()).toContain('agent.timeline.status.cancelled');
  });

  it('reviews a save from the live shelf item, then writes only on confirm', async () => {
    stored = saveWorkspace();
    await mount();
    await click(buttonWith('agent.card.save.review'));

    expect(text()).toContain('agent.card.save.entry:積ん読');
    expect(text()).not.toContain('Stored save label nobody reads');
    expect(saveCalls).toHaveLength(0);

    await click(buttonWith('agent.card.save.confirm'));
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].slice(1, 4)).toEqual(['msg-1', 'entry-card', 'save']);
    expect(text()).toContain('agent.card.save.saved');
    expect(text()).toContain('agent.timeline.effect.save');
    expect(text()).toContain('agent.timeline.status.succeeded');
  });

  it('refuses to save session-only reading context, and never writes', async () => {
    // The persistence boundary, expressed as a control: a passage the user
    // highlighted is never written to disk, so it cannot become a deck row.
    stored = saveWorkspace('reading-passage');
    await mount();
    await click(buttonWith('agent.card.save.review'));

    expect(text()).toContain('agent.save.error.not-savable-kind');
    expect(saveCalls).toHaveLength(0);
    expect(text()).toContain('agent.timeline.status.failed');
  });

  it('refuses a word the deck already holds', async () => {
    stored = saveWorkspace();
    saveContext.savedWords = ['積ん読'];
    await mount();
    await click(buttonWith('agent.card.save.review'));

    expect(text()).toContain('agent.save.error.already-saved');
    expect(saveCalls).toHaveLength(0);
  });

  it('refuses a save the profile no longer permits', async () => {
    stored = saveWorkspace();
    saveContext.allowedOperations = ['flashcard.list-decks'];
    await mount();
    await click(buttonWith('agent.card.save.review'));

    expect(text()).toContain('agent.save.error.operation-denied');
    expect(saveCalls).toHaveLength(0);
  });

  it('reports a write that failed after the user confirmed', async () => {
    stored = saveWorkspace();
    saveResult = { ok: false, code: 'save-failed' };
    await mount();
    await click(buttonWith('agent.card.save.review'));
    await click(buttonWith('agent.card.save.confirm'));

    // Not "saved" over a deck that gained nothing.
    expect(text()).toContain('agent.save.error.save-failed');
    expect(text()).not.toContain('agent.card.save.saved');
    expect(text()).toContain('agent.timeline.status.failed');
  });

  it('reviews and confirms a deterministic Undo, then records the inverse', async () => {
    stored = saveWorkspace();
    await mount();
    await click(buttonWith('agent.card.save.review'));
    await click(buttonWith('agent.card.save.confirm'));

    await click(buttonWith('agent.card.undo.review'));
    expect(text()).toContain('agent.card.undo.target=1');
    expect(undoCalls).toHaveLength(0);

    await click(buttonWith('agent.card.undo.confirm'));
    expect(undoCalls).toHaveLength(1);
    expect(text()).toContain('agent.card.undo.undone');
    expect(text()).toContain('agent.timeline.effect.undo');
    expect(text()).toContain('agent.timeline.status.succeeded');
  });

  /**
   * The session log dies with the window; the durable history is what answers
   * "what has this thing done to my data" after a restart. The projection is a
   * one-way effect with no visible result inside the shell, so nothing else in
   * this file would notice if it stopped running.
   */
  it('projects every completed effect into the durable history, ids only', async () => {
    resetAgentOperationalStateForTests();
    stored = saveWorkspace();
    await mount();
    await click(buttonWith('agent.card.save.review'));
    await click(buttonWith('agent.card.save.confirm'));

    const afterSave = getAgentOperationHistorySnapshot();
    expect(afterSave.entries).toHaveLength(1);
    expect(afterSave.entries[0]).toMatchObject({ claim: 'created', entityType: 'flashcard' });
    // Rule 1 of the session log, made stricter on the way to disk.
    expect('arguments' in afterSave.entries[0]).toBe(false);
    expect('sequence' in afterSave.entries[0]).toBe(false);

    // An undo is its own operation, not an edit of the entry it reverses.
    await click(buttonWith('agent.card.undo.review'));
    await click(buttonWith('agent.card.undo.confirm'));

    const afterUndo = getAgentOperationHistorySnapshot();
    expect(afterUndo.entries).toHaveLength(2);
    expect(afterUndo.entries[0].id).not.toBe(afterUndo.entries[1].id);
    expect('invertsSequence' in afterUndo.entries[0]).toBe(false);
  });

  it('keeps a valid Undo visible after switching away from the saved message', async () => {
    stored = saveWorkspace();
    await mount();
    await click(buttonWith('agent.card.save.review'));
    await click(buttonWith('agent.card.save.confirm'));

    const second = [...host.querySelectorAll<HTMLButtonElement>('[data-agent-conversation]')]
      .find((entry) => entry.dataset.agentConversation === 'chat-2');
    await click(second as HTMLButtonElement);
    const first = [...host.querySelectorAll<HTMLButtonElement>('[data-agent-conversation]')]
      .find((entry) => entry.dataset.agentConversation === 'chat-1');
    await click(first as HTMLButtonElement);

    expect(buttons().some((button) => button.textContent?.includes('agent.card.undo.review'))).toBe(true);
    expect(buttons().some((button) => button.textContent?.includes('agent.card.save.review'))).toBe(false);
    expect(text()).toContain('agent.card.save.saved');
  });

  it('announces stale or undeclared card context without moving focus or mutating state', async () => {
    stored = populated();
    stored.conversations[0].messages[0].cards = [{
      id: 'stale-card',
      kind: 'reading',
      title: 'Stale source',
      sourceContextIds: ['ctx-gone'],
      actions: [{
        id: 'open-stale',
        label: 'Stale model label',
        effect: { type: 'open-context', contextId: 'ctx-gone' },
      }],
    }, {
      id: 'unproven-card',
      kind: 'reading',
      title: 'Missing provenance',
      sourceContextIds: [],
      actions: [{
        id: 'open-unproven',
        label: 'Unproven model label',
        effect: { type: 'open-context', contextId: 'ctx-1' },
      }],
    }];
    await mount();

    const cardActions = [...host.querySelectorAll<HTMLButtonElement>('.agent-card-action')];
    expect(cardActions).toHaveLength(2);
    await click(cardActions[0]);
    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain('agent.error.invalid-request');
    expect(host.querySelector('.agent-context-item.is-opened')).toBeNull();

    await click(cardActions[1]);
    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain('agent.error.invalid-request');
    expect(host.querySelector('.agent-context-item.is-opened')).toBeNull();
    expect(calls.map((call) => call.method)).toEqual(['load', 'providerHealth']);
  });

  it('moves rail focus with the arrow keys', async () => {
    stored = populated();
    await mount();
    const entries = [...host.querySelectorAll<HTMLElement>('[data-agent-conversation]')];
    expect(entries).toHaveLength(2);

    entries[0].focus();
    await act(async () => {
      host.querySelector('.agent-rail-list')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(entries[1]);
  });

  it('switches conversations through the store rather than local state', async () => {
    stored = populated();
    await mount();
    const other = [...host.querySelectorAll<HTMLElement>('[data-agent-conversation]')]
      .find((entry) => entry.dataset.agentConversation === 'chat-2');
    await click(other as HTMLButtonElement);

    const save = calls.find((call) => call.method === 'save');
    expect((save?.args[0] as AgentWorkspaceState).activeConversationId).toBe('chat-2');
    expect(text()).toContain('Second thread');
  });

  it('pins through the bridge and announces the pressed state', async () => {
    stored = populated();
    await mount();
    const pin = buttons().find((button) => button.getAttribute('aria-label') === 'agent.rail.pin');
    expect(pin?.getAttribute('aria-pressed')).toBe('false');
    await click(pin as HTMLButtonElement);
    expect((calls.at(-1)?.args[0] as AgentWorkspaceState).conversations
      .find((item) => item.id === 'chat-1')?.pinned).toBe(true);
  });

  it('will not delete or clear without a second, explicit confirmation', async () => {
    stored = populated();
    await mount();

    await click(buttonWith('agent.conversation.delete'));
    expect(calls.some((call) => call.method === 'delete')).toBe(false);
    await click(buttonWith('agent.conversation.deleteConfirm'));
    expect(calls.filter((call) => call.method === 'delete')).toEqual([
      { method: 'delete', args: ['chat-1'] },
    ]);

    await click(buttonWith('agent.rail.clear'));
    expect(calls.some((call) => call.method === 'clear')).toBe(false);
    await click(buttonWith('agent.rail.clearConfirm'));
    expect(calls.some((call) => call.method === 'clear')).toBe(true);
    expect(text()).toContain('agent.state.emptyTitle');
  });

  it('shows a recoverable error, and retrying calls the bridge again', async () => {
    loadResult = { ok: false, code: 'read-failed' };
    await mount();

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('agent.error.read-failed');
    expect(text()).not.toContain('agent.state.emptyTitle');

    loadResult = null;
    stored = populated();
    await click(buttonWith('agent.state.retry'));
    expect(calls.filter((call) => call.method === 'load')).toHaveLength(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(text()).toContain('Particle question');
  });

  it('keeps a loaded conversation on screen when a write fails', async () => {
    stored = populated();
    await mount();
    (window as unknown as { api: Record<string, unknown> }).api.agentWorkspaceSave =
      () => Promise.resolve({ ok: false, code: 'write-failed' });

    const pin = buttons().find((button) => button.getAttribute('aria-label') === 'agent.rail.pin');
    await click(pin as HTMLButtonElement);

    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain('agent.error.write-failed');
    expect(text()).toContain('Particle question');
  });

  it('renders one live exchange when main announces the persisted placeholders', async () => {
    stored = populated();
    await mount();
    let releaseProvider = (): void => undefined;
    let announcePending = (): void => undefined;
    let finishRun = (): void => undefined;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      announcePending = resolve;
    });
    const finished = new Promise<void>((resolve) => {
      finishRun = resolve;
    });
    (window as unknown as { api: Record<string, unknown> }).api.agentExecutionRun =
      async (raw: unknown) => {
        const request = raw as { requestId: string; conversationId: string; prompt: string };
        const ids = agentExecutionMessageIds(request.requestId);
        stored = {
          ...stored,
          conversations: stored.conversations.map((conversation) => (
            conversation.id === request.conversationId
              ? {
                  ...conversation,
                  messages: [
                    ...conversation.messages,
                    {
                      id: ids.user,
                      conversationId: conversation.id,
                      role: 'user' as const,
                      status: 'complete' as const,
                      text: request.prompt,
                      createdAt: 30,
                      updatedAt: 30,
                      contextIds: [],
                      attachments: [],
                      cards: [],
                    },
                    {
                      id: ids.assistant,
                      conversationId: conversation.id,
                      role: 'assistant' as const,
                      status: 'streaming' as const,
                      text: '',
                      createdAt: 31,
                      updatedAt: 31,
                      contextIds: [],
                      attachments: [],
                      cards: [],
                    },
                  ],
                }
              : conversation
          )),
        };
        workspaceListener?.(stored);
        executionListener?.({
          type: 'chunk',
          requestId: request.requestId,
          assistantMessageId: ids.assistant,
          text: 'Progressive answer',
        });
        announcePending();
        await providerGate;
        stored = {
          ...stored,
          conversations: stored.conversations.map((conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) => (
              message.id === ids.assistant
                ? { ...message, status: 'complete' as const, text: 'Progressive answer' }
                : message
            )),
          })),
        };
        finishRun();
        return {
          ok: true,
          requestId: request.requestId,
          assistantMessageId: ids.assistant,
          delivery: 'streamed' as const,
          state: stored,
        };
      };

    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        ?.call(textarea, 'Explain は');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      const send = buttonWith('agent.execute.send');
      expect(send.disabled).toBe(false);
      send.click();
      await pending;
    });

    const prompts = [...host.querySelectorAll('.agent-message-text')]
      .filter((node) => node.textContent === 'Explain は');
    expect(prompts).toHaveLength(1);
    expect(host.querySelectorAll('.agent-status-streaming')).toHaveLength(1);
    expect(text()).toContain('Progressive answer');
    expect(host.querySelector('.agent-live-exchange')).toBeNull();

    await act(async () => {
      releaseProvider();
      await finished;
    });
  });

  it('streams a prompt through the execution bridge and renders the committed result', async () => {
    stored = populated();
    await mount();
    let executedPrompt = '';
    (window as unknown as { api: Record<string, unknown> }).api.agentExecutionRun =
      async (raw: unknown) => {
        const request = raw as { requestId: string; conversationId: string; prompt: string };
        executedPrompt = request.prompt;
        executionListener?.({
          type: 'chunk',
          requestId: request.requestId,
          assistantMessageId: 'assistant-live',
          text: 'Streamed ',
        });
        executionListener?.({
          type: 'chunk',
          requestId: request.requestId,
          assistantMessageId: 'assistant-live',
          text: 'answer',
        });
        stored = {
          ...stored,
          conversations: stored.conversations.map((conversation) => (
            conversation.id === request.conversationId
              ? {
                  ...conversation,
                  messages: [
                    ...conversation.messages,
                    {
                      id: 'user-live',
                      conversationId: conversation.id,
                      role: 'user' as const,
                      status: 'complete' as const,
                      text: request.prompt,
                      createdAt: 30,
                      updatedAt: 30,
                      contextIds: [],
                      attachments: [],
                      cards: [],
                    },
                    {
                      id: 'assistant-live',
                      conversationId: conversation.id,
                      role: 'assistant' as const,
                      status: 'complete' as const,
                      text: 'Streamed answer',
                      createdAt: 31,
                      updatedAt: 31,
                      contextIds: [],
                      attachments: [],
                      cards: [],
                      provider: {
                        target: { kind: 'local' as const, backend: 'local-qwen' as const },
                        cloud: false,
                        contextIds: [],
                        attachmentIds: [],
                        inputChars: 12,
                        startedAt: 30,
                        completedAt: 31,
                      },
                    },
                  ],
                }
              : conversation
          )),
        };
        return {
          ok: true,
          requestId: request.requestId,
          assistantMessageId: 'assistant-live',
          delivery: 'streamed',
          state: stored,
        };
      };

    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        ?.call(textarea, 'Explain は');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(buttonWith('agent.execute.send'));

    expect(executedPrompt).toBe('Explain は');
    expect(text()).toContain('Explain は');
    expect(text()).toContain('Streamed answer');
    expect(text()).toContain('agent.message.providerLocal');
  });

  it('sends selected text locally and keeps the file and prompt after a failed request', async () => {
    stored = populated();
    await mount();
    await selectFile('private-notes.txt', '秘密のノート');
    await setTextarea('Use my notes');

    expect(text()).toContain('private-notes.txt');
    expect(text()).toContain('agent.attachment.sessionOnly');
    expect(host.querySelector('.agent-attachment-consent')).toBeNull();
    await click(buttonWith('agent.execute.send'));

    const request = calls.find((call) => call.method === 'execute')?.args[0] as {
      attachments: Array<Record<string, unknown>>;
      policy: { allowSensitiveContext: boolean };
    };
    expect(request.policy.allowSensitiveContext).toBe(false);
    expect(request.attachments).toMatchObject([{
      kind: 'text',
      name: 'private-notes.txt',
      sensitivity: 'sensitive',
      retained: false,
      contentText: '秘密のノート',
    }]);
    expect(request.attachments[0]).not.toHaveProperty('localPath');
    expect(text()).toContain('private-notes.txt');
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Use my notes');
  });

  /**
   * The governance panel writes `chatHistory`; main narrows on `policy.historyTurns`.
   * Nothing connects the two but this composer, and this branch has now produced
   * three separate ledger sections about code that existed and was never reached.
   * So the pin is on the request the shell actually builds, read out of the
   * production execution client rather than off a mocked policy.
   */
  it('forwards the stored retained-chat policy on the request it sends', async () => {
    const previous = localStorage.getItem(SETTINGS_KEY);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, chatHistory: 'off' }));
    try {
      stored = populated();
      await mount();
      await setTextarea('Explain this');
      await click(buttonWith('agent.execute.send'));

      const request = calls.find((call) => call.method === 'execute')?.args[0] as {
        policy: { historyTurns?: number };
      };
      expect(request.policy.historyTurns).toBe(0);
    } finally {
      if (previous === null) localStorage.removeItem(SETTINGS_KEY);
      else localStorage.setItem(SETTINGS_KEY, previous);
    }
  });

  it('blocks cloud attachment sending until the visible per-request consent is checked', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      version: 1,
      excludeSensitiveContext: false,
    }));
    stored = populated();
    await mount();
    await selectFile('cloud-notes.txt', 'send only with consent');
    await setTextarea('Summarize this');

    const provider = host.querySelector('.agent-composer select') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
        ?.call(provider, 'gemini-2.5-flash');
      provider.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const send = buttonWith('agent.execute.send');
    expect(send.disabled).toBe(true);
    expect(text()).toContain('agent.execute.sensitiveConsent');
    expect(calls.some((call) => call.method === 'execute')).toBe(false);

    const consent = host.querySelector('.agent-attachment-consent input') as HTMLInputElement;
    await act(async () => {
      consent.click();
    });
    expect(buttonWith('agent.execute.send').disabled).toBe(false);
    await click(buttonWith('agent.execute.send'));

    const request = calls.find((call) => call.method === 'execute')?.args[0] as {
      policy: { target: { kind: string }; allowSensitiveContext: boolean };
      attachments: unknown[];
    };
    expect(request.policy).toMatchObject({
      target: { kind: 'cloud' },
      allowSensitiveContext: true,
    });
    expect(request.attachments).toHaveLength(1);
  });

  it('requires per-request consent for selected sensitive context without an attachment', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      version: 1,
      excludeSensitiveContext: false,
    }));
    stored = populated();
    stored.conversations[0].context[0].sensitivity = 'sensitive';
    await mount();
    await setTextarea('Explain my selection');

    const provider = host.querySelector('.agent-composer-options select') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
        ?.call(provider, 'gemini-2.5-flash');
      provider.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(buttonWith('agent.execute.send').disabled).toBe(true);
    expect(text()).toContain('agent.execute.sensitiveConsent');
    expect(host.querySelectorAll('.agent-attachment-chip')).toHaveLength(0);

    await act(async () => {
      (host.querySelector('.agent-attachment-consent input') as HTMLInputElement).click();
    });
    expect((host.querySelector('.agent-attachment-consent input') as HTMLInputElement).checked)
      .toBe(true);

    stored = {
      ...stored,
      conversations: stored.conversations.map((conversation) => (
        conversation.id === 'chat-1'
          ? {
              ...conversation,
              context: conversation.context.map((item) => (
                item.id === 'ctx-1' ? { ...item, preview: 'Updated private selection' } : item
              )),
            }
          : conversation
      )),
    };
    await act(async () => {
      workspaceListener?.(stored);
    });
    expect((host.querySelector('.agent-attachment-consent input') as HTMLInputElement).checked)
      .toBe(false);
    expect(buttonWith('agent.execute.send').disabled).toBe(true);

    await act(async () => {
      (host.querySelector('.agent-attachment-consent input') as HTMLInputElement).click();
    });
    await click(buttonWith('agent.execute.send'));

    const request = calls.find((call) => call.method === 'execute')?.args[0] as {
      policy: { allowSensitiveContext: boolean };
      attachments: unknown[];
    };
    expect(request.policy.allowSensitiveContext).toBe(true);
    expect(request.attachments).toEqual([]);
  });

  it('submits cloud prompts without sensitive material when persistent exclusion is on', async () => {
    stored = populated();
    stored.conversations[0].context[0].sensitivity = 'sensitive';
    await mount();
    await selectFile('private-cloud-notes.txt', 'must stay local');
    await setTextarea('Answer from public information');

    const provider = host.querySelector('.agent-composer-options select') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
        ?.call(provider, 'gemini-2.5-flash');
      provider.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(host.querySelector('.agent-attachment-consent')).toBeNull();
    expect(text()).toContain('agent.execute.sensitiveExcluded');
    expect(buttonWith('agent.execute.send').disabled).toBe(false);
    await click(buttonWith('agent.execute.send'));

    const request = calls.find((call) => call.method === 'execute')?.args[0] as {
      policy: { excludeSensitiveContext: boolean; allowSensitiveContext: boolean };
      attachments: unknown[];
    };
    expect(request.policy).toMatchObject({
      excludeSensitiveContext: true,
      allowSensitiveContext: false,
    });
    // The execution bridge carries the session-only payload to main, where the
    // policy filter is enforced and tested independently.
    expect(request.attachments).toHaveLength(1);
  });

  /**
   * The receiving end of the capture staging area.
   *
   * A screenshot cannot ride the persisted workspace, so a hand-off leaves it in
   * main keyed by the conversation its context landed in and the window that
   * opens that conversation collects it. These assert the collection actually
   * happens, because the lane is otherwise reachable only from the file picker
   * and a producer with no consumer is a screenshot that silently disappears.
   */
  describe('claiming a staged capture', () => {
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const capture = (id: string) => ({
      id,
      name: 'Screen capture',
      mimeType: 'image/png',
      imageBase64: PNG,
      sizeBytes: 70,
    });

    it('attaches what main was holding for the conversation it opens', async () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        version: 1,
        excludeSensitiveContext: false,
      }));
      stored = populated();
      stagedImages.set('chat-1', [capture('capture-1')]);
      await mount();

      expect(takeCalls).toContain('chat-1');
      expect(host.querySelectorAll('.agent-attachment-chip')).toHaveLength(1);
      expect(text()).toContain('Screen capture');

      await setTextarea('What does this say?');
      // Only Gemini reads an image, so the claimed capture leaves the local
      // target refusing to submit — the same refusal a picked image produces.
      expect(text()).toContain('agent.attachment.visionUnsupported');
      expect(buttonWith('agent.execute.send').disabled).toBe(true);

      const provider = host.querySelector('.agent-composer select') as HTMLSelectElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
          ?.call(provider, 'gemini-2.5-flash');
        provider.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => {
        (host.querySelector('.agent-attachment-consent input') as HTMLInputElement).click();
      });
      await click(buttonWith('agent.execute.send'));

      const request = calls.find((call) => call.method === 'execute')?.args[0] as {
        attachments: Array<Record<string, unknown>>;
      };
      // The payload rides in `imageBase64` and nowhere else, at the strongest
      // floor the contract has — the same shape a picked file produces.
      expect(request.attachments).toMatchObject([{
        kind: 'image',
        name: 'Screen capture',
        mimeType: 'image/png',
        sensitivity: 'sensitive',
        retained: false,
        imageBase64: PNG,
      }]);
    });

    it('claims again for a second hand-off into the conversation already open', async () => {
      stored = populated();
      await mount();
      expect(host.querySelectorAll('.agent-attachment-chip')).toHaveLength(0);

      // The second hand-off does not change `activeConversationId`, so main's
      // announcement is the only signal that a new capture is waiting.
      stagedImages.set('chat-1', [capture('capture-2')]);
      await act(async () => {
        stagedListener?.('chat-1');
      });

      expect(host.querySelectorAll('.agent-attachment-chip')).toHaveLength(1);
    });

    it('does not claim on an ordinary workspace push, which arrives before the capture', async () => {
      stored = populated();
      await mount();
      const beforePush = takeCalls.length;

      // The hand-off saves its context first and stages the capture second, so
      // a claim driven by the push would run against a main that has nothing —
      // and would then never run again for this conversation.
      await act(async () => {
        workspaceListener?.(stored);
      });
      expect(takeCalls.length).toBe(beforePush);
    });

    it('keeps the files the user picked and says what the capture cost it', async () => {
      stored = populated();
      await mount();
      // Four picked files leave room for one attachment of the five a request
      // may carry, so the second capture cannot land.
      for (const name of ['a.txt', 'b.txt', 'c.txt', 'd.txt']) {
        await selectFile(name, '秘密のノート');
      }

      stagedImages.set('chat-1', [capture('c-1'), capture('c-2')]);
      await act(async () => {
        stagedListener?.('chat-1');
      });

      // Staging is single-use, so the one that did not fit is gone rather than
      // pending — saying so is the difference between a bounded list and a lie.
      expect(host.querySelectorAll('.agent-attachment-chip')).toHaveLength(5);
      expect(text()).toContain('a.txt');
      expect(text()).toContain('agent.attachment.error.too-many-images');
    });

    it('does not ask main for a capture before a conversation is selected', async () => {
      stored = state();
      await mount();
      expect(takeCalls).toEqual([]);
    });
  });

  it('sends the visible per-request input and output budgets to main', async () => {
    stored = populated();
    await mount();
    await setTextarea('Bound this answer');
    const budgets = [...host.querySelectorAll<HTMLInputElement>('.agent-budget-field input')];

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        ?.call(budgets[0], '12000');
      budgets[0].dispatchEvent(new Event('input', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        ?.call(budgets[1], '777');
      budgets[1].dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(buttonWith('agent.execute.send'));

    const request = calls.find((call) => call.method === 'execute')?.args[0] as {
      policy: { maxInputChars: number; maxOutputTokens: number };
    };
    expect(request.policy).toMatchObject({
      maxInputChars: 12_000,
      maxOutputTokens: 777,
    });
  });

  it('refuses known prompt and file content over the selected input budget before IPC', async () => {
    stored = populated();
    await mount();
    await setTextarea('Five!');
    const inputBudget = host.querySelector('.agent-budget-field input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        ?.call(inputBudget, '4');
      inputBudget.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(buttonWith('agent.execute.send').disabled).toBe(true);
    expect(text()).toContain('agent.execute.inputOverBudget');
    expect(calls.some((call) => call.method === 'execute')).toBe(false);
  });

  it('clears selected files only after a successful request', async () => {
    stored = populated();
    await mount();
    await selectFile('done.txt', 'finished content');
    await setTextarea('Finish this');
    (window as unknown as { api: Record<string, unknown> }).api.agentExecutionRun =
      async (raw: unknown) => ({
        ok: true,
        requestId: (raw as { requestId: string }).requestId,
        assistantMessageId: 'assistant-done',
        delivery: 'buffered',
        state: stored,
      });

    await click(buttonWith('agent.execute.send'));
    expect(text()).not.toContain('done.txt');
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('creates an Agent-origin plan without sending or clearing the composer draft', async () => {
    stored = populated();
    approvalContext = { ...approvalContext, queue: { version: 1, items: [] } };
    await mount();
    await setTextarea('Look up the selected term');

    await click(buttonWith('agent.plan.create'));

    expect(plannerCalls).toHaveLength(1);
    expect(plannerCalls[0][0]).toMatchObject({ id: 'chat-1' });
    expect(plannerCalls[0][1]).toBe('Look up the selected term');
    expect(text()).toContain('agent.plan.queued=1');
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value)
      .toBe('Look up the selected term');
    expect(calls.some((call) => call.method === 'execute')).toBe(false);
  });

  it('discloses that selected files are excluded and disables plan creation', async () => {
    stored = populated();
    await mount();
    await setTextarea('Use this file');
    await selectFile('notes.txt', 'private notes');

    const plan = buttonWith('agent.plan.create');
    expect(plan.disabled).toBe(true);
    expect(text()).toContain('agent.plan.attachmentsUnsupported');
    expect(plannerCalls).toHaveLength(0);
  });

  it('shows and controls only plans with this conversation origin', async () => {
    stored = populated();
    const own = waitingQueue().items[0] as Record<string, unknown>;
    const foreign = {
      ...own,
      id: 'task-foreign',
      origin: { conversationId: 'chat-2', contextIds: [] },
      task: { ...(own.task as object), id: 'task-foreign', objective: 'Foreign queue plan' },
    };
    approvalContext = {
      ...approvalContext,
      queue: {
        version: 1,
        items: [{
          ...own,
          status: 'queued',
          origin: { conversationId: 'chat-1', contextIds: ['ctx-1'] },
          task: {
            ...(own.task as object),
            objective: 'Visible queue plan',
            status: 'queued',
            steps: [{
              ...((own.task as { steps: object[] }).steps[0]),
              status: 'pending',
              result: { found: true },
            }],
          },
        }, foreign],
      },
    };

    await mount();

    expect(text()).toContain('Visible queue plan');
    expect(text()).not.toContain('Foreign queue plan');
    expect(text()).toContain('flashcard.add-cards');
    await click(buttonWith('common.pause'));
    expect(planQueueActionCalls).toEqual([['chat-1', 'task-1', 'pause']]);
  });
});

/**
 * L5 — which Agent regions adopted the contextual primitive, and which
 * deliberately did not.
 *
 * Fourth and last stop on L5's order (Dictionary → Grammar → Translate → Agent).
 * The three siblings each had exactly one contextual region because each is a
 * single-column view; the Agent is a two-pane shell, so it has two: the
 * conversation rail, which is navigation — the Liquid role §2.3 names first, and
 * the same case `nav.medialib-rail` already took — and the conversation head,
 * which is the contextual tool for whatever is selected (identity, the mode that
 * shapes the next request, the simple/full disclosure switch, delete).
 *
 * The inspector is the one that could plausibly have gone either way, and it
 * stays plain on purpose. "Temporary inspector" is a Liquid role, but this one is
 * a fixed second column carrying `AgentPipelineTerminal` and `ActivityTimeline` —
 * a log and a history table, which §2.3 keeps on stable opaque anchors. Pinned
 * below alongside the messages and the composer so it reads as a decision.
 *
 * Written into this file rather than a new `agentLiquidRegions.test.tsx`: the
 * shell needs the whole bridge stub above to reach `phase === 'ready'`, and a
 * second copy of that harness would be ~400 lines to assert four class names.
 */
describe('Agent — contextual region adoption', () => {
  it('gives the rail and the conversation head the contextual role', async () => {
    stored = populated();
    await mount();

    const rail = host.querySelector('.agent-rail');
    expect(rail, '.agent-rail').not.toBeNull();
    expect(rail?.tagName, 'the rail is still the nav landmark').toBe('NAV');
    expect(rail?.classList.contains('lq-contextual')).toBe(true);
    expect(rail?.getAttribute('data-lq-role')).toBe('contextual');

    const head = host.querySelector('.agent-conversation-head');
    expect(head, '.agent-conversation-head').not.toBeNull();
    expect(head?.tagName, 'the head is still a header element').toBe('HEADER');
    expect(head?.classList.contains('lq-contextual')).toBe(true);
    expect(head?.getAttribute('data-lq-role')).toBe('contextual');
    // The mode select is what makes the head a tool rather than a caption.
    expect(head?.querySelector('.agent-mode-select'), 'the mode picker').not.toBeNull();
  });

  it('does NOT give either one lq-liquid, which would paint in conventional windows too', async () => {
    stored = populated();
    await mount();

    // §2 non-negotiable 1: conventional presentation is the default. `lq-liquid`
    // paints unconditionally; `lq-contextual` is inert until `.fwin-liquid` opts in.
    expect(host.querySelectorAll('.lq-liquid').length).toBe(0);
    expect(host.querySelectorAll('.lq-contextual').length).toBe(2);
  });

  it('keeps the conversation, the composer and the inspector outside every contextual surface', async () => {
    stored = populated();
    await mount();

    // Asserted first, so that removing the contextual surfaces altogether cannot
    // make the loop below pass vacuously.
    expect(host.querySelectorAll('.lq-contextual').length).toBe(2);
    for (const sel of ['.agent-messages', '.agent-composer', '.agent-inspector', '.agent-scope']) {
      const el = host.querySelector(sel);
      expect(el, sel).not.toBeNull();
      expect(el?.closest('.lq-contextual'), `${sel} is outside every contextual surface`).toBeNull();
    }
  });
});
