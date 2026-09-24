// @vitest-environment jsdom
/**
 * Settings > Scraper mounts ExternalPlayerPanel, MediaTrackingManager and
 * VideoServerProfilesManager. Their `externalPlayer.*`, `trackingMgmt.*` and
 * `videoServer.*` key blocks were written and translated into ja/zh/ru, but the
 * three components never called t(), so every UI language saw ~115 English
 * strings. This renders all three (forms opened, a rejected tracking change
 * shown) in each non-English language and fails if any English value of those
 * key blocks is still on screen or in an attribute a screen reader reads.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { en, ensureCatalog } from '../../shared/i18n/catalogs';
import { SCRAPER_UI_EN } from '../../shared/i18n/scraperUi/en';
import { normalizeMediaTrackingDocument } from '../../shared/mediaTracking';
import { normalizeVideoServerProfilesDocument } from '../../shared/videoServerProfiles';
import { getUiLang, setUiLang } from '../i18n';
import ExternalPlayerPanel from '../components/settings/pages/ExternalPlayerPanel';
import MediaTrackingManager from '../components/settings/pages/MediaTrackingManager';
import VideoServerProfilesManager from '../components/settings/pages/VideoServerProfilesManager';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';

const trackingDoc = normalizeMediaTrackingDocument({
  version: 1,
  records: [{ identityId: 'anime-frieren', contentType: 'anime', status: 'watching', progress: { kind: 'episodic', watchedEpisodes: [{ season: 1, episode: 3 }], totalEpisodes: 28, totalSeasons: 1 } }],
}).value;
const serverDoc = normalizeVideoServerProfilesDocument({
  profiles: [{ id: 'server-x', name: 'Alpha', provider: '', status: 'active', reliabilityScore: 80, websiteCompatibility: [{ websiteId: 'site-x' }] }],
}).value;

vi.mock('../externalPlayerStore', () => ({
  loadExternalPlayerPreferences: () => ({
    profiles: [{ id: 'p1', name: 'VLC', executablePath: 'C:/vlc.exe', os: 'all', contentType: 'video', arguments: ['{media}'], supportsSubtitles: false, supportsResume: false }],
    defaultProfileId: null, contentTypeProfileIds: {}, lastUsedProfileId: null,
  }),
  saveExternalPlayerPreferences: (value: unknown) => value,
}));
vi.mock('../mediaTrackingStore', () => ({
  loadMediaTrackingDocument: () => trackingDoc,
  manageMediaTrackingEntry: () => ({ ok: false, value: trackingDoc, reason: 'not-found' }),
  removeMediaTrackingEntry: () => trackingDoc,
}));
vi.mock('../videoServerProfilesStore', () => ({
  loadVideoServerProfilesDocument: () => serverDoc,
  saveVideoServerProfilesDocument: (value: unknown) => ({ value, issues: [] }),
  exportVideoServerProfilesDocument: () => '{}',
  importVideoServerProfilesDocument: () => ({ value: serverDoc, issues: [] }),
}));

const settings = { advancedMode: false } as unknown as SettingsController;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

async function switchTo(lang: 'en' | 'ja' | 'zh' | 'ru'): Promise<void> {
  await ensureCatalog(lang);
  setUiLang(lang);
  await new Promise((r) => setTimeout(r, 0));
  expect(getUiLang()).toBe(lang);
}

/** Every English value these panels can render (their key blocks plus the shared buttons). */
function englishValues(): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(SCRAPER_UI_EN)) {
    if (!/^(externalPlayer|trackingMgmt|videoServer)\./.test(key)) continue;
    const forms = typeof value === 'string' ? [value] : Object.values(value);
    for (const form of forms) {
      const literal = form.split(/\{\w+\}/).map((part) => part.trim()).filter((part) => /[a-z]{3}/i.test(part));
      out.push(...literal);
    }
  }
  out.push(String(en['common.remove']), String(en['common.cancel']));
  // Proper nouns and code samples that are legitimately identical in every language.
  const literal = new Set(['VLC', 'mpv', 'IINA', 'server-a', 'site-a', 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', 'JSON']);
  return out.filter((value) => !literal.has(value));
}

function rendered(host: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) out.push(node.textContent ?? '');
  for (const el of host.querySelectorAll('*')) {
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const value = el.getAttribute(attr);
      if (value) out.push(value);
    }
  }
  return out;
}

describe('Settings > Scraper panels render in the UI language', () => {
  afterEach(() => document.body.replaceChildren());
  for (const lang of ['ja', 'zh', 'ru'] as const) {
    it(`has no English left in ${lang}`, async () => {
      await switchTo(lang);
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      await act(async () => {
        root.render(
          <SettingsProvider value={settings}>
            <ExternalPlayerPanel />
            <MediaTrackingManager />
            <VideoServerProfilesManager />
          </SettingsProvider>,
        );
      });
      // Open the external-player form, the server editor, and trigger a rejected tracking change.
      const primary = [...host.querySelectorAll('[data-setting-id="external-players"] button.btn.primary')] as HTMLButtonElement[];
      await act(async () => { primary[primary.length - 1].click(); });
      const rowButtons = host.querySelectorAll('.video-server-row button');
      await act(async () => { (rowButtons[2] as HTMLButtonElement).click(); });
      const favorite = host.querySelector('.tracking-management-grid input[type="checkbox"]') as HTMLInputElement;
      await act(async () => { favorite.click(); });

      expect(host.querySelector('.video-server-compatibility'), 'server editor opened').toBeTruthy();
      expect(host.querySelector('#external-name'), 'player form opened').toBeTruthy();
      const strings = rendered(host).map((value) => value.trim());
      const texts = strings.join('\n');
      // One-word values ('Video', 'Edit') must match a whole string, or the
      // VLC path placeholder's 'VideoLAN' would read as a leak.
      const leaks = englishValues().filter((value) => (value.includes(' ') ? texts.includes(value) : strings.includes(value)));
      expect(leaks, texts).toEqual([]);
      // Enum values kept as <option value>, labels translated.
      const statusSelect = host.querySelector('.tracking-management-grid select') as HTMLSelectElement;
      expect([...statusSelect.options].map((o) => o.value)).toEqual(['planned', 'watching', 'completed', 'on-hold', 'dropped']);
      expect(statusSelect.value).toBe('watching');
      expect(host.querySelector('.form-msg')?.textContent).not.toContain('not-found');
      root.unmount();
    });
  }
  it('keeps the English text in en', async () => {
    await switchTo('en');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<SettingsProvider value={settings}><MediaTrackingManager /><ExternalPlayerPanel /></SettingsProvider>);
    });
    const favorite = host.querySelector('.tracking-management-grid input[type="checkbox"]') as HTMLInputElement;
    await act(async () => { favorite.click(); });
    expect(host.querySelector('.form-msg')?.textContent).toBe('Change rejected: this entry is no longer tracked.');
    expect(host.textContent).toContain('VLC');
    expect(host.textContent).toContain('C:/vlc.exe · Video');
    root.unmount();
  });
});
