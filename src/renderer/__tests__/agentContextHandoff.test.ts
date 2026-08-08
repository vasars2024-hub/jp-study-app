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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  attachAgentContextFromSurface,
  dictionaryAgentContext,
  handOffToAgent,
  openAgentSurface,
  readingPassageAgentContext,
  selectedTextAgentContext,
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

  it('leaves the change announcement to main, dispatching no window event', async () => {
    // The hand-off used to dispatch `agent:workspace-changed` itself, which woke
    // a shell in this window and left an Agent pop-out stale. Main now
    // broadcasts every committed workspace, so a second mechanism here would be
    // a duplicate refresh and a second thing to keep in step.
    let announced = 0;
    const count = (): void => {
      announced += 1;
    };
    window.addEventListener('agent:workspace-changed', count);
    try {
      await handOffToAgent(dictionaryAgentContext('食べる', 'to eat', NOW), 'T');
      expect(announced).toBe(0);
    } finally {
      window.removeEventListener('agent:workspace-changed', count);
    }
  });

  it('does not open when the attach failed', async () => {
    workspace.saveResult = { ok: false, code: 'write-failed' };
    expect(await handOffToAgent(dictionaryAgentContext('食べる', 'to eat', NOW), 'T'))
      .toBe('save-failed');
    expect(opened()).toEqual([]);
  });
});

describe('reader selection as session-only context', () => {
  const SENTENCE = '昨日は寿司を食べました。とても美味しかったです。';

  it('builds a session-only item that asks for no retention', () => {
    const item = createAgentContextItem(
      selectedTextAgentContext('寿司を食べました', SENTENCE, 'book-7', NOW),
    );
    expect(item).toMatchObject({
      kind: 'selected-text',
      label: '寿司を食べました',
      preview: SENTENCE,
      // `selected-text` floors at `personal`, so the builder cannot ask for
      // retention and does not try. This is the first producer whose material is
      // the user's own rather than reference data.
      sensitivity: 'personal',
      retained: false,
      source: { app: 'reading', entityId: 'book-7' },
    });
  });

  it('is one shelf entry per phrase, however often it is highlighted', () => {
    const first = createAgentContextItem(selectedTextAgentContext('寿司', SENTENCE, 'book-7', NOW));
    const again = createAgentContextItem(
      selectedTextAgentContext('  寿司  ', SENTENCE, 'book-7', NOW + 5_000),
    );
    expect(first?.id).toBe(again?.id);
  });

  it('falls back to the selection when there is no surrounding sentence', () => {
    const item = createAgentContextItem(selectedTextAgentContext('寿司', '   ', 'book-7', NOW));
    expect(item?.preview).toBe('寿司');
  });

  it('keeps a paragraph-length selection readable as a label', () => {
    const long = 'あ'.repeat(300);
    const item = createAgentContextItem(selectedTextAgentContext(long, SENTENCE, undefined, NOW));
    expect(item?.label).toHaveLength(80);
    // No book id means no entityId key at all, rather than an empty string.
    expect(item?.source.entityId).toBeUndefined();
  });

  it('is dropped by the persistence filter, which is why the session transport exists', () => {
    // The complement of the dictionary case above: that item is retained and
    // survives a save, this one must not be written to disk at all. It reaches the
    // shelf through `main/agentSessionContext.ts`, covered by that module's tests.
    const item = createAgentContextItem(selectedTextAgentContext('寿司', SENTENCE, 'b', NOW));
    const persisted = prepareAgentWorkspaceForPersistence({
      version: 1,
      activeConversationId: 'c1',
      conversations: [{
        id: 'c1',
        title: 'Reading',
        mode: 'ask',
        createdAt: NOW,
        updatedAt: NOW,
        context: [item],
        messages: [],
      }],
    });
    expect(persisted.conversations[0].context).toEqual([]);
  });

  it('sends the whole block as a passage, distinct from the fragment inside it', () => {
    const passage = `${SENTENCE}それから店を出ました。`;
    const item = createAgentContextItem(readingPassageAgentContext(passage, 'book-7', NOW));
    expect(item).toMatchObject({
      kind: 'reading-passage',
      preview: passage,
      sensitivity: 'personal',
      retained: false,
      source: { app: 'reading', entityId: 'book-7' },
    });
    // The label is the opening of the passage, so a shelf line stays recognisable.
    expect(item?.label).toBe(passage.slice(0, 60));
    // A passage and a selection taken from the same text are different items: the
    // id is namespaced by kind, so one never shadows the other on the shelf.
    const fragment = createAgentContextItem(selectedTextAgentContext(passage, SENTENCE, 'book-7', NOW));
    expect(item?.id).not.toBe(fragment?.id);
    expect(item?.id.startsWith('reading-passage:')).toBe(true);
  });

  it('collapses whitespace so a re-flowed block is still one passage', () => {
    const a = createAgentContextItem(readingPassageAgentContext('一行目\n  二行目', 'b', NOW));
    const b = createAgentContextItem(readingPassageAgentContext('一行目 二行目', 'b', NOW + 1_000));
    expect(a?.id).toBe(b?.id);
  });

  it('titles the reader conversation from the book, never from the selection', () => {
    // An independent review pointed out that the fix for this had no test at all:
    // reverting the call site to `selection.slice(0, 40)` left the whole suite
    // green. A conversation title IS persisted, so titling it with the highlighted
    // sentence writes the `personal` material the context item is refused
    // permission to store — it reached workspace-v1.json that way, measured live.
    //
    // Asserted on the source text, the same way `agentWorkspaceBridge.test.ts`
    // checks its four boundary files: the decision lives in a component, and this
    // pins it without mounting a reader.
    const source = readFileSync(
      resolve(__dirname, '..', 'views', 'NovelReader.tsx'),
      'utf8',
    );
    const calls = [...source.matchAll(/t\('agent\.conversation\.fromReading',\s*\{\s*label:\s*([^}]+?)\s*\}/g)]
      .map((match) => match[1].trim());
    expect(calls.length).toBeGreaterThan(0);
    for (const argument of calls) {
      expect(argument).toBe('item.title');
      expect(argument).not.toMatch(/selection|currentWord|passage/i);
    }
  });

  it('attaches the selection and then opens the Agent', async () => {
    expect(await handOffToAgent(
      selectedTextAgentContext('寿司を食べました', SENTENCE, 'book-7', NOW),
      'Reading: 寿司を食べました',
    )).toBe('attached');
    expect(opened()).toEqual(['agent']);
    expect(workspace.saves).toHaveLength(1);
  });
});
