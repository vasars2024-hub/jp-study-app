// @vitest-environment jsdom
/**
 * "Ask the Agent about this" — the first producer of agent context.
 *
 * The behaviours worth pinning are the ones a user would notice going wrong:
 * the attach happens *before* the route opens, so a window that cannot route
 * still keeps the context; a failed save does not open the Agent onto a shelf
 * that never got written; and repeating the gesture on the same word does not
 * grow the shelf.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workspace = vi.hoisted(() => ({
  state: {
    version: 1,
    activeConversationId: null as string | null,
    conversations: [] as unknown[],
  },
  loadResult: null as unknown,
  saveResult: null as unknown,
  saves: [] as unknown[],
}));

vi.mock('../agentWorkspaceClient', () => ({
  loadAgentWorkspace: async () => workspace.loadResult ?? { ok: true, state: workspace.state },
  saveAgentWorkspace: async (state: unknown) => {
    workspace.saves.push(state);
    return workspace.saveResult ?? { ok: true, state };
  },
}));

const blanc = vi.hoisted(() => ({ isBlanc: false }));
vi.mock('../blancMode', () => ({ isBlancWindow: () => blanc.isBlanc }));

import {
  AGENT_WORKSPACE_CHANGED_EVENT,
  attachAgentContextFromSurface,
  dictionaryAgentContext,
  handOffToAgent,
  openAgentSurface,
} from '../agentContextHandoff';
import { createAgentContextItem } from '../../shared/agentContext';
import { prepareAgentWorkspaceForPersistence } from '../../main/agentWorkspaceStore';

const NOW = 1_800_000_000_000;

let routed: string[] = [];
const record = (event: Event): void => {
  routed.push(String((event as CustomEvent).detail));
};

function opened(): string[] {
  return routed;
}

beforeEach(() => {
  workspace.state = { version: 1, activeConversationId: null, conversations: [] };
  workspace.loadResult = null;
  workspace.saveResult = null;
  workspace.saves = [];
  blanc.isBlanc = false;
  routed = [];
  window.addEventListener('os:open', record);
});

afterEach(() => {
  // Removed, not just reset: a listener per test accumulates on the shared
  // jsdom window and every later dispatch is counted once per surviving one.
  window.removeEventListener('os:open', record);
  vi.restoreAllMocks();
});

describe('dictionaryAgentContext', () => {
  it('keys identity on the term, so two lookups are one shelf entry', () => {
    expect(dictionaryAgentContext('食べる', 'a sentence', NOW).identity).toBe('食べる');
    expect(dictionaryAgentContext('食べる', 'another sentence', NOW).identity).toBe('食べる');
  });

  it('carries the sentence as the preview and the term as the entity', () => {
    const input = dictionaryAgentContext('食べる', '昨日寿司を食べました', NOW);
    expect(input.preview).toBe('昨日寿司を食べました');
    expect(input.source).toEqual({ app: 'dictionary', entityId: '食べる' });
    expect(input.kind).toBe('dictionary-entry');
  });

  it('survives the store’s retention filter, which a live run caught it failing', () => {
    // The hand-off's only route to the shell is a save through the main-owned
    // workspace store, and `prepareAgentWorkspaceForPersistence` drops every
    // non-retained context item. A non-retained hand-off is therefore erased by
    // the save meant to deliver it: the conversation arrives with an empty shelf
    // and the model never sees the word. Measured live before it was fixed.
    const item = createAgentContextItem(dictionaryAgentContext('食べる', 'to eat', NOW));
    expect(item?.retained).toBe(true);

    const persisted = prepareAgentWorkspaceForPersistence({
      version: 1,
      activeConversationId: 'c1',
      conversations: [{
        id: 'c1',
        title: 'Dictionary',
        mode: 'ask',
        createdAt: NOW,
        updatedAt: NOW,
        pinned: false,
        archived: false,
        context: [item],
        messages: [],
      }],
    });
    expect(persisted.conversations[0].context.map((entry) => entry.id))
      .toEqual(['dictionary-entry:食べる']);
  });
});

describe('attachAgentContextFromSurface', () => {
  it('creates a conversation and writes the item through the workspace bridge', async () => {
    const outcome = await attachAgentContextFromSurface(
      dictionaryAgentContext('食べる', 'to eat', NOW),
      'Dictionary: 食べる',
    );
    expect(outcome).toBe('attached');
    expect(workspace.saves).toHaveLength(1);
    const saved = workspace.saves[0] as {
      activeConversationId: string;
      conversations: Array<{ id: string; title: string; context: Array<{ id: string }> }>;
    };
    expect(saved.conversations).toHaveLength(1);
    expect(saved.conversations[0].title).toBe('Dictionary: 食べる');
    expect(saved.conversations[0].context[0].id).toBe('dictionary-entry:食べる');
    // The new conversation is also selected, or the user would land on a
    // different chat than the one holding the word they just asked about.
    expect(saved.activeConversationId).toBe(saved.conversations[0].id);
  });

  it('refuses input that describes nothing, without touching the bridge', async () => {
    const outcome = await attachAgentContextFromSurface(
      { ...dictionaryAgentContext('   ', '', NOW) },
      'Dictionary',
    );
    expect(outcome).toBe('invalid-context');
    expect(workspace.saves).toEqual([]);
  });

  it('reports a missing bridge distinctly from a failed write', async () => {
    workspace.loadResult = { ok: false, code: 'bridge-unavailable' };
    expect(await attachAgentContextFromSurface(dictionaryAgentContext('食べる', '', NOW), 'T'))
      .toBe('bridge-unavailable');

    workspace.loadResult = null;
    workspace.saveResult = { ok: false, code: 'write-failed' };
    expect(await attachAgentContextFromSurface(dictionaryAgentContext('食べる', '', NOW), 'T'))
      .toBe('save-failed');
  });

  it('does not re-save when the same word is already at the front', async () => {
    await attachAgentContextFromSurface(dictionaryAgentContext('食べる', 'to eat', NOW), 'T');
    const saved = workspace.saves[0] as typeof workspace.state;
    workspace.state = saved;

    const outcome = await attachAgentContextFromSurface(
      dictionaryAgentContext('食べる', 'to eat', NOW),
      'T',
    );
    expect(outcome).toBe('unchanged');
    expect(workspace.saves).toHaveLength(1);
  });
});

describe('routing', () => {
  it('opens the Agent section by its bare id', () => {
    expect(openAgentSurface()).toBe(true);
    expect(opened()).toEqual(['agent']);
  });

  it('does not dispatch in a Blanc window, which has no desktop router', () => {
    blanc.isBlanc = true;
    expect(openAgentSurface()).toBe(false);
    expect(opened()).toEqual([]);
  });

  it('still attaches in a Blanc window, so the gesture is not lost', async () => {
    blanc.isBlanc = true;
    const outcome = await handOffToAgent(dictionaryAgentContext('食べる', 'to eat', NOW), 'T');
    expect(outcome).toBe('attached');
    expect(workspace.saves).toHaveLength(1);
    expect(opened()).toEqual([]);
  });

  it('opens after a successful attach', async () => {
    await handOffToAgent(dictionaryAgentContext('食べる', 'to eat', NOW), 'T');
    expect(opened()).toEqual(['agent']);
  });

  it('announces the workspace change, so an already-open shell re-reads', async () => {
    // Measured live: the shell loads once on mount and the workspace bridge has
    // no change push, so a hand-off into an open Agent left it showing "0
    // conversations" while the store held one. Re-opening the route only
    // focuses the window, so the route change cannot be the signal.
    let announced = 0;
    const count = (): void => {
      announced += 1;
    };
    window.addEventListener(AGENT_WORKSPACE_CHANGED_EVENT, count);
    try {
      await handOffToAgent(dictionaryAgentContext('食べる', 'to eat', NOW), 'T');
      expect(announced).toBe(1);
    } finally {
      window.removeEventListener(AGENT_WORKSPACE_CHANGED_EVENT, count);
    }
  });

  it('does not announce when the save failed', async () => {
    workspace.saveResult = { ok: false, code: 'write-failed' };
    let announced = 0;
    const count = (): void => {
      announced += 1;
    };
    window.addEventListener(AGENT_WORKSPACE_CHANGED_EVENT, count);
    try {
      await handOffToAgent(dictionaryAgentContext('食べる', 'to eat', NOW), 'T');
      expect(announced).toBe(0);
    } finally {
      window.removeEventListener(AGENT_WORKSPACE_CHANGED_EVENT, count);
    }
  });

  it('does not open when the attach failed', async () => {
    workspace.saveResult = { ok: false, code: 'write-failed' };
    expect(await handOffToAgent(dictionaryAgentContext('食べる', 'to eat', NOW), 'T'))
      .toBe('save-failed');
    expect(opened()).toEqual([]);
  });
});
