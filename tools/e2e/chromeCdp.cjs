'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * A headless Chrome the extension flow drives over CDP — `--remote-debugging-pipe`, so no
 * debugging port is opened on the machine at all, and `--headless=new`, so no window
 * exists. Its profile lives in the run's temp dir (`--user-data-dir`), which is also the
 * marker run.cjs's teardown kills by: a separate browser instance from the owner's Chrome,
 * never attached to it.
 *
 * The pipe protocol: JSON messages terminated by '\0', commands written to the child's
 * fd 3, responses and events read from its fd 4.
 */
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');

const CHROME = process.env.GUM_E2E_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function chromeAvailable() {
  return fs.existsSync(CHROME);
}

async function launchHeadlessChrome({ userDataDir, extraArgs = [] }) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const args = [
    '--headless=new',
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-default-apps',
    '--disable-client-side-phishing-detection',
    '--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider',
    '--metrics-recording-only',
    '--password-store=basic',
    '--mute-audio',
    '--window-size=1280,800',
    ...extraArgs,
    'about:blank',
  ];
  const child = spawn(CHROME, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] });
  const out = child.stdio[3];
  const inp = child.stdio[4];
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr = (stderr + d).slice(-8000);
  });
  child.stdout.on('data', () => undefined);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  let buffer = Buffer.alloc(0);
  inp.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let at;
    while ((at = buffer.indexOf(0)) >= 0) {
      const raw = buffer.subarray(0, at).toString('utf8');
      buffer = buffer.subarray(at + 1);
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        continue;
      }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject, method } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result ?? {});
      } else if (msg.method) {
        for (const l of listeners) l(msg);
      }
    }
  });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  const send = (method, params = {}, sessionId, timeout = 30000) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, timeout);
    pending.set(id, {
      method,
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    out.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
  const waitEvent = (predicate, timeout = 15000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listeners.delete(on);
      reject(new Error('event timed out'));
    }, timeout);
    const on = (msg) => {
      if (predicate(msg)) {
        clearTimeout(timer);
        listeners.delete(on);
        resolve(msg);
      }
    };
    listeners.add(on);
  });
  const version = await send('Browser.getVersion', {}, undefined, 20000).catch((err) => {
    throw new Error(`headless Chrome did not answer CDP: ${err.message}; stderr: ${stderr.slice(-600)}`);
  });
  return {
    child,
    pid: child.pid,
    version,
    send,
    waitEvent,
    on: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    stderr: () => stderr,
    async close() {
      try {
        await send('Browser.close', {}, undefined, 5000);
      } catch {
        /* already gone */
      }
      const t = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* gone */
        }
      }, 5000);
      await exited;
      clearTimeout(t);
    },
  };
}

/** Every chrome.exe whose command line names `marker`, with whether it owns a visible window. */
function chromeProcesses(marker) {
  const script = `
$m = '${marker.toLowerCase().replace(/'/g, "''")}'
$rows = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($m) }
$out = foreach ($r in $rows) { $p = Get-Process -Id $r.ProcessId -ErrorAction SilentlyContinue; [pscustomobject]@{ pid = $r.ProcessId; window = [int64]($(if ($p) { $p.MainWindowHandle } else { 0 })); title = $(if ($p) { $p.MainWindowTitle } else { '' }) } }
@($out) | ConvertTo-Json -Compress`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, timeout: 30000 }, (_err, stdout) => {
      try {
        const v = JSON.parse(String(stdout || '[]').trim() || '[]');
        resolve(Array.isArray(v) ? v : [v]);
      } catch {
        resolve([]);
      }
    });
  });
}

/** Kill exactly the chrome.exe processes naming `marker` (our temp user-data-dir). */
async function killChrome(marker) {
  const rows = await chromeProcesses(marker);
  for (const r of rows) {
    await new Promise((resolve) => execFile('taskkill.exe', ['/PID', String(r.pid), '/F'], { windowsHide: true }, () => resolve()));
  }
  return rows.length;
}

module.exports = { CHROME, chromeAvailable, launchHeadlessChrome, chromeProcesses, killChrome };
