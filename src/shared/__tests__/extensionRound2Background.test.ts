// @vitest-environment node
/**
 * Extension round 2, service-worker half:
 * - page scripts are registered dynamically, with `allFrames` following the
 *   setting (default off), instead of a static manifest entry;
 * - word status: `annotate` goes to /v1/annotate, and falls back to the cached
 *   known-word snapshot (IndexedDB) when Gum is closed;
 * - app error codes / known English app errors become _locales strings.
 */
import { describe, expect, it } from 'vitest';
import { bootBackground, contentSender, extensionMessage, type BackgroundHarness } from './extensionHarness';

const flush = () => new Promise((r) => setTimeout(r, 5));

function registrations(h: BackgroundHarness, api: string): Array<Record<string, unknown>> {
  return h.chrome.calls.filter((c) => c.api === api).map((c) => (c.args[0] as Array<Record<string, unknown>>)[0]);
}

describe('dynamic content-script registration (all_frames setting)', () => {
  it('registers the page scripts top-frame only by default', async () => {
    const h = bootBackground();
    await flush();
    const regs = registrations(h, 'scripting.registerContentScripts');
    expect(regs).toHaveLength(1);
    expect(regs[0]).toMatchObject({
      id: 'gum-content',
      matches: ['http://*/*', 'https://*/*'],
      js: ['shared.js', 'settings.js', 'popup-css.js', 'content.js'],
      css: ['content.css'],
      runAt: 'document_idle',
      allFrames: false,
      persistAcrossSessions: true,
    });
  });

  it('switches the one registration to allFrames when the setting is on, without duplicating it', async () => {
    const h = bootBackground({ seed: { jpStudySettings: { version: 3, allFrames: true } } });
    await flush();
    expect(registrations(h, 'scripting.registerContentScripts')[0]).toMatchObject({ allFrames: true });
    // onInstalled re-syncs: nothing changed, so no second register and no update.
    for (const fn of h.chrome.listeners.onInstalled) fn();
    await flush();
    expect(registrations(h, 'scripting.registerContentScripts')).toHaveLength(1);
    expect(registrations(h, 'scripting.updateContentScripts')).toHaveLength(0);

    // Turned off: the existing registration is updated in place.
    h.chrome.storage.local.data.jpStudySettings = { version: 3, allFrames: false };
    for (const fn of h.chrome.listeners.onInstalled) fn();
    await flush();
    expect(registrations(h, 'scripting.updateContentScripts')[0]).toMatchObject({ id: 'gum-content', allFrames: false });
  });
});

describe('word status: annotate + known snapshot', () => {
  it('forwards visible text to /v1/annotate', async () => {
    const h = bootBackground({
      responder: (url) =>
        url.includes('/v1/annotate')
          ? { status: 200, json: { ok: true, results: [[{ o: 0, n: 1, l: '猫', k: 0 }]] } }
          : { status: 200, json: { ok: true } },
    });
    const res = (await h.send({ type: 'annotate', texts: ['猫です'], lang: 'ja' }, contentSender())) as Record<string, unknown>;
    expect(res).toEqual({ ok: true, results: [[{ o: 0, n: 1, l: '猫', k: 0 }]] });
    const call = h.fetches.find((f) => f.url.includes('/v1/annotate'));
    expect(JSON.parse(String(call?.body))).toEqual({ texts: ['猫です'], lang: 'ja' });
  });

  it('falls back to the cached snapshot (longest known word) when Gum is closed', async () => {
    const h = bootBackground({
      responder: (url) =>
        url.includes('/v1/known-snapshot')
          ? { status: 200, json: { ok: true, version: '2-abc', lang: 'ja', words: { 猫: 3, 学校: 1, 学: 0 } } }
          : { status: 200, json: { ok: true } },
    });
    const refreshed = (await h.send({ type: 'known-snapshot-refresh' }, contentSender())) as Record<string, unknown>;
    expect(refreshed).toEqual({ ok: true, version: '2-abc' });

    h.respond(() => 'network-error');
    const res = (await h.send({ type: 'annotate', texts: ['猫と学校'], lang: 'ja' }, contentSender())) as Record<string, unknown>;
    expect(res).toMatchObject({
      ok: true,
      fromCache: true,
      results: [
        [
          { o: 0, n: 1, l: '猫', k: 3 },
          { o: 2, n: 2, l: '学校', k: 1 },
        ],
      ],
    });
  });

  it('asks for the snapshot with ?since= and keeps the cached map when unchanged', async () => {
    let calls = 0;
    const h = bootBackground({
      responder: (url) => {
        if (!url.includes('/v1/known-snapshot')) return { status: 200, json: { ok: true } };
        calls += 1;
        return calls === 1
          ? { status: 200, json: { ok: true, version: 'v1', words: { 猫: 3 } } }
          : { status: 200, json: { ok: true, version: 'v1', unchanged: true } };
      },
    });
    await h.send({ type: 'known-snapshot-refresh' }, contentSender());
    const second = (await h.send({ type: 'known-snapshot-refresh' }, contentSender())) as Record<string, unknown>;
    expect(second).toEqual({ ok: true, version: 'v1' });
    const urls = h.fetches.filter((f) => f.url.includes('/v1/known-snapshot')).map((f) => f.url);
    expect(urls[1]).toMatch(/\/v1\/known-snapshot\?since=v1$/);
  });
});

type OffscreenMsg = { target?: string; type?: string } & Record<string, unknown>;

function offscreenMessages(h: BackgroundHarness): OffscreenMsg[] {
  return h.chrome.calls
    .filter((c) => c.api === 'runtime.sendMessage')
    .map((c) => c.args[0] as OffscreenMsg)
    .filter((m) => m && m.target === 'offscreen');
}

describe('microphone recording in the offscreen document', () => {
  it('starts a mic recording without tab capture, in the same offscreen flow', async () => {
    const h = bootBackground();
    const res = (await h.send({ type: 'record-start', source: 'mic', video: false })) as Record<string, unknown>;
    expect(res).toMatchObject({ ok: true, recording: true, video: false, source: 'mic' });
    expect(h.chrome.calls.some((c) => c.api === 'tabCapture.getMediaStreamId')).toBe(false);
    expect(h.chrome.calls.some((c) => c.api === 'offscreen.createDocument')).toBe(true);
    const start = offscreenMessages(h).find((m) => m.type === 'offscreen-rec-start');
    expect(start).toMatchObject({ source: 'mic', video: false, streamId: null });
  });

  it('opens options.html#mic to grant the microphone when the offscreen document is refused', async () => {
    const h = bootBackground();
    h.chrome.runtime.sendMessage = ((...args: unknown[]) => {
      h.chrome.calls.push({ api: 'runtime.sendMessage', args });
      const msg = args[0] as OffscreenMsg;
      return Promise.resolve(
        msg?.type === 'offscreen-rec-start' ? { ok: false, name: 'NotAllowedError', error: 'Permission denied' } : undefined,
      );
    }) as never;
    const res = (await h.send({ type: 'record-start', source: 'mic', video: false })) as Record<string, unknown>;
    expect(res).toMatchObject({ ok: false, code: 'mic_permission', error: extensionMessage('bg_micGrantNeeded') });
    const opened = h.chrome.calls.find((c) => c.api === 'tabs.create');
    expect((opened?.args[0] as { url: string }).url).toBe('chrome-extension://testtesttest/options.html#mic');
  });
});

describe('page audio clip (mic-clip) in the offscreen document', () => {
  it('starts and stops the clip there and keeps the document open between', async () => {
    const h = bootBackground();
    h.chrome.runtime.sendMessage = ((...args: unknown[]) => {
      h.chrome.calls.push({ api: 'runtime.sendMessage', args });
      const msg = args[0] as OffscreenMsg;
      if (msg?.type === 'offscreen-clip-stop') return Promise.resolve({ ok: true, dataUrl: 'data:audio/webm;base64,AA', mimeType: 'audio/webm' });
      return Promise.resolve({ ok: true });
    }) as never;
    expect(await h.send({ type: 'mic-clip', action: 'start' }, contentSender())).toEqual({ ok: true, recording: true });
    expect(h.chrome.calls.some((c) => c.api === 'offscreen.closeDocument')).toBe(false);
    expect(await h.send({ type: 'mic-clip', action: 'stop' }, contentSender())).toEqual({
      ok: true,
      recording: false,
      dataUrl: 'data:audio/webm;base64,AA',
      mimeType: 'audio/webm',
    });
    expect(offscreenMessages(h).map((m) => m.type)).toEqual(['offscreen-clip-start', 'offscreen-clip-stop']);
    expect(h.chrome.calls.some((c) => c.api === 'offscreen.closeDocument')).toBe(true);
  });
});

describe('Save to disk (optional downloads permission)', () => {
  async function seedPending(h: BackgroundHarness): Promise<void> {
    const idb = (h.sandbox as unknown as { jpStudyIdb: { put(store: string, v: unknown): Promise<void> } }).jpStudyIdb;
    await idb.put('recs', { id: 'r1', kind: 'mic', status: 'stopped', startedAt: Date.UTC(2026, 9, 8, 5, 0, 0), mimeType: 'audio/webm', chunks: 2 });
    await idb.put('chunks', { key: 'r1:0000000', recId: 'r1', seq: 0, data: 'a', size: 1 });
    await idb.put('chunks', { key: 'r1:0000001', recId: 'r1', seq: 1, data: 'b', size: 1 });
  }

  it('refuses with a code while the permission is not granted (no chrome.downloads)', async () => {
    const h = bootBackground();
    await seedPending(h);
    const res = (await h.send({ type: 'recording-save-disk', id: 'r1' })) as Record<string, unknown>;
    expect(res).toMatchObject({ ok: false, code: 'downloads_permission' });
  });

  it('downloads the offscreen-assembled Blob URL and revokes it when the download completes', async () => {
    const h = bootBackground();
    await seedPending(h);
    const changed: Array<(d: unknown) => void> = [];
    const downloads: unknown[] = [];
    (h.chrome as unknown as Record<string, unknown>).downloads = {
      download: (opts: unknown) => {
        downloads.push(opts);
        return Promise.resolve(42);
      },
      onChanged: { addListener: (fn: (d: unknown) => void) => changed.push(fn) },
    };
    h.chrome.runtime.sendMessage = ((...args: unknown[]) => {
      h.chrome.calls.push({ api: 'runtime.sendMessage', args });
      const msg = args[0] as OffscreenMsg;
      return Promise.resolve(msg?.type === 'offscreen-blob-url' ? { ok: true, url: 'blob:chrome-extension://x/1', size: 2 } : { ok: true });
    }) as never;
    const res = (await h.send({ type: 'recording-save-disk', id: 'r1' })) as Record<string, unknown>;
    expect(res).toEqual({ ok: true, downloadId: 42 });
    expect(offscreenMessages(h).find((m) => m.type === 'offscreen-blob-url')).toMatchObject({ recId: 'r1', mimeType: 'audio/webm' });
    expect(downloads[0]).toMatchObject({ url: 'blob:chrome-extension://x/1', saveAs: true });
    expect(String((downloads[0] as { filename: string }).filename)).toMatch(/^Gum mic recording \d{8}-\d{6}\.webm$/);

    changed[0]({ id: 42, state: { current: 'complete' } });
    await flush();
    expect(offscreenMessages(h).find((m) => m.type === 'offscreen-revoke')).toMatchObject({ url: 'blob:chrome-extension://x/1' });
  });
});

describe('app errors reach toasts in the UI language', () => {
  it('maps an error code to its _locales string', async () => {
    const h = bootBackground({
      responder: () => ({ status: 504, json: { ok: false, code: 'app_window_closed', error: 'Gum window is not open' } }),
    });
    const res = (await h.send({ type: 'known-levels', terms: ['猫'] }, contentSender())) as Record<string, unknown>;
    expect(res.error).toBe(extensionMessage('bg_errAppWindowClosed'));
  });

  it('maps a known English app error that carries no code', async () => {
    const h = bootBackground({ responder: () => ({ status: 504, json: { ok: false, error: 'timeout' } }) });
    const res = (await h.send({ type: 'known-levels', terms: ['猫'] }, contentSender())) as Record<string, unknown>;
    expect(res.error).toBe(extensionMessage('bg_errTimeout'));
  });

  it('keeps an unrecognised app message as the app wrote it', async () => {
    const h = bootBackground({ responder: () => ({ status: 500, json: { ok: false, error: 'Something specific broke' } }) });
    const res = (await h.send({ type: 'known-levels', terms: ['猫'] }, contentSender())) as Record<string, unknown>;
    expect(res.error).toBe('Something specific broke');
  });
});
