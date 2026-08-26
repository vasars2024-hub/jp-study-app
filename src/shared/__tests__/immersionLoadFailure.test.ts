/**
 * Rubric category 8 on the Immersion browser: the banner it shows when a page
 * does not open.
 *
 * The defect these guards latch was found by driving the live surface at
 * `http://127.0.0.1:9/definitely-not-there`. Immersion answered "Reader
 * extraction failed. Wait for the page to finish loading, then try again." —
 * a symptom of a step that never ran, plus advice about a load that was
 * already over. The mechanism is the last two cases here: Chromium fires
 * `did-stop-loading` after a FAILED load as well, and the reader pass it
 * schedules opens by clearing the error.
 */
import { describe, expect, it } from 'vitest';
import {
  IMMERSION_LOAD_FAILURE_KEYS,
  immersionLoadFailure,
  immersionLoadFailureMessage,
  isPageLoadFailure,
  mayRunReaderPass,
} from '../immersionLoadFailure';
import { en } from '../i18n/catalogs/en';
import { ja } from '../i18n/catalogs/ja';
import { zh } from '../i18n/catalogs/zh';
import { ru } from '../i18n/catalogs/ru';

const DEAD = 'http://127.0.0.1:9/definitely-not-there';

describe('which did-fail-load events are this page failing', () => {
  it('reports a main-frame failure', () => {
    expect(isPageLoadFailure({
      errorCode: -102,
      errorDescription: 'ERR_CONNECTION_REFUSED',
      validatedURL: DEAD,
      isMainFrame: true,
    })).toBe(true);
  });

  it('stays silent about a subframe failure, which happens on pages that rendered fine', () => {
    expect(isPageLoadFailure({
      errorCode: -105,
      errorDescription: 'ERR_NAME_NOT_RESOLVED',
      validatedURL: 'https://ads.example/track.js',
      isMainFrame: false,
    })).toBe(false);
  });

  it('stays silent about ERR_ABORTED, which is the user replacing their own navigation', () => {
    expect(isPageLoadFailure({
      errorCode: -3,
      errorDescription: 'ERR_ABORTED',
      validatedURL: DEAD,
      isMainFrame: true,
    })).toBe(false);
  });

  it('treats an event with no isMainFrame at all as top level rather than swallowing it', () => {
    // Swallowing these would put the surface back in the state this module fixes:
    // silent about a page that did not open.
    expect(isPageLoadFailure({ errorCode: -105, errorDescription: 'ERR_NAME_NOT_RESOLVED' })).toBe(true);
  });
});

describe('what the banner says', () => {
  it('names the address and the reason the browser gave', () => {
    const failure = immersionLoadFailure({
      errorCode: -102,
      errorDescription: 'ERR_CONNECTION_REFUSED',
      validatedURL: DEAD,
      isMainFrame: true,
    }, 'https://previous.example/');
    expect(failure).toEqual({ url: DEAD, reason: 'ERR_CONNECTION_REFUSED' });
    expect(failure && immersionLoadFailureMessage(failure)).toEqual({
      key: 'immersion.pageLoadFailedAt',
      vars: { url: DEAD, reason: 'ERR_CONNECTION_REFUSED' },
    });
  });

  it('falls back to the undetailed key when the platform names no reason', () => {
    const failure = immersionLoadFailure(
      { errorCode: -2, validatedURL: DEAD, isMainFrame: true },
      '',
    );
    expect(failure && immersionLoadFailureMessage(failure))
      .toEqual({ key: 'immersion.pageLoadFailed' });
  });

  it('falls back to the current URL when the event carries none', () => {
    const failure = immersionLoadFailure(
      { errorCode: -102, errorDescription: 'ERR_CONNECTION_REFUSED', isMainFrame: true },
      DEAD,
    );
    expect(failure?.url).toBe(DEAD);
  });

  it('has every key it can return in all four catalogs, with both placeholders', () => {
    for (const key of IMMERSION_LOAD_FAILURE_KEYS) {
      for (const [name, cat] of [['en', en], ['ja', ja], ['zh', zh], ['ru', ru]] as const) {
        const text = (cat as Record<string, string>)[key];
        expect(text, `${key} missing from ${name}`).toBeTruthy();
        if (key === 'immersion.pageLoadFailedAt') {
          expect(text, `${key} in ${name} drops {url}`).toContain('{url}');
          expect(text, `${key} in ${name} drops {reason}`).toContain('{reason}');
        }
      }
    }
  });
});

describe('the reader pass that used to overwrite the true reason', () => {
  it('is refused for the URL that failed', () => {
    expect(mayRunReaderPass({ url: DEAD, reason: 'ERR_CONNECTION_REFUSED' }, DEAD)).toBe(false);
  });

  it('runs when nothing has failed', () => {
    expect(mayRunReaderPass(null, 'https://example.com/')).toBe(true);
  });

  it('is not held back for a different page', () => {
    // The failure is scoped to its own URL, so navigating somewhere else — or retrying, which
    // clears the ref first — is not punished for the previous page.
    expect(mayRunReaderPass({ url: DEAD, reason: 'ERR_CONNECTION_REFUSED' }, 'https://example.com/'))
      .toBe(true);
  });
});
