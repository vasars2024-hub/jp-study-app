// Slice 70 — the Immersion Browser guest⇄host study-lookup contract.
//
// The feature's whole risk sits in one place: a `<webview>` running arbitrary
// untrusted web content is now allowed to say something to the host. These
// tests are about what it is allowed to say, and what happens when it lies.
//
// Node environment (see vitest.config.ts) — there is no jsdom here, so the
// guest DOM is faked explicitly below. That is the point: the fake records
// *every* call the guest body makes, which is how "the guest cannot reach
// anything outside the enumerated contract" becomes an assertion rather than a
// claim.

import { describe, expect, it, vi } from 'vitest';
import {
  IMMERSION_CONFIG_CHANNEL,
  IMMERSION_GUEST_LIMITS,
  IMMERSION_LOOKUP_CHANNEL,
  buildImmersionGuestPreload,
  createGuestLookupGate,
  immersionGuestBody,
  validateGuestLookupMessage,
  type GuestIpc,
} from '../immersionGuestBridge';

// ---------------------------------------------------------------- fake guest

interface FakeIpcLog {
  sent: { channel: string; payload: unknown }[];
  listened: string[];
  fire(channel: string, payload: unknown): void;
}

/**
 * `ipcRenderer` as the guest preload sees it — but every property other than
 * the two the contract permits throws on access. If the body ever reaches for
 * `invoke`, `send`, `sendSync` (i.e. anything that would reach `ipcMain` and
 * therefore the dictionary IPC), this fake makes it a test failure rather than
 * a code review question.
 */
function fakeIpc(): { ipc: GuestIpc; log: FakeIpcLog } {
  const sent: { channel: string; payload: unknown }[] = [];
  const listened: string[] = [];
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => void>();

  const real = {
    sendToHost(channel: string, payload: unknown) {
      sent.push({ channel, payload });
    },
    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void) {
      listened.push(channel);
      handlers.set(channel, listener);
    },
  };

  const ipc = new Proxy(real, {
    get(target, prop) {
      if (prop === 'sendToHost' || prop === 'on') return (target as never)[prop];
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      throw new Error(`guest reached outside the contract: ipcRenderer.${String(prop)}`);
    },
  }) as unknown as GuestIpc;

  return {
    ipc,
    log: {
      sent,
      listened,
      fire(channel, payload) {
        handlers.get(channel)?.({}, payload);
      },
    },
  };
}

interface FakeGuest {
  win: unknown;
  ipcLog: FakeIpcLog;
  /** DOM-mutating calls the body made. Must stay empty: the guest renders nothing. */
  mutations: string[];
  emit(type: string, event: Record<string, unknown>): void;
  setSelection(text: string): void;
  setCaret(offsetInBlock: number): void;
}

function makeBlock(text: string) {
  const nodes = [{ nodeType: 3, textContent: text, parentElement: null as unknown }];
  const block: Record<string, unknown> = {
    nodeType: 1,
    textContent: text,
    closest: () => block,
    __nodes: nodes,
  };
  nodes[0].parentElement = block;
  return { block, node: nodes[0] };
}

function makeGuest(blockText: string): FakeGuest {
  const { ipc, log } = fakeIpc();
  const { block, node } = makeBlock(blockText);
  const listeners = new Map<string, ((e: unknown) => void)[]>();
  const mutations: string[] = [];
  let selection = '';
  let caretOffset = -1;

  const trap = (name: string) => () => {
    mutations.push(name);
  };

  const doc: Record<string, unknown> = {
    addEventListener(type: string, fn: (e: unknown) => void) {
      const arr = listeners.get(type) ?? [];
      arr.push(fn);
      listeners.set(type, arr);
    },
    createTreeWalker(root: Record<string, unknown>) {
      const ns = (root.__nodes ?? []) as unknown[];
      let i = -1;
      return {
        nextNode() {
          i += 1;
          return ns[i] ?? null;
        },
      };
    },
    caretRangeFromPoint() {
      if (caretOffset < 0) return null;
      return { startContainer: node, startOffset: caretOffset };
    },
    // Anything that would put markup into the untrusted page.
    createElement: trap('createElement'),
    appendChild: trap('appendChild'),
    write: trap('write'),
    body: { appendChild: trap('body.appendChild') },
    head: { appendChild: trap('head.appendChild') },
  };

  const win = {
    document: doc,
    getSelection: () => ({
      toString: () => selection,
      anchorNode: node,
    }),
  };

  immersionGuestBody(ipc, win);

  return {
    win,
    ipcLog: log,
    mutations,
    emit(type, event) {
      (listeners.get(type) ?? []).forEach((fn) => fn(event));
    },
    setSelection(text) {
      selection = text;
    },
    setCaret(offset) {
      caretOffset = offset;
    },
  };
}

const SENTENCE = '猫が魚を食べました。';

function trustedMouseUp(extra: Record<string, unknown> = {}) {
  return { isTrusted: true, clientX: 120, clientY: 240, ...extra };
}
function trustedShiftMove(extra: Record<string, unknown> = {}) {
  return { isTrusted: true, shiftKey: true, clientX: 120, clientY: 240, ...extra };
}

// ------------------------------------------------------- the message contract

describe('validateGuestLookupMessage', () => {
  const good = {
    v: 1 as const,
    kind: 'selection' as const,
    text: SENTENCE,
    offset: 0,
    query: '魚',
    x: 10,
    y: 20,
  };

  it('accepts a well-formed selection message and yields inert data', () => {
    const res = validateGuestLookupMessage({ ...good });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual(good);
    // Rebuilt, not passed through: the guest's object identity does not survive.
    expect(res.value).not.toBe(good);
    expect(Object.keys(res.value).sort()).toEqual(
      ['kind', 'offset', 'query', 'text', 'v', 'x', 'y'],
    );
  });

  it('accepts a well-formed hover message', () => {
    const res = validateGuestLookupMessage({ ...good, kind: 'hover', query: '' });
    expect(res.ok).toBe(true);
  });

  it.each([
    ['non-objects', null, 'not-an-object'],
    ['arrays', [1, 2, 3], 'not-an-object'],
    ['strings', 'not a message', 'not-an-object'],
  ])('rejects %s', (_label, raw, reason) => {
    const res = validateGuestLookupMessage(raw);
    expect(res).toEqual({ ok: false, reason });
  });

  it('rejects an unrecognised field rather than ignoring it', () => {
    const res = validateGuestLookupMessage({ ...good, exec: 'rm -rf /' });
    expect(res).toEqual({ ok: false, reason: 'unknown-field' });
  });

  it('rejects a missing field', () => {
    const { y: _y, ...missing } = good;
    expect(validateGuestLookupMessage(missing)).toEqual({ ok: false, reason: 'missing-field' });
  });

  it('rejects a wrong protocol version', () => {
    expect(validateGuestLookupMessage({ ...good, v: 2 })).toEqual({
      ok: false,
      reason: 'bad-version',
    });
  });

  it('rejects an unknown kind', () => {
    expect(validateGuestLookupMessage({ ...good, kind: 'exec' })).toEqual({
      ok: false,
      reason: 'bad-kind',
    });
  });

  it('rejects empty and non-string text', () => {
    expect(validateGuestLookupMessage({ ...good, text: '' }).ok).toBe(false);
    expect(validateGuestLookupMessage({ ...good, text: 42 })).toEqual({
      ok: false,
      reason: 'bad-text',
    });
  });

  it('rejects oversized text', () => {
    const over = 'あ'.repeat(IMMERSION_GUEST_LIMITS.maxText + 1);
    expect(validateGuestLookupMessage({ ...good, text: over })).toEqual({
      ok: false,
      reason: 'text-too-long',
    });
    const exact = 'あ'.repeat(IMMERSION_GUEST_LIMITS.maxText);
    expect(validateGuestLookupMessage({ ...good, text: exact }).ok).toBe(true);
  });

  it('rejects an offset outside the text it claims to index', () => {
    for (const offset of [-1, SENTENCE.length, 1.5, Number.NaN, '0']) {
      expect(validateGuestLookupMessage({ ...good, offset }).ok).toBe(false);
    }
  });

  it('rejects an oversized selection query', () => {
    const over = 'あ'.repeat(IMMERSION_GUEST_LIMITS.maxQuery + 1);
    expect(validateGuestLookupMessage({ ...good, query: over })).toEqual({
      ok: false,
      reason: 'query-too-long',
    });
  });

  it('will not let the two kinds impersonate each other', () => {
    expect(validateGuestLookupMessage({ ...good, kind: 'hover', query: '魚' })).toEqual({
      ok: false,
      reason: 'query-mismatch',
    });
    expect(validateGuestLookupMessage({ ...good, kind: 'selection', query: '' })).toEqual({
      ok: false,
      reason: 'query-mismatch',
    });
  });

  it('rejects non-finite and implausible coordinates', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 1e9, '10', null]) {
      expect(validateGuestLookupMessage({ ...good, x: bad }).ok).toBe(false);
      expect(validateGuestLookupMessage({ ...good, y: bad }).ok).toBe(false);
    }
  });

  it('does not let a prototype-polluting payload through', () => {
    const hostile = JSON.parse(
      `{"v":1,"kind":"hover","text":"猫","offset":0,"query":"","x":1,"y":1,"__proto__":{"polluted":true}}`,
    );
    const res = validateGuestLookupMessage(hostile);
    // Either it is rejected as an unknown field or the rebuilt value is clean —
    // what must never happen is `polluted` reaching the lookup path.
    if (res.ok) {
      expect((res.value as unknown as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.getPrototypeOf(res.value)).toBe(Object.prototype);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ------------------------------------------------------------------ the gate

describe('createGuestLookupGate', () => {
  it('accepts up to the window budget and then drops', () => {
    const gate = createGuestLookupGate({ windowMs: 1000, maxPerWindow: 3 });
    expect(gate.accept(0)).toBe(true);
    expect(gate.accept(10)).toBe(true);
    expect(gate.accept(20)).toBe(true);
    expect(gate.accept(30)).toBe(false);
    expect(gate.accept(40)).toBe(false);
    expect(gate.dropped()).toBe(2);
  });

  it('recovers once the window slides past', () => {
    const gate = createGuestLookupGate({ windowMs: 1000, maxPerWindow: 2 });
    expect(gate.accept(0)).toBe(true);
    expect(gate.accept(1)).toBe(true);
    expect(gate.accept(2)).toBe(false);
    expect(gate.accept(1000)).toBe(true);
    expect(gate.accept(1001)).toBe(true);
    expect(gate.accept(1002)).toBe(false);
  });

  it('caps a flood at the documented rate regardless of how fast it arrives', () => {
    const gate = createGuestLookupGate();
    let accepted = 0;
    for (let i = 0; i < 10_000; i += 1) if (gate.accept(500)) accepted += 1;
    expect(accepted).toBe(IMMERSION_GUEST_LIMITS.maxPerWindow);
    expect(gate.dropped()).toBe(10_000 - IMMERSION_GUEST_LIMITS.maxPerWindow);
  });
});

// ------------------------------------------------------------- the guest body

describe('immersionGuestBody', () => {
  it('listens on exactly one channel and sends on exactly one channel', () => {
    const g = makeGuest(SENTENCE);
    expect(g.ipcLog.listened).toEqual([IMMERSION_CONFIG_CHANNEL]);

    g.setSelection('魚');
    g.emit('mouseup', trustedMouseUp());
    g.setCaret(2);
    g.emit('mousemove', trustedShiftMove());

    expect(g.ipcLog.sent.length).toBeGreaterThan(0);
    expect([...new Set(g.ipcLog.sent.map((m) => m.channel))]).toEqual([IMMERSION_LOOKUP_CHANNEL]);
  });

  it('turns a real selection into a message the host accepts', () => {
    const g = makeGuest(SENTENCE);
    g.setSelection('魚');
    g.emit('mouseup', trustedMouseUp());

    expect(g.ipcLog.sent).toHaveLength(1);
    const res = validateGuestLookupMessage(g.ipcLog.sent[0]!.payload);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.kind).toBe('selection');
    expect(res.value.query).toBe('魚');
    expect(res.value.text).toBe(SENTENCE);
    expect(res.value.x).toBe(120);
    expect(res.value.y).toBe(240);
  });

  it('ignores a synthetic (untrusted) mouseup — the page cannot fake a gesture', () => {
    const g = makeGuest(SENTENCE);
    g.setSelection('魚');
    g.emit('mouseup', trustedMouseUp({ isTrusted: false }));
    expect(g.ipcLog.sent).toHaveLength(0);
  });

  it('ignores a synthetic shift-move', () => {
    const g = makeGuest(SENTENCE);
    g.setCaret(2);
    g.emit('mousemove', trustedShiftMove({ isTrusted: false }));
    expect(g.ipcLog.sent).toHaveLength(0);
  });

  it('sends nothing on a plain hover without the modifier', () => {
    const g = makeGuest(SENTENCE);
    g.setCaret(2);
    g.emit('mousemove', trustedShiftMove({ shiftKey: false }));
    expect(g.ipcLog.sent).toHaveLength(0);
  });

  it('sends nothing on a mouseup with no selection', () => {
    const g = makeGuest(SENTENCE);
    g.setSelection('   ');
    g.emit('mouseup', trustedMouseUp());
    expect(g.ipcLog.sent).toHaveLength(0);
  });

  it('turns a shift-hover into a hover message carrying the caret offset', () => {
    const g = makeGuest(SENTENCE);
    g.setCaret(2);
    g.emit('mousemove', trustedShiftMove());

    expect(g.ipcLog.sent).toHaveLength(1);
    const res = validateGuestLookupMessage(g.ipcLog.sent[0]!.payload);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.kind).toBe('hover');
    expect(res.value.query).toBe('');
    expect(res.value.text[res.value.offset]).toBe(SENTENCE[2]);
  });

  it('does not re-fire while the caret sits on the same character', () => {
    const g = makeGuest(SENTENCE);
    vi.useFakeTimers();
    try {
      g.setCaret(2);
      g.emit('mousemove', trustedShiftMove());
      vi.advanceTimersByTime(500);
      g.emit('mousemove', trustedShiftMove());
      expect(g.ipcLog.sent).toHaveLength(1);

      g.setCaret(4);
      vi.advanceTimersByTime(500);
      g.emit('mousemove', trustedShiftMove());
      expect(g.ipcLog.sent).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('windows an oversized block so the payload can never exceed the cap', () => {
    const huge = 'あ'.repeat(5000) + '魚' + 'い'.repeat(5000);
    const g = makeGuest(huge);
    g.setCaret(5000);
    g.emit('mousemove', trustedShiftMove());

    expect(g.ipcLog.sent).toHaveLength(1);
    const res = validateGuestLookupMessage(g.ipcLog.sent[0]!.payload);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.text.length).toBe(IMMERSION_GUEST_LIMITS.maxText);
    // The rebased offset must still point at the character the user hovered.
    expect(res.value.text[res.value.offset]).toBe('魚');
  });

  it('rate-limits itself, and every message it does emit is host-valid', () => {
    const g = makeGuest(SENTENCE);
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 200; i += 1) {
        g.setSelection(i % 2 === 0 ? '魚' : '猫');
        g.emit('mouseup', trustedMouseUp());
      }
      expect(g.ipcLog.sent.length).toBeLessThanOrEqual(IMMERSION_GUEST_LIMITS.maxPerWindow);
      for (const m of g.ipcLog.sent) {
        expect(validateGuestLookupMessage(m.payload).ok).toBe(true);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops sending when the host disables it, and resumes when re-enabled', () => {
    const g = makeGuest(SENTENCE);
    g.ipcLog.fire(IMMERSION_CONFIG_CHANNEL, { enabled: false });
    g.setSelection('魚');
    g.emit('mouseup', trustedMouseUp());
    expect(g.ipcLog.sent).toHaveLength(0);

    g.ipcLog.fire(IMMERSION_CONFIG_CHANNEL, { enabled: true });
    g.emit('mouseup', trustedMouseUp());
    expect(g.ipcLog.sent).toHaveLength(1);
  });

  it('ignores a malformed config message rather than crashing the guest', () => {
    const g = makeGuest(SENTENCE);
    for (const junk of [null, 'off', 0, { enabled: 'no' }, []]) {
      g.ipcLog.fire(IMMERSION_CONFIG_CHANNEL, junk);
    }
    g.setSelection('魚');
    g.emit('mouseup', trustedMouseUp());
    expect(g.ipcLog.sent).toHaveLength(1);
  });

  it('never puts markup into the untrusted page', () => {
    const g = makeGuest(SENTENCE);
    g.setSelection('魚');
    g.emit('mouseup', trustedMouseUp());
    g.setCaret(2);
    g.emit('mousemove', trustedShiftMove());
    expect(g.mutations).toEqual([]);
  });
});

// ------------------------------------------------------ the serialized preload

describe('buildImmersionGuestPreload', () => {
  const src = buildImmersionGuestPreload();

  it('is syntactically valid JavaScript', () => {
    expect(() => new Function(src)).not.toThrow();
  });

  it('is self-contained — the body references no module-scope binding', () => {
    const body = immersionGuestBody.toString();
    // If these constants were imported rather than re-declared inline, bundling
    // would rename them and the guest would throw ReferenceError at install.
    expect(body).toContain(IMMERSION_LOOKUP_CHANNEL);
    expect(body).toContain(IMMERSION_CONFIG_CHANNEL);
    expect(body).not.toContain('IMMERSION_GUEST_LIMITS');
    expect(body).not.toContain('IMMERSION_LOOKUP_CHANNEL');
  });

  it('keeps its inlined limits in step with IMMERSION_GUEST_LIMITS', () => {
    const body = immersionGuestBody.toString();
    /**
     * Compare the VALUE, not the source text.
     *
     * The first version asserted `body).toContain('WINDOW_MS = 1000')` and failed, while the
     * source genuinely reads `var WINDOW_MS = 1000;` — because this body is read back through
     * `Function.prototype.toString()` AFTER esbuild has transformed the module, and esbuild
     * re-encodes the numeric literal as `1e3`. The guard was measuring how the bundler chose to
     * spell a number, which it is free to change for any value at any time.
     *
     * `Number('1e3') === 1000`, so parsing the literal keeps the guard's real job — catching a
     * limit that drifts out of step with `IMMERSION_GUEST_LIMITS` — without depending on the
     * spelling.
     */
    const inlined = (name: string): number => {
      const hit = body.match(new RegExp(`${name}\\s*=\\s*([0-9.eE+-]+)`));
      if (!hit) throw new Error(`${name} is not declared in the serialized guest body at all`);
      return Number(hit[1]);
    };
    expect(inlined('MAX_TEXT')).toBe(IMMERSION_GUEST_LIMITS.maxText);
    expect(inlined('MAX_QUERY')).toBe(IMMERSION_GUEST_LIMITS.maxQuery);
    expect(inlined('WINDOW_MS')).toBe(IMMERSION_GUEST_LIMITS.windowMs);
    expect(inlined('MAX_PER_WINDOW')).toBe(IMMERSION_GUEST_LIMITS.maxPerWindow);
  });

  it('takes only ipcRenderer from electron and nothing else', () => {
    expect(src).toContain("const { ipcRenderer } = require('electron');");
    for (const forbidden of ['contextBridge', 'webFrame', '@electron/remote', 'nodeIntegration']) {
      expect(src).not.toContain(forbidden);
    }
  });

  it('exposes nothing on the guest window', () => {
    // No global assignment: the page's main world gains no new property, so a
    // hostile page cannot find, wrap, or drive the bridge.
    expect(src).not.toMatch(/window\.[A-Za-z_$][\w$]*\s*=/);
    expect(src).not.toContain('exposeInMainWorld');
  });
});
