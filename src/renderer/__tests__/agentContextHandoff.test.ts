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
    revision: 0,
    activeConversationId: null as string | null,
    conversations: [] as unknown[],
  },
  loadResult: null as unknown,
  saveResult: null as unknown,
  saves: [] as unknown[],
}));

vi.mock('../agentWorkspaceClient', () => ({
  loadAgentWorkspace: async () => workspace.loadResult ?? { ok: true, state: workspace.state },
  updateAgentWorkspace: async (base: unknown, transform: (state: unknown) => unknown) => {
    const state = transform(base);
    workspace.saves.push(state);
    return workspace.saveResult ?? { ok: true, state };
  },
}));

const blanc = vi.hoisted(() => ({ isBlanc: false }));
vi.mock('../blancMode', () => ({ isBlancWindow: () => blanc.isBlanc }));

const staging = vi.hoisted(() => ({
  staged: [] as Array<{ conversationId: string; mimeType: string; imageBase64: string }>,
  result: { ok: true, sizeBytes: 70 } as unknown,
}));
vi.mock('../agentImageStagingClient', () => ({
  stageAgentImage: async (request: {
    conversationId: string;
    mimeType: string;
    imageBase64: string;
  }) => {
    staging.staged.push(request);
    return staging.result;
  },
}));

import {
  attachAgentContextFromSurface,
  dictionaryAgentContext,
  handOffToAgent,
  lexiconPassageAgentContext,
  mediaCueAgentContext,
  openAgentSurface,
  readingPassageAgentContext,
  routeAgentContext,
  savedWordsAgentContext,
  selectedTextAgentContext,
  settingsRouteAgentContext,
  studySessionAgentContext,
  visualNovelCaptureAgentContext,
} from '../agentContextHandoff';
import { AGENT_NAVIGABLE_SECTIONS, resolveAgentNavigation } from '../../shared/agentNavigation';
import { attachAgentContext, createAgentContextItem } from '../../shared/agentContext';
import type { AgentContextItem } from '../../shared/agentWorkspace';
import { prepareAgentWorkspaceForPersistence } from '../../main/agentWorkspaceStore';

const NOW = 1_800_000_000_000;

let routed: string[] = [];

function opened(): string[] {
  return routed;
}

beforeEach(() => {
  workspace.state = { version: 1, revision: 0, activeConversationId: null, conversations: [] };
  workspace.loadResult = null;
  workspace.saveResult = null;
  workspace.saves = [];
  blanc.isBlanc = false;
  staging.staged = [];
  staging.result = { ok: true, sizeBytes: 70 };
  routed = [];
  (window as unknown as { api: Record<string, unknown> }).api = {
    popOut: async (section: string) => {
      routed.push(section);
    },
  };
});

afterEach(() => {
  // Removed, not just reset: a listener per test accumulates on the shared
  // jsdom window and every later dispatch is counted once per surviving one.
  delete (window as unknown as { api?: unknown }).api;
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

describe('lexiconPassageAgentContext', () => {
  it('keeps Workbench text session-only and identifies its real surface', () => {
    const input = lexiconPassageAgentContext(' 一行目\n  二行目 ', NOW);
    expect(input).toMatchObject({
      kind: 'reading-passage',
      label: '一行目 二行目',
      preview: '一行目 二行目',
      source: { app: 'dictionary' },
      identity: 'lexicon\u0000一行目 二行目',
    });
    expect(input.retained).toBeUndefined();
    expect(createAgentContextItem(input)?.sensitivity).toBe('personal');
  });
});

describe('a capture travelling with the gesture', () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('stages against the conversation the context actually landed in', async () => {
    const outcome = await attachAgentContextFromSurface(
      readingPassageAgentContext('昨日寿司を食べました', undefined, NOW),
      'Reading',
      undefined,
      { dataUrl: `data:image/jpeg;base64,${PNG}`, name: 'Screen capture' },
    );
    expect(outcome).toBe('attached');
    // The id is decided by the save, not guessed beforehand — staging against a
    // guess would leave the capture on a conversation the shell never opens.
    const saved = workspace.saves[0] as { activeConversationId: string };
    expect(staging.staged).toHaveLength(1);
    expect(staging.staged[0].conversationId).toBe(saved.activeConversationId);
    // The `data:` prefix is stripped and the format comes from the URL.
    expect(staging.staged[0]).toMatchObject({ mimeType: 'image/jpeg', imageBase64: PNG });
  });

  it('still stages when the shelf was already correct and no save happened', async () => {
    await attachAgentContextFromSurface(
      readingPassageAgentContext('昨日寿司を食べました', undefined, NOW),
      'Reading',
    );
    workspace.state = workspace.saves[0] as typeof workspace.state;
    staging.staged = [];

    const outcome = await attachAgentContextFromSurface(
      readingPassageAgentContext('昨日寿司を食べました', undefined, NOW),
      'Reading',
      undefined,
      { dataUrl: `data:image/png;base64,${PNG}`, name: 'Screen capture' },
    );
    expect(outcome).toBe('unchanged');
    expect(staging.staged).toHaveLength(1);
  });

  it('reports a capture it could not stage instead of claiming the whole gesture landed', async () => {
    staging.result = { ok: false, code: 'too-many' };
    const outcome = await attachAgentContextFromSurface(
      readingPassageAgentContext('昨日寿司を食べました', undefined, NOW),
      'Reading',
      undefined,
      { dataUrl: `data:image/png;base64,${PNG}`, name: 'Screen capture' },
    );
    expect(outcome).toBe('image-failed');
  });

  it('refuses a format the vision lane does not take, without calling main', async () => {
    const outcome = await attachAgentContextFromSurface(
      readingPassageAgentContext('昨日寿司を食べました', undefined, NOW),
      'Reading',
      undefined,
      { dataUrl: `data:image/gif;base64,${PNG}`, name: 'Screen capture' },
    );
    expect(outcome).toBe('image-failed');
    expect(staging.staged).toEqual([]);
  });

  it('opens the Agent anyway when only the capture failed', async () => {
    staging.result = { ok: false, code: 'bridge-unavailable' };
    const outcome = await handOffToAgent(
      readingPassageAgentContext('昨日寿司を食べました', undefined, NOW),
      'Reading',
      undefined,
      { dataUrl: `data:image/png;base64,${PNG}`, name: 'Screen capture' },
    );
    // The text half really did land, so the Agent is still the right place to
    // be — the toast is what stops the user asking about a missing screenshot.
    expect(outcome).toBe('image-failed');
    expect(opened()).toEqual(['agent']);
  });

  it('does not touch the staging bridge when the gesture carries no capture', async () => {
    await handOffToAgent(dictionaryAgentContext('食べる', 'to eat', NOW), 'Dictionary');
    expect(staging.staged).toEqual([]);
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
  it('opens the Agent through the main-owned pop-out route', async () => {
    expect(await openAgentSurface()).toBe(true);
    expect(opened()).toEqual(['agent']);
  });

  it('opens from a Blanc window even though it has no desktop router', async () => {
    blanc.isBlanc = true;
    expect(await openAgentSurface()).toBe(true);
    expect(opened()).toEqual(['agent']);
  });

  it('attaches and opens from a Blanc window', async () => {
    blanc.isBlanc = true;
    const outcome = await handOffToAgent(dictionaryAgentContext('食べる', 'to eat', NOW), 'T');
    expect(outcome).toBe('attached');
    expect(workspace.saves).toHaveLength(1);
    expect(opened()).toEqual(['agent']);
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
    const toasts: unknown[] = [];
    const onToast = (event: Event) => toasts.push((event as CustomEvent).detail);
    window.addEventListener('os:toast', onToast);
    workspace.saveResult = { ok: false, code: 'write-failed' };
    try {
      expect(await handOffToAgent(dictionaryAgentContext('食べる', 'to eat', NOW), 'T'))
        .toBe('save-failed');
      expect(opened()).toEqual([]);
      expect(toasts).toEqual([expect.objectContaining({ kind: 'warn' })]);
    } finally {
      window.removeEventListener('os:toast', onToast);
    }
  });

  it('reports an open failure after preserving the attached context', async () => {
    (window as unknown as { api: Record<string, unknown> }).api.popOut =
      async () => Promise.reject(new Error('window refused'));
    expect(await handOffToAgent(dictionaryAgentContext('食べる', 'to eat', NOW), 'T'))
      .toBe('open-failed');
    expect(workspace.saves).toHaveLength(1);
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

describe('media cue as session-only context', () => {
  const LINE = '行ってきます';
  const SCENE = 'もう八時だよ 行ってきます 気をつけてね';

  it('builds a session-only item that asks for no retention', () => {
    const item = createAgentContextItem(mediaCueAgentContext(LINE, SCENE, 'ep-3', NOW));
    expect(item).toMatchObject({
      kind: 'media-cue',
      label: LINE,
      preview: SCENE,
      // `media-cue` floors at `personal` exactly like the two reader producers:
      // what someone is watching is their own material, not reference data.
      sensitivity: 'personal',
      retained: false,
      source: { app: 'media', entityId: 'ep-3' },
    });
  });

  it('is dropped by the persistence filter, so a subtitle never reaches disk', () => {
    const item = createAgentContextItem(mediaCueAgentContext(LINE, SCENE, 'ep-3', NOW));
    const persisted = prepareAgentWorkspaceForPersistence({
      version: 1,
      activeConversationId: 'c1',
      conversations: [{
        id: 'c1',
        title: 'Watching',
        mode: 'ask',
        createdAt: NOW,
        updatedAt: NOW,
        context: [item],
        messages: [],
      }],
    });
    expect(persisted.conversations[0].context).toEqual([]);
  });

  it('collapses the hard line breaks cue formats carry, so a rewind is one entry', () => {
    // SRT and ASS wrap a single spoken line across two rows and the renderer folds
    // that away, so the visible line and the raw cue differ by whitespace alone.
    // Without collapsing, asking about the same subtitle after a rewind would sit
    // on the shelf twice and look like two different lines.
    const wrapped = createAgentContextItem(mediaCueAgentContext('行って\nきます', SCENE, 'ep-3', NOW));
    const folded = createAgentContextItem(mediaCueAgentContext('行って きます', SCENE, 'ep-3', NOW + 9_000));
    expect(wrapped?.id).toBe(folded?.id);
  });

  it('keeps the same common subtitle in different media items as separate context', () => {
    const first = createAgentContextItem(mediaCueAgentContext(LINE, SCENE, 'show-1', NOW));
    const second = createAgentContextItem(mediaCueAgentContext(LINE, SCENE, 'show-2', NOW));
    const rewind = createAgentContextItem(mediaCueAgentContext(LINE, SCENE, '  show-1  ', NOW + 1));

    expect(first?.id).not.toBe(second?.id);
    expect(rewind?.id).toBe(first?.id);
    expect(rewind?.source.entityId).toBe('show-1');
  });

  it('namespaces a cue even when its player has no stable media id', () => {
    const cue = createAgentContextItem(mediaCueAgentContext(LINE, SCENE, undefined, NOW));
    const legacyLineOnly = createAgentContextItem({
      ...mediaCueAgentContext(LINE, SCENE, undefined, NOW),
      identity: LINE,
    });

    expect(cue?.id).not.toBe(legacyLineOnly?.id);
    expect(cue?.source).toEqual({ app: 'media' });
  });

  it('falls back to the line when the scene is empty, and never to an empty preview', () => {
    expect(createAgentContextItem(mediaCueAgentContext(LINE, '   ', 'ep-3', NOW))?.preview).toBe(LINE);
  });

  it('does not collide with a reader item taken from the same text', () => {
    const cue = createAgentContextItem(mediaCueAgentContext(LINE, SCENE, 'ep-3', NOW));
    const read = createAgentContextItem(selectedTextAgentContext(LINE, SCENE, 'book-7', NOW));
    expect(cue?.id).not.toBe(read?.id);
    expect(cue?.id.startsWith('media-cue:')).toBe(true);
  });

  it('titles the media conversation from the item, never from the subtitle line', () => {
    // The same rule the reader producer had to be corrected on, pinned here before
    // it can be broken rather than after. A conversation title IS persisted, and
    // `media-cue` is refused retention precisely so the line stays off disk —
    // titling the conversation with it would write it there through the
    // neighbouring field, defeating the refusal.
    const source = readFileSync(
      resolve(__dirname, '..', 'components', 'media', 'MediaStudyMode.tsx'),
      'utf8',
    );
    const calls = [...source.matchAll(/t\('agent\.conversation\.fromMedia',\s*\{\s*label:\s*([^}]+?)\s*\}/g)]
      .map((match) => match[1].trim());
    expect(calls.length).toBeGreaterThan(0);
    for (const argument of calls) {
      expect(argument).toBe('item.title');
      expect(argument).not.toMatch(/line|sentence|cue|text/i);
    }
  });

  it('bounds the scene to the neighbouring lines, not the whole transcript', () => {
    // The scope the label promises must be the scope delivered: the control says
    // "this line", so the preview may carry the turns around it and nothing more.
    // The reader producer shipped this bug — `.novel-content` as a fallback block
    // sent 1,684 characters for a six-character selection — so the call site's
    // slice is asserted on the source rather than trusted.
    const source = readFileSync(
      resolve(__dirname, '..', 'components', 'media', 'MediaStudyMode.tsx'),
      'utf8',
    );
    expect(source).toMatch(/slice\(Math\.max\(0,\s*index - 1\),\s*index \+ 2\)/);
    // ...and never the unbounded join that would send every analyzed sentence.
    expect(source).not.toMatch(/sentences\.map\(\(entry\) => entry\.text\)\.join/);
  });

  it('attaches the line and then opens the Agent', async () => {
    expect(await handOffToAgent(
      mediaCueAgentContext(LINE, SCENE, 'ep-3', NOW),
      'Watching: My Show',
    )).toBe('attached');
    expect(opened()).toEqual(['agent']);
    const saved = workspace.saves[0] as {
      conversations: Array<{ title: string; context: Array<{ id: string }> }>;
    };
    expect(saved.conversations[0].title).toBe('Watching: My Show');
    expect(saved.conversations[0].context[0].id).toMatch(/^media-cue:[0-9a-f]{16}$/);
    expect(saved.conversations[0].context[0].id).not.toContain(LINE);
  });
});

describe('routeAgentContext', () => {
  it('keys identity on the section, so ten hand-offs are one shelf entry', () => {
    expect(routeAgentContext('dictionary', 'Dictionary', NOW).identity).toBe('dictionary');
    expect(routeAgentContext('dictionary', 'Dictionary', NOW + 5_000).identity).toBe('dictionary');
  });

  it('is ordinary and retained — a place carries nothing of the user’s', () => {
    const item = createAgentContextItem(routeAgentContext('library', 'Library', NOW));
    expect(item).toMatchObject({
      id: 'route:library',
      kind: 'route',
      label: 'Library',
      preview: '',
      source: { app: 'library' },
      sensitivity: 'ordinary',
      retained: true,
    });
    // No `route` key at all, rather than an empty one: main opens sections.
    expect(Object.hasOwn(item?.source ?? {}, 'route')).toBe(false);
  });

  it('survives the store’s retention filter, so it reaches the shelf', () => {
    const item = createAgentContextItem(routeAgentContext('dictionary', 'Dictionary', NOW));
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
    expect(persisted.conversations[0].context.map((entry) => entry.id)).toEqual(['route:dictionary']);
  });

  /**
   * Every section this producer is called with must be one the app can open,
   * because the card producer silently drops a suggestion for anything else —
   * so a wrong value here is invisible rather than loud.
   */
  it('is only ever called with a navigable section at its five call sites', () => {
    const sources = [
      ['components', 'DictionaryPopup.tsx'],
      ['views', 'NovelReader.tsx'],
      ['components', 'media', 'MediaStudyMode.tsx'],
      ['components', 'immersion', 'VisualNovelAgentHandoffButton.tsx'],
    ].map((parts) => readFileSync(resolve(__dirname, '..', ...parts), 'utf8')).join('\n');
    const sections = [...sources.matchAll(/routeAgentContext\('([a-z]+)'/g)].map((m) => m[1]);
    expect(sections.length).toBe(5);
    for (const section of sections) {
      expect(AGENT_NAVIGABLE_SECTIONS).toContain(section);
    }
  });
});

describe('a gesture that carries its place', () => {
  it('attaches place and material together, with the material at the front', async () => {
    expect(await handOffToAgent(
      dictionaryAgentContext('食べる', 'a sentence', NOW),
      'Dictionary: 食べる',
      routeAgentContext('dictionary', 'Dictionary', NOW),
    )).toBe('attached');

    // One save, not two: a half-attached shelf must never be broadcast.
    expect(workspace.saves).toHaveLength(1);
    const saved = workspace.saves[0] as {
      conversations: Array<{ context: Array<{ id: string }> }>;
    };
    expect(saved.conversations).toHaveLength(1);
    expect(saved.conversations[0].context.map((entry) => entry.id))
      .toEqual(['dictionary-entry:食べる', 'route:dictionary']);
    expect(opened()).toEqual(['agent']);
  });

  it('does not grow the shelf when the same gesture repeats', async () => {
    await handOffToAgent(
      dictionaryAgentContext('食べる', 'a sentence', NOW),
      'Dictionary: 食べる',
      routeAgentContext('dictionary', 'Dictionary', NOW),
    );
    workspace.state = workspace.saves[0] as typeof workspace.state;
    await handOffToAgent(
      dictionaryAgentContext('食べる', 'a sentence', NOW),
      'Dictionary: 食べる',
      routeAgentContext('dictionary', 'Dictionary', NOW),
    );
    const last = workspace.saves.at(-1) as {
      conversations: Array<{ context: Array<{ id: string }> }>;
    };
    expect(last.conversations[0].context.map((entry) => entry.id))
      .toEqual(['dictionary-entry:食べる', 'route:dictionary']);
  });

  it('still delivers the material when the place is malformed', async () => {
    expect(await handOffToAgent(
      dictionaryAgentContext('食べる', 'a sentence', NOW),
      'Dictionary: 食べる',
      // An empty label cannot describe anything, so `createAgentContextItem`
      // refuses it. Losing the word over that would be the wrong trade.
      { ...routeAgentContext('dictionary', '', NOW) },
    )).toBe('attached');
    const saved = workspace.saves[0] as {
      conversations: Array<{ context: Array<{ id: string }> }>;
    };
    expect(saved.conversations[0].context.map((entry) => entry.id))
      .toEqual(['dictionary-entry:食べる']);
  });
});

describe('the producers that had no call site', () => {
  it('carries a guided coordinate all the way to an authorized destination', () => {
    // The property this slice exists for. `resolveAgentNavigation` authorizes a
    // page/control destination by requiring a live route item to agree with the
    // stored effect in every coordinate — and `createAgentContextItem` used to
    // rebuild `source` without `controlId` or `highlight`, so no item outside a
    // test could ever satisfy it. The provenance half of guided navigation was
    // unreachable machinery; this asserts it is reachable.
    const place = createAgentContextItem(
      settingsRouteAgentContext('appearance', 'Settings', 'theme', NOW),
    );
    expect(place?.source).toMatchObject({
      app: 'settings', route: 'appearance', controlId: 'theme', highlight: true,
    });

    const conversation = {
      id: 'c1', title: 'T', mode: 'ask' as const, createdAt: NOW, updatedAt: NOW,
      pinned: false, archived: false,
      context: [place!],
      messages: [{
        id: 'm1', conversationId: 'c1', role: 'assistant' as const,
        status: 'complete' as const, text: '', createdAt: NOW, updatedAt: NOW,
        contextIds: [], attachments: [],
        cards: [{
          id: 'card1', kind: 'navigation' as const, title: 'Theme',
          sourceContextIds: [place!.id],
          actions: [{
            id: 'a1', label: 'Open',
            effect: {
              type: 'navigate' as const, section: 'settings',
              page: 'appearance', controlId: 'theme', highlight: true,
            },
          }],
        }],
      }],
    };

    expect(resolveAgentNavigation(conversation, 'm1', 'card1', 'a1')).toEqual({
      ok: true,
      destination: {
        section: 'settings', page: 'appearance', controlId: 'theme', highlight: true,
      },
    });
  });

  it('refuses a guided coordinate the allowlist does not know', () => {
    // No validation happens in the producer on purpose, so this is where an
    // invented control has to die: a card that cannot open is worse than none.
    const place = createAgentContextItem(
      settingsRouteAgentContext('appearance', 'Settings', 'not-a-control', NOW),
    );
    const conversation = {
      id: 'c1', title: 'T', mode: 'ask' as const, createdAt: NOW, updatedAt: NOW,
      pinned: false, archived: false,
      context: [place!],
      messages: [{
        id: 'm1', conversationId: 'c1', role: 'assistant' as const,
        status: 'complete' as const, text: '', createdAt: NOW, updatedAt: NOW,
        contextIds: [], attachments: [],
        cards: [{
          id: 'card1', kind: 'navigation' as const, title: 'X',
          sourceContextIds: [place!.id],
          actions: [{
            id: 'a1', label: 'Open',
            effect: {
              type: 'navigate' as const, section: 'settings',
              page: 'appearance', controlId: 'not-a-control', highlight: true,
            },
          }],
        }],
      }],
    };
    expect(resolveAgentNavigation(conversation, 'm1', 'card1', 'a1'))
      .toEqual({ ok: false, code: 'stale-provenance' });
  });

  it('claims a highlight only when it names a control', () => {
    const page = createAgentContextItem(settingsRouteAgentContext('appearance', 'Settings', undefined, NOW));
    expect(page?.source.controlId).toBeUndefined();
    expect(page?.source.highlight).toBeUndefined();
    // Two named controls are two places; the bare section producer collapses.
    expect(createAgentContextItem(settingsRouteAgentContext('appearance', 'S', 'theme', NOW))?.id)
      .not.toBe(createAgentContextItem(settingsRouteAgentContext('appearance', 'S', 'accent', NOW))?.id);
  });

  it('keeps one sitting as one shelf entry and tomorrow as another', () => {
    const first = createAgentContextItem(studySessionAgentContext('N5', '12 of 40', NOW, 'deck-1', NOW));
    const same = createAgentContextItem(studySessionAgentContext('N5', '13 of 40', NOW, 'deck-1', NOW + 5_000));
    const later = createAgentContextItem(studySessionAgentContext('N5', '2 of 40', NOW + 86_400_000, 'deck-1', NOW));
    expect(same?.id).toBe(first?.id);
    expect(later?.id).not.toBe(first?.id);
    // Performance is not reference data: session-only, and retention refused.
    expect(first?.sensitivity).toBe('personal');
    expect(first?.retained).toBe(false);
  });

  it('identifies a saved-word set by its contents, not its size', () => {
    const one = createAgentContextItem(savedWordsAgentContext(['食べる', '飲む'], 'Saved words', NOW));
    const same = createAgentContextItem(savedWordsAgentContext(['食べる', ' 飲む '], 'Saved words', NOW));
    const grown = createAgentContextItem(savedWordsAgentContext(['食べる', '飲む', '走る'], 'Saved words', NOW));
    expect(same?.id).toBe(one?.id);
    expect(grown?.id).not.toBe(one?.id);
    expect(one?.preview).toBe('食べる、飲む');
    expect(one?.sensitivity).toBe('personal');
    expect(one?.retained).toBe(false);
  });
});

/**
 * The second producer that can carry a picture, and the second producer of
 * `media-cue` — which is the whole reason this block exists. Reusing a kind is
 * cheap right up until two producers of it can mint the same id.
 */
describe('a captured visual-novel line', () => {
  const LINE = '行ってきます';
  const SCENE = '玄関 朝';

  it('discloses the Immersion window, not the player, as where it came from', () => {
    expect(createAgentContextItem(visualNovelCaptureAgentContext(LINE, SCENE, 'vn-9', NOW)))
      .toMatchObject({
        kind: 'media-cue',
        label: LINE,
        preview: SCENE,
        // Same floor as every other `media-cue`: what someone is reading is
        // their own material. Session-only, so neither the line nor the scene
        // it names can reach disk.
        sensitivity: 'personal',
        retained: false,
        source: { app: 'immersion', entityId: 'vn-9' },
      });
  });

  /**
   * The regression this producer's namespaced identity exists for.
   *
   * A shelf id is `kind:identity` and carries no trace of `source.app`, so
   * before the namespace an anime subtitle and a VN capture of the same
   * sentence minted byte-identical ids. `attachAgentContext` keeps one entry
   * per id and the newer replaces the older, so asking about a line a visual
   * novel and an episode happen to share would have taken the shelf entry away
   * from whichever was asked about first — and common short utterances like
   * this one are exactly the lines that collide.
   */
  it('does not take the shelf entry away from an episode with the same line', () => {
    const cue = createAgentContextItem(mediaCueAgentContext(LINE, 'もう八時だよ', 'ep-3', NOW));
    const vn = createAgentContextItem(visualNovelCaptureAgentContext(LINE, SCENE, 'vn-9', NOW));
    expect(vn?.id).not.toBe(cue?.id);

    const shelf = [cue, vn].filter((item): item is AgentContextItem => item !== null);
    expect(shelf).toHaveLength(2);
    expect(shelf.reduce((into, item) => attachAgentContext(into, item), [] as AgentContextItem[]))
      .toHaveLength(2);
  });

  it('is still one entry when a hook and an OCR read disagree about the line break', () => {
    // A text hook, a clipboard poller and an OCR read of one visible line
    // disagree about where it wraps; re-capturing must not grow the shelf.
    const hooked = createAgentContextItem(visualNovelCaptureAgentContext('行って\nきます', SCENE, 'vn-9', NOW));
    const scanned = createAgentContextItem(visualNovelCaptureAgentContext('行って きます', SCENE, 'vn-9', NOW + 9_000));
    expect(hooked?.id).toBe(scanned?.id);
  });

  it('falls back to the line when the scene is empty, which is the common case', () => {
    // `scene` is free text the user fills in later, so it is usually blank at
    // capture time — an empty preview would describe the material as having no
    // content at all.
    expect(createAgentContextItem(visualNovelCaptureAgentContext(LINE, '   ', 'vn-9', NOW))?.preview)
      .toBe(LINE);
  });

  it('is dropped by the persistence filter, so a captured line never reaches disk', () => {
    const item = createAgentContextItem(visualNovelCaptureAgentContext(LINE, SCENE, 'vn-9', NOW));
    const persisted = prepareAgentWorkspaceForPersistence({
      version: 1,
      activeConversationId: 'c1',
      conversations: [{
        id: 'c1',
        title: 'Visual novel',
        mode: 'ask',
        createdAt: NOW,
        updatedAt: NOW,
        context: [item],
        messages: [],
      }],
    });
    expect(persisted.conversations[0].context).toEqual([]);
  });

  /**
   * The same rule the reader and cue producers were each corrected on. A
   * conversation title IS persisted, and `media-cue` is refused retention
   * precisely so the line stays off disk — titling the conversation with the
   * raw line would write it there through the neighbouring field.
   */
  it('titles the conversation from a key, never from a raw line literal', () => {
    const source = readFileSync(
      resolve(__dirname, '..', 'components', 'immersion', 'VisualNovelAgentHandoffButton.tsx'),
      'utf8',
    );
    expect(source).toContain("t('agent.conversation.fromVisualNovel'");
    // The label passed into that key is bounded, so a paragraph-long capture
    // cannot become a paragraph-long persisted title.
    expect(source).toMatch(/label: line\.slice\(0, \d+\)/);
  });

  it('hands the picture over as an image, not as a field on the context', () => {
    const source = readFileSync(
      resolve(__dirname, '..', 'components', 'immersion', 'VisualNovelAgentHandoffButton.tsx'),
      'utf8',
    );
    // The fourth argument of `handOffToAgent` is the only route an image may
    // take; `FORBIDDEN_ATTACHMENT_FIELDS` refuses every other one.
    expect(source).toContain('visualNovelReadCaptureImage');
    expect(source).toMatch(/handOffToAgent\(/);
    expect(source).not.toMatch(/dataUrl:\s*capture\./);
  });
});
