/**
 * The first-boot guided tour — declarative script.
 *
 * Phase 9.5 of `docs/IMPLEMENTATION_PLAN_V1.01.md`, audit `T1`. The plan called
 * this "the last phase before release" and it was never built: `tourScript`,
 * `TourOverlay` and `onboarding` matched **zero files**. Audit `F11` and `U4`
 * are its downstream cost — a first run that opens on an empty desktop whose
 * most prominent text is `Seanime sidecar · stopped`, which reads as breakage.
 *
 * Pure data, in `shared/` on purpose: the step list is the thing worth testing
 * (ordering, i18n key coverage, anchor discipline) and none of that needs a DOM.
 *
 * ## Anchors
 *
 * `anchor` is a CSS selector for a **live** element. The plan's own pitfall list
 * warns that anchors point at empty space when the element is absent — on a
 * small screen, a different shell, or a step whose feature is not installed. So
 * a missing anchor is not an error here: `TourOverlay` centres the bubble and
 * drops the spotlight. That makes every step survivable on a first boot with
 * zero models, which the plan requires ("the tour IS the funnel to the download
 * wizard, not a consumer of it").
 *
 * Only selectors verified to exist in `DesktopShell` are used. Adding a step
 * with a speculative selector is how this feature degrades back into pointing at
 * nothing.
 */

/** What the user must do before the step advances. */
export type TourAdvance =
  /** The bubble's own "Next" button — the default, and always available. */
  | 'next'
  /** Advance as soon as the anchored element is clicked, as well as via Next. */
  | 'anchor-click';

export interface TourStep {
  /** Stable id. Persisted in progress state, so never renumber — append. */
  id: string;
  /** CSS selector for the element to spotlight, or `null` for a centred bubble. */
  anchor: string | null;
  /** i18n key for the bubble heading. */
  titleKey: string;
  /** i18n key for the bubble body. */
  bodyKey: string;
  advance: TourAdvance;
  /**
   * Set when the step teaches something the user cannot discover by looking —
   * a global hotkey, a gesture. `TourOverlay` renders it as a key hint.
   */
  hotkey?: string;
}

/**
 * The tour, in order.
 *
 * Content follows the plan's outline (welcome → the shell → the study surfaces →
 * outro), with one deliberate addition: **the Reading Lens**. It is a
 * system-wide screen-OCR reader bound to a global hotkey and enabled by default
 * (`main/readingLens.ts:57`), which means a user who is never told the
 * accelerator has a finished feature they cannot find. That is the exact shape
 * of defect this tour exists to close.
 *
 * The mascot is deliberately **not** Miku. The plan's own pitfall note says
 * Hatsune Miku is Crypton IP under the Piapro license and must not ship in a
 * GitHub release; the companion system already loads user-supplied shimeji
 * packs, so the tour speaks as the app's own guide and points at companion
 * settings instead.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    anchor: null,
    titleKey: 'tour.welcome.title',
    bodyKey: 'tour.welcome.body',
    advance: 'next',
  },
  {
    id: 'start',
    anchor: '.os-start-btn',
    titleKey: 'tour.start.title',
    bodyKey: 'tour.start.body',
    advance: 'anchor-click',
  },
  {
    id: 'taskbar',
    anchor: '.os-taskbar',
    titleKey: 'tour.taskbar.title',
    bodyKey: 'tour.taskbar.body',
    advance: 'next',
  },
  {
    id: 'lens',
    anchor: null,
    titleKey: 'tour.lens.title',
    bodyKey: 'tour.lens.body',
    advance: 'next',
    hotkey: 'Ctrl+Shift+Space',
  },
  {
    id: 'study',
    anchor: null,
    titleKey: 'tour.study.title',
    bodyKey: 'tour.study.body',
    advance: 'next',
  },
  {
    id: 'language',
    anchor: null,
    titleKey: 'tour.language.title',
    bodyKey: 'tour.language.body',
    advance: 'next',
  },
  {
    id: 'assets',
    anchor: null,
    titleKey: 'tour.assets.title',
    bodyKey: 'tour.assets.body',
    advance: 'next',
  },
  {
    id: 'outro',
    anchor: null,
    titleKey: 'tour.outro.title',
    bodyKey: 'tour.outro.body',
    advance: 'next',
  },
];

/** Every i18n key the tour renders — used by the catalog-coverage test. */
export function tourI18nKeys(): string[] {
  const keys: string[] = [];
  for (const step of TOUR_STEPS) keys.push(step.titleKey, step.bodyKey);
  return keys;
}
