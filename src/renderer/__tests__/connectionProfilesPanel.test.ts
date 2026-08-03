// @vitest-environment node
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      (vars?.count === undefined ? key : `${key}:${vars.count}`),
  }),
}));

// Unlike the leaner mock other panel tests use, this one also renders `title`,
// `description` and `trailing` — the panel puts its diagnostics grade in `trailing`,
// and a mock that dropped it would quietly stop covering that surface.
vi.mock('../components/settings/SettingsCard', () => ({
  default: ({ id, title, description, trailing, children }: {
    id?: string;
    title?: ReactNode;
    description?: ReactNode;
    trailing?: ReactNode;
    children?: ReactNode;
  }) => createElement(
    'section',
    { 'data-setting-id': id },
    createElement('h3', null, title),
    createElement('p', null, description),
    createElement('div', null, trailing),
    children,
  ),
}));

beforeEach(() => vi.stubGlobal('localStorage', storage()));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('connection profiles settings wiring', () => {
  it('renders every §2 surface from a fresh store', async () => {
    const { default: ConnectionProfilesPanel } = await import(
      '../components/settings/pages/ConnectionProfilesPanel'
    );
    const html = renderToStaticMarkup(createElement(ConnectionProfilesPanel));

    for (const card of [
      'connection-profiles',
      'connection-monitoring',
      'connection-compare',
      'connection-sites',
      'connection-queue',
      'connection-logs',
      'connection-history',
      'connection-portability',
    ]) {
      expect(html, `missing card ${card}`).toContain(`data-setting-id="${card}"`);
    }
    // All six built-in presets are offered, and the fresh document grades as "no data"
    // rather than as a failing profile.
    for (const preset of ['fast', 'balanced', 'conservative', 'metadata-only', 'browser-assisted', 'low-bandwidth']) {
      expect(html).toContain(`connection.preset.${preset}`);
    }
    expect(html).toContain('connection.grade.unknown');
    expect(html).toContain('connection.note.no-data');
    expect(html).toContain('connection.builtInNote');
  });

  it('reflects a persisted profile and its recorded requests', async () => {
    const shared = await import('../../shared/connectionProfiles');
    const store = await import('../connectionProfilesStore');

    let document = shared.createDefaultConnectionProfilesDocument('2026-07-25T12:00:00.000Z');
    document = shared.cloneConnectionProfile(document, 'conservative', {
      id: 'nightly',
      name: 'Nightly crawl',
      now: '2026-07-25T12:00:00.000Z',
      inherit: true,
    });
    document = shared.setActiveConnectionProfile(document, 'nightly');
    document = shared.recordConnectionAttempt(document, {
      id: 'a1',
      profileId: 'nightly',
      site: 'example.org',
      startedAt: '2026-07-25T12:00:00.000Z',
      durationMs: 240,
      outcome: 'success',
      status: 200,
      bytes: 512,
      fromCache: false,
      parsed: true,
      errorCategory: null,
    });
    document = shared.enqueueConnectionJob(
      document,
      { id: 'j1', profileId: 'nightly', site: 'example.org', label: 'Nightly job' },
      '2026-07-25T12:00:00.000Z',
    );
    store.saveConnectionProfilesDocument(document);

    const { default: ConnectionProfilesPanel } = await import(
      '../components/settings/pages/ConnectionProfilesPanel'
    );
    const html = renderToStaticMarkup(createElement(ConnectionProfilesPanel));

    expect(html).toContain('Nightly crawl');
    expect(html).toContain('connection.attemptsCount:1');
    expect(html).toContain('Nightly job');
    expect(html).toContain('connection.jobState.queued');
    // The inheritance chain is shown resolved, root first.
    expect(html).toContain('connection.chain');
    expect(html).toContain('connection.note.healthy');
  });

  it('registers the surface in the settings search index', async () => {
    const { SETTINGS_REGISTRY } = await import('../components/settings/settingsRegistry');
    const entry = SETTINGS_REGISTRY.find((item) => item.id === 'connection-profiles');

    expect(entry).toMatchObject({ pageId: 'scraper', group: 'Media', advanced: true });
    expect(entry?.keywords).toEqual(
      expect.arrayContaining(['connection profiles', 'inheritance', 'monitoring', 'queue']),
    );
  });
});
