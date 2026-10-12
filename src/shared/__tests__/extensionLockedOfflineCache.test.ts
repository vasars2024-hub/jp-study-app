// @vitest-environment node
/**
 * risk4, service-worker half: the offline scan cache (IndexedDB) answers when
 * Gum is closed — but not when the last word from Gum was "locked". A locked
 * app that then closed, or a dropped connection mid-lock, used to fall through
 * to the cache and show study data the lock was hiding. The lock edge is also
 * broadcast to every tab so content scripts purge their in-memory cache.
 */
import { describe, expect, it } from 'vitest';
import { bootBackground, contentSender } from './extensionHarness';

const flush = () => new Promise((r) => setTimeout(r, 10));

const SCAN_HIT = { status: 200, json: { ok: true, matched: '猫', entries: [{ word: '猫', reading: 'ねこ', via: 'exact', glosses: ['cat'] }] } };
const LOCKED = { status: 423, json: { ok: false, code: 'locked', error: 'Gum is locked' } };

describe('offline scan cache and the lock', () => {
  it('serves the offline cache when Gum is simply closed (control)', async () => {
    const h = bootBackground({ responder: (url) => (url.includes('/v1/scan') ? SCAN_HIT : { status: 200, json: { ok: true } }) });
    await h.send({ type: 'scan', text: '猫', lang: 'ja' }, contentSender());
    await flush();
    h.respond(() => 'network-error');
    const res = (await h.send({ type: 'scan', text: '猫', lang: 'ja' }, contentSender())) as Record<string, unknown>;
    expect(res).toMatchObject({ ok: true, fromCache: true });
  });

  it('after a locked reply, offline answers say locked and never come from the cache', async () => {
    const h = bootBackground({ responder: (url) => (url.includes('/v1/scan') ? SCAN_HIT : { status: 200, json: { ok: true } }) });
    await h.send({ type: 'scan', text: '猫', lang: 'ja' }, contentSender());
    await flush();
    h.respond((url) => (url.includes('/v1/scan') ? LOCKED : { status: 200, json: { ok: true } }));
    const locked = (await h.send({ type: 'scan', text: '猫', lang: 'ja' }, contentSender())) as Record<string, unknown>;
    expect(locked).toMatchObject({ ok: false, locked: true });
    await flush();
    // Every tab is told, so content scripts purge their in-memory cache.
    expect(h.sentToTab.some((m) => m.type === 'gum-app-locked' && m.msg.locked === true)).toBe(true);

    h.respond(() => 'network-error');
    const offline = (await h.send({ type: 'scan', text: '猫', lang: 'ja' }, contentSender())) as Record<string, unknown>;
    expect(offline).toMatchObject({ ok: false, locked: true, offline: true });
    expect(offline.fromCache).toBeUndefined();
    expect(offline.entries).toEqual([]);
  });

  it('the unlock edge is broadcast too', async () => {
    const h = bootBackground({ responder: (url) => (url.includes('/v1/scan') ? LOCKED : { status: 200, json: { ok: true } }) });
    await h.send({ type: 'scan', text: '猫', lang: 'ja' }, contentSender());
    await flush();
    h.respond((url) => (url.includes('/v1/scan') ? SCAN_HIT : { status: 200, json: { ok: true } }));
    await h.send({ type: 'scan', text: '猫', lang: 'ja' }, contentSender());
    await flush();
    expect(h.sentToTab.some((m) => m.type === 'gum-app-locked' && m.msg.locked === false)).toBe(true);
  });
});
