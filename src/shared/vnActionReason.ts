/**
 * Why each greyed-out button in the visual-novel workspace is greyed out.
 *
 * The category-8 sweep on a POPULATED `@.visual-novel-panel` scored five mute
 * pairs — `Launch`, `Add route`, `Add captured line`, `Analyze …` and `Create
 * study deck cards` — every one of them `aria-label: null`, `title: null`, and
 * every one sitting in a row of other buttons, so correction 11's rule that a
 * neighbour's caption is not an explanation leaves them with nothing at all.
 * The captions say what each does; none said what to change.
 *
 * All nine sites are covered rather than the five the sweep caught. Four of the
 * missing four only render once a route, a scene list or the community section
 * is on screen, and scoring the surface in the one arrangement where they are
 * absent and calling the row clean is measuring the easy moment — the same
 * mistake `novelsActionReason.ts` was written to avoid.
 *
 * Rules here rather than inline, beside `novelsActionReason.ts`,
 * `mediaVideoActionReason.ts` and `agentComposerReason.ts`: two of the nine
 * have more than one condition, so there is a PRIORITY, and a priority that is
 * not in a module is a priority nothing can test. Returning i18n keys keeps
 * this file free of English.
 */

/** Everything the nine rules read. `busy` is the shared run-in-progress flag. */
export interface VnActionState {
  busy: boolean;
  hasExecutablePath: boolean;
  hasRouteName: boolean;
  hasEndingName: boolean;
  hasCaptureText: boolean;
  scopedCaptureCount: number;
  hasAnalysis: boolean;
  hasCurrentScene: boolean;
  selectedSceneCount: number;
  hasReportDraft: boolean;
}

/**
 * Every flag in its most-blocked position, for a call site that owns only some of them.
 *
 * The community panel is a child component and knows about exactly two — `busy` and whether the
 * report draft has content. Spreading this and overriding those two states plainly that it is
 * not claiming anything about a route name or a scene selection it cannot see, which a
 * hand-written literal with seven invented `false`s would not.
 */
export const VN_ACTION_STATE_EMPTY: VnActionState = {
  busy: false,
  hasExecutablePath: false,
  hasRouteName: false,
  hasEndingName: false,
  hasCaptureText: false,
  scopedCaptureCount: 0,
  hasAnalysis: false,
  hasCurrentScene: false,
  selectedSceneCount: 0,
  hasReportDraft: false,
};

/**
 * `undefined` means ENABLED. Every call site derives `disabled` from this rather
 * than repeating the condition list, so the two cannot disagree and a button
 * that is grey with no reason is not expressible.
 */
export type VnActionReason = string | undefined;

/** Launching needs a real executable on disk; nothing else about the entry matters. */
export function vnLaunchReason(s: VnActionState): VnActionReason {
  if (!s.hasExecutablePath) return 'vnPanel.reason.noExecutable';
  return undefined;
}

export function vnAddRouteReason(s: VnActionState): VnActionReason {
  if (!s.hasRouteName) return 'vnPanel.reason.noRouteName';
  return undefined;
}

export function vnAddEndingReason(s: VnActionState): VnActionReason {
  if (!s.hasEndingName) return 'vnPanel.reason.noEndingName';
  return undefined;
}

export function vnAddCapturedLineReason(s: VnActionState): VnActionReason {
  if (!s.hasCaptureText) return 'vnPanel.reason.noCaptureText';
  return undefined;
}

/**
 * The order is load-bearing and it is why this is a function rather than a
 * ternary at the call site.
 *
 * `busy` is transient: wait, and it clears. "This scope holds no captured lines"
 * is a property of what the user has SELECTED, and no amount of waiting changes
 * it. Leading with `busy` would send someone to wait out an analysis and come
 * back to a button that is still dead. The condition the user can act on wins —
 * the same inversion `novelsActionReason.ts` settled on.
 */
export function vnAnalyzeReason(s: VnActionState): VnActionReason {
  if (s.scopedCaptureCount === 0) return 'vnPanel.reason.noScopedCaptures';
  if (s.busy) return 'vnPanel.reason.busy';
  return undefined;
}

export function vnCreateCardsReason(s: VnActionState): VnActionReason {
  if (!s.hasAnalysis) return 'vnPanel.reason.noAnalysis';
  return undefined;
}

export function vnCurrentSceneReason(s: VnActionState): VnActionReason {
  if (!s.hasCurrentScene) return 'vnPanel.reason.noCurrentScene';
  return undefined;
}

export function vnClearScenesReason(s: VnActionState): VnActionReason {
  if (s.selectedSceneCount === 0) return 'vnPanel.reason.noSelectedScenes';
  return undefined;
}

/** Same priority as the analysis, and for the same reason. */
export function vnSaveReportReason(s: VnActionState): VnActionReason {
  if (!s.hasReportDraft) return 'vnCommunity.reason.emptyDraft';
  if (s.busy) return 'vnCommunity.reason.busy';
  return undefined;
}

/** Export and import share one condition and therefore one rule. */
export function vnBundleReason(s: VnActionState): VnActionReason {
  if (s.busy) return 'vnCommunity.reason.busy';
  return undefined;
}

/** Every key the nine rules can return, so a catalog test can assert all of them. */
export const VN_ACTION_REASON_KEYS = [
  'vnPanel.reason.noExecutable',
  'vnPanel.reason.noRouteName',
  'vnPanel.reason.noEndingName',
  'vnPanel.reason.noCaptureText',
  'vnPanel.reason.noScopedCaptures',
  'vnPanel.reason.busy',
  'vnPanel.reason.noAnalysis',
  'vnPanel.reason.noCurrentScene',
  'vnPanel.reason.noSelectedScenes',
  'vnCommunity.reason.emptyDraft',
  'vnCommunity.reason.busy',
] as const;
