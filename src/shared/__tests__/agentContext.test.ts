/**
 * The first link in the context pipeline.
 *
 * Two rules carry the risk and are pinned hardest: a producer must not be able
 * to talk an item's sensitivity *down* below its kind's floor (that floor is
 * what `evaluateAgentProviderPrivacy` relies on to hold the cloud boundary), and
 * personal content must not be able to claim `retained` and reach disk. The rest
 * is shelf arithmetic — bounded, deduplicated, newest first.
 */
import { describe, expect, it } from 'vitest';

import {
  AGENT_CONTEXT_PREVIEW_MAX,
  AGENT_CONTEXT_SHELF_LIMIT,
  agentContextSensitivityFloor,
  attachAgentContext,
  conversationWithAgentContext,
  conversationWithoutAgentContext,
  createAgentContextItem,
  detachAgentContext,
} from '../agentContext';
import { normalizeAgentWorkspaceState, type AgentContextItem } from '../agentWorkspace';

const NOW = 1_800_000_000_000;

function build(overrides: Record<string, unknown> = {}): AgentContextItem {
  const item = createAgentContextItem({
    kind: 'dictionary-entry',
    label: '食べる',
    preview: 'to eat',
    source: { app: 'dictionary' },
    identity: 'taberu',
    now: NOW,
    ...overrides,
  } as Parameters<typeof createAgentContextItem>[0]);
  if (!item) throw new Error('expected a context item');
  return item;
}

function conversation(context: AgentContextItem[]) {
  return {
    id: 'chat-1',
    title: 'First',
    mode: 'ask' as const,
    createdAt: NOW,
    updatedAt: NOW,
    pinned: false,
    archived: false,
    context,
    messages: [],
  };
}

describe('createAgentContextItem', () => {
  it('derives a stable id from the kind and identity', () => {
    expect(build().id).toBe('dictionary-entry:taberu');
    expect(build().id).toBe(build().id);
  });

  it('keeps personal material out of ids without losing stable identity', () => {
    const first = build({ kind: 'reading-passage', identity: '秘密の段落' });
    const again = build({ kind: 'reading-passage', identity: '秘密の段落' });
    const other = build({ kind: 'reading-passage', identity: '別の段落' });
    expect(first.id).toBe(again.id);
    expect(first.id).not.toBe(other.id);
    expect(first.id).toMatch(/^reading-passage:[0-9a-f]{16}$/);
    expect(first.id).not.toContain('秘密の段落');
  });

  it('does not collapse long personal identities that share their first 200 characters', () => {
    const prefix = 'あ'.repeat(200);
    const first = build({ kind: 'reading-passage', identity: `${prefix}甲` });
    const second = build({ kind: 'reading-passage', identity: `${prefix}乙` });
    expect(first.id).not.toBe(second.id);
  });

  it('refuses input that could not describe anything', () => {
    const base = {
      kind: 'dictionary-entry' as const,
      label: '食べる',
      source: { app: 'dictionary' },
      identity: 'taberu',
      now: NOW,
    };
    expect(createAgentContextItem({ ...base, label: '   ' })).toBeNull();
    expect(createAgentContextItem({ ...base, identity: '' })).toBeNull();
    expect(createAgentContextItem({ ...base, source: { app: '  ' } })).toBeNull();
  });

  it('defaults sensitivity to the kind floor', () => {
    expect(build().sensitivity).toBe('ordinary');
    expect(build({ kind: 'reading-passage', identity: 'p1' }).sensitivity).toBe('personal');
    expect(build({ kind: 'file', identity: 'f1' }).sensitivity).toBe('sensitive');
  });

  it('lets a producer raise sensitivity', () => {
    expect(build({ sensitivity: 'sensitive' }).sensitivity).toBe('sensitive');
    expect(build({ kind: 'reading-passage', identity: 'p1', sensitivity: 'sensitive' }).sensitivity)
      .toBe('sensitive');
  });

  it('refuses to let a producer lower sensitivity below the kind floor', () => {
    // The failure this prevents: a surface marking the user's own reading
    // material `ordinary` and walking it past the cloud privacy boundary.
    expect(build({ kind: 'reading-passage', identity: 'p1', sensitivity: 'ordinary' }).sensitivity)
      .toBe('personal');
    expect(build({ kind: 'file', identity: 'f1', sensitivity: 'ordinary' }).sensitivity)
      .toBe('sensitive');
    expect(build({ kind: 'file', identity: 'f1', sensitivity: 'personal' }).sensitivity)
      .toBe('sensitive');
  });

  it.each(['route', 'dictionary-entry'] as const)('allows retention for %s', (kind) => {
    expect(agentContextSensitivityFloor(kind)).toBe('ordinary');
    expect(build({ kind, identity: 'x', retained: true }).retained).toBe(true);
  });

  it.each(['selected-text', 'reading-passage', 'media-cue', 'study-session', 'saved-words', 'file'] as const)(
    'refuses retention for %s even when asked',
    (kind) => {
      expect(build({ kind, identity: 'x', retained: true }).retained).toBe(false);
    },
  );

  it('bounds the preview to what the workspace normalizer keeps', () => {
    const item = build({ preview: 'あ'.repeat(AGENT_CONTEXT_PREVIEW_MAX + 500) });
    expect(item.preview.length).toBe(AGENT_CONTEXT_PREVIEW_MAX);
  });

  it('survives the workspace normalizer unchanged', () => {
    // The item crosses the workspace bridge, so it has to be a fixed point of
    // the normalizer that guards the other side.
    const item = build({ source: { app: 'dictionary', route: '/lexicon', entityId: 'jmdict:1358280' } });
    const state = normalizeAgentWorkspaceState({
      version: 1,
      activeConversationId: 'chat-1',
      conversations: [conversation([item])],
    });
    expect(state.conversations[0].context).toEqual([item]);
  });
});

describe('shelf arithmetic', () => {
  it('puts the newest item first', () => {
    const a = build({ identity: 'a' });
    const b = build({ identity: 'b' });
    expect(attachAgentContext([a], b).map((item) => item.id)).toEqual([
      'dictionary-entry:b',
      'dictionary-entry:a',
    ]);
  });

  it('re-adding the same identity refreshes it and moves it to the front', () => {
    const a = build({ identity: 'a' });
    const b = build({ identity: 'b' });
    const aAgain = build({ identity: 'a', preview: 'to eat (refreshed)' });
    const shelf = attachAgentContext(attachAgentContext([a], b), aAgain);
    expect(shelf.map((item) => item.id)).toEqual(['dictionary-entry:a', 'dictionary-entry:b']);
    expect(shelf[0].preview).toBe('to eat (refreshed)');
  });

  it('is bounded, dropping the oldest', () => {
    let shelf: AgentContextItem[] = [];
    for (let index = 0; index < AGENT_CONTEXT_SHELF_LIMIT + 5; index += 1) {
      shelf = attachAgentContext(shelf, build({ identity: `w${index}` }));
    }
    expect(shelf).toHaveLength(AGENT_CONTEXT_SHELF_LIMIT);
    expect(shelf[0].id).toBe(`dictionary-entry:w${AGENT_CONTEXT_SHELF_LIMIT + 4}`);
    expect(shelf.some((item) => item.id === 'dictionary-entry:w0')).toBe(false);
  });

  it('detaches by id and ignores an unknown one', () => {
    const a = build({ identity: 'a' });
    expect(detachAgentContext([a], 'dictionary-entry:a')).toEqual([]);
    expect(detachAgentContext([a], 'nope')).toEqual([a]);
  });
});

describe('conversation transforms', () => {
  it('attaches and stamps updatedAt', () => {
    const next = conversationWithAgentContext(conversation([]), build(), NOW + 10);
    expect(next?.context.map((item) => item.id)).toEqual(['dictionary-entry:taberu']);
    expect(next?.updatedAt).toBe(NOW + 10);
  });

  it('returns null when attaching would change nothing', () => {
    const item = build();
    // Same identity, same content, already at the front: no save is warranted.
    expect(conversationWithAgentContext(conversation([item]), item, NOW + 10)).toBeNull();
  });

  it('is still a no-op for an equal item built later from a real clock', () => {
    // The case that matters in production: a producer builds a fresh object on
    // every gesture, so a later lookup of the same word differs only by
    // `createdAt`. Treating that as a change would rewrite the main-owned
    // workspace file on every repeat lookup.
    const first = build();
    const again = build({ now: NOW + 60_000 });
    expect(again).not.toBe(first);
    expect(again.createdAt).not.toBe(first.createdAt);
    expect(conversationWithAgentContext(conversation([first]), again, NOW + 60_000)).toBeNull();
  });

  it('is a change when the same word arrives with a different sentence', () => {
    const first = build({ preview: 'first sentence' });
    const second = build({ preview: 'second sentence' });
    const next = conversationWithAgentContext(conversation([first]), second, NOW + 10);
    expect(next?.context[0].preview).toBe('second sentence');
  });

  it('reorders when the same identity arrives behind another item', () => {
    const a = build({ identity: 'a' });
    const b = build({ identity: 'b' });
    const next = conversationWithAgentContext(conversation([b, a]), a, NOW + 10);
    expect(next?.context.map((item) => item.id)).toEqual([
      'dictionary-entry:a',
      'dictionary-entry:b',
    ]);
  });

  it('detaches, and returns null for an id that is not there', () => {
    const item = build();
    expect(conversationWithoutAgentContext(conversation([item]), item.id, NOW + 10)?.context)
      .toEqual([]);
    expect(conversationWithoutAgentContext(conversation([item]), 'nope', NOW + 10)).toBeNull();
  });
});
