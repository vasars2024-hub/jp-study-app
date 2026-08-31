// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_WORKSPACE_RELATIVE_PATH,
  emptyAgentWorkspaceState,
} from '../../shared/agentWorkspace';
import { createAgentSessionContextStore } from '../agentSessionContext';
import {
  createAgentWorkspaceStore,
  prepareAgentWorkspaceForPersistence,
  type AgentWorkspaceStore,
} from '../agentWorkspaceStore';

let root = '';
let store: AgentWorkspaceStore;

function document() {
  return {
    version: 1,
    revision: 0,
    activeConversationId: 'chat-1',
    conversations: [{
      id: 'chat-1',
      title: 'Retained chat',
      mode: 'study',
      createdAt: 100,
      updatedAt: 200,
      context: [{
        id: 'ctx-keep',
        kind: 'reading-passage',
        label: 'Retained passage',
        preview: '保存する',
        source: { app: 'reading' },
        sensitivity: 'ordinary',
        retained: true,
        createdAt: 100,
      }, {
        id: 'ctx-session',
        kind: 'selected-text',
        label: 'Session only',
        preview: '秘密',
        source: { app: 'reading' },
        sensitivity: 'sensitive',
        retained: false,
        createdAt: 100,
      }],
      messages: [{
        id: 'message-1',
        conversationId: 'chat-1',
        role: 'user',
        status: 'complete',
        text: 'Explain this.',
        createdAt: 100,
        updatedAt: 100,
        contextIds: ['ctx-keep', 'ctx-session'],
        attachments: [{
          id: 'file-keep',
          kind: 'document',
          name: 'retained.txt',
          sensitivity: 'ordinary',
          retained: true,
        }, {
          id: 'file-session',
          kind: 'image',
          name: 'session.png',
          sensitivity: 'sensitive',
          retained: false,
        }],
        cards: [{
          id: 'card-1',
          kind: 'reading',
          title: 'Reading result repeats 秘密',
          summary: 'Derived from session-only context: 秘密',
          sourceContextIds: ['ctx-keep', 'ctx-session'],
          actions: [{
            id: 'open-session-context',
            label: 'Open',
            effect: { type: 'open-context', contextId: 'ctx-session' },
          }],
        }, {
          id: 'card-retained',
          kind: 'reading',
          title: 'Retained result',
          sourceContextIds: ['ctx-keep'],
          actions: [{
            id: 'open-retained-context',
            label: 'Open retained',
            effect: { type: 'open-context', contextId: 'ctx-keep' },
          }, {
            id: 'open-missing-context',
            label: 'Open missing',
            effect: { type: 'open-context', contextId: 'ctx-session' },
          }],
        }, {
          id: 'card-unprovenanced',
          kind: 'generic',
          title: 'Private material with no declared source',
          summary: 'UNPROVENANCED_PRIVATE_VALUE',
          sourceContextIds: [],
          actions: [],
        }, {
          // The one card that keeps no context id and survives anyway: its text
          // is the user's own question and its destination is re-derived from a
          // static table, so there is nothing here that can outlive a source.
          id: 'card-query',
          kind: 'navigation',
          title: 'where do I change the interface language?',
          sourceContextIds: [],
          actions: [{
            id: 'navigate-index',
            label: 'where do I change the interface language?',
            effect: {
              type: 'navigate',
              section: 'settings',
              page: 'appearance',
              controlId: 'ui-language',
              highlight: true,
              query: 'where do I change the interface language?',
            },
          }],
        }, {
          // Same empty provenance, but one action is not a query navigation, so
          // it falls back to the ordinary rule and is dropped.
          id: 'card-query-mixed',
          kind: 'navigation',
          title: 'MIXED_UNPROVENANCED_VALUE',
          sourceContextIds: [],
          actions: [{
            id: 'navigate-index-mixed',
            label: 'Mixed',
            effect: {
              type: 'navigate',
              section: 'settings',
              page: 'appearance',
              controlId: 'ui-language',
              highlight: true,
              query: 'where do I change the interface language?',
            },
          }, {
            id: 'open-session-context-mixed',
            label: 'Open',
            effect: { type: 'open-context', contextId: 'ctx-session' },
          }],
        }],
        provider: {
          target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
          cloud: true,
          contextIds: ['ctx-keep', 'ctx-session'],
          attachmentIds: ['file-keep', 'file-session'],
          historyMessageIds: ['missing-history', 'message-1'],
          inputChars: 50,
          startedAt: 100,
        },
      }],
    }, {
      id: 'chat-2',
      title: 'Second chat',
      mode: 'ask',
      createdAt: 300,
      updatedAt: 300,
      context: [],
      messages: [],
    }],
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-store-'));
  // An explicit session store per test. The default is a process singleton, so
  // sharing it would carry one test's session-only context into the next.
  store = createAgentWorkspaceStore(root, createAgentSessionContextStore());
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('main-owned Agent workspace store', () => {
  it('starts empty for missing, corrupt, or future documents', () => {
    expect(store.filePath).toBe(path.join(root, ...AGENT_WORKSPACE_RELATIVE_PATH));
    expect(store.read()).toEqual(emptyAgentWorkspaceState());
    fs.mkdirSync(path.dirname(store.filePath), { recursive: true });
    fs.writeFileSync(store.filePath, '{bad json', 'utf8');
    expect(store.read()).toEqual(emptyAgentWorkspaceState());
    fs.writeFileSync(store.filePath, JSON.stringify({ version: 99, conversations: [] }), 'utf8');
    expect(store.read()).toEqual(emptyAgentWorkspaceState());
  });

  it('atomically writes normalized state and leaves no temporary file', () => {
    const saved = store.write(document());
    expect(saved.activeConversationId).toBe('chat-1');
    expect(saved.revision).toBe(1);
    expect(store.read()).toEqual(saved);
    expect(fs.existsSync(store.filePath)).toBe(true);
    expect(fs.readdirSync(path.dirname(store.filePath))).toEqual(['workspace-v1.json']);
  });

  it('persists reusable prompts in the same main-owned document across store instances', () => {
    const saved = store.write({
      ...emptyAgentWorkspaceState(),
      prompts: [{
        id: 'prompt-1',
        title: 'Reading helper',
        text: 'Explain the selected passage at N3 level.',
        createdAt: 10,
        updatedAt: 12,
      }],
    });
    expect(saved.prompts?.[0]).toMatchObject({ id: 'prompt-1', title: 'Reading helper' });

    const reopened = createAgentWorkspaceStore(root, createAgentSessionContextStore());
    expect(reopened.read().prompts).toEqual(saved.prompts);
  });

  it('writes and reads only unambiguous normalized message/card/action coordinates', () => {
    const longId = 'x'.repeat(240);
    const action = (id: string, label: string) => ({
      id,
      label,
      effect: { type: 'navigate', section: 'dictionary' },
    });
    const card = (id: string, title: string, actions: ReturnType<typeof action>[]) => ({
      id,
      kind: 'navigation',
      title,
      sourceContextIds: ['ctx-keep'],
      actions,
    });
    const message = (id: string, text: string, cards: ReturnType<typeof card>[]) => ({
      id,
      role: 'assistant',
      status: 'complete',
      text,
      createdAt: 100,
      contextIds: ['ctx-keep'],
      attachments: [],
      cards,
    });
    const input = {
      version: 1,
      activeConversationId: 'chat-1',
      conversations: [{
        id: 'chat-1',
        title: 'Coordinate persistence',
        createdAt: 100,
        context: [{
          id: 'ctx-keep',
          kind: 'reading-passage',
          label: 'Retained',
          preview: '保存',
          source: { app: 'reading' },
          sensitivity: 'ordinary',
          retained: true,
          createdAt: 100,
        }],
        messages: [
          message('message-collision', 'MESSAGE_COLLISION_A', []),
          message(' message-collision ', 'MESSAGE_COLLISION_B', []),
          message('message-unique', 'MESSAGE_UNIQUE', [
            card('card-collision', 'CARD_COLLISION_A', []),
            card(' card-collision ', 'CARD_COLLISION_B', []),
            card(`${longId}A`, 'CARD_LONG_A', []),
            card(`${longId}B`, 'CARD_LONG_B', []),
            card('card-unique', 'CARD_UNIQUE', [
              action('action-collision', 'ACTION_COLLISION_A'),
              action(' action-collision ', 'ACTION_COLLISION_B'),
              action(`${longId}A`, 'ACTION_LONG_A'),
              action(`${longId}B`, 'ACTION_LONG_B'),
              action('action-unique', 'ACTION_UNIQUE'),
            ]),
          ]),
        ],
      }],
    };

    const saved = store.write(input);
    const savedMessages = saved.conversations[0].messages;
    expect(savedMessages.map((entry) => entry.id)).toEqual(['message-unique']);
    expect(savedMessages[0].cards.map((entry) => entry.id)).toEqual(['card-unique']);
    expect(savedMessages[0].cards[0].actions.map((entry) => entry.id)).toEqual(['action-unique']);
    expect(store.read()).toEqual(saved);

    const raw = fs.readFileSync(store.filePath, 'utf8');
    const diskConversation = JSON.parse(raw).conversations[0];
    expect(diskConversation.messages.map((entry: { id: string }) => entry.id))
      .toEqual(['message-unique']);
    expect(diskConversation.messages[0].cards.map((entry: { id: string }) => entry.id))
      .toEqual(['card-unique']);
    expect(diskConversation.messages[0].cards[0].actions.map((entry: { id: string }) => entry.id))
      .toEqual(['action-unique']);
    for (const removedSentinel of [
      'MESSAGE_COLLISION_A',
      'MESSAGE_COLLISION_B',
      'CARD_COLLISION_A',
      'CARD_COLLISION_B',
      'CARD_LONG_A',
      'CARD_LONG_B',
      'ACTION_COLLISION_A',
      'ACTION_COLLISION_B',
      'ACTION_LONG_A',
      'ACTION_LONG_B',
    ]) {
      expect(raw).not.toContain(removedSentinel);
    }
    expect(raw).toContain('MESSAGE_UNIQUE');
    expect(raw).toContain('CARD_UNIQUE');
    expect(raw).toContain('ACTION_UNIQUE');
  });

  it('terminalizes an interrupted execution once when the store opens', () => {
    const interrupted = document();
    interrupted.revision = 4;
    interrupted.conversations[0].messages[0].status = 'streaming';
    interrupted.conversations[0].messages[0].text = 'partial answer';
    fs.mkdirSync(path.dirname(store.filePath), { recursive: true });
    fs.writeFileSync(store.filePath, JSON.stringify(interrupted), 'utf8');

    const recovered = store.read();
    expect(recovered.revision).toBe(5);
    expect(recovered.conversations[0].messages[0]).toMatchObject({
      status: 'failed',
      error: 'provider-failed',
      text: 'partial answer',
    });
    expect(store.read()).toEqual(recovered);
    expect(JSON.parse(fs.readFileSync(store.filePath, 'utf8'))).toEqual(recovered);
  });

  it('refuses a stale compare-and-swap and preserves the newer document', () => {
    const base = store.write(document());
    const pinned = store.compareAndWrite({
      ...base,
      conversations: base.conversations.map((conversation) => (
        conversation.id === 'chat-1' ? { ...conversation, pinned: true } : conversation
      )),
    });
    expect(pinned).toMatchObject({ ok: true, state: { revision: 2 } });

    const stale = store.compareAndWrite({
      ...base,
      conversations: base.conversations.map((conversation) => (
        conversation.id === 'chat-1' ? { ...conversation, mode: 'analyze' } : conversation
      )),
    });
    expect(stale).toMatchObject({ ok: false, state: { revision: 2 } });
    if (stale.ok) throw new Error('expected stale compare-and-swap to be refused');
    expect(stale.state.conversations.find((conversation) => conversation.id === 'chat-1'))
      .toMatchObject({ pinned: true, mode: 'study' });
    expect(store.read()).toEqual(stale.state);

    const rebased = store.compareAndWrite({
      ...stale.state,
      conversations: stale.state.conversations.map((conversation) => (
        conversation.id === 'chat-1' ? { ...conversation, mode: 'analyze' } : conversation
      )),
    });
    expect(rebased).toMatchObject({ ok: true, state: { revision: 3 } });
    expect(rebased.state.conversations.find((conversation) => conversation.id === 'chat-1'))
      .toMatchObject({ pinned: true, mode: 'analyze' });
  });

  it('never persists session-only context, attachments, or dangling references', () => {
    const persisted = prepareAgentWorkspaceForPersistence(document());
    const conversation = persisted.conversations[0];
    const message = conversation.messages[0];

    expect(conversation.context.map((item) => item.id)).toEqual(['ctx-keep']);
    expect(message.contextIds).toEqual(['ctx-keep']);
    expect(message.attachments.map((item) => item.id)).toEqual(['file-keep']);
    // `card-query` keeps no context id and survives on its stored question;
    // `card-query-mixed` has the same empty provenance but one non-query action,
    // so it falls back to the ordinary rule and goes.
    expect(message.cards.map((card) => card.id)).toEqual(['card-retained', 'card-query']);
    expect(message.cards[0].sourceContextIds).toEqual(['ctx-keep']);
    expect(message.cards[0].actions.map((action) => action.id))
      .toEqual(['open-retained-context']);
    expect(JSON.stringify(persisted)).not.toContain('MIXED_UNPROVENANCED_VALUE');
    expect(message.provider).toMatchObject({
      contextIds: ['ctx-keep'],
      attachmentIds: ['file-keep'],
      historyMessageIds: [],
    });
  });

  it('keeps session-only context live in memory while the file stays retained-only', () => {
    const saved = store.write(document());
    const ids = (state: typeof saved): string[] =>
      state.conversations[0].context.map((item) => item.id);

    // The whole point of the slice: the caller gets both halves back.
    expect(ids(saved)).toEqual(['ctx-keep', 'ctx-session']);
    expect(ids(store.read())).toEqual(['ctx-keep', 'ctx-session']);

    // ...and the bytes on disk carry only the retained half. Asserted on the raw
    // text, not on a parsed round trip, so a normalizer cannot launder it.
    const raw = fs.readFileSync(store.filePath, 'utf8');
    expect(raw).toContain('ctx-keep');
    expect(raw).not.toContain('ctx-session');
    expect(raw).not.toContain('秘密');
    expect(raw).not.toContain('card-1');
    expect(raw).not.toContain('card-unprovenanced');
    expect(raw).not.toContain('UNPROVENANCED_PRIVATE_VALUE');
    expect(JSON.parse(raw).conversations[0].context).toHaveLength(1);
  });

  it('loses session-only context across a restart and keeps the retained half', () => {
    store.write(document());
    // A new store on the same root with its own session half is what a restart
    // looks like: the file survives, the memory does not.
    const restarted = createAgentWorkspaceStore(root, createAgentSessionContextStore());
    expect(restarted.read().conversations[0].context.map((item) => item.id))
      .toEqual(['ctx-keep']);
  });

  it('removes a session-only item when a save stops listing it', () => {
    store.write(document());
    const current = store.read();
    const trimmed = {
      ...current,
      conversations: current.conversations.map((conversation) => (
        conversation.id === 'chat-1'
          ? {
              ...conversation,
              context: conversation.context.filter((item) => item.id !== 'ctx-session'),
            }
          : conversation
      )),
    };
    // Replace-not-union: a removal reaches the store as a document that simply no
    // longer lists the item, so a union would make the remove control a no-op.
    expect(store.write(trimmed).conversations[0].context.map((item) => item.id))
      .toEqual(['ctx-keep']);
    expect(store.read().conversations[0].context.map((item) => item.id)).toEqual(['ctx-keep']);
  });

  it('deletes one conversation without stripping another conversation\'s session context', () => {
    const base = document();
    base.conversations[1].context = [{
      id: 'ctx-session-2',
      kind: 'media-cue',
      label: 'Session cue',
      preview: '字幕',
      source: { app: 'media' },
      sensitivity: 'personal',
      retained: false,
      createdAt: 300,
    }];
    store.write(base);
    expect(store.read().conversations[1].context.map((item) => item.id)).toEqual(['ctx-session-2']);

    // `deleteConversation` re-derives the session half from the document it writes,
    // so reading the file's view instead of the merged one would quietly drop this.
    const afterDelete = store.deleteConversation('chat-1');
    expect(afterDelete.conversations.map((item) => item.id)).toEqual(['chat-2']);
    expect(afterDelete.conversations[0].context.map((item) => item.id)).toEqual(['ctx-session-2']);
    expect(store.read().conversations[0].context.map((item) => item.id)).toEqual(['ctx-session-2']);
  });

  it('drops session-only context when history is cleared', () => {
    store.write(document());
    expect(store.clear()).toEqual({ ...emptyAgentWorkspaceState(), revision: 2 });
    // Re-creating the conversation must not resurrect the old session item.
    const revived = store.write({
      version: 1,
      activeConversationId: 'chat-1',
      conversations: [{ id: 'chat-1', title: 'Revived', mode: 'ask', createdAt: 400, updatedAt: 400, context: [], messages: [] }],
    });
    expect(revived.conversations[0].context).toEqual([]);
  });

  it('deletes an active conversation safely and can clear all history', () => {
    store.write(document());
    const afterDelete = store.deleteConversation('chat-1');
    expect(afterDelete.conversations.map((item) => item.id)).toEqual(['chat-2']);
    expect(afterDelete.activeConversationId).toBe('chat-2');
    expect(store.read()).toEqual(afterDelete);

    expect(store.clear()).toEqual({ ...emptyAgentWorkspaceState(), revision: 3 });
    expect(store.read()).toEqual({ ...emptyAgentWorkspaceState(), revision: 3 });
  });
});
