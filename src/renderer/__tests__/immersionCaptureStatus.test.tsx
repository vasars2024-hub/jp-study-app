// @vitest-environment jsdom
/**
 * The Immersion status banner is the ONLY outcome channel the eight overflow
 * page actions have — Save site, Save as tool, Export to Library, Capture video
 * to Media and the lens all report through it and nothing else.
 *
 * Two defects were measured on it live on 2026-09-08, driving the user's own
 * app (pid 22788, window 1) on NHK Easy:
 *
 *  1. Capture video to Media was pressed on an ordinary news article. It did not
 *     refuse — `isRemoteMediaUrl` admits every http(s) page that is not a search
 *     portal — and 2.1 s later the banner read, verbatim,
 *     `Download failed: ERROR: Unsupported URL: https://news.web.nhk/news/easy/`.
 *     That is main's English literal (`main/media.ts:375`) wrapping yt-dlp's own
 *     stderr: untranslated in every language, and it tells a reader nothing.
 *
 *  2. The banner was a bare `<div onClick>`. It could only be dismissed with a
 *     mouse and no screen reader ever announced it — while Aero's copy of the
 *     same banner (`ImmersionView.tsx:286`) had already been made a `<button>`.
 *
 * The permissive acceptance is deliberate and stays: yt-dlp supports over a
 * thousand sites and any host list this app carried would go stale. What is
 * asserted here is that the REPORTING is the product's own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SITES = { sites: [] as unknown[] };
const URL_BAR = '.immersion-url, .aero-immersion-url';
const BANNER = '.immersion-banner.status, .aero-immersion-banner.status';

let harness: ReadingSurfaceHarness | null = null;

async function mountImmersion(): Promise<ReadingSurfaceHarness> {
  const { default: ImmersionView } = await import('../views/ImmersionView');
  harness = createReadingSurfaceHarness({
    render: () => createElement(ImmersionView),
    ready: (container) => container.querySelector('.lq-reading.immersion-body, .aero-immersion') !== null,
  });
  await harness.mount(1200);
  return harness;
}

async function openPage(h: ReadingSurfaceHarness, url: string): Promise<void> {
  const bar = h.container.querySelector<HTMLInputElement>(URL_BAR);
  const form = bar!.closest('form');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
      .set!.call(bar!, url);
    bar!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await h.flush();
}

/** Press Capture and let the (mocked) download settle. */
async function capture(h: ReadingSurfaceHarness): Promise<void> {
  // The overflow actions carry no aria-label — their accessible name is the
  // span, so that is what a user reads and what this selects on.
  const button = [...h.container.querySelectorAll<HTMLButtonElement>('.immersion-overflow-body > button, .aero-immersion-icon-btn')]
    .find((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === 'Capture video to Media');
  expect(button, 'no Capture video control in the overflow').not.toBe(undefined);
  expect(button!.disabled, 'Capture is disabled with a page open').toBe(false);
  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await h.flush();
}

function bannerText(h: ReadingSurfaceHarness): string {
  return (h.container.querySelector<HTMLElement>(BANNER)?.textContent ?? '').trim();
}

function install(downloadYouTube: () => Promise<unknown>): void {
  installReadingSurfaceApi({
    immersionListSites: async () => SITES,
    onImmersionSitesChanged: () => () => undefined,
    immersionRecordVisit: async () => ({ ok: true }),
    immersionBumpMetrics: async () => ({ ok: true }),
    downloadYouTube,
  });
}

beforeEach(() => {
  installResizeObserver();
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  document.documentElement.removeAttribute('data-materials');
  vi.restoreAllMocks();
});

describe.each(['classic', 'aero'])('%s capture status', (materials) => {
  beforeEach(() => {
    if (materials === 'aero') document.documentElement.setAttribute('data-materials', 'aero');
  });

  describe('Immersion capture reports in the product\'s own words', () => {
    it('turns yt-dlp\'s "Unsupported URL" into a sentence about the page', async () => {
      install(async () => ({
        error: 'Download failed: ERROR: Unsupported URL: https://news.web.nhk/news/easy/',
      }));
      const h = await mountImmersion();
      await openPage(h, 'https://news.web.nhk/news/easy/');
      await capture(h);

      const text = bannerText(h);
      expect(text).toBe(
        'No video on this page. Capture works on video pages — YouTube, Vimeo and the other sites yt-dlp supports.',
      );
      // The exact thing the user saw must be gone, not merely prefixed.
      expect(text).not.toContain('Unsupported URL');
      expect(text).not.toContain('news.web.nhk');
      expect(text).not.toContain('ERROR');
    });

    /*
     * The control. A failure the user CAN act on keeps its detail — flattening
     * everything into "no video here" would be a different lie from the one being
     * fixed, and would hide a missing yt-dlp behind a page-content excuse.
     */
    it('keeps an actionable failure\'s detail, inside a translated frame', async () => {
      install(async () => ({ error: 'Download failed: ERROR: yt-dlp is not installed' }));
      const h = await mountImmersion();
      await openPage(h, 'https://www.youtube.com/watch?v=abc123');
      await capture(h);

      const text = bannerText(h);
      expect(text).toContain('yt-dlp is not installed');
      expect(text.startsWith('Capture failed.'), text).toBe(true);
      expect(text).not.toContain('No video on this page');
    });

    it('reports a success without borrowing a failure message', async () => {
      install(async () => ({ ok: true, path: 'C:/media/clip.mp4' }));
      const h = await mountImmersion();
      await openPage(h, 'https://www.youtube.com/watch?v=abc123');
      await capture(h);
      expect(bannerText(h)).toBe('Saved to Media library');
    });
  });

  describe('the status banner is operable and announced', () => {
    it('is a button, so it can be dismissed without a mouse', async () => {
      install(async () => ({ error: 'Download failed: ERROR: Unsupported URL: https://x.test/' }));
      const h = await mountImmersion();
      await openPage(h, 'https://x.test/');
      await capture(h);

      const banner = h.container.querySelector<HTMLElement>(BANNER);
      expect(banner, 'no status banner').not.toBe(null);
      expect(banner!.tagName).toBe('BUTTON');
      // A <div onClick> is not in the tab order at all; a button is, with no
      // tabindex needed. This is the half a keyboard user was missing.
      expect(banner!.hasAttribute('disabled')).toBe(false);

      await act(async () => {
        banner!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
      await h.flush();
      expect(h.container.querySelector(BANNER), 'the banner did not dismiss').toBe(null);
    });

    /*
     * The live region is asserted to be ALWAYS MOUNTED, not merely present once a
     * message exists. A region that mounts together with its first message is not
     * reliably announced — the text has to change inside a region that was already
     * there, which is why this checks the starter state first.
     */
    it('carries the message in a live region that was already in the tree', async () => {
      install(async () => ({ error: 'Download failed: ERROR: Unsupported URL: https://x.test/' }));
      const h = await mountImmersion();
      const region = () => h.container.querySelector<HTMLElement>('[role="status"][aria-live="polite"].sr-only');

      expect(region(), 'no live region before any status').not.toBe(null);
      expect(region()!.textContent).toBe('');

      await openPage(h, 'https://x.test/');
      await capture(h);

      expect(region()!.textContent).toBe(
        'No video on this page. Capture works on video pages — YouTube, Vimeo and the other sites yt-dlp supports.',
      );
    });
  });
});
