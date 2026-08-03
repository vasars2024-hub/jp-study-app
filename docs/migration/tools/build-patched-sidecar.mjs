#!/usr/bin/env node
// Builds the pinned Seanime sidecar with Study OS's upstreamable Go patches
// without modifying the pinned checkout or relying on its dirty working files.
//
// Usage:
//   node docs/migration/tools/build-patched-sidecar.mjs <absolute-output.exe>

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PIN = '9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const UPSTREAM = path.resolve(
  process.env.SEANIME_UPSTREAM_DIR
    ?? path.join(REPO, '../seanime-upstream'),
);
const OUTPUT = process.argv[2] ? path.resolve(process.argv[2]) : '';
const GO = process.env.SEANIME_GO
  ?? (fs.existsSync('C:/Program Files/Go/bin/go.exe')
    ? 'C:/Program Files/Go/bin/go.exe'
    : 'go');
// bsdtar, by absolute path, NEVER a bare `tar.exe` — slice 46.
//
// This file used to spawn `tar.exe` and a comment asserted it "resolves to System32's".
// That was a fact about the shell it happened to be launched from. Under Git Bash, Git's
// own `usr/bin/tar` wins the PATH, reads `-C C:\...` as a remote HOST, and dies with
// "Cannot connect to C: resolve failed" — the same trap slice 41 already documented for
// `git archive | tar` and worked around with `git clone`. A build tool must not depend on
// its caller's PATH to pick between two programs with the same name.
const TAR = (() => {
  const system32 = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe');
  return fs.existsSync(system32) ? system32 : 'tar.exe';
})();
// Go-source patches only. These are applied to the `git archive` tree below and
// are therefore compiled into the sidecar this app launches.
//
// 0001 and 0003 are deliberately absent: they patch `seanime-web/**`, which is
// TypeScript for the web frontend. `web/` is copied in pre-built from the
// upstream checkout (see the cpSync below), so applying them here would patch
// sources nothing rebuilds — a silent no-op that would read as "the patch is
// applied" while changing nothing. They belong to the seanime-web build, not
// this one.
const PATCHES = [
  path.join(REPO, 'patches/seanime/0002-directstream-terminal-subtitle-flush.patch'),
  path.join(REPO, 'patches/seanime/0004-directstream-open-generation.patch'),
];

if (!OUTPUT || !path.isAbsolute(OUTPUT)) {
  throw new Error('Pass an absolute output path for the patched seanime.exe.');
}
if (!fs.existsSync(path.join(UPSTREAM, '.git'))) {
  throw new Error(`Pinned Seanime checkout not found: ${UPSTREAM}`);
}
if (!fs.existsSync(path.join(UPSTREAM, 'web'))) {
  throw new Error(
    `Missing ${path.join(UPSTREAM, 'web')}; build seanime-web first so Go can embed it.`,
  );
}
for (const patch of PATCHES) {
  if (!fs.existsSync(patch)) throw new Error(`Missing patch: ${patch}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture
      ? `\n${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd()
      : '';
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}${detail}`);
  }
  return options.capture ? String(result.stdout).trim() : '';
}

const head = run('git', ['rev-parse', 'HEAD'], { cwd: UPSTREAM, capture: true });
if (head !== PIN) {
  throw new Error(`Seanime pin mismatch: expected ${PIN}, found ${head}`);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'studyos-seanime-build-'));
const archive = path.join(scratch, 'seanime.tar');
const source = path.join(scratch, 'source');

try {
  fs.mkdirSync(source);
  run('git', ['archive', '--format=tar', `--output=${archive}`, PIN], { cwd: UPSTREAM });
  run(TAR, ['-xf', archive, '-C', source]);

  // `web/` is a generated, ignored Go embed input. Copy it separately; every tracked
  // source file still comes from `git archive`, never from the dirty checkout.
  fs.cpSync(path.join(UPSTREAM, 'web'), path.join(source, 'web'), { recursive: true });

  for (const patch of PATCHES) {
    run('git', ['apply', '--check', patch], { cwd: source });
    run('git', ['apply', patch], { cwd: source });
  }

  run(GO, ['test', './internal/directstream'], { cwd: source });
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  run(
    GO,
    [
      'build',
      '-o',
      OUTPUT,
      '-trimpath',
      '-ldflags=-s -w',
      '-tags=nosystray',
    ],
    { cwd: source },
  );
  console.log(`patched sidecar: ${OUTPUT}`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
