/**
 * Permission-gated navigation: the allowlist, the resolver and the lifecycle.
 *
 * The Agent has been able to *suggest* a destination since the read-only
 * navigation card shipped. This module is what a suggestion has to survive
 * before anything opens, and it is deliberately three separate refusals rather
 * than one "is this allowed" predicate:
 *
 * 1. **The section must be on a hand-written allowlist.** Not "a string main
 *    accepts", not "a section the desktop knows about" — this list. It mirrors
 *    `POPOUT_SECTIONS` in `src/main.ts` and is asserted against it by
 *    `agentNavigation.test.ts`, so widening one without the other fails.
 * 2. **The destination is re-derived from live context, never read off the
 *    stored effect.** `resolveAgentNavigation` returns a destination built from
 *    the `AgentContextItem` still sitting on the conversation's shelf. A stored
 *    effect whose section, page, control or highlight no longer matches that item resolves to
 *    `stale-provenance` and opens nothing, so a card that was honest when it was
 *    written cannot become a wrong destination after the shelf moves on.
 * 3. **Approval is a separate argument from resolution.** Resolving is what the
 *    review step calls; it is side-effect free by construction, because opening
 *    lives in `main/agentNavigationIpc.ts` behind an explicit `approved` flag.
 *
 * A card produced from a *fresh question* rather than a hand-off swaps rule 2's
 * authority without weakening it: it carries the question it was looked up from,
 * and `resolveAgentNavigationQuery` in `agentNavigationIndex.ts` re-runs that
 * lookup against a static table at review and approval time. The stored effect
 * still has to agree in every coordinate, and the allowlist above still has the
 * last word — the only thing that changes is whether the destination is
 * re-derived from the context shelf or from the index.
 *
 * What a provider says never reaches any of this. The model authors message
 * text; `main/agentExecutionIpc.ts` authors the effect from context metadata,
 * and this module then refuses to trust even that unless live context still
 * agrees with it. A page/control link is executable only for a statically
 * registered Settings target; other apps retain their section-only behavior.
 */

import type { DesktopWinSection } from './desktop';
import {
  resolveAgentNavigationQuery,
  type AgentNavigationTranslatedTitles,
} from './agentNavigationIndex';
import {
  findUnambiguousAgentCardAction,
  type AgentConversation,
  type AgentNavigationEffect,
  type AgentResultCard,
} from './agentWorkspace';

/**
 * Every section the Agent may open, in the order `POPOUT_SECTIONS` lists them.
 *
 * `note` and `visualizer` are absent for the same reason main excludes them:
 * they are desktop-only trinkets with no window of their own, so "navigate
 * there" is not a thing that can succeed.
 */
export const AGENT_NAVIGABLE_SECTIONS: readonly DesktopWinSection[] = [
  'agent',
  'library',
  'novels',
  'reading',
  'dictionary',
  'grammar',
  'notebook',
  'translate',
  'player',
  'video',
  'music',
  'anki',
  'flashcards',
  'games',
  'stats',
  'resources',
  'city',
  'musicwidget',
  'immersion',
  'calendar',
  'settings',
  'youtube',
  'scraper',
  'files',
];

const NAVIGABLE = new Set<string>(AGENT_NAVIGABLE_SECTIONS);

/**
 * Settings deep links the Agent may offer. This is deliberately narrower than
 * arbitrary DOM ids: each control below is a stable SettingsCard coordinate
 * whose page already renders a visible `focusSettingId` highlight. Settings
 * validates this same registry again when the main process delivers the link.
 */
export const AGENT_SETTINGS_GUIDED_TARGETS = {
  home: [],
  appearance: [
    'appearance-preview', 'ui-language', 'blanc-mode', 'theme', 'accent',
    'typography', 'materials', 'app-border', 'pillarbox', 'custom-css',
  ],
  wallpaper: ['wallpaper', 'wallpaper-dim', 'rotation', 'mini-wallpaper'],
  atmosphere: [
    'living-layer', 'environment-preset', 'lighting', 'particles',
    'particle-size', 'snow-accumulation', 'weather', 'ambient-audio', 'achievements',
  ],
  companions: [
    'companions-leave-secret', 'companions', 'companion-activeness',
    'buddy-programmer', 'os-pets', 'trinkets',
  ],
  'desktop-layout': ['icons', 'icon-recommended', 'taskbar', 'start-menu', 'session'],
  shortcuts: ['os-hotkey', 'global-lookup', 'shortcuts'],
  mini: ['mini-enable', 'mini-apps', 'mini-routines', 'mini-look'],
  lockscreen: ['lockscreen-enable', 'lockscreen-pin', 'lockscreen-tint'],
  study: [
    'focus-mode', 'focus-lock', 'focus-default-tab', 'focus-distractions',
    'focus-auto-enter', 'level', 'game-arena', 'profile', 'dictionary',
    'system-dictionary', 'ai-analysis', 'reading-lens', 'study-language',
    'study-language-setup', 'extension-bridge',
  ],
  'profile-rules': ['profile-rules'],
  reading: ['reading'],
  transcription: ['whisper'],
  scraper: [],
  visualizer: ['visualizer', 'lyrics'],
  special: [
    'blanc-mode', 'secret-os-leave', 'special-locked', 'wired-archive',
    'wired-finding-terminal', 'wired-arcade', 'aero-gadget-lab', 'aero-arcade',
  ],
  monitors: ['monitors-list', 'monitors-layout-remap', 'monitors-simulated', 'monitors-reset'],
  'file-drops': ['filedrop-auto', 'filedrop-overrides', 'filedrop-undo', 'filedrop-reset'],
  'api-keys': [],
  display: [
    'window-chrome', 'borderless', 'zoom', 'base-font', 'contrast', 'night-light',
    'brightness-sat', 'color-filter', 'transparency', 'focus-ring', 'scrollbars',
    'pointer', 'animation-level', 'reduce-motion',
  ],
  motion: ['motion-mode', 'motion-velocity', 'motion-particles', 'motion-companion-weight'],
  storage: ['storage-models'],
  memory: [
    'memory', 'system-memory', 'storage-usage', 'storage-inventory',
    'agent-memory', 'agent-history', 'backup', 'clear-data', 'factory-reset',
  ],
  help: [],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type AgentSettingsPage = keyof typeof AGENT_SETTINGS_GUIDED_TARGETS;

export function isAgentSettingsPage(value: unknown): value is AgentSettingsPage {
  return typeof value === 'string' && Object.hasOwn(AGENT_SETTINGS_GUIDED_TARGETS, value);
}

export function isAgentSettingsControl(page: AgentSettingsPage, value: unknown): value is string {
  return typeof value === 'string'
    && (AGENT_SETTINGS_GUIDED_TARGETS[page] as readonly string[]).includes(value);
}

export function isAgentNavigableSection(value: unknown): value is DesktopWinSection {
  return typeof value === 'string' && NAVIGABLE.has(value);
}

/**
 * The i18n key naming each destination, resolved by the consumer at render time
 * rather than here (CLAUDE.md §7 — this is module-level data and cannot call
 * `t()`).
 *
 * These reuse the command palette's own section labels wherever one exists: the
 * palette already names these places, and a second set of names for the same
 * windows would be free to drift. A review step that says "Open Dictionary"
 * while the palette says something else is exactly the mismatch that makes an
 * approval prompt untrustworthy.
 */
export const AGENT_NAVIGATION_SECTION_LABEL_KEYS: Record<DesktopWinSection, string> = {
  agent: 'palette.section.agent',
  library: 'palette.section.library',
  novels: 'palette.section.novels',
  reading: 'palette.section.reading',
  dictionary: 'palette.section.dictionary',
  grammar: 'palette.section.grammar',
  notebook: 'palette.section.notebook',
  translate: 'palette.section.translate',
  player: 'palette.section.player',
  video: 'palette.section.video',
  music: 'palette.section.music',
  anki: 'palette.section.anki',
  flashcards: 'palette.section.flashcards',
  games: 'appShell.popout.games',
  stats: 'palette.section.stats',
  resources: 'palette.section.resources',
  city: 'palette.section.city',
  musicwidget: 'settings.mini.app.musicwidget',
  immersion: 'palette.section.immersion',
  calendar: 'palette.section.calendar',
  settings: 'palette.section.settings',
  youtube: 'palette.section.youtube',
  scraper: 'palette.section.scraper',
  files: 'palette.section.files',
  // Present so the record stays exhaustive over `DesktopWinSection`; neither is
  // navigable, so neither key is ever resolved.
  note: 'palette.section.notebook',
  visualizer: 'palette.section.music',
};

export type AgentNavigationFailureCode =
  | 'invalid-request'
  | 'conversation-not-found'
  | 'action-not-found'
  | 'not-navigable'
  | 'unknown-section'
  | 'stale-provenance'
  | 'busy'
  | 'open-failed'
  | 'store-failed'
  | 'bridge-unavailable';

export interface AgentNavigationDestination {
  section: DesktopWinSection;
  /** Exact Settings page re-derived from live route provenance. */
  page?: string;
  /** Exact registered Settings control re-derived from live route provenance. */
  controlId?: string;
  /** Present only for a control the Settings surface can visibly highlight. */
  highlight?: true;
}

/**
 * Runtime validation shared by resolution, the IPC result boundary and the
 * Settings renderer. Whole-section targets stay valid for every navigable app;
 * page/control targets are intentionally limited to the typed Settings bridge.
 */
export function isAgentNavigationDestination(
  value: unknown,
): value is AgentNavigationDestination {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  if (!isAgentNavigableSection(raw.section)) return false;
  const page = typeof raw.page === 'string' && raw.page ? raw.page : undefined;
  const controlId = typeof raw.controlId === 'string' && raw.controlId
    ? raw.controlId
    : undefined;
  const highlight = raw.highlight === true ? true : undefined;
  if (raw.page !== undefined && page === undefined) return false;
  if (raw.controlId !== undefined && controlId === undefined) return false;
  if (raw.highlight !== undefined && highlight === undefined) return false;
  if (!controlId && !highlight && raw.section !== 'settings') return true;
  if (raw.section !== 'settings' || !page || !isAgentSettingsPage(page)) return false;
  if (!controlId) return highlight === undefined;
  return highlight === true && isAgentSettingsControl(page, controlId);
}

export type AgentNavigationResolution =
  | { ok: true; destination: AgentNavigationDestination }
  | { ok: false; code: AgentNavigationFailureCode };

function navigationEffect(
  conversation: AgentConversation,
  messageId: string,
  cardId: string,
  actionId: string,
): { effect: AgentNavigationEffect; card: AgentResultCard } | AgentNavigationFailureCode {
  const coordinate = findUnambiguousAgentCardAction(conversation, messageId, cardId, actionId);
  if (!coordinate) return 'action-not-found';
  if (coordinate.action.effect.type !== 'navigate') return 'not-navigable';
  // Provenance is the card's, not the action's: an action with no declared
  // source has nothing to check against and must not fall through to the
  // shelf-wide search below. An index-resolved card is the one exception — its
  // provenance is the stored question plus the static table, and it is re-derived
  // by `indexDestination` instead.
  if (coordinate.card.sourceContextIds.length === 0 && !coordinate.action.effect.query) {
    return 'stale-provenance';
  }
  return { effect: coordinate.action.effect, card: coordinate.card };
}

/**
 * Resolves one stored navigation action against the conversation as it is *now*.
 *
 * Pure and side-effect free — the review step and the approved run both call it,
 * and the only difference between them is what the caller does afterwards.
 */
export function resolveAgentNavigation(
  conversation: AgentConversation,
  messageId: string,
  cardId: string,
  actionId: string,
  /**
   * Translated titles for an index-resolved card, so a question asked in another
   * language resolves. Whatever a caller passes here it must pass *identically*
   * at review and at approval: the re-derivation below demands the stored effect
   * still agree in every coordinate, so a set that changed between the two would
   * read as tampering and refuse.
   */
  titles?: AgentNavigationTranslatedTitles,
): AgentNavigationResolution {
  const result = navigationEffect(conversation, messageId, cardId, actionId);
  if (typeof result === 'string') return { ok: false, code: result };
  const { effect, card } = result;
  if (!isAgentNavigableSection(effect.section)) {
    return { ok: false, code: 'unknown-section' };
  }
  // An index-resolved card answers a question the conversation asked, not a
  // place it was handed. Its check is the same shape as the provenance one
  // below — re-derive, then require the stored effect to agree in every
  // coordinate — with the static table standing in for the context shelf. It is
  // deliberately checked *first*: a card carrying a query is an index card, and
  // must never be able to borrow an unrelated route item to authorize itself.
  if (effect.query) {
    const answer = resolveAgentNavigationQuery(effect.query, undefined, titles);
    if (!answer) return { ok: false, code: 'stale-provenance' };
    if (answer.section !== effect.section) return { ok: false, code: 'stale-provenance' };
    if (answer.page !== effect.page) return { ok: false, code: 'stale-provenance' };
    if (answer.controlId !== effect.controlId) return { ok: false, code: 'stale-provenance' };
    const effectHighlight = effect.highlight === true ? true : undefined;
    if (answer.highlight !== effectHighlight) return { ok: false, code: 'stale-provenance' };
    const destination: AgentNavigationDestination = {
      section: answer.section,
      ...(answer.page ? { page: answer.page } : {}),
      ...(answer.controlId ? { controlId: answer.controlId } : {}),
      ...(answer.highlight ? { highlight: true } : {}),
    };
    // The allowlist still has the last word. The index is hand-written, but so
    // was every other list that has ever drifted from the surface it names.
    if (!isAgentNavigationDestination(destination)) {
      return { ok: false, code: 'unknown-section' };
    }
    return { ok: true, destination };
  }
  for (const contextId of card.sourceContextIds) {
    const item = conversation.context.find((entry) => entry.id === contextId);
    // Only a live `route` context authorizes navigation. A dictionary entry or a
    // subtitle line describes material, not a place, and a card grounded in one
    // has no business opening a window.
    if (!item || item.kind !== 'route') continue;
    if (item.source.app !== effect.section) continue;
    // Every coordinate must match in both directions. Treating an omitted
    // stored field as "take whatever is live" would let a page/control be added
    // after review without requiring a second approval.
    if (effect.page !== item.source.route) continue;
    if (effect.controlId !== item.source.controlId) continue;
    const effectHighlight = effect.highlight === true ? true : undefined;
    const liveHighlight = item.source.highlight === true ? true : undefined;
    if (effectHighlight !== liveHighlight) continue;
    const destination: AgentNavigationDestination = {
      section: effect.section,
      ...(item.source.route ? { page: item.source.route } : {}),
      ...(item.source.controlId ? { controlId: item.source.controlId } : {}),
      ...(liveHighlight ? { highlight: true } : {}),
    };
    if (!isAgentNavigationDestination(destination)) continue;
    return {
      ok: true,
      // Built from the live item on purpose. The stored effect got this far by
      // matching it, so the two are equal here — but reading the live one is
      // what keeps that true if this function is ever loosened. A section with
      // no sub-page is a complete destination: main opens sections.
      destination,
    };
  }
  return { ok: false, code: 'stale-provenance' };
}

/* ---------- Lifecycle ----------------------------------------------------- */

export type AgentNavigationStatus =
  | 'idle'
  | 'review'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface AgentNavigationRun {
  status: AgentNavigationStatus;
  /** Approvals granted so far. A retry is a second approval, not a free redo. */
  attempts: number;
  destination?: AgentNavigationDestination;
  code?: AgentNavigationFailureCode;
}

export type AgentNavigationEvent =
  | { type: 'review'; destination: AgentNavigationDestination }
  | { type: 'refused'; code: AgentNavigationFailureCode }
  | { type: 'approve' }
  | { type: 'cancel' }
  | { type: 'succeeded' }
  | { type: 'failed'; code: AgentNavigationFailureCode }
  | { type: 'retry' }
  | { type: 'dismiss' };

export const AGENT_NAVIGATION_IDLE: AgentNavigationRun = { status: 'idle', attempts: 0 };

/**
 * The whole permitted lifecycle, as one total function.
 *
 * `running` accepts neither `cancel` nor `approve`. A window open is already in
 * flight at that point and this process cannot un-open it, so offering a cancel
 * there would be a button that claims to stop something it does not stop —
 * the failure mode this gate exists to prevent. Cancel belongs to `review`,
 * which is the state where nothing has happened yet.
 */
export function agentNavigationReduce(
  run: AgentNavigationRun,
  event: AgentNavigationEvent,
): AgentNavigationRun {
  switch (event.type) {
    case 'review':
      return run.status === 'running'
        ? run
        : { status: 'review', attempts: run.attempts, destination: event.destination };
    case 'refused':
      return run.status === 'running'
        ? run
        : { status: 'failed', attempts: run.attempts, code: event.code };
    case 'approve':
      return run.status === 'review'
        ? { status: 'running', attempts: run.attempts + 1, ...(run.destination ? { destination: run.destination } : {}) }
        : run;
    case 'cancel':
      return run.status === 'review'
        ? { status: 'cancelled', attempts: run.attempts }
        : run;
    case 'succeeded':
      return run.status === 'running'
        ? { status: 'succeeded', attempts: run.attempts, ...(run.destination ? { destination: run.destination } : {}) }
        : run;
    case 'failed':
      return run.status === 'running'
        ? { status: 'failed', attempts: run.attempts, code: event.code }
        : run;
    case 'retry':
      // Back to review rather than straight to running: a second attempt is a
      // second approval, and the destination is re-resolved before it is shown.
      return run.status === 'failed' || run.status === 'cancelled'
        ? { status: 'idle', attempts: run.attempts }
        : run;
    case 'dismiss':
      return { status: 'idle', attempts: run.attempts };
    default:
      return run;
  }
}
