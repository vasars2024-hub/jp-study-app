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
import v8 from 'node:v8';
import vm from 'node:vm';
import { BrowserWindow, app } from 'electron';
import { llamaHostStats } from './llamaHost';

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
/** What `/emulate` is currently overriding, per webContents — so `/health` can say so. */
const emulatedMedia = new Map<number, { name: string; value: string }[]>();

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
      return {
        code: 200,
        body: {
          ok: true,
          version: 1,
          windows: windowSummaries(),
          // A leaked media override makes every later measurement wrong in a way that looks
          // like a product change, so it is reported where every run already looks.
          emulated: [...emulatedMedia.entries()].map(([id, features]) => ({ webContentsId: id, features })),
        },
      };

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

    case '/mem': {
      // Deliberately NOT an eval route. Defect D1 (§12.1 of the Liquid plan) is
      // a main-process growth of 575 MB → 7,075 MB that `/eval` cannot see at
      // all, because `/eval` runs in a renderer. This reports main's own pools
      // so the growth can be attributed instead of guessed: `heapUsed` means
      // retained JS objects, `external`/`arrayBuffers` means Buffers, and rss
      // far above both means native or allocator-held memory.
      //
      // `detachedContexts` is the single most useful number here — a non-zero
      // count that climbs is the classic signature of contexts kept alive by a
      // stale reference, and it distinguishes a leak from a high-water mark.
      const forceGc = body.gc === true;
      let gcRan = false;
      if (forceGc) {
        // The app is not launched with `--expose-gc`, so borrow it for one call.
        // This is what separates "GC never got idle time under cadence" from
        // "the memory is genuinely still referenced": if private bytes fall
        // after this, the allocation was collectable all along.
        try {
          v8.setFlagsFromString('--expose_gc');
          (vm.runInNewContext('gc') as () => void)();
          gcRan = true;
        } catch {
          /* best effort — never take the app down for a measurement */
        } finally {
          try {
            v8.setFlagsFromString('--no-expose_gc');
          } catch {
            /* ignore */
          }
        }
      }
      const mu = process.memoryUsage();
      const hs = v8.getHeapStatistics();
      const info = await process.getProcessMemoryInfo();
      // Asked before the body is built so a host that is mid-exit answers empty rather than
      // stalling the route. Costs one round trip only while a host exists.
      const llamaHost = await llamaHostStats();
      const mb = (n: number) => Math.round((n / (1024 * 1024)) * 10) / 10;
      return {
        code: 200,
        body: {
          ok: true,
          gcRequested: forceGc,
          gcRan,
          pid: process.pid,
          uptimeSec: Math.round(process.uptime()),
          // Electron reports these in KB; normalize everything to MB.
          privateMb: mb(info.private * 1024),
          residentMb: mb(info.residentSet * 1024),
          rssMb: mb(mu.rss),
          heapTotalMb: mb(mu.heapTotal),
          heapUsedMb: mb(mu.heapUsed),
          externalMb: mb(mu.external),
          arrayBuffersMb: mb(mu.arrayBuffers),
          heapLimitMb: mb(hs.heap_size_limit),
          mallocedMb: mb(hs.malloced_memory),
          peakMallocedMb: mb(hs.peak_malloced_memory),
          nativeContexts: hs.number_of_native_contexts,
          detachedContexts: hs.number_of_detached_contexts,
          spaces: v8.getHeapSpaceStatistics().map((s) => ({
            name: s.space_name,
            usedMb: mb(s.space_used_size),
            sizeMb: mb(s.space_size),
          })),
          metrics: app.getAppMetrics().map((m) => ({
            pid: m.pid,
            type: m.type,
            name: m.name ?? '',
            workingSetMb: mb((m.memory?.workingSetSize ?? 0) * 1024),
            peakWorkingSetMb: mb((m.memory?.peakWorkingSetSize ?? 0) * 1024),
          })),
          // Every number above is V8's or the OS's, and neither can see a GGUF. Since the model
          // host moved out of this process these two rows are ANOTHER process's pools, asked over
          // the wire — which is also why `metrics` above is the row that now carries the weights'
          // real cost: look for the `Utility` entry named `jp-llama-host`. Both rows empty means
          // no host is running, which is a real answer rather than a missing one.
          llamaModels: llamaHost.models,
          // The other half of the same off-heap bill, and the larger one: an 8,192-token KV cache
          // measured +1,298.5 MB against a 1,223 MB model file. Without this row a probe sampling
          // between cycles cannot tell "the cache was rebuilt" from "the weights were reloaded" —
          // the two look identical in `privateMb` and differ only in which pool was warm.
          llamaContexts: llamaHost.contexts,
        },
      };
    }

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

    /**
     * Emulate a CSS media feature — `prefers-reduced-motion`, `prefers-color-scheme`,
     * `forced-colors` — for one window, through CDP.
     *
     * There is no page-side API for this: `matchMedia` reports the OS and cannot be forced,
     * so a probe that wants to score "what a reduced-motion user gets" has only two options,
     * and both were wrong. Reading the stylesheet is scoring from source, which the rubric
     * forbids. Toggling the app's own `.reduce-motion` class answers a DIFFERENT mechanism —
     * that class is deliberately targeted (`theme/a11y.css` says so in as many words), while
     * the OS query is app-wide with `!important`, so the class-toggle reads 8 durations
     * unchanged and looks exactly like a surface that ignores reduced motion.
     *
     * Body: `{ features: [{ name, value }] }` to set, `{ clear: true }` (or an empty
     * `features`) to reset. The response echoes the emulated set back so a caller can prove
     * the restore rather than assume it.
     */
    case '/emulate': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const raw = Array.isArray(body.features) ? body.features : [];
      const clear = body.clear === true || raw.length === 0;
      const features = raw
        .map((f) => ({ name: String((f as { name?: unknown })?.name ?? ''), value: String((f as { value?: unknown })?.value ?? '') }))
        .filter((f) => f.name);
      const dbg = win.webContents.debugger;
      try {
        // Already attached is not an error — DevTools may own the session, or a previous
        // /emulate call may still hold it. Only a genuinely different failure is reported.
        if (!dbg.isAttached()) dbg.attach('1.3');
      } catch (err) {
        return { code: 200, body: { ok: false, error: `debugger attach failed: ${String(err)}` } };
      }
      try {
        await dbg.sendCommand('Emulation.setEmulatedMedia', { media: '', features: clear ? [] : features });
        if (clear) {
          emulatedMedia.delete(win.webContents.id);
          // Detaching is what makes the reset outlive this route: an attached session with an
          // empty feature list still overrides nothing, but a leaked session shows the yellow
          // "being debugged" banner and blocks DevTools.
          try { dbg.detach(); } catch { /* another owner holds it; the reset above already landed */ }
        } else {
          emulatedMedia.set(win.webContents.id, features);
        }
        return { code: 200, body: { ok: true, emulated: clear ? [] : features, attached: dbg.isAttached() } };
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
      // Windows will not hand foreground to a background process on request
      // alone; `steal` is what makes the focus below actually take effect.
      //
      // IT MUST COME FIRST. On Windows `app.focus({ steal: true })` focuses the
      // application's FIRST window, so calling it after `win.focus()` takes the
      // foreground straight back off every window but that one. Measured
      // 2026-08-31: /focus on the Blanc window returned `focused: false` on every
      // attempt while window 1 stayed focused, so no second-window shell could be
      // raised through this route at all — and because Chromium throttles
      // requestAnimationFrame in an occluded window, every frame number a QA pass
      // recorded for such a surface was a throttle artifact rather than renderer
      // cost. Stealing for the app, then focusing the requested window, is the
      // order that actually lands.
      app.focus({ steal: true });
      win.show();
      win.moveTop();
      win.focus();
      writeStateSnapshot();
      return {
        code: 200,
        body: { ok: true, id: win.id, focused: win.isFocused(), visible: win.isVisible() },
      };
    }

    /**
     * Reads, and optionally sets, an OS window's content size.
     *
     * Not every surface is a floating window inside the desktop shell. Opening a book replaces
     * the shell entirely with a full-window reader, and the Agent pop-out, Blanc and Focus
     * hosts do the same — so "does this surface hold together at 380px" cannot be asked by
     * writing an inline width on some element mid-tree. Measured 2026-08-25: doing that to the
     * NovelReader left `div.novel-scroller` (`position: absolute`) holding a page buffer sized
     * against a container that had not moved, and the harness read 132 boxes as clipped that
     * the product pages to on its own. The only faithful narrow host is a narrow window.
     *
     * `setContentSize` rather than `setSize` so the number means the same thing as
     * `window.innerWidth`. The previous content size comes back in the response, which is what
     * a caller restores — and it must restore THAT, not the outer bounds: content 1264x821 is
     * outer 1280x860 here, so writing the outer numbers back as a content size grows the
     * window by the frame every round trip.
     *
     * ALWAYS READ `contentSize` BACK; the request is a request. The desktop window has a
     * minimum, measured 2026-08-25: asking for 380x580 yields 924x580, an outer 940. So a
     * "does it hold at 380px" run against this host is not a narrow run at all, and reporting
     * the requested number would be reporting a size nothing was ever measured at.
     * Development-only, like the rest of this bridge, and never shipped.
     */
    case '/bounds': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const [wasW, wasH] = win.getContentSize();
      const w = body.width === undefined ? null : Number(body.width);
      const h = body.height === undefined ? null : Number(body.height);
      if (w !== null || h !== null) {
        if ((w !== null && !Number.isFinite(w)) || (h !== null && !Number.isFinite(h))) {
          return { code: 400, body: { ok: false, error: 'width and height must be numbers' } };
        }
        if (win.isMaximized()) win.unmaximize();
        win.setContentSize(Math.round(w ?? wasW), Math.round(h ?? wasH));
      }
      const [nowW, nowH] = win.getContentSize();
      return {
        code: 200,
        body: {
          ok: true,
          id: win.id,
          previous: { width: wasW, height: wasH },
          contentSize: { width: nowW, height: nowH },
          bounds: win.getBounds(),
        },
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
