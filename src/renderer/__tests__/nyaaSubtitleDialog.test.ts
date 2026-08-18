// @vitest-environment jsdom
//
// The nyaa subtitle chooser, rendered — specifically, what it does with a
// refusal.
//
// `nyaaAvailability` distinguishes five reasons a fetch cannot run, and
// `listNyaaCandidates` returns the one that applies as `message` with
// `candidates: []`. That distinction is only worth anything if the surface
// carries it: an empty list plus "nothing found" is the same screen whether the
// title genuinely has no subtitle releases or the user never entered a
// qBittorrent credential, and only the second is fixable by the user.
//
// This file had no coverage at all before 2026-08-18, on either side. It is
// Main V1 Track 9 gate 16's third surface.
//
// `createElement` rather than JSX because `vitest.config.ts` only collects
// `*.test.ts`.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NyaaSubtitleDialog from '../components/media/library/NyaaSubtitleDialog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../scraperSettingsStore', () => ({
  getActiveScraperSettings: () => ({
    sources: { entries: [{ id: 'nyaa', kind: 'torrent', enabled: true }], perSourceTimeoutMs: 8_000 },
    torrents: { indexerIds: [], minSeeders: 1, resolutionPriority: [1080] },
    qbittorrent: {
      enabled: true,
      host: '127.0.0.1',
      savePath: '',
      authMode: 'apiKey',
      username: '',
      passwordRef: '',
      apiKeyRef: '',
    },
  }),
}));

let host: HTMLDivElement;
let root: Root;

/** The exact sentence `qbitCredentialGap` produces for a key mode with no key. */
const NO_KEY = 'qBittorrent is set to API key authentication, but no key has been entered.';

function candidate(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tok-1',
    releaseName: '[Sub] Frieren 01 [JP]',
    route: 'subtitle-only',
    sizeBytes: 420 * 1024,
    seeders: 12,
    languages: ['ja'],
    score: 90,
    reasons: ['name match'],
    ...patch,
  };
}

function stubApi(overrides: Record<string, unknown> = {}): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    listNyaaSubtitles: vi.fn(async () => ({ ok: true, candidates: [], message: '' })),
    acceptNyaaSubtitle: vi.fn(async () => ({ ok: true, lang: 'ja' })),
    ...overrides,
  };
}

async function open(): Promise<void> {
  await act(async () => {
    root.render(createElement(NyaaSubtitleDialog, {
      mediaId: 'media-1',
      languages: ['ja'],
      onCancel: () => undefined,
      onAttached: () => undefined,
    }));
  });
}

function text(): string {
  return host.textContent ?? '';
}

function rows(): HTMLLIElement[] {
  return [...host.querySelectorAll<HTMLLIElement>('.medialib-match__list > li')];
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  stubApi();
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('NyaaSubtitleDialog', () => {
  // Gate 16 on this surface: the clean-profile refusal has to arrive as the
  // sentence main wrote, not as a generic empty result.
  it('carries the credential refusal through instead of flattening it', async () => {
    stubApi({
      listNyaaSubtitles: vi.fn(async () => ({ ok: false, candidates: [], message: NO_KEY })),
    });
    await open();
    expect(text()).toContain(NO_KEY);
    expect(rows()).toHaveLength(0);
    // And it is announced, not just printed — the list did not change, so a
    // silent status line is a screen that looks like it is still searching.
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(NO_KEY);
  });

  // The negative control, and the reason the above is not simply "show any
  // message": a real listing must render its releases and raise no alert.
  it('renders the releases and no alert when the search succeeds', async () => {
    stubApi({
      listNyaaSubtitles: vi.fn(async () => ({
        ok: true,
        candidates: [candidate(), candidate({ id: 'tok-2', releaseName: '[Sub] Frieren 02 [JP]' })],
        message: '',
      })),
    });
    await open();
    expect(rows()).toHaveLength(2);
    expect(text()).toContain('[Sub] Frieren 01 [JP]');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  // A title with no subtitle releases is a third state and must not borrow the
  // refusal's wording — the fix there is a different search, not a setting.
  it('keeps an empty listing distinct from a refusal', async () => {
    stubApi({
      listNyaaSubtitles: vi.fn(async () => ({
        ok: true,
        candidates: [],
        message: 'No release on the index carried a subtitle file.',
      })),
    });
    await open();
    expect(rows()).toHaveLength(0);
    // Scoped to the alert: the standing explainer names qBittorrent on purpose,
    // because accepting a release starts a transfer there.
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('No release on the index carried a subtitle file.');
    expect(alert?.textContent).not.toContain('credential');
  });

  // Main narrows the config off the wire, so the dialog has to actually send
  // one. Passing `undefined` would make every refusal read `not-configured`,
  // which is the wrong reason for a profile that is configured.
  it('sends the active profile as the acquisition config', async () => {
    const listed = vi.fn(async () => ({ ok: true, candidates: [], message: '' }));
    stubApi({ listNyaaSubtitles: listed });
    await open();
    expect(listed).toHaveBeenCalledTimes(1);
    const [mediaId, config, languages] = listed.mock.calls[0] as unknown as [string, Record<string, unknown>, string[]];
    expect(mediaId).toBe('media-1');
    expect(languages).toEqual(['ja']);
    expect(Array.isArray(config.indexers)).toBe(true);
    expect((config.qbittorrent as Record<string, unknown>).enabled).toBe(true);
  });

  // An IPC throw is not a search result. Reporting it as an empty list would
  // tell the user the title has no subtitles when nothing was ever asked.
  it('reports a thrown IPC error rather than an empty result', async () => {
    stubApi({
      listNyaaSubtitles: vi.fn(async () => { throw new Error('scraper backend is not running'); }),
    });
    await open();
    expect(text()).toContain('scraper backend is not running');
    expect(rows()).toHaveLength(0);
  });
});
