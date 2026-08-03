/*
 * src/shared/extensionContract.ts — bound to the things it claims to describe.
 *
 * A hand-written contract that nothing checks is a comment, and comments are
 * not evidence. Every table in that module is asserted here against its live
 * source, preferring a runtime observation to a source read wherever the
 * harness can actually reach the behaviour:
 *
 *   - command identities / categories / contexts → `COMMANDS`, evaluated out of
 *     extension/shared.js in a vm, not parsed out of its text;
 *   - every identity is *dispatchable* → each id is sent through the real
 *     `run-command` entry point and must not come back "Unknown command" /
 *     "Unhandled command" (background.js's switch ends in a throwing default,
 *     so this is a real check, not a tautology);
 *   - queue kinds → replayed through an actual flush, asserting the URLs
 *     background.js really fetched;
 *   - bridge routes → the `pathname === '…'` comparisons in
 *     src/main/extensionServer.ts.
 *
 * `QUEUE_ENDPOINTS` and `PAGE_SIDE_COMMANDS` are function-scoped once
 * `evaluateBackground` wraps the module body in an IIFE, so they cannot be read
 * out of the sandbox — `evalInSandbox` throws on them. extensionRetryQueue.test.ts
 * hit the same wall and settled on parsing them out of the source; this file
 * does the same for the declaration, then backs it with the runtime flush above
 * so the claim does not rest on a regex alone.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXTENSION_BRIDGE_ROUTES,
  EXTENSION_COMMANDS,
  EXTENSION_COMMAND_CATEGORIES,
  EXTENSION_COMMAND_CONTEXTS,
  EXTENSION_COMMAND_IDS,
  EXTENSION_CONTRACT_VERSION,
  EXTENSION_QUEUE_KINDS,
  EXTENSION_QUEUE_ROUTES,
  extensionCommand,
  extensionCommandsByCategory,
  extensionContractManifest,
  extensionObservableCommands,
  extensionQueueRoute,
  isExtensionBridgeRoute,
  isExtensionCommandId,
  isExtensionQueueKind,
} from '../extensionContract';
import {
  bootBackground,
  loadExtensionSandbox,
  readExtensionFile,
  type JpStudySharedModule,
} from './extensionHarness';

const shared: JpStudySharedModule = loadExtensionSandbox({ files: ['shared.js'] }).jpStudyShared;

const SERVER_SOURCE = readFileSync(
  path.join(__dirname, '..', '..', 'main', 'extensionServer.ts'),
  'utf8',
);

/** Every `/v1/*` route the bridge server compares a pathname against. */
function serverRoutes(): string[] {
  const found = new Set<string>();
  for (const m of SERVER_SOURCE.matchAll(/pathname === '(\/v1\/[^']+)'/g)) found.add(m[1]);
  if (found.size === 0) throw new Error('extensionServer.ts no longer routes on `pathname === ...`');
  return [...found].sort();
}

/** `PAGE_SIDE_COMMANDS` — function-scoped, so read from source (see header). */
function declaredPageSideCommands(): string[] {
  const source = readExtensionFile('background.js');
  const block = /const PAGE_SIDE_COMMANDS = new Set\(\[([\s\S]*?)\n\]\);/.exec(source);
  if (!block) throw new Error('background.js no longer declares PAGE_SIDE_COMMANDS as a Set literal');
  return [...block[1].matchAll(/'([\w.]+)'/g)].map((m) => m[1]);
}

describe('extension contract — identities match the live registry', () => {
  it('lists exactly the commands the extension registers, in registry order', () => {
    expect([...EXTENSION_COMMAND_IDS]).toEqual(shared.COMMANDS.map((c) => c.id));
  });

  it('agrees with the registry on every command category and context', () => {
    for (const contract of EXTENSION_COMMANDS) {
      const live = shared.COMMANDS.find((c) => c.id === contract.id);
      expect(live, contract.id).toBeTruthy();
      expect(contract.category, contract.id).toBe(live!.category);
      expect([...contract.contexts], contract.id).toEqual(live!.contexts);
    }
  });

  it('enumerates every category and context the registry actually uses', () => {
    expect([...EXTENSION_COMMAND_CATEGORIES].sort()).toEqual(
      [...new Set(shared.COMMANDS.map((c) => c.category))].sort(),
    );
    expect([...EXTENSION_COMMAND_CONTEXTS].sort()).toEqual(
      [...new Set(shared.COMMANDS.flatMap((c) => c.contexts))].sort(),
    );
  });

  it('keeps every legacy alias pointing at a command the contract still names', () => {
    // A stored v1 wheel layout resolves through COMMAND_ALIASES. An alias aimed
    // at a deleted command throws "Unknown command" at the user, on the wheel
    // press, and nowhere earlier.
    for (const [legacy, target] of Object.entries(shared.COMMAND_ALIASES)) {
      expect(isExtensionCommandId(target), `${legacy} → ${target}`).toBe(true);
    }
  });

  it('resolves every contract id through the extension resolver', () => {
    for (const id of EXTENSION_COMMAND_IDS) {
      expect(shared.resolveCommandId(id), id).toBe(id);
      expect(shared.getCommand(id), id).toBeTruthy();
    }
  });
});

describe('extension contract — every identity is really dispatchable', () => {
  it('is never rejected as unknown or unhandled by background.js', async () => {
    // runCommand() ends in `default: throw new Error('Unhandled command: …')`,
    // and resolveCommandId() returning null throws 'Unknown command: …'. Those
    // two strings are the only failures this asserts on: a command may still
    // fail for want of a selection or a paired app, which is not the claim here.
    const h = bootBackground();
    for (const id of EXTENSION_COMMAND_IDS) {
      const res = (await h.send({ type: 'run-command', command: id })) as {
        ok?: boolean;
        error?: string;
      };
      const error = String(res?.error ?? '');
      expect(error, id).not.toMatch(/^Unknown command/);
      expect(error, id).not.toMatch(/^Unhandled command/);
    }
  });
});

describe('extension contract — pageSide reflects real dispatch', () => {
  it('marks exactly the commands background.js forwards to the content script', () => {
    expect(
      EXTENSION_COMMANDS.filter((c) => c.pageSide)
        .map((c) => c.id)
        .sort(),
    ).toEqual([...declaredPageSideCommands()].sort());
  });

  it('sends a page-side command to the tab and not to the bridge', async () => {
    const h = bootBackground();
    await h.send({ type: 'run-command', command: 'reader.highlight' });
    expect(h.sentToTab.map((s) => s.type)).toContain('jp-highlight-mode-toggle');
    // Health probes bypass apiFetch and may fire independently; the claim is
    // that no *action* route was called, not that the socket stayed silent.
    const acted = h.fetches
      .map((f) => new URL(f.url).pathname)
      .filter((p) => p !== '/v1/health' && p !== '/health');
    expect(acted).toEqual([]);
  });

  it('treats the complement as the observable set', () => {
    const pageSide = new Set(declaredPageSideCommands());
    const observable = extensionObservableCommands().map((c) => c.id);
    for (const id of observable) expect(pageSide.has(id), id).toBe(false);
    expect(observable.length + pageSide.size).toBe(EXTENSION_COMMAND_IDS.length);
  });
});

describe('extension contract — events match the retry queue at runtime', () => {
  it('replays every declared kind to exactly the route the contract names', async () => {
    // The strong form: not "the source says so" but "background.js fetched it".
    const h = bootBackground({ responder: () => ({ status: 200, json: { ok: true } }) });
    h.setQueue(EXTENSION_QUEUE_KINDS.map((kind) => ({ kind, payload: { marker: kind } })));
    const res = (await h.send({ type: 'flush' })) as {
      flushed: number;
      left: number;
      dropped: number;
    };
    expect(res).toEqual({ flushed: EXTENSION_QUEUE_KINDS.length, left: 0, dropped: 0 });
    expect(h.fetches.map((f) => new URL(f.url).pathname)).toEqual(
      EXTENSION_QUEUE_KINDS.map((k) => EXTENSION_QUEUE_ROUTES[k]),
    );
  });

  it('holds no kind background.js would drop as unrecognised', async () => {
    // A kind in the contract that background.js cannot replay would strand
    // whatever users already have queued under it.
    const h = bootBackground({ responder: () => ({ status: 200, json: { ok: true } }) });
    h.setQueue(EXTENSION_QUEUE_KINDS.map((kind) => ({ kind, payload: {} })));
    const res = (await h.send({ type: 'flush' })) as { dropped: number };
    expect(res.dropped).toBe(0);
  });

  it('routes every queue kind to a route the contract also declares', () => {
    for (const kind of EXTENSION_QUEUE_KINDS) {
      expect(isExtensionBridgeRoute(extensionQueueRoute(kind)), kind).toBe(true);
    }
  });
});

describe('extension contract — routes match the bridge server', () => {
  it('declares exactly the /v1 routes the server answers', () => {
    expect([...EXTENSION_BRIDGE_ROUTES].sort()).toEqual(serverRoutes());
  });

  it('finds a real handler for each, not a mention in a comment', () => {
    // /v1/sentence-analysis-v2 appears in background.js only inside a docblock;
    // a substring search would have called it a route. Anything asserted here
    // has to be an actual pathname comparison.
    for (const route of EXTENSION_BRIDGE_ROUTES) {
      expect(SERVER_SOURCE.includes(`pathname === '${route}'`), route).toBe(true);
    }
  });
});

describe('extension contract — guards and helpers', () => {
  it('rejects ids and kinds it does not know', () => {
    expect(isExtensionCommandId('save.word')).toBe(true);
    expect(isExtensionCommandId('mine')).toBe(false); // legacy alias, not an id
    expect(isExtensionCommandId(undefined)).toBe(false);
    expect(isExtensionQueueKind('audio-save')).toBe(true);
    expect(isExtensionQueueKind('epub')).toBe(false); // dropped legacy kind
    expect(isExtensionQueueKind(42)).toBe(false);
    expect(isExtensionBridgeRoute('/v1/mine')).toBe(true);
    expect(isExtensionBridgeRoute('/v1/nope')).toBe(false);
  });

  it('looks a command up by id and by category', () => {
    expect(extensionCommand('capture.manga').contexts).toEqual(['page:manga']);
    expect(extensionCommandsByCategory('card').map((c) => c.id)).toEqual(['card.create']);
    expect(extensionCommandsByCategory('save').map((c) => c.id)).toEqual([
      'save.word',
      'save.sentence',
      'clipboard.send',
    ]);
  });

  it('publishes a manifest that carries both identity tables', () => {
    const manifest = extensionContractManifest();
    expect(manifest.contractVersion).toBe(EXTENSION_CONTRACT_VERSION);
    expect(manifest.commands).toEqual([...EXTENSION_COMMAND_IDS]);
    expect(manifest.queueKinds).toEqual([...EXTENSION_QUEUE_KINDS]);
  });

  it('has no duplicate entries in any table', () => {
    for (const table of [EXTENSION_COMMAND_IDS, EXTENSION_QUEUE_KINDS, EXTENSION_BRIDGE_ROUTES]) {
      expect(new Set(table).size).toBe(table.length);
    }
  });
});
