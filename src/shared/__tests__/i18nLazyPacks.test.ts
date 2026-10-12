// @vitest-environment jsdom
/**
 * Lazily merged i18n packs (`shared/i18n/catalogs.ts`, "Lazily merged packs").
 *
 * The AI features' strings left the eager English catalog — which every window,
 * Blanc included, carries at boot — for a pack loaded the first time something
 * needs it. What has to hold for that to be invisible to the learner:
 *
 * - `t()` never shows a raw key for a pack key that simply has not arrived: a
 *   neutral placeholder, the load starts, and `useT` subscribers re-render;
 * - a key the loader cannot attribute to the pack by prefix is eager, or it
 *   would render raw until some AI surface happened to load the pack;
 * - the merge never overwrites an eager string, and a language loaded later
 *   brings the pack with it.
 *
 * The suite-wide setup (`shared/i18n/testing/mergeLazyPacks.ts`) merges every
 * pack up front, so each case here starts from a FRESH module graph.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Loader = typeof import('../i18n/catalogs');

async function freshLoader(): Promise<Loader> {
  vi.resetModules();
  return import('../i18n/catalogs');
}

beforeEach(() => {
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.resetModules();
});

describe('which keys are lazy', () => {
  it('every AI pack key is under a pack prefix, or eager (never raw-until-loaded)', async () => {
    const loader = await freshLoader();
    const { AI_PACK_EN } = await import('../i18n/aiPack/en');
    const strays = Object.keys(AI_PACK_EN).filter(
      (key) => loader.i18nPackForKey(key) !== 'ai' && loader.en[key] === undefined,
    );
    expect(strays).toEqual([]);
  });

  it('the eager English catalog carries none of the pack (that is the boot saving)', async () => {
    const loader = await freshLoader();
    const { AI_PACK_EN } = await import('../i18n/aiPack/en');
    const keys = Object.keys(AI_PACK_EN);
    expect(keys.length).toBeGreaterThan(300);
    expect(keys.filter((key) => loader.en[key] !== undefined)).toEqual([]);
  });

  it('every pack language covers the English pack', async () => {
    const [{ AI_PACK_EN }, { AI_PACK_JA }, { AI_PACK_ZH }, { AI_PACK_RU }] = await Promise.all([
      import('../i18n/aiPack/en'),
      import('../i18n/aiPack/ja'),
      import('../i18n/aiPack/zh'),
      import('../i18n/aiPack/ru'),
    ]);
    for (const pack of [AI_PACK_JA, AI_PACK_ZH, AI_PACK_RU]) {
      expect(Object.keys(AI_PACK_EN).filter((key) => pack[key] === undefined)).toEqual([]);
    }
  });

  it('attributes keys by prefix only', async () => {
    const loader = await freshLoader();
    expect(loader.i18nPackForKey('aiStudy.badge')).toBe('ai');
    expect(loader.i18nPackForKey('aiProv.error.generic')).toBe('ai');
    expect(loader.i18nPackForKey('settings.appTitle')).toBeNull();
    // `ai.` alone is not a pack prefix: the pack owns named namespaces, not a letter pair.
    expect(loader.i18nPackForKey('aiming.x')).toBeNull();
  });
});

describe('the loader', () => {
  it('loads, merges into English, notifies once, and stops reporting the key as pending', async () => {
    const loader = await freshLoader();
    expect(loader.en['aiStudy.badge']).toBeUndefined();
    expect(loader.pendingI18nPack('aiStudy.badge')).toBe('ai');
    const listener = vi.fn();
    loader.onI18nPacksChanged(listener);

    await Promise.all([loader.ensureI18nPack('ai'), loader.ensureI18nPack('ai')]);

    expect(loader.en['aiStudy.badge']).toBe('AI suggestion');
    expect(loader.isI18nPackLoaded('ai', 'en')).toBe(true);
    expect(loader.pendingI18nPack('aiStudy.badge')).toBeNull();
    // A key the pack does not have is a bug, shown as itself — not a placeholder forever.
    expect(loader.pendingI18nPack('aiStudy.noSuchKey')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    await loader.ensureI18nPack('ai');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a language loaded after the pack was asked for arrives with it', async () => {
    const loader = await freshLoader();
    await loader.ensureI18nPack('ai');
    expect(loader.isCatalogLoaded('ja')).toBe(false);

    const ja = await loader.ensureCatalog('ja');

    expect(ja['aiStudy.badge']).toBeTruthy();
    expect(ja['aiStudy.badge']).not.toBe('AI suggestion');
    expect(loader.isI18nPackLoaded('ai', 'ja')).toBe(true);
  });

  it('a pack asked for in a language already loaded merges into it too', async () => {
    const loader = await freshLoader();
    const ru = await loader.ensureCatalog('ru');
    expect(ru['aiStudy.badge']).toBeUndefined();
    await loader.ensureI18nPack('ai', 'ru');
    expect(loader.catalogFor('ru')['aiStudy.badge']).toBeTruthy();
    expect(loader.en['aiStudy.badge']).toBe('AI suggestion');
  });

  it('never overwrites an eager string, and a reset takes back exactly what it added', async () => {
    const loader = await freshLoader();
    const eagerClose = loader.en['aiStudy.close'];
    expect(eagerClose).toBe('Close');
    loader.registerI18nPack('ai', 'en', { 'aiStudy.close': 'OVERWRITTEN', 'aiStudy.onlyInPack': 'Added' });
    expect(loader.en['aiStudy.close']).toBe('Close');
    expect(loader.en['aiStudy.onlyInPack']).toBe('Added');

    loader.resetI18nPacksForTest();

    expect(loader.en['aiStudy.onlyInPack']).toBeUndefined();
    expect(loader.en['aiStudy.close']).toBe('Close');
    expect(loader.pendingI18nPack('aiStudy.badge')).toBe('ai');
  });
});

describe('renderer t() and useT', () => {
  it('shows a placeholder — never the raw key — until the pack lands, then the text', async () => {
    vi.resetModules();
    const i18n = await import('../../renderer/i18n');
    const loader = await import('../i18n/catalogs');

    const before = i18n.t('aiStudy.badge');
    expect(before).toBe(i18n.I18N_PENDING_TEXT);
    expect(before).not.toContain('aiStudy');
    // Asking started the load; it is the same promise a caller can await.
    await i18n.ensureUiPack('ai');
    expect(loader.isI18nPackLoaded('ai')).toBe(true);
    expect(i18n.t('aiStudy.badge')).toBe('AI suggestion');
    // Eager keys never wait, and a missing non-pack key still shows itself.
    expect(i18n.t('aiTutor.goal.button')).toBe('Suggest targets');
    expect(i18n.t('no.such.key')).toBe('no.such.key');
  });

  it('re-renders a mounted surface when the pack arrives, keeping `t` one function', async () => {
    vi.resetModules();
    const i18n = await import('../../renderer/i18n');
    const seen: string[] = [];
    const fns = new Set<unknown>();
    function Probe() {
      const { t } = i18n.useT();
      fns.add(t);
      const text = t('aiStudy.whyWrong.button');
      seen.push(text);
      return createElement('span', null, text);
    }
    const host = document.createElement('div');
    const root = createRoot(host);
    // Synchronous act: the first paint, before the pack chunk can resolve.
    act(() => {
      root.render(createElement(Probe));
    });
    expect(host.textContent).toBe(i18n.I18N_PENDING_TEXT);

    await act(async () => {
      await i18n.ensureUiPack('ai');
    });

    expect(host.textContent).toBe('Why was I wrong?');
    expect(seen.some((text) => text.includes('aiStudy.'))).toBe(false);
    expect(fns.size).toBe(1);
    await act(async () => root.unmount());
  });
});
