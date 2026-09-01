/**
 * Shared contract for the Chrome-extension surface — Phase 8 item 4.
 *
 * `docs/migration/FEATURE_PARITY_LEDGER.md:106-110` defers Chrome-extension
 * parity on one explicit condition: *"Their identities and events must exist in
 * the shared contracts from Phase 2 so promotion later is additive."*
 *
 * Before this module, they did not. The extension's 20 command identities lived
 * only in `extension/shared.js` (plain JavaScript, reachable from TypeScript
 * only by loading it into a `vm` sandbox inside a test) and its 10 retry-queue
 * kinds only in `extension/background.js`. Nothing under `src/shared/**` could
 * *name* an extension capability, so any later app-side promotion would have
 * had to re-derive the whole surface by reading the extension — a rewrite, not
 * an addition. That is precisely the outcome the ledger sentence exists to
 * prevent.
 *
 * This module is a **contract, not an implementation**. It deliberately does
 * not dispatch, fetch, or own behaviour — the extension keeps doing that. Its
 * only job is to make the surface nameable and type-checkable from the app
 * side, and to fail a test the moment the extension and the app disagree about
 * what exists. `src/shared/__tests__/extensionContract.test.ts` binds every
 * table below to its live source (`extension/shared.js`,
 * `extension/background.js`, `src/main/extensionServer.ts`); a command added to
 * the extension and not to this file is a test failure, not a silent drift.
 *
 * Scope note: page-kind / content-category / mine-mode were already contracted
 * by `./extensionCapture` and are not duplicated here. Bridge transport (port,
 * bearer token) is contracted by `./inboxMeta`. This module adds the layer
 * neither covers: *which actions exist* and *which durable events they emit*.
 *
 * No dependencies by design — main process, renderer and tests all import it.
 */

/** Bumped when a command identity or queue kind is added or removed. */
export const EXTENSION_CONTRACT_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Identities — what the user can invoke                                       */
/* -------------------------------------------------------------------------- */

/** Grouping used by the wheel, the More menu and the settings page. */
export const EXTENSION_COMMAND_CATEGORIES = [
  'read',
  'save',
  'card',
  'capture',
  'page',
  'app',
] as const;
export type ExtensionCommandCategory = (typeof EXTENSION_COMMAND_CATEGORIES)[number];

/**
 * Where a command is offered. `page:*` variants are page-restricted: the wheel
 * renders them disabled off that page kind and the More menu filters them out.
 */
export const EXTENSION_COMMAND_CONTEXTS = [
  'page',
  'selection',
  'page:manga',
  'page:youtube',
] as const;
export type ExtensionCommandContext = (typeof EXTENSION_COMMAND_CONTEXTS)[number];

/**
 * Every command identity the extension dispatches on, in registry order.
 *
 * These strings are a compatibility surface, not labels: stored wheel layouts
 * and user keyboard bindings are persisted against them, so renaming one is a
 * breaking change for existing users. Old ids are not listed here — they are
 * mapped forward by `COMMAND_ALIASES` in `extension/shared.js`.
 */
export const EXTENSION_COMMAND_IDS = [
  'lookup.selection',
  'save.word',
  'save.sentence',
  'card.create',
  'capture.page',
  'capture.ocr',
  'capture.audio.record',
  'capture.audio.save',
  'capture.manga',
  'media.download',
  'media.transcribe',
  'clipboard.send',
  'translate.selection',
  'grammar.match',
  'reader.theme',
  'reader.highlight',
  'reader.knownTint',
  'tabs.picker',
  'app.open',
  'settings.special',
  'wheel.more',
] as const;
export type ExtensionCommandId = (typeof EXTENSION_COMMAND_IDS)[number];

export interface ExtensionCommandContract {
  readonly id: ExtensionCommandId;
  readonly category: ExtensionCommandCategory;
  readonly contexts: readonly ExtensionCommandContext[];
  /**
   * True when the command runs inside the page (content script) and produces no
   * bridge event — the app cannot observe it happening. Page-side commands are
   * the ones a future in-app promotion would have to reimplement rather than
   * subscribe to.
   */
  readonly pageSide: boolean;
}

/**
 * Identity → shape. Mirrors `COMMANDS` in `extension/shared.js:272-473`;
 * the contract test asserts the two agree field by field.
 */
export const EXTENSION_COMMANDS: readonly ExtensionCommandContract[] = [
  { id: 'lookup.selection', category: 'read', contexts: ['page', 'selection'], pageSide: true },
  { id: 'save.word', category: 'save', contexts: ['selection'], pageSide: false },
  { id: 'save.sentence', category: 'save', contexts: ['selection'], pageSide: false },
  { id: 'card.create', category: 'card', contexts: ['selection'], pageSide: false },
  { id: 'capture.page', category: 'capture', contexts: ['page'], pageSide: false },
  { id: 'capture.ocr', category: 'capture', contexts: ['page'], pageSide: true },
  { id: 'capture.audio.record', category: 'capture', contexts: ['page'], pageSide: true },
  { id: 'capture.audio.save', category: 'capture', contexts: ['page'], pageSide: false },
  { id: 'capture.manga', category: 'capture', contexts: ['page:manga'], pageSide: false },
  { id: 'media.download', category: 'capture', contexts: ['page:youtube'], pageSide: false },
  { id: 'media.transcribe', category: 'capture', contexts: ['page:youtube'], pageSide: false },
  { id: 'clipboard.send', category: 'save', contexts: ['selection'], pageSide: false },
  { id: 'translate.selection', category: 'read', contexts: ['selection'], pageSide: true },
  { id: 'grammar.match', category: 'read', contexts: ['selection'], pageSide: true },
  { id: 'reader.theme', category: 'page', contexts: ['page'], pageSide: true },
  { id: 'reader.highlight', category: 'page', contexts: ['page'], pageSide: true },
  { id: 'reader.knownTint', category: 'page', contexts: ['page'], pageSide: true },
  { id: 'tabs.picker', category: 'app', contexts: ['page'], pageSide: false },
  { id: 'app.open', category: 'app', contexts: ['page'], pageSide: false },
  { id: 'settings.special', category: 'app', contexts: ['page'], pageSide: false },
  { id: 'wheel.more', category: 'app', contexts: ['page'], pageSide: true },
];

/* -------------------------------------------------------------------------- */
/* Events — what survives a restart                                            */
/* -------------------------------------------------------------------------- */

/**
 * The durable event kinds. When the desktop app is unreachable the extension
 * parks the action in `chrome.storage.local` under these names and replays it
 * later, so a kind is a persisted value: dropping one strands whatever users
 * already have queued. `extension/background.js:213-223` refuses to replay a
 * kind it no longer recognises and counts it as a drop rather than losing it
 * silently — that path is exactly why this list has to be stable.
 */
export const EXTENSION_QUEUE_KINDS = [
  'inbox',
  'mine',
  'capture',
  'playlist',
  'video',
  'download',
  'clipboard',
  'audio-save',
  'manga-import',
  'immersion',
] as const;
export type ExtensionQueueKind = (typeof EXTENSION_QUEUE_KINDS)[number];

/**
 * Queue kind → bridge route it replays to.
 * Mirrors `QUEUE_ENDPOINTS` in `extension/background.js:213-223`.
 */
export const EXTENSION_QUEUE_ROUTES: Readonly<Record<ExtensionQueueKind, string>> = {
  inbox: '/v1/inbox',
  mine: '/v1/mine',
  capture: '/v1/capture',
  playlist: '/v1/playlist',
  video: '/v1/video',
  download: '/v1/download',
  clipboard: '/v1/clipboard',
  'audio-save': '/v1/audio/save',
  'manga-import': '/v1/manga-import',
  immersion: '/v1/immersion/visit',
};

/**
 * Every route the loopback bridge answers, as implemented by
 * `src/main/extensionServer.ts`. The contract test asserts each one is actually
 * reachable in that file, so a route deleted from the server without being
 * removed here fails rather than 404-ing at a user.
 */
export const EXTENSION_BRIDGE_ROUTES = [
  '/v1/extension-settings',
  '/v1/health',
  '/v1/page-kind',
  '/v1/page-context',
  '/v1/ocr',
  '/v1/ocr/status',
  '/v1/mine-info',
  '/v1/download',
  '/v1/download/status',
  // MINING gate 11. Two routes because a Whisper pass is minutes long: the POST
  // answers with a named refusal or `queued`, and the GET is where the cue
  // count the gate asks for actually arrives.
  '/v1/transcribe',
  '/v1/transcribe/status',
  '/v1/inbox',
  '/v1/mine',
  '/v1/capture',
  '/v1/manga-import',
  '/v1/audio/save',
  '/v1/clipboard',
  '/v1/ui/open',
  '/v1/known-levels',
  '/v1/known-level',
  '/v1/comprehensibility',
  '/v1/grammar-match',
  '/v1/immersion/visit',
  '/v1/translate',
  '/v1/level-estimate',
  '/v1/lookup',
  '/v1/sentence-analysis',
  '/v1/sentence-analysis/prefs',
  '/v1/sentence-analysis/snapshot',
  '/v1/sentence-analysis/mine',
  '/v1/examples',
  '/v1/playlists/status',
  '/v1/playlist',
  '/v1/video',
] as const;
export type ExtensionBridgeRoute = (typeof EXTENSION_BRIDGE_ROUTES)[number];

/* -------------------------------------------------------------------------- */
/* Narrowing helpers                                                           */
/* -------------------------------------------------------------------------- */

const COMMAND_ID_SET: ReadonlySet<string> = new Set(EXTENSION_COMMAND_IDS);
const QUEUE_KIND_SET: ReadonlySet<string> = new Set(EXTENSION_QUEUE_KINDS);
const BRIDGE_ROUTE_SET: ReadonlySet<string> = new Set(EXTENSION_BRIDGE_ROUTES);

export function isExtensionCommandId(value: unknown): value is ExtensionCommandId {
  return typeof value === 'string' && COMMAND_ID_SET.has(value);
}

/** Guards replay of a persisted queue entry whose kind may predate this build. */
export function isExtensionQueueKind(value: unknown): value is ExtensionQueueKind {
  return typeof value === 'string' && QUEUE_KIND_SET.has(value);
}

export function isExtensionBridgeRoute(value: unknown): value is ExtensionBridgeRoute {
  return typeof value === 'string' && BRIDGE_ROUTE_SET.has(value);
}

export function extensionQueueRoute(kind: ExtensionQueueKind): string {
  return EXTENSION_QUEUE_ROUTES[kind];
}

export function extensionCommand(id: ExtensionCommandId): ExtensionCommandContract {
  const found = EXTENSION_COMMANDS.find((c) => c.id === id);
  // Unreachable for a well-typed caller; the queue guard exists for untyped input.
  if (!found) throw new Error(`Unknown extension command: ${id}`);
  return found;
}

export function extensionCommandsByCategory(
  category: ExtensionCommandCategory,
): readonly ExtensionCommandContract[] {
  return EXTENSION_COMMANDS.filter((c) => c.category === category);
}

/**
 * Commands that emit a bridge event the app can observe. The complement —
 * `pageSide: true` — is the set a future in-app promotion must reimplement
 * rather than subscribe to, which is the useful thing to know when planning one.
 */
export function extensionObservableCommands(): readonly ExtensionCommandContract[] {
  return EXTENSION_COMMANDS.filter((c) => !c.pageSide);
}

/** What `/v1/health` advertises so a client can feature-detect this build. */
export interface ExtensionContractManifest {
  readonly contractVersion: number;
  readonly commands: readonly string[];
  readonly queueKinds: readonly string[];
}

export function extensionContractManifest(): ExtensionContractManifest {
  return {
    contractVersion: EXTENSION_CONTRACT_VERSION,
    commands: EXTENSION_COMMAND_IDS,
    queueKinds: EXTENSION_QUEUE_KINDS,
  };
}
