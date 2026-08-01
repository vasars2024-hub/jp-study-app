// Does patch 0004 still apply to the pin, compile, and pass its tests? — slice 41.
//
// `patches/seanime/0004-directstream-open-generation.patch` gives the sidecar a generation it
// can refuse, which is the half of the stale-open problem a client cannot do: `fetch`'s abort
// abandons the response, never the work, so a recovery request already sent can land inside a
// later open and `BeginOpen` -> `beginSubtitleSeek` strips that open's subtitles.
//
// Everything happens in a CLONE of the pinned checkout. The pin is read, never written, and
// this asserts its HEAD is unmoved afterwards.
//
// Two machine-specific traps this file exists partly to encode:
//   * Git Bash's `tar` reads `-C C:\...` as a remote host ("Cannot connect to C: resolve
//     failed"), so `git archive | tar` is not usable here — hence `git clone`.
//   * `git clone` honours the global `core.autocrlf`, which would check the tree out as CRLF
//     and make every multi-line anchor and hunk context stop matching. Both the clone and the
//     checkout force it off.
//
// usage:
//   node docs/migration/tools/verify-open-generation-patch.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PIN = '9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const UPSTREAM = path.resolve(
  process.env.SEANIME_UPSTREAM_DIR ?? path.join(REPO, '../seanime-upstream'),
);
const PATCH = path.join(REPO, 'patches/seanime/0004-directstream-open-generation.patch');
const GO = process.env.SEANIME_GO
  ?? (fs.existsSync('C:/Program Files/Go/bin/go.exe') ? 'C:/Program Files/Go/bin/go.exe' : 'go');

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe', windowsHide: true });
  return { status: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};

if (!fs.existsSync(PATCH)) throw new Error(`missing patch: ${PATCH}`);
if (!fs.existsSync(path.join(UPSTREAM, '.git'))) throw new Error(`pinned checkout not found: ${UPSTREAM}`);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'studyos-verify0004-'));
const source = path.join(scratch, 'source');
const record = { tool: 'verify-open-generation-patch.mjs', slice: 41, pin: PIN, patch: path.relative(REPO, PATCH), steps: [] };

const step = (name, result, extra = {}) => {
  record.steps.push({ name, ok: result.status === 0, exit: result.status, ...extra, output: result.out.slice(0, 1200) });
  return result.status === 0;
};

let ok = true;
ok = step('clone the pin', run('git', ['-c', 'core.autocrlf=false', 'clone', '--quiet', '--no-checkout', UPSTREAM, source], scratch)) && ok;
ok = step('checkout the pin', run('git', ['-c', 'core.autocrlf=false', 'checkout', '--quiet', PIN], source)) && ok;
ok = step('git apply --check', run('git', ['apply', '--check', PATCH], source)) && ok;
ok = step('git apply', run('git', ['apply', PATCH], source)) && ok;
ok = step('go vet ./internal/directstream', run(GO, ['vet', './internal/directstream'], source)) && ok;
ok = step('go build ./internal/directstream ./internal/handlers', run(GO, ['build', './internal/directstream', './internal/handlers'], source)) && ok;
const tests = run(GO, ['test', './internal/directstream', '-run', 'TestAcceptOpenGeneration', '-v'], source);
ok = step('go test -run TestAcceptOpenGeneration', tests, {
  subtests: (tests.out.match(/--- PASS: [^\n]+/g) ?? []).map((line) => line.trim()),
}) && ok;
// The whole package, so the patch is shown not to break an upstream test.
ok = step('go test ./internal/directstream', run(GO, ['test', './internal/directstream'], source)) && ok;

const headAfter = run('git', ['rev-parse', 'HEAD'], UPSTREAM);
record.pinnedCheckoutHeadAfter = headAfter.out;
record.pinnedCheckoutUnmoved = headAfter.out === PIN;
record.result = ok && record.pinnedCheckoutUnmoved ? 'PASS' : 'FAIL';

const now = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}`
  + `${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
const outDir = path.join(REPO, 'docs/migration/proof', `open-generation-patch-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'open-generation-patch.json');
fs.writeFileSync(outFile, `${JSON.stringify(record, null, 1)}\n`);

for (const entry of record.steps) console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}`);
for (const line of record.steps.find((entry) => entry.subtests)?.subtests ?? []) console.log(`      ${line}`);
console.log(`\n${record.result}  ${path.relative(REPO, outFile)}`);
fs.rmSync(scratch, { recursive: true, force: true });
process.exit(record.result === 'PASS' ? 0 : 1);
