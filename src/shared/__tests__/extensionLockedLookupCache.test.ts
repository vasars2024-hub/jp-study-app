// @vitest-environment jsdom
/**
 * risk4: no cached dictionary answers while Gum is locked.
 *
 * The content script keeps an in-memory LRU of lookups. A word looked up before
 * the lock was answered from it afterwards without asking the app, so the 423
 * the app returns never came into play. Now a locked reply (or the background's
 * `gum-app-locked` broadcast) purges the cache and keeps it shut until an
 * unlocked answer arrives.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createI18nStub, EXTENSION_DIR } from './extensionHarness';

type Listener = (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;

const sent: Array<Record<string, unknown>> = [];
const listeners: Listener[] = [];
let reply: (msg: Record<string, unknown>) => unknown = () => ({ ok: true });

function run(file: string): void {
  // eslint-disable-next-line no-new-func -- evaluates the shipped classic script as the page would
  new Function(readFileSync(path.join(EXTENSION_DIR, file), 'utf8')).call(globalThis);
}

interface Hooks {
  cachedLookup(query: string): Promise<Record<string, unknown>>;
  prefixLookup(text: string, script: string): Promise<Record<string, unknown>>;
  lookupCacheSize(): number;
  appLockedSeen(): boolean;
}

const hooks = (): Hooks => (globalThis as unknown as { __jpStudyTestHooks: Hooks }).__jpStudyTestHooks;

beforeAll(() => {
  Object.assign(globalThis, {
    chrome: {
      runtime: {
        id: 'test-extension',
        lastError: undefined,
        getURL: (p: string) => p,
        onMessage: { addListener: (fn: Listener) => listeners.push(fn), removeListener: () => undefined },
        sendMessage: (msg: Record<string, unknown>, cb?: (r: unknown) => void) => {
          sent.push(msg);
          const out = reply(msg);
          if (cb) setTimeout(() => cb(out), 0);
          return Promise.resolve(out);
        },
      },
      storage: {
        local: { get: async () => ({}), set: async () => undefined },
        onChanged: { addListener: () => undefined, removeListener: () => undefined },
      },
      i18n: createI18nStub('en'),
    },
  });
  (globalThis as unknown as Record<string, unknown>).__JP_STUDY_TEST__ = true;
  run('shared.js');
  run('settings.js');
  run('content.js');
});

const HIT = { ok: true, entries: [{ word: '猫', reading: 'ねこ', via: 'exact', glosses: ['cat'] }] };
const LOCKED = { ok: false, locked: true, code: 'locked', error: 'Gum is locked' };

describe('content script lookup cache and the lock', () => {
  it('a cached answer is not served once the app says it is locked, and the cache is purged', async () => {
    reply = (msg) => (msg.type === 'lookup' ? HIT : { ok: true });
    await hooks().cachedLookup('猫');
    expect(hooks().lookupCacheSize()).toBeGreaterThan(0);
    const before = sent.filter((m) => m.type === 'lookup').length;
    await hooks().cachedLookup('猫'); // served from memory: no request
    expect(sent.filter((m) => m.type === 'lookup').length).toBe(before);

    reply = (msg) => (msg.type === 'lookup' || msg.type === 'scan' ? LOCKED : { ok: true });
    await hooks().cachedLookup('犬'); // a locked reply for any word
    expect(hooks().appLockedSeen()).toBe(true);
    expect(hooks().lookupCacheSize()).toBe(0);

    // The word cached before the lock now goes to the app, which refuses it.
    const res = await hooks().cachedLookup('猫');
    expect(res).toMatchObject({ locked: true });
    expect(sent.filter((m) => m.type === 'lookup' && m.query === '猫').length).toBe(2);
    expect(hooks().lookupCacheSize()).toBe(0);
  });

  it('the background broadcast purges and shuts the cache; an unlocked answer reopens it', async () => {
    reply = (msg) => (msg.type === 'lookup' ? HIT : { ok: true });
    for (const l of listeners) l({ type: 'gum-app-locked', locked: false }, {}, () => undefined);
    await hooks().cachedLookup('鳥');
    expect(hooks().lookupCacheSize()).toBeGreaterThan(0);
    for (const l of listeners) l({ type: 'gum-app-locked', locked: true }, {}, () => undefined);
    expect(hooks().lookupCacheSize()).toBe(0);
    expect(hooks().appLockedSeen()).toBe(true);
    // A real unlocked answer lifts it.
    await hooks().cachedLookup('鳥');
    expect(hooks().appLockedSeen()).toBe(false);
    expect(hooks().lookupCacheSize()).toBeGreaterThan(0);
  });

  it('the hover scan path takes the same rule', async () => {
    reply = (msg) => (msg.type === 'scan' ? LOCKED : { ok: true });
    const out = await hooks().prefixLookup('魚が泳ぐ', 'cjk');
    expect(out).toMatchObject({ locked: true, matched: '' });
    expect(hooks().appLockedSeen()).toBe(true);
    expect(hooks().lookupCacheSize()).toBe(0);
  });
});
