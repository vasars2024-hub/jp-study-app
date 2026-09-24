// @vitest-environment node
/**
 * App-wide hardening (audit robust #4): a central sender check on every IPC
 * handler, navigation/window.open floors for every webContents, and permission
 * allow-lists instead of Electron's grant-everything default.
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  installIpcSenderGuard,
  installPermissionPolicy,
  installWebContentsHardening,
  isTrustedIpcSender,
  makeAppOriginPolicy,
  permissionAllowed,
  urlOrigin,
} from '../securityHardening';

const packaged = makeAppOriginPolicy(null);
const dev = makeAppOriginPolicy('http://localhost:5173');

function fakeEvent(opts: { type?: string; origin?: string | null; top?: boolean }) {
  return {
    sender: { getType: () => opts.type ?? 'window' },
    senderFrame: opts.origin === null ? null : { origin: opts.origin ?? 'app://bundle', parent: opts.top === false ? {} : null },
  };
}

class FakeIpc extends EventEmitter {
  handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
  handle(channel: string, fn: (e: unknown, ...a: unknown[]) => unknown) {
    this.handlers.set(channel, fn);
  }
  handleOnce(channel: string, fn: (e: unknown, ...a: unknown[]) => unknown) {
    this.handlers.set(channel, fn);
  }
}

describe('origins', () => {
  it('computes app:// origins the way Chromium reports them (Node says "null")', () => {
    expect(urlOrigin('app://bundle/index.html?desk=1')).toBe('app://bundle');
    expect(packaged.isAppUrl('app://bundle/blanc.html')).toBe(true);
    expect(packaged.isAppUrl('https://evil.example/')).toBe(false);
    expect(packaged.isAppUrl('file:///C:/x/index.html')).toBe(false);
    expect(dev.isAppUrl('http://localhost:5173/?popout=reader')).toBe(true);
    expect(dev.isAppOrigin('http://127.0.0.1:5173')).toBe(true);
    expect(packaged.isAppOrigin('http://localhost:5173')).toBe(false);
  });
});

describe('IPC sender guard', () => {
  it('trusts only the app origin, top frame, not a webview guest', () => {
    expect(isTrustedIpcSender({ senderType: 'window', frameOrigin: 'app://bundle', isTopFrame: true }, packaged)).toBe(true);
    expect(isTrustedIpcSender({ senderType: 'webview', frameOrigin: 'app://bundle', isTopFrame: true }, packaged)).toBe(false);
    expect(isTrustedIpcSender({ senderType: 'window', frameOrigin: 'https://evil.example', isTopFrame: true }, packaged)).toBe(false);
    expect(isTrustedIpcSender({ senderType: 'window', frameOrigin: 'app://bundle', isTopFrame: false }, packaged)).toBe(false);
    expect(isTrustedIpcSender({ senderType: 'window', frameOrigin: null, isTopFrame: false }, packaged)).toBe(false);
  });

  it('wraps handlers registered after install: invoke from an untrusted sender rejects and never runs the handler', async () => {
    const ipc = new FakeIpc();
    const blocked: string[] = [];
    installIpcSenderGuard(ipc as never, packaged, (ch) => blocked.push(ch));
    const handler = vi.fn(() => 'ok');
    (ipc as unknown as { handle: FakeIpc['handle'] }).handle('library:remove', handler);
    const wrapped = ipc.handlers.get('library:remove');
    expect(wrapped?.(fakeEvent({}), 'id')).toBe('ok');
    expect(() => wrapped?.(fakeEvent({ type: 'webview', origin: 'https://site.example' }), 'id')).toThrow(/untrusted sender/);
    expect(() => wrapped?.(fakeEvent({ origin: 'https://evil.example' }), 'id')).toThrow();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(blocked).toEqual(['library:remove', 'library:remove']); // once per sender kind
  });

  it('guards ipcMain.on listeners too, and removeListener still finds them', () => {
    const ipc = new FakeIpc();
    installIpcSenderGuard(ipc as never, packaged, () => undefined);
    const listener = vi.fn();
    ipc.on('desk:drag', listener);
    ipc.emit('desk:drag', fakeEvent({ type: 'webview' }), 1);
    expect(listener).not.toHaveBeenCalled();
    ipc.emit('desk:drag', fakeEvent({}), 2);
    expect(listener).toHaveBeenCalledWith(expect.anything(), 2);
    ipc.removeListener('desk:drag', listener);
    expect(ipc.listenerCount('desk:drag')).toBe(0);
  });
});

describe('permissions', () => {
  it('app origins get the microphone (audio only), clipboard and fullscreen; nothing else', () => {
    expect(permissionAllowed('app', 'media', 'app://bundle', packaged, ['audio'])).toBe(true);
    expect(permissionAllowed('app', 'media', 'app://bundle', packaged, ['audio', 'video'])).toBe(false);
    expect(permissionAllowed('app', 'clipboard-read', 'app://bundle', packaged)).toBe(true);
    expect(permissionAllowed('app', 'geolocation', 'app://bundle', packaged)).toBe(false);
    expect(permissionAllowed('app', 'notifications', 'app://bundle', packaged)).toBe(false);
    expect(permissionAllowed('app', 'clipboard-read', 'https://evil.example', packaged)).toBe(false);
  });

  it('sites in the Immersion browser no longer get the microphone or notifications', () => {
    expect(permissionAllowed('immersion', 'media', 'https://site.example', packaged, ['audio'])).toBe(false);
    expect(permissionAllowed('immersion', 'notifications', 'https://site.example', packaged)).toBe(false);
    expect(permissionAllowed('immersion', 'fullscreen', 'https://site.example', packaged)).toBe(true);
  });

  it('installs request and check handlers on the session', () => {
    let request: ((wc: unknown, p: string, cb: (ok: boolean) => void, d: unknown) => void) | null = null;
    let check: ((wc: unknown, p: string, o: string, d: unknown) => boolean) | null = null;
    const ses = {
      setPermissionRequestHandler: (fn: typeof request) => {
        request = fn;
      },
      setPermissionCheckHandler: (fn: typeof check) => {
        check = fn;
      },
    };
    installPermissionPolicy(ses as never, 'app', packaged);
    const cb = vi.fn();
    request?.({ getURL: () => 'app://bundle/index.html' }, 'media', cb, { mediaTypes: ['audio'], requestingUrl: 'app://bundle/index.html' });
    expect(cb).toHaveBeenCalledWith(true);
    request?.({ getURL: () => 'app://bundle/index.html' }, 'media', cb, { mediaTypes: ['video'], requestingUrl: 'app://bundle/index.html' });
    expect(cb).toHaveBeenLastCalledWith(false);
    expect(check?.(null, 'clipboard-read', 'app://bundle', {})).toBe(true);
    expect(check?.(null, 'clipboard-read', 'https://evil.example', {})).toBe(false);
  });
});

describe('web contents floors', () => {
  function created(type: string) {
    const app = new EventEmitter();
    const opened: string[] = [];
    installWebContentsHardening(app as never, packaged, { openExternal: (u) => opened.push(u) });
    const contents = Object.assign(new EventEmitter(), {
      getType: () => type,
      openHandler: null as null | ((d: { url: string }) => { action: string }),
      setWindowOpenHandler(fn: (d: { url: string }) => { action: string }) {
        this.openHandler = fn;
      },
      loadURL: vi.fn(() => Promise.resolve()),
    });
    app.emit('web-contents-created', {}, contents);
    return { contents, opened };
  }

  it('app windows cannot navigate off the app or open windows', () => {
    const { contents, opened } = created('window');
    const e = { preventDefault: vi.fn() };
    contents.emit('will-navigate', e, 'https://evil.example/');
    expect(e.preventDefault).toHaveBeenCalled();
    const ok = { preventDefault: vi.fn() };
    contents.emit('will-navigate', ok, 'app://bundle/index.html');
    expect(ok.preventDefault).not.toHaveBeenCalled();
    expect(contents.openHandler?.({ url: 'https://example.com/' })).toEqual({ action: 'deny' });
    expect(opened).toEqual(['https://example.com/']);
  });

  it('a webview guest popup loads in the same guest instead of a native window', () => {
    const { contents } = created('webview');
    expect(contents.openHandler?.({ url: 'https://news.example/article' })).toEqual({ action: 'deny' });
    expect(contents.loadURL).toHaveBeenCalledWith('https://news.example/article');
    const e = { preventDefault: vi.fn() };
    contents.emit('will-navigate', e, 'app://bundle/index.html');
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('webview attach is forced safe, and a privileged src is refused', () => {
    const { contents } = created('window');
    const prefs: Record<string, unknown> = { nodeIntegration: true, contextIsolation: false, preload: 'C:/evil.js' };
    const e = { preventDefault: vi.fn() };
    contents.emit('will-attach-webview', e, prefs, { src: 'https://site.example/' });
    expect(prefs).toMatchObject({ nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true });
    expect(prefs.preload).toBeUndefined();
    const bad = { preventDefault: vi.fn() };
    contents.emit('will-attach-webview', bad, {}, { src: 'file:///C:/Windows/win.ini' });
    expect(bad.preventDefault).toHaveBeenCalled();
  });
});
