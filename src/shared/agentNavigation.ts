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
 *    effect whose section or page no longer matches that item resolves to
 *    `stale-provenance` and opens nothing, so a card that was honest when it was
 *    written cannot become a wrong destination after the shelf moves on.
 * 3. **Approval is a separate argument from resolution.** Resolving is what the
 *    review step calls; it is side-effect free by construction, because opening
 *    lives in `main/agentNavigationIpc.ts` behind an explicit `approved` flag.
 *
 * What a provider says never reaches any of this. The model authors message
 * text; `main/agentExecutionIpc.ts` authors the effect from context metadata,
 * and this module then refuses to trust even that unless live context still
 * agrees with it. `controlId` and `highlight` on the effect are display hints
 * with no bearing on the target and are ignored here on purpose.
 */

import type { DesktopWinSection } from './desktop';
import type { AgentConversation, AgentNavigationEffect } from './agentWorkspace';

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
];

const NAVIGABLE = new Set<string>(AGENT_NAVIGABLE_SECTIONS);

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
  /**
   * The route the live context names. Shown in the review step so the user sees
   * what the Agent is pointing at, and deliberately **not** an execution target:
   * main opens a section, never a page, so a page can describe a destination but
   * can never widen one.
   */
  page?: string;
}

export type AgentNavigationResolution =
  | { ok: true; destination: AgentNavigationDestination }
  | { ok: false; code: AgentNavigationFailureCode };

function navigationEffect(
  conversation: AgentConversation,
  messageId: string,
  cardId: string,
  actionId: string,
): AgentNavigationEffect | AgentNavigationFailureCode {
  const message = conversation.messages.find((entry) => entry.id === messageId);
  const card = message?.cards.find((entry) => entry.id === cardId);
  const action = card?.actions.find((entry) => entry.id === actionId);
  if (!message || !card || !action) return 'action-not-found';
  if (action.effect.type !== 'navigate') return 'not-navigable';
  // Provenance is the card's, not the action's: an action with no declared
  // source has nothing to check against and must not fall through to the
  // shelf-wide search below.
  if (card.sourceContextIds.length === 0) return 'stale-provenance';
  return action.effect;
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
): AgentNavigationResolution {
  const effect = navigationEffect(conversation, messageId, cardId, actionId);
  if (typeof effect === 'string') return { ok: false, code: effect };
  if (!isAgentNavigableSection(effect.section)) {
    return { ok: false, code: 'unknown-section' };
  }
  const message = conversation.messages.find((entry) => entry.id === messageId);
  const card = message?.cards.find((entry) => entry.id === cardId);
  for (const contextId of card?.sourceContextIds ?? []) {
    const item = conversation.context.find((entry) => entry.id === contextId);
    // Only a live `route` context authorizes navigation. A dictionary entry or a
    // subtitle line describes material, not a place, and a card grounded in one
    // has no business opening a window.
    if (!item || item.kind !== 'route') continue;
    if (item.source.app !== effect.section || !item.source.route) continue;
    if (effect.page !== undefined && effect.page !== item.source.route) continue;
    return {
      ok: true,
      // Built from the live item on purpose. The stored effect got this far by
      // matching it, so the two are equal here — but reading the live one is
      // what keeps that true if this function is ever loosened.
      destination: { section: effect.section, page: item.source.route },
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
