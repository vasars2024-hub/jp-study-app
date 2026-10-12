// @vitest-environment jsdom
/**
 * risk4: CC-CEDICT is a download now (forge.config.ts), so a Chinese learner who
 * updated gets one "Download now" prompt — at startup when the study language
 * is Chinese, or on the first lookup that finds no Chinese dictionary — and a
 * download they started resumes on the next start.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../localStorageWrite', () => ({
  writeLocalStorage: vi.fn((key: string, value: string) => {
    localStorage.setItem(key, value);
    return true;
  }),
}));

import {
  CEDICT_NOTICE_ID,
  checkCedictOnStartup,
  installCedictMissingPrompt,
  promptCedictMissing,
  startCedictDownload,
  type CedictPromptBridge,
} from '../cedictMissingPrompt';
import { clearAll, getNotifications } from '../notificationStore';

function bridge(over: Partial<CedictPromptBridge> = {}) {
  return {
    dictChineseAvailable: vi.fn(async () => false),
    assetsIsInstalled: vi.fn(async () => false),
    assetsStart: vi.fn(async () => ({ ok: true })),
    assetsList: vi.fn(async () => ({ statuses: [] as Array<{ id: string; state: string }> })),
    ...over,
  };
}

const toasts: Array<{ message: string; action?: { label: string; run: () => void } }> = [];
const onToast = (e: Event) => toasts.push((e as CustomEvent).detail);

beforeEach(() => {
  localStorage.clear();
  clearAll();
  toasts.length = 0;
  window.addEventListener('os:toast', onToast);
});
afterEach(() => window.removeEventListener('os:toast', onToast));

const cedictNotices = () => getNotifications().filter((n) => n.clientId === CEDICT_NOTICE_ID);

describe('startup', () => {
  it('a Chinese learner with no Chinese dictionary gets the prompt once, with Download now', async () => {
    const api = bridge();
    expect(await checkCedictOnStartup('zh', api)).toBe('prompted');
    expect(cedictNotices()).toHaveLength(1);
    expect(cedictNotices()[0]).toMatchObject({ clientAction: 'download-cedict', kind: 'warning' });
    expect(toasts.at(-1)?.action).toBeDefined();
    // A restart does not prompt again.
    expect(await checkCedictOnStartup('zh', api)).toBe('available');
    expect(cedictNotices()).toHaveLength(1);
  });

  it('nothing for a Japanese learner, or when a Chinese dictionary can answer', async () => {
    expect(await checkCedictOnStartup('ja', bridge())).toBe('skipped');
    expect(await checkCedictOnStartup('zh', bridge({ dictChineseAvailable: vi.fn(async () => true) }))).toBe('available');
    expect(cedictNotices()).toHaveLength(0);
  });

  it('a download the learner started resumes on the next start, without a prompt', async () => {
    const api = bridge({
      assetsList: vi.fn(async () => ({ statuses: [{ id: 'cc-cedict', state: 'paused' }] })),
    });
    await startCedictDownload(api);
    expect(api.assetsStart).toHaveBeenCalledTimes(1);
    expect(await checkCedictOnStartup('zh', api)).toBe('resumed');
    expect(api.assetsStart).toHaveBeenCalledTimes(2);
    expect(cedictNotices()).toHaveLength(0);
    // Still running: left alone. Finished: the memory is cleared.
    vi.mocked(api.assetsList).mockResolvedValue({ statuses: [{ id: 'cc-cedict', state: 'downloading' }] });
    expect(await checkCedictOnStartup('zh', api)).toBe('downloading');
    vi.mocked(api.assetsIsInstalled).mockResolvedValue(true);
    expect(await checkCedictOnStartup('zh', api)).toBe('available');
    expect(localStorage.getItem('jp-cedict-download-wanted-v1')).toBe('0');
  });

  it('the toast action starts the Storage downloader', async () => {
    const api = bridge();
    await promptCedictMissing(api);
    toasts.at(-1)?.action?.run();
    await vi.waitFor(() => expect(api.assetsStart).toHaveBeenCalledWith('cc-cedict'));
  });
});

describe('on the first lookup that finds none', () => {
  it('main\'s event prompts even when the study language is not Chinese', async () => {
    let fire: (() => void) | null = null;
    const api = bridge({
      onCedictMissing: (cb: () => void) => {
        fire = cb;
        return () => {
          fire = null;
        };
      },
    });
    const off = installCedictMissingPrompt(api);
    await vi.waitFor(() => expect(fire).not.toBeNull());
    fire!();
    await vi.waitFor(() => expect(cedictNotices()).toHaveLength(1));
    fire!();
    await new Promise((r) => setTimeout(r, 10));
    expect(cedictNotices()).toHaveLength(1);
    off();
    expect(fire).toBeNull();
  });
});
