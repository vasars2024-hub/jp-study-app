/**
 * What the Immersion browser is allowed to say when a page does not open.
 *
 * The category-8 sweep drove Immersion at a dead address and the banner read
 * "Reader extraction failed. Wait for the page to finish loading, then try
 * again." The page had not failed to extract — it had never opened at all
 * (`ERR_CONNECTION_REFUSED`), so the advice was to wait for something that
 * would never happen, at a step that was not the failing one. The true reason
 * was set first and then overwritten ~400 ms later, because Chromium fires
 * `did-stop-loading` after a failed load too and the reader pass that follows
 * it opens with `setError(null)`.
 *
 * The rules live here rather than inline in `ImmersionContent.tsx`, beside
 * `mediaVideoActionReason.ts` and `agentComposerReason.ts`, for the same
 * reason those do: the decision has a PRIORITY and an exclusion list, and both
 * are untestable while they sit inside a component that no test can mount
 * (it renders an Electron `<webview>` and pulls in `playerBus`). Returning
 * i18n keys keeps this file free of English.
 */

/** The subset of Electron's `did-fail-load` event this decision reads. */
export interface ImmersionLoadFailEvent {
  errorCode?: number;
  errorDescription?: string;
  validatedURL?: string;
  isMainFrame?: boolean;
}

/** A main-frame load that failed, kept for as long as that page is on screen. */
export interface ImmersionLoadFailure {
  url: string;
  reason: string;
}

/**
 * `ERR_ABORTED`. Chromium reports it when a load is cancelled by the user's own
 * next navigation — clicking a second link before the first finished, or the
 * app itself calling `loadURL` again. Nothing failed, so nothing should be said.
 */
const ERR_ABORTED = -3;

/**
 * Whether this event is THIS PAGE failing.
 *
 * Two events are not, and reporting either would be a fabricated error rather
 * than a missing one: a subframe failure (a blocked ad iframe, a dead tracker)
 * happens on pages that rendered perfectly, and an aborted load is a
 * navigation the user replaced on purpose.
 *
 * `isMainFrame` is checked against `false` rather than for truthiness on
 * purpose: an event that omits the field entirely is a top-level failure from
 * a source that did not populate it, and silently swallowing those would put
 * the surface back in the state this module exists to fix.
 */
export function isPageLoadFailure(e: ImmersionLoadFailEvent): boolean {
  if (e.isMainFrame === false) return false;
  if (e.errorCode === ERR_ABORTED) return false;
  return true;
}

/** The failure to remember, or `null` when the event is not this page failing. */
export function immersionLoadFailure(
  e: ImmersionLoadFailEvent,
  currentUrl: string,
): ImmersionLoadFailure | null {
  if (!isPageLoadFailure(e)) return null;
  return {
    url: (e.validatedURL || currentUrl || '').trim(),
    reason: (e.errorDescription || '').trim(),
  };
}

/**
 * The banner to show, as a key plus its interpolation.
 *
 * Chromium's `errorDescription` (`ERR_NAME_NOT_RESOLVED`, `ERR_CONNECTION_REFUSED`)
 * is not translated and is not prose, which is exactly why it is passed through
 * as a variable instead of being mapped onto a friendlier sentence: a mapping
 * would have to guess, and a wrong guess is the defect this module fixes. When
 * the platform gives no description there is nothing true to name, and the
 * older undetailed key is the honest fallback.
 */
export function immersionLoadFailureMessage(
  failure: ImmersionLoadFailure,
): { key: string; vars?: { url: string; reason: string } } {
  if (!failure.reason || !failure.url) return { key: 'immersion.pageLoadFailed' };
  return {
    key: 'immersion.pageLoadFailedAt',
    vars: { url: failure.url, reason: failure.reason },
  };
}

/**
 * Whether the reader-extraction pass may run for `url`.
 *
 * This is the half that actually removed the misleading message. The pass is
 * scheduled off `did-stop-loading`, which fires for failures too; running it
 * over an error page cannot succeed and its failure message describes the
 * wrong step. Scoped to the failing URL so a retry, or a navigation somewhere
 * else, is not held back by the previous page's failure.
 */
export function mayRunReaderPass(
  failure: ImmersionLoadFailure | null,
  url: string,
): boolean {
  if (!failure) return true;
  return failure.url !== url;
}

/** Every key the rules above can return, so a catalog test can assert all of them. */
export const IMMERSION_LOAD_FAILURE_KEYS = [
  'immersion.pageLoadFailed',
  'immersion.pageLoadFailedAt',
] as const;
