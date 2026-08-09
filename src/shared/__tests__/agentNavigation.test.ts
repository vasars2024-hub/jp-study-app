// @vitest-environment node
/**
 * The navigation gate's pure half: what may be opened, and what proves it.
 *
 * The allowlist test reads `src/main.ts` rather than importing it. Importing the
 * entry point pulls in Electron and the whole app boot; the set it declares is a
 * literal, and a source-derived assertion is what makes "mirrors POPOUT_SECTIONS"
 * a gate instead of a comment. `mediaCenterIntegration.test.ts` reads source for
 * the same reason.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENT_NAVIGABLE_SECTIONS,
  AGENT_NAVIGATION_IDLE,
  AGENT_NAVIGATION_SECTION_LABEL_KEYS,
  agentNavigationReduce,
  isAgentNavigableSection,
  resolveAgentNavigation,
  type AgentNavigationFailureCode,
  type AgentNavigationRun,
} from '../agentNavigation';
import type {
  AgentContextItem,
  AgentConversation,
  AgentResultCardAction,
} from '../agentWorkspace';

/**
 * The English catalog as **source text**, not as an imported object.
 *
 * Importing `catalogs/en` pulls in the split modules it re-exports, several of
 * which exist only as uncommitted files in the primary tree — so an import here
 * passes in a dirty worktree and fails on the commit, which is the worst of both
 * (`agentWorkspaceShell.test.ts` mocks `../i18n` for the same reason). Reading
 * the sources answers the only question these assertions ask — does English
 * define this key — without depending on another track's work.
 */
const CATALOG_DIR = path.resolve(__dirname, '..', 'i18n', 'catalogs');

const englishCatalogSource = ((): string => {
  const parts = [fs.readFileSync(path.join(CATALOG_DIR, 'en.ts'), 'utf8')];
  for (const entry of fs.readdirSync(CATALOG_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(CATALOG_DIR, entry.name, 'en.ts');
    if (fs.existsSync(nested)) parts.push(fs.readFileSync(nested, 'utf8'));
  }
  return parts.join('\n');
})();

const definesKey = (key: string): boolean => englishCatalogSource.includes(`'${key}':`);

function routeContext(overrides: Partial<AgentContextItem> = {}): AgentContextItem {
  return {
    id: 'ctx-route',
    kind: 'route',
    label: 'Dictionary',
    preview: 'Where you were',
    source: { app: 'dictionary', route: 'entry/猫' },
    sensitivity: 'ordinary',
    retained: true,
    createdAt: 10,
    ...overrides,
  };
}

function conversation(
  context: AgentContextItem[],
  action: AgentResultCardAction,
  sourceContextIds = ['ctx-route'],
): AgentConversation {
  return {
    id: 'chat-1',
    title: 'Thread',
    mode: 'navigate',
    createdAt: 1,
    updatedAt: 2,
    pinned: false,
    archived: false,
    context,
    messages: [{
      id: 'msg-1',
      conversationId: 'chat-1',
      role: 'assistant',
      status: 'complete',
      text: 'Reply',
      createdAt: 2,
      updatedAt: 2,
      contextIds: context.map((item) => item.id),
      attachments: [],
      cards: [{
        id: 'card-1',
        kind: 'navigation',
        title: 'Suggestion',
        sourceContextIds,
        actions: [action],
      }],
    }],
  };
}

const navigateAction = (
  effect: AgentResultCardAction['effect'],
): AgentResultCardAction => ({ id: 'act-1', label: 'Model-authored label', effect });

const resolve = (conv: AgentConversation) =>
  resolveAgentNavigation(conv, 'msg-1', 'card-1', 'act-1');

describe('agent navigation allowlist', () => {
  it('mirrors POPOUT_SECTIONS in the main process exactly', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'main.ts'),
      'utf8',
    );
    const declared = /const POPOUT_SECTIONS = new Set\(\[([\s\S]*?)\]\)/.exec(source);
    expect(declared).not.toBeNull();
    const sections = [...(declared?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((match) => match[1]);
    expect(sections.length).toBeGreaterThan(0);
    expect([...AGENT_NAVIGABLE_SECTIONS].sort()).toEqual([...sections].sort());
  });

  it('refuses the desktop-only trinkets main also refuses', () => {
    expect(isAgentNavigableSection('note')).toBe(false);
    expect(isAgentNavigableSection('visualizer')).toBe(false);
    expect(isAgentNavigableSection('')).toBe(false);
    expect(isAgentNavigableSection('dictionary')).toBe(true);
    // A source app that is not a window at all. The media producers emit this.
    expect(isAgentNavigableSection('media')).toBe(false);
  });

  it('names every navigable section with a key English actually has', () => {
    const missing = AGENT_NAVIGABLE_SECTIONS
      .map((section) => AGENT_NAVIGATION_SECTION_LABEL_KEYS[section])
      .filter((key) => !definesKey(key));
    expect(missing).toEqual([]);
  });

  /**
   * The shell renders a failure as `t(\`agent.navigate.error.${code}\`)`, and a
   * template key is invisible to `tools/i18n-missing-key-check.cjs`. Without
   * this, adding a code would ship a raw key string to the surface and every
   * gate would still pass.
   */
  it('gives every failure code an English message', () => {
    const codes: AgentNavigationFailureCode[] = [
      'invalid-request',
      'conversation-not-found',
      'action-not-found',
      'not-navigable',
      'unknown-section',
      'stale-provenance',
      'busy',
      'open-failed',
      'store-failed',
      'bridge-unavailable',
    ];
    expect(codes.filter((code) => !definesKey(`agent.navigate.error.${code}`))).toEqual([]);
    // The catalog carries no message for a code the union does not have.
    const declared = [...englishCatalogSource.matchAll(/'agent\.navigate\.error\.([a-z-]+)':/g)]
      .map((match) => match[1]);
    expect(declared.sort()).toEqual([...codes].sort());
  });
});

describe('resolveAgentNavigation', () => {
  it('resolves a destination from the live route context, not from the stored effect', () => {
    const result = resolve(conversation(
      [routeContext()],
      navigateAction({ type: 'navigate', section: 'dictionary', page: 'entry/猫' }),
    ));
    expect(result).toEqual({
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
    });
  });

  it('resolves when the stored effect names no page, taking the page from live context', () => {
    const result = resolve(conversation(
      [routeContext()],
      navigateAction({ type: 'navigate', section: 'dictionary' }),
    ));
    expect(result).toEqual({
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
    });
  });

  it('fails closed when the stored page no longer matches the live route', () => {
    const result = resolve(conversation(
      [routeContext({ source: { app: 'dictionary', route: 'entry/犬' } })],
      navigateAction({ type: 'navigate', section: 'dictionary', page: 'entry/猫' }),
    ));
    expect(result).toEqual({ ok: false, code: 'stale-provenance' });
  });

  it('fails closed when the provenance context is gone from the shelf', () => {
    const result = resolve(conversation(
      [],
      navigateAction({ type: 'navigate', section: 'dictionary', page: 'entry/猫' }),
    ));
    expect(result).toEqual({ ok: false, code: 'stale-provenance' });
  });

  it('fails closed when the card declares no provenance at all', () => {
    const result = resolve(conversation(
      [routeContext()],
      navigateAction({ type: 'navigate', section: 'dictionary' }),
      [],
    ));
    expect(result).toEqual({ ok: false, code: 'stale-provenance' });
  });

  it('refuses a live context that describes material rather than a place', () => {
    const result = resolve(conversation(
      [routeContext({ kind: 'dictionary-entry' })],
      navigateAction({ type: 'navigate', section: 'dictionary', page: 'entry/猫' }),
    ));
    expect(result).toEqual({ ok: false, code: 'stale-provenance' });
  });

  it('refuses a section that is not on the allowlist even with live provenance', () => {
    const result = resolve(conversation(
      [routeContext({ source: { app: 'admin', route: 'delete-everything' } })],
      navigateAction({ type: 'navigate', section: 'admin', page: 'delete-everything' }),
    ));
    expect(result).toEqual({ ok: false, code: 'unknown-section' });
  });

  /**
   * A section IS a destination. `popOut` takes a section and nothing else, so a
   * route context that names only the app names somewhere real — which is the
   * shape every production producer emits, since surfaces have no sub-pages.
   */
  it('resolves a section-only destination when neither side claims a page', () => {
    const result = resolve(conversation(
      [routeContext({ source: { app: 'dictionary' } })],
      navigateAction({ type: 'navigate', section: 'dictionary' }),
    ));
    expect(result).toEqual({ ok: true, destination: { section: 'dictionary' } });
  });

  it('still refuses a stored page whose live context has since lost its route', () => {
    const result = resolve(conversation(
      [routeContext({ source: { app: 'dictionary' } })],
      navigateAction({ type: 'navigate', section: 'dictionary', page: 'entry/猫' }),
    ));
    expect(result).toEqual({ ok: false, code: 'stale-provenance' });
  });

  it('refuses an effect that is not a navigation at all', () => {
    const result = resolve(conversation(
      [routeContext()],
      { id: 'act-1', label: 'Open', effect: { type: 'open-context', contextId: 'ctx-route' } },
    ));
    expect(result).toEqual({ ok: false, code: 'not-navigable' });
  });

  it('refuses an unknown message, card or action', () => {
    const conv = conversation(
      [routeContext()],
      navigateAction({ type: 'navigate', section: 'dictionary' }),
    );
    expect(resolveAgentNavigation(conv, 'msg-9', 'card-1', 'act-1'))
      .toEqual({ ok: false, code: 'action-not-found' });
    expect(resolveAgentNavigation(conv, 'msg-1', 'card-9', 'act-1'))
      .toEqual({ ok: false, code: 'action-not-found' });
    expect(resolveAgentNavigation(conv, 'msg-1', 'card-1', 'act-9'))
      .toEqual({ ok: false, code: 'action-not-found' });
  });

  it('ignores display-only hints on the effect when choosing the destination', () => {
    const result = resolve(conversation(
      [routeContext()],
      navigateAction({
        type: 'navigate',
        section: 'dictionary',
        page: 'entry/猫',
        controlId: 'settings-delete-all',
        highlight: true,
      }),
    ));
    expect(result).toEqual({
      ok: true,
      destination: { section: 'dictionary', page: 'entry/猫' },
    });
  });
});

describe('agentNavigationReduce', () => {
  const destination = { section: 'dictionary' as const, page: 'entry/猫' };
  const review = (): AgentNavigationRun =>
    agentNavigationReduce(AGENT_NAVIGATION_IDLE, { type: 'review', destination });

  it('counts an approval as an attempt and only from review', () => {
    expect(review()).toEqual({ status: 'review', attempts: 0, destination });
    const running = agentNavigationReduce(review(), { type: 'approve' });
    expect(running).toEqual({ status: 'running', attempts: 1, destination });
    // Approving something that is not under review changes nothing.
    expect(agentNavigationReduce(AGENT_NAVIGATION_IDLE, { type: 'approve' }))
      .toEqual(AGENT_NAVIGATION_IDLE);
  });

  it('cancels only from review, never from a run already in flight', () => {
    expect(agentNavigationReduce(review(), { type: 'cancel' }))
      .toEqual({ status: 'cancelled', attempts: 0 });
    const running = agentNavigationReduce(review(), { type: 'approve' });
    expect(agentNavigationReduce(running, { type: 'cancel' })).toEqual(running);
  });

  it('records success and failure only for a running approval', () => {
    const running = agentNavigationReduce(review(), { type: 'approve' });
    expect(agentNavigationReduce(running, { type: 'succeeded' }))
      .toEqual({ status: 'succeeded', attempts: 1, destination });
    expect(agentNavigationReduce(running, { type: 'failed', code: 'open-failed' }))
      .toEqual({ status: 'failed', attempts: 1, code: 'open-failed' });
    expect(agentNavigationReduce(review(), { type: 'succeeded' })).toEqual(review());
  });

  it('keeps the attempt count across a retry, so a second approval is visible', () => {
    const failed = agentNavigationReduce(
      agentNavigationReduce(review(), { type: 'approve' }),
      { type: 'failed', code: 'open-failed' },
    );
    const retried = agentNavigationReduce(failed, { type: 'retry' });
    expect(retried).toEqual({ status: 'idle', attempts: 1 });
    const second = agentNavigationReduce(
      agentNavigationReduce(retried, { type: 'review', destination }),
      { type: 'approve' },
    );
    expect(second).toEqual({ status: 'running', attempts: 2, destination });
  });

  it('turns a refusal into a failure without ever entering running', () => {
    expect(agentNavigationReduce(AGENT_NAVIGATION_IDLE, {
      type: 'refused',
      code: 'stale-provenance',
    })).toEqual({ status: 'failed', attempts: 0, code: 'stale-provenance' });
  });

  it('refuses to re-review or refuse a run that is in flight', () => {
    const running = agentNavigationReduce(review(), { type: 'approve' });
    expect(agentNavigationReduce(running, { type: 'review', destination })).toEqual(running);
    expect(agentNavigationReduce(running, { type: 'refused', code: 'busy' })).toEqual(running);
  });
});
