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
import { forceCollect } from './debugGc';
import {
  EMPTY_WITNESS,
  INPUT_WITNESS_SOURCE,
  cdpKeyEvents,
  cdpMouseEvents,
  normaliseWitness,
  summariseDelivery,
  type InputWitness,
} from './debugBridgeInput';

/**
 * The bridge port. 39273 unless `JP_DEBUG_PORT` says otherwise.
 *
 * Why the override exists: this repo is worked from git worktrees, and a second
 * dev instance is the ONLY way to drive a surface while another track's app holds
 * the machine. The renderer half of that was already solved — `vite.renderer.config.ts`
 * honours `PORT` for exactly this reason ("dev harnesses run alongside the Electron
 * dev server, which owns the default") — but the bridge stayed hardcoded, so the
 * second instance came up with `[debugBridge] disabled: EADDRINUSE` and no way to be
 * driven. `debugRoot()` is already `cwd/debug`, so each worktree writes its own
 * `bridge.json` and a client that reads it finds the right port with no extra wiring.
 *
 * An unset or unparseable value keeps 39273, so the normal `npm start` flow is
 * byte-identical.
 */
const DEBUG_PORT = Number.parseInt(process.env.JP_DEBUG_PORT ?? '', 10) || 39273;
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
/**
 * What `/network` is currently overriding, per webContents — so `/health` can say so and a
 * caller can prove the restore rather than assume it. An emulation that outlives its probe is
 * the worst failure this route has: the next worker measures a healthy app as a dead one.
 */
const networkEmulation = new Map<number, { offline: boolean; blackhole: boolean }>();

export interface NetworkEmulationState {
  offline: boolean;
  blackhole: boolean;
}

export interface NetworkEmulationPlan extends NetworkEmulationState {
  /** Whether CDP has to be driven at all — false when nothing is on and nothing is asked for. */
  touchCdp: boolean;
  /** Whether the session proxy has to be written — false when it is already where it belongs. */
  touchProxy: boolean;
  /** What the map should hold afterwards; `null` means the entry is removed. */
  next: NetworkEmulationState | null;
}

/**
 * What `/network` must actually do, given what the caller asked for and what is already on.
 *
 * Split out from the route because the route needs a live window and CDP, while the mistake that
 * matters is pure and invisible: a RESTORE that decides it has nothing to do. `clear` on a window
 * that is offline has to reach CDP precisely because the flag is currently set — an
 * "is anything requested? no? then skip" reading leaks the emulation past the probe, and the next
 * worker measures a healthy app as one that cannot reach the network.
 */
export function planNetworkEmulation(
  request: { clear?: boolean; offline?: boolean; blackhole?: boolean },
  current: NetworkEmulationState | undefined,
): NetworkEmulationPlan {
  const clear = request.clear === true;
  const offline = !clear && request.offline === true;
  const blackhole = !clear && request.blackhole === true;
  return {
    offline,
    blackhole,
    touchCdp: offline || current?.offline === true,
    touchProxy: blackhole || current?.blackhole === true || clear,
    next: offline || blackhole ? { offline, blackhole } : null,
  };
}

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

/**
 * The DevTools agent for a window, or null if it cannot be had.
 *
 * `sendInputEvent` is kept as the fallback rather than removed: it is the only
 * path that exists when a human has DevTools open on the window (only one client
 * may attach), and the receipt now says which transport ran, so a reader can tell
 * the two apart instead of guessing.
 */
function cdpSender(
  win: BrowserWindow,
): ((method: string, params?: Record<string, unknown>) => Promise<unknown>) | null {
  const wc = win.webContents;
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  } catch {
    if (!wc.debugger.isAttached()) return null;
  }
  return (method, params) => wc.debugger.sendCommand(method, params ?? {});
}

/**
 * Samples the renderer's own view of what arrived. A page that refuses to run the
 * witness (mid-navigation, crashed) reads as zeros, which makes the receipt say
 * "not delivered" — the safe direction, since the alternative is a false ok.
 */
async function readInputWitness(win: BrowserWindow): Promise<InputWitness> {
  try {
    return normaliseWitness(await win.webContents.executeJavaScript(INPUT_WITNESS_SOURCE, true));
  } catch {
    return EMPTY_WITNESS;
  }
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

/**
 * Where a `/heap-snapshot` file is allowed to land, and the reason it is a
 * separate function: the caller supplies a NAME and never a location.
 *
 * A heap snapshot of main is on the order of a gigabyte, so a caller that could
 * steer the directory could drop one under `src/` and it would reach a commit.
 * `raw` is therefore stripped to `[A-Za-z0-9._-]`, which removes `/`, `\` and
 * `:` and so cannot express a traversal, a sibling directory or a drive; the
 * result is then joined onto `tempDir` rather than resolved against it.
 *
 * Exported for its test. `path.join` alone is NOT the guard — `join(tmp, '../x')`
 * escapes happily — so the guard is the character class, and the test asserts
 * containment rather than asserting the class.
 */
export function heapSnapshotPath(tempDir: string, rawName: unknown, now: Date): string {
  const safe = String(rawName ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 60);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return path.join(tempDir, `jp-main-heap-${safe ? `${safe}-` : ''}${stamp}.heapsnapshot`);
}

/** One frame of a CDP `Profiler.Profile`, reduced to what a latency question needs. */
export interface CpuProfileFrame {
  fn: string;
  url: string;
  line: number;
  selfMs: number;
  selfPct: number;
  samples: number;
}

/**
 * Fold a CDP sampling profile into the functions that actually held the CPU.
 *
 * Exported for its test, and separated from the route for a reason this repo has already
 * paid for: every "where did the 100 ms go" question so far has been answered by BISECTING
 * the product — delete a subtree, re-measure, put it back. That costs a turn per candidate
 * and it killed four candidates on `immersion` cat2 without naming the cost once. A sampling
 * profile answers it in one call, but only if it is reduced correctly, and the reduction is
 * where the mistakes are:
 *
 *  - `samples` holds NODE IDS, not indices. `nodes[i].id` is not `i` — V8 emits ids in
 *    call-tree discovery order and the array is not sorted by them. Indexing `nodes` with a
 *    sample value reads a different function, and the answer looks plausible.
 *  - `timeDeltas[i]` is the interval BEFORE `samples[i]`, in MICROseconds, and both arrays
 *    have the same length. Summing deltas without pairing them bills the wrong frame.
 *  - This is SELF time. A parent that never runs its own code (`(root)`, `(program)`) can
 *    hold most of the wall clock and name nothing; the caller gets those rows too rather than
 *    having them filtered away, because "(garbage collector) 60 %" is itself the finding.
 */
export function summarizeCpuProfile(
  profile: {
    nodes?: Array<{ id: number; callFrame: { functionName?: string; url?: string; lineNumber?: number } }>;
    samples?: number[];
    timeDeltas?: number[];
    startTime?: number;
    endTime?: number;
  },
  top = 12,
): { durationMs: number; totalSamples: number; frames: CpuProfileFrame[] } {
  const nodes = profile.nodes ?? [];
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const selfUs = new Map<number, { us: number; n: number }>();
  for (let i = 0; i < samples.length; i += 1) {
    const id = samples[i];
    const dt = Math.max(0, deltas[i] ?? 0);
    const cur = selfUs.get(id) ?? { us: 0, n: 0 };
    cur.us += dt;
    cur.n += 1;
    selfUs.set(id, cur);
  }
  const totalUs = [...selfUs.values()].reduce((a, b) => a + b.us, 0) || 1;
  const frames: CpuProfileFrame[] = [...selfUs.entries()]
    .map(([id, v]) => {
      const cf = byId.get(id)?.callFrame;
      return {
        fn: cf?.functionName || '(anonymous)',
        url: cf?.url || '',
        line: (cf?.lineNumber ?? -1) + 1,
        selfMs: Math.round((v.us / 1000) * 10) / 10,
        selfPct: Math.round((v.us / totalUs) * 1000) / 10,
        samples: v.n,
      };
    })
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, Math.max(1, top));
  const durationMs =
    profile.startTime != null && profile.endTime != null
      ? Math.round(((profile.endTime - profile.startTime) / 1000) * 10) / 10
      : Math.round((totalUs / 1000) * 10) / 10;
  return { durationMs, totalSamples: samples.length, frames };
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
          // Same reasoning as `emulated`, one layer down: a leaked offline emulation reads as a
          // product that cannot reach the network at all.
          network: [...networkEmulation.entries()].map(([id, state]) => ({ webContentsId: id, ...state })),
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
      let gcSource = 'not-requested';
      let gcReason = '';
      if (forceGc) {
        // Borrowing a collector separates "GC never got idle time under cadence" from "the
        // memory is genuinely still referenced": if private bytes fall after this, the
        // allocation was collectable all along.
        //
        // The borrow lives in `debugGc.ts` because the version inlined here re-toggled a V8
        // flag and minted a fresh vm context on EVERY request, and killed main on the fifth
        // call of a 2026-09-05 rubric run — asynchronously, after the route had answered 200,
        // which the `try/catch` around it could never have caught. See that file's header.
        const outcome = forceCollect({
          globalGc: (globalThis as { gc?: unknown }).gc,
          setFlagsFromString: (flag) => v8.setFlagsFromString(flag),
          runInNewContext: (code) => vm.runInNewContext(code),
        });
        gcRan = outcome.ran;
        gcSource = outcome.source;
        gcReason = outcome.reason;
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
          // Reported so a run that scores against a collection can say WHICH collector fired,
          // and so a refusal reads as a refusal instead of a silent no-op.
          gcSource,
          gcReason,
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

    /**
     * `/mem` says HOW MUCH main retains; it cannot say WHAT. That gap is why
     * cat7's episodic block went three turns without a mechanism: measured
     * 2026-09-05 on an idle instance driving nothing, main's `old_space` sat at
     * 639-661 MB of 669-676 (~98% of its size), a forced full collection freed
     * only 43.7 MB of it, and the resulting major GC blocked main for 477 ms —
     * the same magnitude as the 500 ms bar that leg keeps failing. The heap is
     * RETAINED, so the next question is by what, and no route here could answer it.
     *
     * Written OUTSIDE the repository, always. A snapshot of this heap is on the
     * order of a gigabyte; landing one under `src/` would put a generated artifact
     * in a commit. `app.getPath('temp')` is deliberate and the caller cannot
     * redirect it — only name the file — because "let the probe choose the
     * directory" is exactly how such a file reaches the tree.
     *
     * The write is SYNCHRONOUS and blocks main for seconds on a heap this size.
     * That cost is reported rather than hidden: a probe that treats this as a
     * free read would attribute its own snapshot to the surface it is scoring.
     */
    case '/heap-snapshot': {
      const file = heapSnapshotPath(app.getPath('temp'), body.name, new Date());
      const before = v8.getHeapStatistics();
      const t0 = Date.now();
      let written: string;
      try {
        written = v8.writeHeapSnapshot(file);
      } catch (err) {
        return {
          code: 500,
          body: { ok: false, error: `heap snapshot failed: ${(err as Error).message}` },
        };
      }
      const blockedMs = Date.now() - t0;
      let sizeMb = -1;
      try {
        sizeMb = Math.round((fs.statSync(written).size / (1024 * 1024)) * 10) / 10;
      } catch {
        /* the snapshot exists or writeHeapSnapshot threw; a stat failure is not fatal */
      }
      return {
        code: 200,
        body: {
          ok: true,
          path: written,
          sizeMb,
          // Named `blockedMs` and not `durationMs`: main could not serve anything
          // for this long, which is the number a concurrent probe needs.
          blockedMs,
          heapUsedMb: Math.round((before.used_heap_size / (1024 * 1024)) * 10) / 10,
          insideRepo: false,
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

    /**
     * Take the app's network away, reversibly, so "what does this surface do offline" can be
     * driven instead of reasoned about.
     *
     * There was no route for this and the two obvious substitutes are both wrong. Stubbing
     * `fetch` from `/eval` answers a different question — it makes the RENDERER's own calls fail
     * while every main-process request still succeeds, so an IPC-backed surface reads as fully
     * online. Disabling the machine's adapter is out of the question: it is not scoped to this
     * app and nothing restores it if the probe dies.
     *
     * Two levers, because the app loses its network in two distinguishable ways and no single
     * lever produces both:
     *
     * - `offline: true` drives CDP `Network.emulateNetworkConditions` on ONE window. This is the
     *   only thing that flips `navigator.onLine` and fires the `offline` event, which is what
     *   `widgets/system.tsx` and anything else keyed on that signal actually watch. Its cost in
     *   a DEV build is that it also blocks loopback, so Vite's HMR socket drops for the duration
     *   and reconnects on restore — expected, and not a product finding.
     * - `blackhole: true` points the window's session at a dead proxy, leaving Chromium's
     *   implicit loopback bypass in place. That is the faithful shape of a real outage:
     *   everything off-machine fails at the transport, while the dev server, the Anki connector,
     *   the qBittorrent WebUI and the Seanime sidecar all keep answering. It reaches every
     *   Chromium-stack request including main's `net.fetch`.
     *
     * **Neither lever reaches Node's global `fetch`**, which is undici on its own socket, and
     * most of `src/main/` uses exactly that. So a main-process request that succeeds under this
     * route has NOT been proven offline-safe — say so rather than crediting it.
     *
     * Body: `{ window?, offline?, blackhole?, clear? }`. The response echoes the resulting state
     * and `/health` reports it, so a restore is provable.
     */
    case '/network': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const dbg = win.webContents.debugger;
      const ses = win.webContents.session;
      const plan = planNetworkEmulation(body, networkEmulation.get(win.webContents.id));
      const { offline, blackhole } = plan;
      const applied: string[] = [];
      try {
        if (plan.touchCdp) {
          if (!dbg.isAttached()) dbg.attach('1.3');
          await dbg.sendCommand('Network.enable');
          await dbg.sendCommand('Network.emulateNetworkConditions', {
            offline,
            latency: 0,
            downloadThroughput: offline ? 0 : -1,
            uploadThroughput: offline ? 0 : -1,
          });
          applied.push(offline ? 'cdp-offline' : 'cdp-online');
          // Only let go of a session this route opened, and only once nothing else here needs
          // it — `/emulate` may be holding the same one for a media override.
          if (!offline && !emulatedMedia.has(win.webContents.id)) {
            try { dbg.detach(); } catch { /* another owner holds it; the reset above already landed */ }
          }
        }
        if (plan.touchProxy) {
          if (blackhole) {
            // NO `proxyBypassRules`, deliberately. Chromium bypasses loopback implicitly, which
            // is exactly the shape wanted, and the rule that looks like it says so —
            // `<-loopback>` — means the OPPOSITE: it REMOVES that implicit bypass and sends
            // localhost through the proxy too. Measured 2026-09-07 with `<-loopback>` set:
            // the dev server on 127.0.0.1:5173 and AnkiConnect on :8765 both failed alongside
            // the two remote hosts, i.e. the lever was a total block rather than an outage.
            await ses.setProxy({ proxyRules: 'http=127.0.0.1:9;https=127.0.0.1:9;socks=127.0.0.1:9' });
            applied.push('blackhole-proxy');
          } else {
            // `mode: 'system'` is Electron's own default and nothing in `src/main/` calls
            // `setProxy`, so this restores the app to the configuration it boots with.
            await ses.setProxy({ mode: 'system' });
            applied.push('proxy-restored');
          }
        }
      } catch (err) {
        return { code: 200, body: { ok: false, error: String(err), applied } };
      }
      if (plan.next) networkEmulation.set(win.webContents.id, plan.next);
      else networkEmulation.delete(win.webContents.id);
      return {
        code: 200,
        body: {
          ok: true,
          webContentsId: win.webContents.id,
          offline,
          blackhole,
          applied,
          attached: dbg.isAttached(),
        },
      };
    }

    /**
     * The RENDERER's own memory, with a forced collection — the half `/mem` structurally cannot
     * see.
     *
     * `/mem` runs `gc()` inside MAIN's isolate. That is the right instrument for defect D1, but
     * a renderer is a different process with a different heap, so main's collection cannot free
     * one byte of it. Measured 2026-09-01 on a 12-cycle Liquid cadence: main private 427.8 ->
     * 427.4 MB and `heapUsed` byte-identical, while the renderer's `usedJSHeapSize` moved
     * 233.6 -> 433.6 MB under a deliberate +200 MB plant that the same reading never released.
     * That is not a leak finding, it is an instrument limit — and closing a long-session memory
     * clause on main alone would credit the wrong process entirely.
     *
     * `performance.memory` is reachable from `/eval` already, so what is missing is only the
     * COLLECTION: there is no page-side way to ask for one, `--expose-gc` would have to be a
     * launch flag, and without a collection a rising heap cannot be told apart from a heap that
     * simply has not been swept. CDP has the button (`HeapProfiler.collectGarbage`), and this
     * bridge already proves it reaches CDP — `/emulate` drives `Emulation.setEmulatedMedia`
     * through the same debugger session.
     *
     * Body: `{ window?, gc?: true }`. The DOM counters are reported alongside the heap because a
     * heap number alone cannot name WHAT is retained: `documents` and `nodes` that stay high
     * after a collection are the detached-subtree signature, and `jsEventListeners` is the
     * listener-not-removed one. Before/after pairs are both returned when a collection ran, so a
     * caller can prove the collector did something rather than assume it.
     */
    case '/rmem': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const dbg = win.webContents.debugger;
      // Whoever attached the session owns detaching it. Detaching one we did not open would
      // silently clear a live `/emulate` override — the exact leak that route warns about.
      const weAttached = !dbg.isAttached();
      try {
        if (weAttached) dbg.attach('1.3');
      } catch (err) {
        return { code: 200, body: { ok: false, error: `debugger attach failed: ${String(err)}` } };
      }
      const sample = async () => {
        const heap = (await dbg.sendCommand('Runtime.getHeapUsage')) as { usedSize: number; totalSize: number };
        const dom = (await dbg.sendCommand('Memory.getDOMCounters')) as {
          documents: number; nodes: number; jsEventListeners: number;
        };
        const mb = (n: number) => Math.round((n / (1024 * 1024)) * 10) / 10;
        return {
          usedMb: mb(heap.usedSize),
          totalMb: mb(heap.totalSize),
          documents: dom.documents,
          nodes: dom.nodes,
          jsEventListeners: dom.jsEventListeners,
        };
      };
      try {
        const before = await sample();
        let gcRan = false;
        if (body.gc === true) {
          await dbg.sendCommand('HeapProfiler.collectGarbage');
          gcRan = true;
        }
        const after = gcRan ? await sample() : before;
        return {
          code: 200,
          body: {
            ok: true,
            webContentsId: win.webContents.id,
            pid: win.webContents.getOSProcessId(),
            gcRequested: body.gc === true,
            gcRan,
            // `after` is the number to compare across cycles; `before` exists so the collection
            // itself is falsifiable — equal pairs on a heap that just grew mean the button did
            // nothing, and that is a finding about the instrument, not about the product.
            ...after,
            beforeGc: before,
          },
        };
      } catch (err) {
        return { code: 200, body: { ok: false, error: String(err) } };
      } finally {
        if (weAttached && !emulatedMedia.has(win.webContents.id)) {
          try { dbg.detach(); } catch { /* another owner took it mid-call; nothing to restore */ }
        }
      }
    }

    /**
     * A CPU sampling profile of ONE renderer, around a driver expression the caller supplies.
     *
     * The gap this closes: `/eval` can time a keystroke and say it cost 100 ms; nothing in this
     * bridge could say WHERE. Four `immersion` cat2 candidates were killed by deleting product
     * subtrees and re-measuring — one turn each — and the cost was in none of them, so the cell
     * still has no cause. CDP has had the answer all along (`Profiler.start` / `Profiler.stop`)
     * and `/rmem` already proves this bridge reaches CDP through the same debugger session.
     *
     * Body: `{ window?, js, sampleIntervalUs?, top? }`. `js` is driven with `executeJavaScript`
     * BETWEEN start and stop, so the profile covers the drive and nothing else — profiling an
     * idle window returns `(program)` and is the negative control for this route.
     *
     * `sampleIntervalUs` defaults to 100 µs rather than V8's 1000: a 100 ms input costs ~100
     * samples at the default, which is too coarse to separate a React commit from a style
     * recalc. Anything below ~50 µs distorts what it measures.
     */
    case '/cpu-profile': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const code = String(body.js ?? '');
      if (!code) return { code: 400, body: { ok: false, error: 'missing js' } };
      const intervalUs = Math.max(20, Math.min(10000, Number(body.sampleIntervalUs ?? 100) || 100));
      const dbg = win.webContents.debugger;
      const weAttached = !dbg.isAttached();
      try {
        if (weAttached) dbg.attach('1.3');
      } catch (err) {
        return { code: 200, body: { ok: false, error: `debugger attach failed: ${String(err)}` } };
      }
      try {
        await dbg.sendCommand('Profiler.enable');
        await dbg.sendCommand('Profiler.setSamplingInterval', { interval: intervalUs });
        await dbg.sendCommand('Profiler.start');
        let jsResult: unknown = null;
        let jsError: string | null = null;
        try {
          jsResult = await win.webContents.executeJavaScript(
            `(() => { try { const __r = (${code}); return JSON.parse(JSON.stringify(__r ?? null)); }
              catch (e) { return { __error: String(e) }; } })()`,
            true,
          );
        } catch (err) {
          // The drive failing is not the route failing: the profile still covers whatever ran
          // before the throw, and hiding it would turn a broken driver into a silent empty result.
          jsError = String(err);
        }
        const stopped = (await dbg.sendCommand('Profiler.stop')) as { profile: Parameters<typeof summarizeCpuProfile>[0] };
        await dbg.sendCommand('Profiler.disable');
        const summary = summarizeCpuProfile(stopped.profile, Number(body.top ?? 12) || 12);
        return {
          code: 200,
          body: {
            ok: true,
            webContentsId: win.webContents.id,
            sampleIntervalUs: intervalUs,
            jsResult,
            jsError,
            ...summary,
          },
        };
      } catch (err) {
        return { code: 200, body: { ok: false, error: String(err) } };
      } finally {
        if (weAttached && !emulatedMedia.has(win.webContents.id)) {
          try { dbg.detach(); } catch { /* another owner took it mid-call; nothing to restore */ }
        }
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
        // An optional `rect` crops the capture to one region of the renderer. Without it
        // every capture is the WHOLE desktop, so a matrix that varies which app it is
        // "photographing" while several windows are open produces byte-identical images
        // per theme and the app dimension is not actually being measured — the L12
        // matrix harness found exactly that. Electron wants integers, and a rect that
        // escapes the page silently returns an empty image, so it is clamped here.
        let image;
        if (body.rect && typeof body.rect === 'object') {
          const r = body.rect as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
          const [cw, ch] = win.getContentSize();
          const x = Math.max(0, Math.round(Number(r.x) || 0));
          const y = Math.max(0, Math.round(Number(r.y) || 0));
          const width = Math.round(Number(r.width) || 0);
          const height = Math.round(Number(r.height) || 0);
          if (!(width > 0 && height > 0)) {
            return { code: 400, body: { ok: false, error: 'rect needs positive width and height' } };
          }
          image = await win.webContents.capturePage({
            x, y,
            width: Math.min(width, Math.max(1, cw - x)),
            height: Math.min(height, Math.max(1, ch - y)),
          });
        } else {
          image = await win.webContents.capturePage();
        }
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
      const modifiers = Array.isArray(body.modifiers) ? (body.modifiers as string[]) : [];
      const before = await readInputWitness(win);
      const cdp = cdpSender(win);
      if (cdp) {
        for (const event of cdpMouseEvents(x, y, button, clickCount, modifiers)) {
          await cdp('Input.dispatchMouseEvent', event as unknown as Record<string, unknown>);
        }
      } else {
        win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount });
        win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount });
      }
      const after = await readInputWitness(win);
      const receipt = summariseDelivery(before, after, 'mouse', 1, cdp ? 'cdp' : 'sendInputEvent');
      return { code: 200, body: { ...receipt, x, y, button } };
    }

    case '/type': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const text = String(body.text ?? '');
      if (!text) return { code: 400, body: { ok: false, error: 'missing text' } };
      const chars = Array.from(text);
      const before = await readInputWitness(win);
      const cdp = cdpSender(win);
      if (cdp) {
        for (const ch of chars) {
          for (const event of cdpKeyEvents(ch)) {
            await cdp('Input.dispatchKeyEvent', event as unknown as Record<string, unknown>);
          }
        }
      } else {
        for (const ch of chars) {
          win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
        }
      }
      const after = await readInputWitness(win);
      const receipt = summariseDelivery(
        before,
        after,
        'key',
        chars.length,
        cdp ? 'cdp' : 'sendInputEvent',
      );
      return { code: 200, body: { ...receipt, text } };
    }

    case '/key': {
      const win = resolveWindow(body.window);
      if (!win) return { code: 404, body: { ok: false, error: 'no matching window' } };
      const key = String(body.key ?? '');
      if (!key) return { code: 400, body: { ok: false, error: 'missing key' } };
      const modifiers = Array.isArray(body.modifiers) ? (body.modifiers as string[]) : [];
      const before = await readInputWitness(win);
      const cdp = cdpSender(win);
      if (cdp) {
        for (const event of cdpKeyEvents(key, modifiers)) {
          await cdp('Input.dispatchKeyEvent', event as unknown as Record<string, unknown>);
        }
      } else {
        // sendInputEvent takes Electron's modifier names only; anything else is dropped.
        const inputModifiers = modifiers.filter((m): m is NonNullable<Electron.KeyboardInputEvent['modifiers']>[number] =>
          ['shift', 'control', 'ctrl', 'alt', 'meta', 'command', 'cmd', 'iskeypad', 'isautorepeat', 'leftbuttondown',
            'middlebuttondown', 'rightbuttondown', 'capslock', 'numlock', 'left', 'right'].includes(m));
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: inputModifiers });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: inputModifiers });
      }
      const after = await readInputWitness(win);
      const receipt = summariseDelivery(before, after, 'key', 1, cdp ? 'cdp' : 'sendInputEvent');
      return { code: 200, body: { ...receipt, key, modifiers } };
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
