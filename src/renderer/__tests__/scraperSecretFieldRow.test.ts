// @vitest-environment jsdom
//
// The two qBittorrent credential rows in the Advanced Settings drawer, rendered.
//
// They used to be `kind: 'status'`, which prints the bound value verbatim — and
// the bound value is a `*Ref`, an opaque handle into OS storage. So a row
// labelled "Password" read `qbit/webui` whether or not anything was behind it,
// which is the one input where "looks configured" and "is configured" coming
// apart costs the user a connection failure with no visible cause. Same defect
// the Torrent Manager pill was fixed for in `bd725520`; this is its second
// surface.
//
// Rendered rather than asserted on the schema, because the schema was never
// wrong: `passwordRef` really is the path. It is the *presentation* that lied.
//
// `createElement` rather than JSX because `vitest.config.ts` only collects
// `*.test.ts`.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FieldRow from '../components/scraper/settings/FieldRow';
import { SCRAPER_FIELDS } from '../components/scraper/settings/fields';
import { DEFAULT_SCRAPER_SETTINGS } from '../../shared/scraperSettings';
import type { ScraperSettings } from '../../shared/scraperSettings';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function fieldFor(path: string) {
  const field = SCRAPER_FIELDS.find((entry) => entry.path === path);
  if (!field) throw new Error(`No drawer field at ${path}`);
  return field;
}

function settingsWith(patch: Partial<ScraperSettings['qbittorrent']>): ScraperSettings {
  return {
    ...DEFAULT_SCRAPER_SETTINGS,
    qbittorrent: { ...DEFAULT_SCRAPER_SETTINGS.qbittorrent, ...patch },
  };
}

/** `scraperHasCredential`'s answer, as the row will actually receive it. */
function stubVault(answer: boolean | Error | null): ReturnType<typeof vi.fn> | undefined {
  const api = (window as unknown as { api: Record<string, unknown> }).api ?? {};
  (window as unknown as { api: Record<string, unknown> }).api = api;
  if (answer === null) {
    delete api.scraperHasCredential;
    return undefined;
  }
  const probe = vi.fn(async () => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
  api.scraperHasCredential = probe;
  return probe;
}

async function render(path: string, settings: ScraperSettings): Promise<void> {
  await act(async () => {
    root.render(createElement(FieldRow, {
      field: fieldFor(path),
      settings,
      onChange: () => undefined,
      onAction: () => undefined,
    }));
  });
}

function text(): string {
  return host.textContent ?? '';
}

function pill(): HTMLElement {
  const found = host.querySelector<HTMLElement>('.scr-conn');
  if (!found) throw new Error('No credential pill rendered');
  return found;
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  stubVault(true);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('drawer credential rows', () => {
  // The defect, exactly: a ref naming a secret the store does not hold.
  it('reports an empty store rather than printing the ref', async () => {
    stubVault(false);
    await render('qbittorrent.passwordRef', settingsWith({ passwordRef: 'qbit/webui' }));
    expect(text()).toContain('password missing from OS storage');
    // The ref is a storage handle, not a status, and must not reach the screen.
    expect(text()).not.toContain('qbit/webui');
    expect(pill().className).toContain('scr-conn--cred-bad');
  });

  // The negative control: same ref, same row, the store answering yes.
  it('reports a stored password when the store does hold one', async () => {
    const probe = stubVault(true);
    await render('qbittorrent.passwordRef', settingsWith({ passwordRef: 'qbit/webui' }));
    expect(text()).toContain('password stored');
    expect(pill().className).toContain('scr-conn--cred-good');
    expect(probe).toHaveBeenCalledWith('qbit/webui');
  });

  // Nothing configured is a different state from configured-over-nothing, and a
  // milder one — the button says so too.
  it('separates never-configured from configured-and-empty', async () => {
    const probe = stubVault(false);
    await render('qbittorrent.passwordRef', settingsWith({ passwordRef: '' }));
    expect(text()).toContain('no password');
    expect(text()).not.toContain('missing from OS storage');
    expect(pill().className).toContain('scr-conn--cred-warn');
    expect(text()).toContain('Set');
    // Nothing to ask about, so the store is not asked.
    expect(probe).not.toHaveBeenCalled();
  });

  // The API-key row reads the other vocabulary. Sharing one set of strings
  // would tell a key-mode user they have "no password", which reads as broken.
  it('uses the API-key wording on the API-key row', async () => {
    stubVault(false);
    await render('qbittorrent.apiKeyRef', settingsWith({ apiKeyRef: 'qbit/apikey' }));
    expect(pill().textContent).toBe('API key missing from OS storage');
    // Scoped to the pill: the row's own hint mentions a password on purpose,
    // to say that key mode needs none.
    expect(pill().textContent).not.toContain('password');
    expect(text()).not.toContain('qbit/apikey');
  });

  // A probe that throws must not be read as "no". Claiming a credential is
  // absent because the store could not be reached is the same false state in
  // the other direction.
  it('claims neither yes nor no when the probe fails', async () => {
    stubVault(new Error('keyring unavailable'));
    await render('qbittorrent.passwordRef', settingsWith({ passwordRef: 'qbit/webui' }));
    expect(text()).toContain('password unverified');
    expect(text()).not.toContain('stored');
    expect(text()).not.toContain('missing from OS storage');
  });

  // And a window with no binding at all — a preload that never exposed it —
  // is the same "cannot tell" rather than a crash or a false negative.
  it('survives a window with no credential binding', async () => {
    stubVault(null);
    await render('qbittorrent.passwordRef', settingsWith({ passwordRef: 'qbit/webui' }));
    expect(text()).toContain('password unverified');
  });
});
