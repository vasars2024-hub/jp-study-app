// @vitest-environment jsdom
/**
 * Settings › Media providers lists the real metadata clients and whether each
 * answers — it used to be an editor over a document nothing wrote.
 */
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars?.ms === undefined ? key : `${key}:${vars.ms}`),
  }),
}));

vi.mock('../components/settings/SettingsCard', () => ({
  default: ({ id, children }: { id?: string; children?: unknown }) => createElement('section', { 'data-setting-id': id }, children as never),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('media provider settings', () => {
  it('shows Jikan, AniList, TVmaze and TMDB with their live state', async () => {
    const status = vi.fn(async () => [
      { id: 'jikan', state: 'ok', latencyMs: 120 },
      { id: 'anilist', state: 'down' },
      { id: 'tvmaze', state: 'ok', latencyMs: 80 },
      { id: 'tmdb', state: 'needs-key' },
    ]);
    vi.stubGlobal('api', { mediaProviderStatus: status });
    (window as unknown as { api: unknown }).api = { mediaProviderStatus: status };
    const { default: MediaProviderPanel } = await import('../components/settings/pages/MediaProviderPanel');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(MediaProviderPanel));
    });
    await act(async () => {
      await Promise.resolve();
    });
    const rows = [...host.querySelectorAll('.media-provider-row')];
    expect(rows.map((r) => r.querySelector('strong')?.textContent)).toEqual(['MyAnimeList (Jikan)', 'AniList', 'TVmaze', 'TMDB']);
    const states = rows.map((r) => r.querySelector('.media-provider-state')?.className ?? '');
    expect(states[0]).toContain('is-ok');
    expect(states[1]).toContain('is-down');
    expect(states[3]).toContain('is-needs-key');
    expect(status).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
