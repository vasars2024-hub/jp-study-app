// @vitest-environment jsdom
/**
 * Settings > Scraper mounts ExternalPlayerPanel and VideoServerProfilesManager.
 * Their `externalPlayer.*` and `videoServer.*` key blocks were written and
 * translated into ja/zh/ru, but the components never called t(), so every UI
 * language saw English. This renders both (forms opened) in each non-English
 * language and fails if any English value of those key blocks is still on
 * screen or in an attribute a screen reader reads.
 *
 * MediaTrackingManager and its `trackingMgmt.*` grid were covered here too
 * until the media hub's "one tracking store" replaced that editor with the
 * watch library's counts (media.tracking.*), and ExternalPlayerPanel's copy
 * moved to the media hub's own `externalPlayer.*` block. This checks the
 * panels as they now are.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { en, ensureCatalog } from '../../shared/i18n/catalogs';
import { MEDIA_HUB_EN } from '../../shared/i18n/mediaHub/en';
import { SCRAPER_UI_EN } from '../../shared/i18n/scraperUi/en';
import { normalizeVideoServerProfilesDocument } from '../../shared/videoServerProfiles';
import { getUiLang, setUiLang } from '../i18n';
import ExternalPlayerPanel from '../components/settings/pages/ExternalPlayerPanel';
import VideoServerProfilesManager from '../components/settings/pages/VideoServerProfilesManager';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';

const serverDoc = normalizeVideoServerProfilesDocument({
  profiles: [{ id: 'server-x', name: 'Alpha', provider: '', status: 'active', reliabilityScore: 80, websiteCompatibility: [{ websiteId: 'site-x' }] }],
}).value;

const h = vi.hoisted(() => ({
  prefs: () => ({
    profiles: [{ id: 'p1', name: 'VLC', executablePath: 'C:/vlc.exe', os: 'all', contentType: 'video', arguments: ['{media}'], supportsSubtitles: false, supportsResume: false }],
    defaultProfileId: null, contentTypeProfileIds: {}, lastUsedProfileId: null,
  }),
}));

vi.mock('../externalPlayerStore', () => ({
  loadExternalPlayerPreferences: () => h.prefs(),
  saveExternalPlayerPreferences: (value: unknown) => value,
  commitExternalPlayerPreferences: async (value: unknown) => ({ preferences: value, rejected: [] }),
  hydrateExternalPlayerPreferences: async () => h.prefs(),
  onExternalPlayerPreferencesChanged: () => () => undefined,
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
  const blocks = [
    ...Object.entries(MEDIA_HUB_EN).filter(([key]) => key.startsWith('externalPlayer.')),
    ...Object.entries(SCRAPER_UI_EN).filter(([key]) => key.startsWith('videoServer.')),
  ];
  for (const [, value] of blocks) {
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
            <VideoServerProfilesManager />
          </SettingsProvider>,
        );
      });
      // Open the external-player form and the server editor.
      const primary = [...host.querySelectorAll('[data-setting-id="external-players"] button.btn.primary')] as HTMLButtonElement[];
      await act(async () => { primary[primary.length - 1].click(); });
      const rowButtons = host.querySelectorAll('.video-server-row button');
      await act(async () => { (rowButtons[2] as HTMLButtonElement).click(); });

      expect(host.querySelector('.video-server-compatibility'), 'server editor opened').toBeTruthy();
      expect(host.querySelector('#external-name'), 'player form opened').toBeTruthy();
      const strings = rendered(host).map((value) => value.trim());
      const texts = strings.join('\n');
      // One-word values ('Video', 'Edit') must match a whole string, or the
      // VLC path placeholder's 'VideoLAN' would read as a leak.
      const leaks = englishValues().filter((value) => (value.includes(' ') ? texts.includes(value) : strings.includes(value)));
      expect(leaks, texts).toEqual([]);
      root.unmount();
    });
  }
  it('keeps the English text in en', async () => {
    await switchTo('en');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<SettingsProvider value={settings}><ExternalPlayerPanel /></SettingsProvider>);
    });
    expect(host.textContent).toContain(MEDIA_HUB_EN['externalPlayer.title']);
    expect(host.textContent).toContain('VLC');
    expect(host.textContent).toContain('C:/vlc.exe · Video');
    root.unmount();
  });
});
