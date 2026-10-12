'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * What lets two `npm run e2e` runs share one machine and one tree (several agents run
 * them at once):
 *
 *  - Ports: each run picks free ephemeral loopback ports for the app's debug bridge, its
 *    extension server and (with --dev) the Vite server. They used to be fixed (39391,
 *    18791, 5191), so a second run either failed to bind or — worse — drove the FIRST
 *    run's app. Overridable per port with a flag or an environment variable.
 *  - Output: each run writes to tools/e2e/out/<run-id>/ (logs, report, screenshots,
 *    fakes bundle). The newest finished report is copied to out/report.md/.json and named
 *    by out/latest.json.
 *  - Snapshot builds: a build goes into its own directory, out/builds/<build-id>/app, and
 *    `latest.json` there names the newest complete one. A rebuild therefore never touches
 *    a snapshot another run is executing, and `--reuse-build` picks the newest. Builds are
 *    serialized by a lock file with a wait; a run that waited for another run's build
 *    reuses it when that build STARTED after this run asked (so it is no older than the
 *    tree this run was asked to test). The resource junctions inside a snapshot are
 *    reference-counted by per-run user markers, so one run's teardown cannot pull them
 *    from under another run's app.
 */
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A free loopback port, chosen by the OS. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function parsePort(raw) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

/**
 * The run's ports: `--<name>-port=N`, else `GUM_E2E_<NAME>_PORT`, else a free ephemeral
 * port. Distinct from each other whatever the source.
 */
async function resolvePorts(argv = [], env = process.env, pick = freePort) {
  const names = { bridge: 'BRIDGE', extension: 'EXTENSION', vite: 'VITE' };
  const ports = {};
  const taken = new Set();
  for (const [name, envName] of Object.entries(names)) {
    const flag = argv.find((a) => a.startsWith(`--${name}-port=`));
    let port = parsePort(flag ? flag.slice(`--${name}-port=`.length) : null) ?? parsePort(env[`GUM_E2E_${envName}_PORT`]);
    if (port && taken.has(port)) throw new Error(`e2e: the ${name} port ${port} is already used by another of this run's servers`);
    for (let tries = 0; !port || taken.has(port); tries += 1) {
      if (tries > 20) throw new Error(`e2e: could not find a free port for ${name}`);
      port = await pick();
    }
    taken.add(port);
    ports[name] = port;
  }
  return ports;
}

/** Unique per run even when two start in the same millisecond. */
function makeRunId(now = new Date(), pid = process.pid) {
  return `${now.toISOString().replace(/[:.]/g, '-')}-p${pid}`;
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM';
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * Runs `fn` holding an exclusive lock file. A lock whose owner process is gone, or that
 * is older than `staleMs`, is taken over. Waits up to `timeoutMs`, reporting through
 * `onWait` once.
 */
async function withFileLock(lockFile, fn, { timeoutMs = 30 * 60_000, staleMs = 45 * 60_000, onWait, pollMs = 500 } = {}) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  let told = false;
  for (;;) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      fs.closeSync(fd);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const owner = readJson(lockFile);
      let age = 0;
      try {
        age = Date.now() - fs.statSync(lockFile).mtimeMs;
      } catch {
        continue; // released between the open and the stat
      }
      const ownerGone = owner ? !isPidAlive(owner.pid) : age > 5_000; // a half-written lock is new, not stale
      if (ownerGone || age > staleMs) {
        try {
          fs.rmSync(lockFile, { force: true });
        } catch {
          /* someone else took it over first */
        }
        continue;
      }
      if (Date.now() > deadline) throw new Error(`e2e: timed out waiting for ${lockFile} (held by pid ${owner?.pid})`);
      if (!told && onWait) {
        told = true;
        onWait(owner);
      }
      await sleep(pollMs);
    }
  }
  try {
    return await fn();
  } finally {
    const owner = readJson(lockFile);
    if (!owner || owner.pid === process.pid) fs.rmSync(lockFile, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Snapshot builds
// ---------------------------------------------------------------------------

function buildsRoot(outRoot) {
  return path.join(outRoot, 'builds');
}

/** The newest complete snapshot: `{ id, appDir, startedAt, builtAt }`, or null. */
function latestBuild(outRoot) {
  const pointer = readJson(path.join(buildsRoot(outRoot), 'latest.json'));
  if (!pointer || typeof pointer.id !== 'string') return null;
  const appDir = path.join(buildsRoot(outRoot), pointer.id, 'app');
  if (!fs.existsSync(path.join(appDir, '.vite', 'build', 'main.js')) || !fs.existsSync(path.join(appDir, 'build-info.json'))) return null;
  return { ...pointer, appDir };
}

/**
 * The snapshot this run executes. `reuse`: the newest complete one if any. Otherwise a
 * fresh build — unless another run's build that started after `requestedAt` completed
 * while this run waited for the lock, which is then reused.
 */
async function prepareBuild({ outRoot, reuse, requestedAt = Date.now(), runBuild, log = () => undefined }) {
  const root = buildsRoot(outRoot);
  fs.mkdirSync(root, { recursive: true });
  if (reuse) {
    const latest = latestBuild(outRoot);
    if (latest) {
      log(`reusing build ${latest.id} from ${latest.builtAt}`);
      return { ...latest, reused: true };
    }
  }
  return withFileLock(path.join(root, '.build.lock'), async () => {
    const latest = latestBuild(outRoot);
    if (latest && (reuse || (Number(latest.startedAt) || 0) >= requestedAt)) {
      log(`reusing build ${latest.id}, finished by another run while this one waited`);
      return { ...latest, reused: true };
    }
    const id = makeRunId(new Date(), process.pid);
    const appDir = path.join(root, id, 'app');
    const startedAt = Date.now();
    await runBuild(appDir, id);
    if (!fs.existsSync(path.join(appDir, '.vite', 'build', 'main.js'))) throw new Error(`e2e: build ${id} produced no main bundle`);
    const builtAt = new Date().toISOString();
    writeJsonAtomic(path.join(root, 'latest.json'), { id, startedAt, builtAt });
    return { id, appDir, startedAt, builtAt, reused: false };
  }, { onWait: (owner) => log(`waiting for another run's snapshot build (pid ${owner?.pid ?? '?'})…`) });
}

function usersDir(appDir) {
  return path.join(path.dirname(appDir), 'users');
}

/** Live runs registered on a snapshot, other than `exceptRunId`. */
function liveUsers(appDir, exceptRunId) {
  let names = [];
  try {
    names = fs.readdirSync(usersDir(appDir));
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.json') && name !== `${exceptRunId}.json`)
    .map((name) => ({ name, user: readJson(path.join(usersDir(appDir), name)) }))
    .filter(({ name, user }) => {
      if (user && isPidAlive(user.pid)) return true;
      fs.rmSync(path.join(usersDir(appDir), name), { force: true }); // a crashed run's marker
      return false;
    });
}

/** Registers this run on a snapshot and makes sure its resource junctions exist. */
async function acquireSnapshot(appDir, runId, link) {
  await withFileLock(path.join(path.dirname(appDir), '.links.lock'), () => {
    writeJsonAtomic(path.join(usersDir(appDir), `${runId}.json`), { pid: process.pid, at: Date.now() });
    link(appDir);
  }, { timeoutMs: 60_000 });
}

/** Unregisters this run; the junctions go only when no other live run still uses the snapshot. */
async function releaseSnapshot(appDir, runId, unlink) {
  let unlinked = false;
  await withFileLock(path.join(path.dirname(appDir), '.links.lock'), () => {
    fs.rmSync(path.join(usersDir(appDir), `${runId}.json`), { force: true });
    if (!liveUsers(appDir, runId).length) {
      unlink(appDir);
      unlinked = true;
    }
  }, { timeoutMs: 60_000 });
  return unlinked;
}

/** True when a directory tree holds any symlink or junction (never deleted recursively). */
function containsLink(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return true;
    if (entry.isDirectory() && containsLink(full)) return true;
  }
  return false;
}

/**
 * Deletes old snapshots: never the latest, never one a live run uses, never one that
 * still holds a junction (a recursive delete must not be able to follow one into the
 * repo), and keeps the newest `keep`.
 */
async function pruneBuilds(outRoot, { keep = 2, unlink, log = () => undefined } = {}) {
  const root = buildsRoot(outRoot);
  await withFileLock(path.join(root, '.build.lock'), () => {
    const latest = readJson(path.join(root, 'latest.json'));
    let ids = [];
    try {
      ids = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    } catch {
      return;
    }
    const removable = ids.filter((id) => id !== latest?.id).slice(0, Math.max(0, ids.length - keep));
    for (const id of removable) {
      const appDir = path.join(root, id, 'app');
      if (liveUsers(appDir, '').length) continue;
      try {
        if (unlink) unlink(appDir);
      } catch {
        /* checked below */
      }
      if (containsLink(path.join(root, id))) {
        log(`left build ${id}: it still holds a junction`);
        continue;
      }
      fs.rmSync(path.join(root, id), { recursive: true, force: true });
    }
  }, { timeoutMs: 5_000 }).catch(() => undefined); // a busy builder: prune next time
}

// ---------------------------------------------------------------------------
// Run output
// ---------------------------------------------------------------------------

/** Copies a finished run's report to out/report.{md,json} and names it in out/latest.json. */
function publishLatest(outRoot, runOut, runId) {
  for (const name of ['report.md', 'report.json']) {
    const from = path.join(runOut, name);
    if (!fs.existsSync(from)) continue;
    const to = path.join(outRoot, name);
    const tmp = `${to}.${process.pid}.tmp`;
    fs.copyFileSync(from, tmp);
    fs.renameSync(tmp, to);
  }
  writeJsonAtomic(path.join(outRoot, 'latest.json'), { runId, dir: path.relative(outRoot, runOut), finishedAt: new Date().toISOString() });
}

/** Keeps the newest `keep` run folders; a folder whose run is still alive is never removed. */
function pruneRunDirs(outRoot, { keep = 20, exceptRunId } = {}) {
  let dirs = [];
  try {
    dirs = fs.readdirSync(outRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return;
  }
  for (const name of dirs.slice(0, Math.max(0, dirs.length - keep))) {
    if (name === exceptRunId) continue;
    const dir = path.join(outRoot, name);
    const run = readJson(path.join(dir, 'run.json'));
    if (run && isPidAlive(run.pid) && !run.finishedAt) continue;
    if (containsLink(dir)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = {
  acquireSnapshot,
  containsLink,
  freePort,
  isPidAlive,
  latestBuild,
  makeRunId,
  prepareBuild,
  pruneBuilds,
  pruneRunDirs,
  publishLatest,
  readJson,
  releaseSnapshot,
  resolvePorts,
  withFileLock,
  writeJsonAtomic,
};
