/**
 * Dev-only inspection bridge (never starts in a packaged build).
 *
 * Two halves, deliberately split by durability:
 *  - A log tee that mirrors renderer/main console output to `debug/app.log`.
 *    Survives a crash, so the stack trace is still readable afterwards.
 *  - A loopback HTTP server that answers live queries (read the DOM, run JS,
 *    capture a window, send input). Dies with the process, by design.
 *
 * Follows the same shape as extensionServer.ts: binds 127.0.0.1 only, every
 * route requires a Bearer token, and the port/token pair is written to a state
 * file that only local processes can read.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, app } from 'electron';

const DEBUG_PORT = 39273;
const LOG_RING_LIMIT = 2000;
const LOG_FILE_MAX_BYTES = 5 * 1024 * 1024;

export interface DebugLogEntry {
  ts: number;
  source: string;
  level: string;
  message: string;
}

let server: http.Server | null = null;
let token = '';
let logStream: fs.WriteStream | null = null;
const ring: DebugLogEntry[] = [];

/** Project root in dev — where `debug/` lives. */
function debugRoot(): string {
  return path.join(process.cwd(), 'debug');
}

function ensureDebugRoot(): string {
  const root = debugRoot();
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch {
    /* best effort — the bridge must never take the app down */
  }
  return root;
}

/**
 * Record one line. Called by main.ts's renderer console forwarder and by the
 * process-level error hooks below.
 */
export function recordDebugLog(source: string, level: string, message: string): void {
  if (!message) return;
  const entry: DebugLogEntry = { ts: Date.now(), source, level, message };
  ring.push(entry);
  if (ring.length > LOG_RING_LIMIT) ring.splice(0, ring.length - LOG_RING_LIMIT);
  if (logStream) {
    const stamp = new Date(entry.ts).toISOString();
    try {
      logStream.write(`${stamp} [${source}/${level}] ${message}\n`);
    } catch {
      /* a broken log stream must not break the app */
    }
  }
}

function openLogFile(): void {
  const file = path.join(ensureDebugRoot(), 'app.log');
  // Roll the file when it gets large so a long session can't fill the disk.
  try {
    const stat = fs.statSync(file);
    if (stat.size > LOG_FILE_MAX_BYTES) fs.renameSync(file, `${file}.prev`);
  } catch {
    /* no existing log — nothing to roll */
  }
  try {
    logStream = fs.createWriteStream(file, { flags: 'a' });
    logStream.on('error', () => {
      logStream = null;
    });
  } catch {
    logStream = null;
  }
}

/** Snapshot of the current window set — the durable half of the state view. */
function windowSummaries(): Array<Record<string, unknown>> {
  return BrowserWindow.getAllWindows().map((win) => {
    const bounds = win.getBounds();
    return {
      id: win.id,
      title: win.getTitle(),
      url: win.webContents.getURL(),
      visible: win.isVisible(),
      focused: win.isFocused(),
      minimized: win.isMinimized(),
      maximized: win.isMaximized(),
      bounds,
      destroyed: win.isDestroyed(),
    };
  });
}

function writeStateSnapshot(): void {
  try {
    fs.writeFileSync(
      path.join(ensureDebugRoot(), 'state.json'),
      JSON.stringify({ ts: Date.now(), windows: windowSummaries() }, null, 2),
    );
  } catch {
    /* best effort */
  }
}

/**
 * The full desktop window. Every companion window (Blanc `?blanc=1`, Mini and
 * lockscreen `?popout=…`) loads the SPA with a query string; only the main
 * desktop loads it bare. getAllWindows() order is not creation order, so
 * position in that array can't be used to identify it.
 */
function mainDesktopWindow(live: BrowserWindow[]): BrowserWindow | null {
  const bare = live.find((w) => {
    try {
      return new URL(w.webContents.getURL()).search === '';
    } catch {
      return false;
    }
  });
  // Fall back to the largest window if every URL carries a query string.
  return (
    bare ??
    live
      .slice()
      .sort((a, b) => b.getBounds().width * b.getBounds().height - a.getBounds().width * a.getBounds().height)[0] ??
    null
  );
}

/**
 * Resolve a window target. Accepts a numeric id, "focused", "main", or a
 * substring matched against the window title/URL (so "blanc" or "mini" work).
 */
function resolveWindow(target: unknown): BrowserWindow | null {
  const live = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  if (live.length === 0) return null;
  if (target === undefined || target === null || target === '' || target === 'focused') {
    return BrowserWindow.getFocusedWindow() ?? mainDesktopWindow(live);
  }
  if (typeof target === 'number') {
    return live.find((w) => w.id === target) ?? null;
  }
  const needle = String(target).toLowerCase();
  if (needle === 'main') return mainDesktopWindow(live);
  const byId = Number(needle);
  if (!Number.isNaN(byId)) {
    const hit = live.find((w) => w.id === byId);
    if (hit) return hit;
  }
  return (
    live.find(
      (w) =>
        w.getTitle().toLowerCase().includes(needle) ||
        w.webContents.getURL().toLowerCase().includes(needle),
    ) ?? null
  );
}

function json(res: http.ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      chunks.push(c);
      // Refuse absurd payloads rather than buffering them.
      if (chunks.reduce((n, b) => n + b.length, 0) > 2 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

async function handle(
  route: string,
  url: URL,
  body: Record<string, unknown>,
): Promise<{ code: number; body: unknown }> {
  switch (route) {
    case '/health':
      return { code: 200, body: { ok: true, version: 1, windows: windowSummaries() } };

    case '/logs': {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 200) || 200, LOG_RING_LIMIT);
      const level = (url.searchParams.get('level') ?? '').toLowerCase();
      const match = (url.searchParams.get('match') ?? '').toLowerCase();
      let rows = ring;
      if (level && level !== 'all') {
        rows = rows.filter((r) => r.level.toLowerCase() === level);
      }
      if (match) rows = rows.filter((r) => r.message.toLowerCase().includes(match));
      return { code: 200, body: { ok: true, total: rows.length, entries: rows.slice(-limit) } };
    }

    case '/clear-logs':
      ring.length = 0;
      return { code: 200, body: { ok: true } };

    case '/eval': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const code = String(body.js ?? '');
      if (!code) return { code: 400, body: { ok: false, error: 'missing js' } };
      try {
        // Wrapped so a bare expression still returns a value, and so DOM
        // objects serialize instead of throwing a clone error.
        const result = await win.webContents.executeJavaScript(
          `(() => { try { const __r = (${code}); return JSON.parse(JSON.stringify(__r ?? null)); }
            catch (e) { try { return String((${code})); } catch (e2) { return { __error: String(e2) }; } } })()`,
          true,
        );
        return { code: 200, body: { ok: true, result } };
      } catch (err) {
        return { code: 200, body: { ok: false, error: String(err) } };
      }
    }

    case '/dom': {
      const win = resolveWindow(body.window ?? url.searchParams.get('window'));
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const selector = String(body.selector ?? url.searchParams.get('selector') ?? 'body');
      const maxChars = Number(body.maxChars ?? 40000) || 40000;
      try {
        const html = await win.webContents.executeJavaScript(
          `(() => { const el = document.querySelector(${JSON.stringify(selector)});
            return el ? el.outerHTML : null; })()`,
          true,
        );
        if (html === null) {
          return { code: 200, body: { ok: false, error: `no element matches ${selector}` } };
        }
        const text = String(html);
        return {
          code: 200,
          body: {
            ok: true,
            selector,
            truncated: text.length > maxChars,
            html: text.slice(0, maxChars),
          },
        };
      } catch (err) {
        return { code: 200, body: { ok: false, error: String(err) } };
      }
    }

    case '/text': {
      const win = resolveWindow(body.window ?? url.searchParams.get('window'));
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const selector = String(body.selector ?? url.searchParams.get('selector') ?? 'body');
      try {
        const text = await win.webContents.executeJavaScript(
          `(() => { const el = document.querySelector(${JSON.stringify(selector)});
            return el ? el.innerText : null; })()`,
          true,
        );
        return { code: 200, body: { ok: true, selector, text } };
      } catch (err) {
        return { code: 200, body: { ok: false, error: String(err) } };
      }
    }

    case '/screenshot': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      try {
        const image = await win.webContents.capturePage();
        const dir = path.join(ensureDebugRoot(), 'shots');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `win${win.id}-${Date.now()}.png`);
        fs.writeFileSync(file, image.toPNG());
        return { code: 200, body: { ok: true, path: file, size: image.getSize() } };
      } catch (err) {
        return { code: 200, body: { ok: false, error: String(err) } };
      }
    }

    case '/click': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const x = Number(body.x);
      const y = Number(body.y);
      if (Number.isNaN(x) || Number.isNaN(y)) {
        return { code: 400, body: { ok: false, error: 'x and y are required' } };
      }
      const button = (String(body.button ?? 'left') as 'left' | 'right' | 'middle');
      const clickCount = Number(body.clickCount ?? 1) || 1;
      win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount });
      win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount });
      return { code: 200, body: { ok: true, x, y, button } };
    }

    case '/type': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const text = String(body.text ?? '');
      for (const ch of text) {
        win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
      }
      return { code: 200, body: { ok: true, typed: text.length } };
    }

    case '/key': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const key = String(body.key ?? '');
      if (!key) return { code: 400, body: { ok: false, error: 'missing key' } };
      const modifiers = Array.isArray(body.modifiers) ? (body.modifiers as string[]) : [];
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers });
      return { code: 200, body: { ok: true, key, modifiers } };
    }

    /**
     * Brings a window genuinely to the front. Chromium throttles
     * `requestAnimationFrame` in a window that is not foreground, so an effect
     * that reveals a panel on the next frame simply never runs while a QA pass
     * drives an unfocused window — the pass then cannot tell a real defect from
     * the harness. This is the app focusing itself; no mouse or keyboard input
     * is synthesized, and like the rest of the bridge it never ships.
     */
    case '/focus': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      if (win.isMinimized()) win.restore();
      win.show();
      win.moveTop();
      win.focus();
      // Windows will not hand foreground to a background process on request
      // alone; `steal` is what makes the focus above actually take effect.
      app.focus({ steal: true });
      writeStateSnapshot();
      return {
        code: 200,
        body: { ok: true, id: win.id, focused: win.isFocused(), visible: win.isVisible() },
      };
    }

    case '/reload': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      win.webContents.reload();
      return { code: 200, body: { ok: true } };
    }

    default:
      return { code: 404, body: { ok: false, error: `unknown route ${route}` } };
  }
}

export function startDebugBridge(): void {
  if (server) return;
  if (app.isPackaged) return; // hard stop — this must never ship

  openLogFile();
  token = crypto.randomBytes(24).toString('hex');

  // Main-process crashes are the ones that otherwise vanish silently.
  process.on('uncaughtException', (err) => {
    recordDebugLog('main', 'error', `uncaughtException: ${err?.stack ?? String(err)}`);
  });
  process.on('unhandledRejection', (reason) => {
    recordDebugLog('main', 'error', `unhandledRejection: ${String(reason)}`);
  });

  server = http.createServer((req, res) => {
    void (async () => {
      // Loopback only — refuse anything that reached us from off-box.
      const ra = req.socket.remoteAddress;
      if (ra && ra !== '127.0.0.1' && ra !== '::1' && ra !== '::ffff:127.0.0.1') {
        return json(res, 403, { ok: false, error: 'loopback only' });
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${token}`) {
        return json(res, 401, { ok: false, error: 'bad token' });
      }
      const body = req.method === 'POST' ? await readBody(req) : {};
      try {
        const out = await handle(url.pathname, url, body);
        json(res, out.code, out.body);
      } catch (err) {
        json(res, 500, { ok: false, error: String(err) });
      }
    })();
  });

  server.on('error', (err) => {
    console.log(`[debugBridge] disabled: ${String(err)}`);
    server = null;
  });

  server.listen(DEBUG_PORT, '127.0.0.1', () => {
    const file = path.join(ensureDebugRoot(), 'bridge.json');
    try {
      fs.writeFileSync(
        file,
        JSON.stringify({ port: DEBUG_PORT, token, pid: process.pid, started: Date.now() }, null, 2),
      );
    } catch {
      /* best effort */
    }
    console.log(`[debugBridge] listening on 127.0.0.1:${DEBUG_PORT}`);
    recordDebugLog('main', 'info', `debug bridge up on ${DEBUG_PORT}`);
    writeStateSnapshot();
  });

  // Keep state.json roughly current without polling the renderer.
  app.on('browser-window-created', () => setTimeout(writeStateSnapshot, 250));
  app.on('browser-window-focus', () => setTimeout(writeStateSnapshot, 50));
}

export function stopDebugBridge(): void {
  if (server) {
    server.close();
    server = null;
  }
  if (logStream) {
    logStream.end();
    logStream = null;
  }
  try {
    fs.rmSync(path.join(debugRoot(), 'bridge.json'), { force: true });
  } catch {
    /* best effort */
  }
}
