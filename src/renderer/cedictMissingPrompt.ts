/**
 * The one-time "Chinese dictionary missing" prompt (risk4).
 *
 * CC-CEDICT stopped shipping inside the installer: it is the `cc-cedict` asset
 * in Settings > Storage (forge.config.ts `ON_DEMAND_PUBLIC_PATHS`). A Chinese
 * learner who updated lost lookups with no word about why until they looked
 * something up. Now:
 *
 *  - at startup, when the study language is Chinese and main says no Chinese
 *    dictionary can answer (`dictChineseAvailable`), and
 *  - the first time a lookup finds none (main's `dict:cedictMissing`),
 *
 * one notice is posted (Notification Center + toast) with "Download now", which
 * starts the same downloader Settings > Storage uses. It is shown once per
 * profile; the dictionary surfaces keep their own "no Chinese dictionary"
 * message and link either way. A download the learner started is resumed on
 * the next start if it did not finish (the downloader keeps the partial).
 */
import { t, getUiLang } from './i18n';
import { ensureCatalog } from '../shared/i18n/catalogs';
import { notify } from './notificationStore';
import { writeLocalStorage } from './localStorageWrite';
import { getStudyLang } from './studyEnvironment';

export const CEDICT_ASSET_ID = 'cc-cedict';
/** Stable Notification Center id: a repeat replaces the earlier notice. */
export const CEDICT_NOTICE_ID = 'cedict-missing';
const PROMPTED_KEY = 'jp-cedict-missing-prompted-v1';
const WANTED_KEY = 'jp-cedict-download-wanted-v1';

/** States in which the downloader is already working on it: leave it alone. */
const ACTIVE_STATES = new Set(['queued', 'downloading', 'verifying']);

export interface CedictPromptBridge {
  dictChineseAvailable?(): Promise<boolean>;
  assetsIsInstalled?(id: string): Promise<boolean>;
  assetsStart?(id: string): Promise<{ ok: boolean }>;
  assetsList?(): Promise<{ statuses: Array<{ id: string; state: string }> }>;
  onCedictMissing?(cb: () => void): () => void;
}

function bridge(): CedictPromptBridge {
  return ((typeof window !== 'undefined' ? (window as unknown as { api?: CedictPromptBridge }).api : undefined) ?? {});
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function toast(message: string, kind: 'ok' | 'warn' | 'err', action?: { label: string; run: () => void }): void {
  window.dispatchEvent(new CustomEvent('os:toast', {
    detail: { message, kind, record: false, ...(action ? { action } : {}) },
  }));
}

async function chineseAvailable(api: CedictPromptBridge): Promise<boolean> {
  try {
    if (api.dictChineseAvailable) return await api.dictChineseAvailable();
    if (api.assetsIsInstalled) return await api.assetsIsInstalled(CEDICT_ASSET_ID);
  } catch {
    /* cannot tell: do not nag */
  }
  return true;
}

/** "Download now": the Settings > Storage downloader, remembered so a restart resumes it. */
export async function startCedictDownload(api: CedictPromptBridge = bridge()): Promise<boolean> {
  writeLocalStorage(WANTED_KEY, '1');
  if (!api.assetsStart) return false;
  try {
    const res = await api.assetsStart(CEDICT_ASSET_ID);
    if (res?.ok) {
      toast(t('risk4.cedict.downloading'), 'ok');
      return true;
    }
  } catch {
    /* reported below */
  }
  toast(t('risk4.cedict.downloadFailed'), 'err');
  return false;
}

/**
 * Post the notice, once per profile, when nothing can answer a Chinese lookup.
 * Resolves true when it was posted by this call.
 */
export async function promptCedictMissing(api: CedictPromptBridge = bridge()): Promise<boolean> {
  if (readFlag(PROMPTED_KEY)) return false;
  if (await chineseAvailable(api)) return false;
  // Re-checked after the await: two windows asking at once post one notice.
  if (readFlag(PROMPTED_KEY)) return false;
  writeLocalStorage(PROMPTED_KEY, '1');
  await ensureCatalog(getUiLang());
  const titleKey = 'risk4.cedict.title';
  const messageKey = 'risk4.cedict.missing';
  notify({
    id: CEDICT_NOTICE_ID,
    title: t(titleKey),
    message: t(messageKey),
    i18n: { title: titleKey, message: messageKey },
    kind: 'warning',
    source: 'dictionary',
    clientAction: 'download-cedict',
  });
  toast(t(messageKey), 'warn', { label: t('risk4.cedict.download'), run: () => void startCedictDownload(api) });
  return true;
}

export type CedictStartupOutcome = 'available' | 'resumed' | 'downloading' | 'prompted' | 'skipped';

/**
 * The startup half. A download the learner asked for and that has not finished
 * is resumed (no prompt); otherwise a Chinese learner with no Chinese
 * dictionary gets the one-time prompt.
 */
export async function checkCedictOnStartup(
  studyLang: string = getStudyLang(),
  api: CedictPromptBridge = bridge(),
): Promise<CedictStartupOutcome> {
  const wanted = readFlag(WANTED_KEY);
  if (wanted) {
    let installed = false;
    try {
      installed = (await api.assetsIsInstalled?.(CEDICT_ASSET_ID)) === true;
    } catch {
      installed = false;
    }
    if (installed) {
      writeLocalStorage(WANTED_KEY, '0');
      return 'available';
    }
    let state = '';
    try {
      state = (await api.assetsList?.())?.statuses.find((s) => s.id === CEDICT_ASSET_ID)?.state ?? '';
    } catch {
      state = '';
    }
    if (ACTIVE_STATES.has(state)) return 'downloading';
    try {
      await api.assetsStart?.(CEDICT_ASSET_ID);
    } catch {
      /* the Storage page shows the asset's own error */
    }
    return 'resumed';
  }
  if (studyLang !== 'zh') return 'skipped';
  return (await promptCedictMissing(api)) ? 'prompted' : 'available';
}

/** Wire both halves for this window. Returns the unsubscribe. */
export function installCedictMissingPrompt(api: CedictPromptBridge = bridge()): () => void {
  const off = api.onCedictMissing?.(() => void promptCedictMissing(api));
  void checkCedictOnStartup(getStudyLang(), api).catch(() => undefined);
  return () => off?.();
}

export const __cedictPromptTestables = { PROMPTED_KEY, WANTED_KEY };
