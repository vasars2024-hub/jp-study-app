// @vitest-environment node
/**
 * Two halves of one guarantee: the Agent workspace bridge has no dead ends, and
 * the renderer trusts nothing that crosses it.
 *
 * The parity half reads the four boundary files as text. That is deliberate — a
 * channel is a string, and a typed import cannot tell you that the preload spells
 * `agentWorkspace:deleteConversation` the same way the handler does. Slice 6 held
 * the store back precisely because a channel with no consumer is a defect, so the
 * consumer side is asserted here rather than assumed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_WORKSPACE_CHANNELS } from '../../shared/agentWorkspaceBridge';
import { emptyAgentWorkspaceState } from '../../shared/agentWorkspace';
import {
  clearAgentWorkspace,
  deleteAgentConversation,
  loadAgentWorkspace,
  onAgentWorkspaceChanged,
  saveAgentWorkspace,
  updateAgentWorkspace,
} from '../agentWorkspaceClient';
import { agentWorkspaceWithPromptSaved } from '../agentPromptLibraryModel';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (relative: string): string => readFileSync(resolve(ROOT, relative), 'utf8');

/** `deleteConversation` → `agentWorkspaceDeleteConversation`. */
const methodFor = (key: string): string =>
  `agentWorkspace${key[0].toUpperCase()}${key.slice(1)}`;

const occurrences = (source: string, needle: string): number =>
  source.split(needle).length - 1;

/**
 * The call-site needles are assembled rather than written out, and that is not
 * style. `tools/architecture-audit.cjs` scans every source file — tests included
 * — for a registration call followed by a quoted channel name. Spelling one out
 * anywhere in this file, even inside a comment, registers a bogus channel and
 * fails the dead-IPC gate on a string that is only ever an assertion. Hence the
 * assembled quote below, and hence the careful wording here.
 */
const Q = String.fromCharCode(39);
const handleSite = (channel: string): string => `ipcMain.handle(${Q}${channel}${Q}`;
const invokeSite = (channel: string): string => `ipcRenderer.invoke(${Q}${channel}${Q}`;
const sendSite = (channel: string): string => `webContents.send(${Q}${channel}${Q}`;
const onSite = (channel: string): string => `ipcRenderer.on(${Q}${channel}${Q}`;

/**
 * `changed` is a main → renderer push, not a request, so it has a different set
 * of four ends: a `send` in main, an `on` in the preload, a declaration, and a
 * subscribe in the client. It is separated by shape rather than exempted —
 * a push with no listener is exactly as dead as a handler with no caller, and
 * that is the property this file exists to defend.
 */
const PUSH_KEYS = new Set(['changed']);
const REQUEST_ENTRIES = Object.entries(AGENT_WORKSPACE_CHANNELS)
  .filter(([key]) => !PUSH_KEYS.has(key));
const PUSH_ENTRIES = Object.entries(AGENT_WORKSPACE_CHANNELS)
  .filter(([key]) => PUSH_KEYS.has(key));

/** `changed` → `onAgentWorkspaceChanged`. */
const pushMethodFor = (key: string): string =>
  `onAgentWorkspace${key[0].toUpperCase()}${key.slice(1)}`;

describe('Agent workspace bridge parity', () => {
  const handlerSource = read('src/main/agentWorkspaceIpc.ts');
  const preloadSource = read('src/preload.ts');
  const declarationSource = read('src/renderer/window.d.ts');
  const clientSource = read('src/renderer/agentWorkspaceClient.ts');

  it('handles, exposes, declares and calls every request channel exactly once', () => {
    for (const [key, channel] of REQUEST_ENTRIES) {
      const method = methodFor(key);
      expect(occurrences(handlerSource, handleSite(channel)), channel).toBe(1);
      expect(occurrences(preloadSource, invokeSite(channel)), channel).toBe(1);
      expect(occurrences(preloadSource, `${method}:`), method).toBe(1);
      expect(occurrences(declarationSource, `${method}(`), method).toBe(1);
      expect(occurrences(clientSource, `bridgeMethod(${Q}${method}${Q})`), method).toBe(1);
    }
  });

  it('sends, exposes, declares and subscribes to every push channel exactly once', () => {
    expect(PUSH_ENTRIES).toHaveLength(1);
    for (const [key, channel] of PUSH_ENTRIES) {
      const method = pushMethodFor(key);
      expect(occurrences(handlerSource, sendSite(channel)), channel).toBe(1);
      expect(occurrences(preloadSource, onSite(channel)), channel).toBe(1);
      expect(occurrences(preloadSource, `${method}:`), method).toBe(1);
      expect(occurrences(declarationSource, `${method}(`), method).toBe(1);
      expect(occurrences(clientSource, `bridgeMethod(${Q}${method}${Q})`), method).toBe(1);
    }
  });

  it('registers no channel the contract does not declare', () => {
    const handlePattern = new RegExp(`ipcMain\\.handle\\(${Q}([^${Q}]+)${Q}`, 'g');
    const registered = [...handlerSource.matchAll(handlePattern)].map((match) => match[1]);
    expect(registered.sort()).toEqual(REQUEST_ENTRIES.map(([, channel]) => channel).sort());

    const sendPattern = new RegExp(`webContents\\.send\\(${Q}([^${Q}]+)${Q}`, 'g');
    const pushed = [...handlerSource.matchAll(sendPattern)].map((match) => match[1]);
    expect(pushed.sort()).toEqual(PUSH_ENTRIES.map(([, channel]) => channel).sort());
  });
});

describe('Agent workspace bridge consumption', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubApi = (api: Record<string, unknown>): void => {
    vi.stubGlobal('window', { api });
  };

  const okReply = { ok: true, state: emptyAgentWorkspaceState() };

  it('calls the matching preload method with the argument it was given', async () => {
    const calls: [string, unknown[]][] = [];
    const record = (name: string) => (...args: unknown[]) => {
      calls.push([name, args]);
      return Promise.resolve(okReply);
    };
    stubApi({
      agentWorkspaceLoad: record('load'),
      agentWorkspaceSave: record('save'),
      agentWorkspaceDeleteConversation: record('delete'),
      agentWorkspaceClear: record('clear'),
    });

    const state = emptyAgentWorkspaceState();
    expect(await loadAgentWorkspace()).toEqual(okReply);
    expect(await saveAgentWorkspace(state)).toEqual(okReply);
    expect(await deleteAgentConversation('chat-1')).toEqual(okReply);
    expect(await clearAgentWorkspace()).toEqual(okReply);

    expect(calls).toEqual([
      ['load', []],
      ['save', [state]],
      ['delete', ['chat-1']],
      ['clear', []],
    ]);
  });

  it('reports a missing preload method instead of throwing', async () => {
    stubApi({});
    for (const call of [
      loadAgentWorkspace(),
      saveAgentWorkspace(emptyAgentWorkspaceState()),
      deleteAgentConversation('chat-1'),
      clearAgentWorkspace(),
    ]) {
      expect(await call).toEqual({ ok: false, code: 'bridge-unavailable' });
    }
  });

  it('turns a rejected invoke into the failure its caller can act on', async () => {
    const reject = () => Promise.reject(new Error("no handler for 'agentWorkspace:load'"));
    stubApi({
      agentWorkspaceLoad: reject,
      agentWorkspaceSave: reject,
      agentWorkspaceDeleteConversation: reject,
      agentWorkspaceClear: reject,
    });
    expect(await loadAgentWorkspace()).toEqual({ ok: false, code: 'read-failed' });
    expect(await saveAgentWorkspace(emptyAgentWorkspaceState()))
      .toEqual({ ok: false, code: 'write-failed' });
    expect(await deleteAgentConversation('chat-1')).toEqual({ ok: false, code: 'write-failed' });
    expect(await clearAgentWorkspace()).toEqual({ ok: false, code: 'write-failed' });
  });

  it('re-applies a semantic edit to the latest state after a stale-save conflict', async () => {
    const base = emptyAgentWorkspaceState();
    const latest = {
      ...base,
      revision: 1,
      activeConversationId: 'newer',
      conversations: [{
        id: 'newer',
        title: 'Newer conversation',
        mode: 'ask' as const,
        createdAt: 1,
        updatedAt: 1,
        pinned: false,
        archived: false,
        context: [],
        messages: [],
      }],
    };
    const saved = { ...latest, revision: 2, activeConversationId: null };
    const posted: unknown[] = [];
    stubApi({
      agentWorkspaceSave: (state: unknown) => {
        posted.push(state);
        return Promise.resolve(posted.length === 1
          ? { ok: false, code: 'conflict', state: latest }
          : { ok: true, state: saved });
      },
    });

    const result = await updateAgentWorkspace(base, (current) => ({
      ...current,
      activeConversationId: null,
    }));

    expect(result).toEqual({ ok: true, state: saved });
    expect(posted).toHaveLength(2);
    expect(posted[0]).toMatchObject({ revision: 0, conversations: [] });
    expect(posted[1]).toMatchObject({
      revision: 1,
      activeConversationId: null,
      conversations: [expect.objectContaining({ id: 'newer' })],
    });
  });

  it('re-applies a prompt-library edit without erasing a prompt saved by another window', async () => {
    const base = emptyAgentWorkspaceState();
    const latest = {
      ...base,
      revision: 1,
      prompts: [{
        id: 'other-window',
        title: 'Other window',
        text: 'Already committed',
        createdAt: 1,
        updatedAt: 1,
      }],
    };
    const posted: unknown[] = [];
    stubApi({
      agentWorkspaceSave: (state: unknown) => {
        posted.push(state);
        return Promise.resolve(posted.length === 1
          ? { ok: false, code: 'conflict', state: latest }
          : { ok: true, state: { ...(state as object), revision: 2 } });
      },
    });

    const result = await updateAgentWorkspace(base, (current) => (
      agentWorkspaceWithPromptSaved(current, {
        id: 'this-window',
        title: 'This window',
        text: 'New reusable prompt',
        now: 2,
      })
    ));

    expect(result.ok).toBe(true);
    expect(posted).toHaveLength(2);
    expect(posted[1]).toMatchObject({
      revision: 1,
      prompts: [
        expect.objectContaining({ id: 'this-window' }),
        expect.objectContaining({ id: 'other-window' }),
      ],
    });
  });

  it('delivers a pushed workspace, re-derived rather than trusted', () => {
    let push: ((state: unknown) => void) | null = null;
    let unsubscribed = false;
    stubApi({
      onAgentWorkspaceChanged: (callback: (state: unknown) => void) => {
        push = callback;
        return () => {
          unsubscribed = true;
        };
      },
    });

    const seen: unknown[] = [];
    const off = onAgentWorkspaceChanged((state) => seen.push(state));
    expect(push).toBeTypeOf('function');
    const emit = push as unknown as (state: unknown) => void;

    emit({ version: 1, revision: 0, activeConversationId: null, conversations: [] });
    expect(seen).toEqual([emptyAgentWorkspaceState()]);

    // A foreign schema normalizes to the EMPTY workspace, which a consumer would
    // otherwise adopt over correct content it already holds. Dropped instead.
    emit({ version: 99, conversations: [{ id: 'ghost' }] });
    emit('nonsense');
    emit(null);
    expect(seen).toHaveLength(1);

    off();
    expect(unsubscribed).toBe(true);
  });

  it('gives a usable unsubscribe when the preload predates the push channel', () => {
    stubApi({});
    const off = onAgentWorkspaceChanged(() => undefined);
    expect(() => off()).not.toThrow();
  });

  it('re-normalizes whatever actually came back', async () => {
    // A reply is untrusted in this direction too: a foreign schema is reduced to
    // the empty workspace rather than handed to the shell as conversations.
    stubApi({
      agentWorkspaceLoad: () => Promise.resolve({
        ok: true,
        state: { version: 99, conversations: [{ id: 'ghost' }] },
      }),
    });
    expect(await loadAgentWorkspace()).toEqual({ ok: true, state: emptyAgentWorkspaceState() });

    stubApi({ agentWorkspaceLoad: () => Promise.resolve('nonsense') });
    expect(await loadAgentWorkspace()).toEqual({ ok: false, code: 'read-failed' });

    stubApi({ agentWorkspaceLoad: () => Promise.resolve({ ok: false, code: 'made-up' }) });
    expect(await loadAgentWorkspace()).toEqual({ ok: false, code: 'read-failed' });

    stubApi({ agentWorkspaceLoad: () => Promise.resolve({ ok: false, code: 'invalid-request' }) });
    expect(await loadAgentWorkspace()).toEqual({ ok: false, code: 'invalid-request' });
  });
});
