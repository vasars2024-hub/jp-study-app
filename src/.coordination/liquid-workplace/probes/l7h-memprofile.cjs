/**
 * L7-H — attribute defect D1 instead of guessing at it.
 *
 * D1 (§12.1 of `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md`): main-process
 * private bytes go 575.8 MB → 7,075.7 MB across ~19 Dictionary actions in ~70 s
 * and never come back. Every previous instrument here sampled from OUTSIDE the
 * process (`Get-Process`.`PrivateMemorySize64`), which can say how much grew but
 * never which pool grew — and `/eval` is no help because it runs in a renderer,
 * not in main.
 *
 * This reads main's own `/mem` route, so each sample separates:
 *   heapUsed      retained JS objects in main
 *   external / arrayBuffers   Buffers (SQLite rows, images, IPC payloads)
 *   rss far above both        native or allocator-held memory
 *   detachedContexts          contexts held alive by a stale reference
 *
 * The decisive control is `--gc`. The app runs without `--expose-gc`, so `/mem`
 * borrows the flag for one forced collection. If private bytes fall after it,
 * the memory was collectable all along and D1 is GC never getting idle time
 * under cadence. If they do not move, it is genuine retention and the next
 * question is which reference.
 *
 *   node src/.coordination/liquid-workplace/probes/l7h-memprofile.cjs <label> [--gc]
 *
 * Every sample appends to `l7h-memprofile.json` beside this file, so a run's
 * series survives the shell that produced it.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const OUT = path.join(__dirname, 'l7h-memprofile.json');

async function main() {
  const label = process.argv[2] || 'sample';
  const gc = process.argv.includes('--gc');

  const res = await fetch(`http://127.0.0.1:${cfg.port}/mem`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ gc }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`/mem failed: ${JSON.stringify(body).slice(0, 300)}`);

  // A forced GC that silently did not run would make a flat reading read like
  // proof of retention. Say so rather than scoring it.
  if (gc && !body.gcRan) {
    console.log('!! --gc requested but gcRan=false — this sample proves NOTHING about retention');
  }

  const row = { label, at: new Date().toISOString(), gc, ...body };
  delete row.ok;

  let series = [];
  try {
    series = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    /* first sample */
  }
  series.push(row);
  fs.writeFileSync(OUT, JSON.stringify(series, null, 2));

  const renderers = body.metrics.filter((m) => m.type !== 'Browser');
  const rendererMb = Math.round(renderers.reduce((a, m) => a + m.workingSetMb, 0) * 10) / 10;

  console.log(
    [
      `${label.padEnd(22)} pid=${body.pid} up=${body.uptimeSec}s${gc ? ` gcRan=${body.gcRan}` : ''}`,
      `  MAIN  private=${body.privateMb} MB   rss=${body.rssMb} MB`,
      `  V8    heapUsed=${body.heapUsedMb} / heapTotal=${body.heapTotalMb} MB   (limit ${body.heapLimitMb})`,
      `  BUF   external=${body.externalMb} MB   arrayBuffers=${body.arrayBuffersMb} MB`,
      `  NATIVE malloced=${body.mallocedMb} MB   peakMalloced=${body.peakMallocedMb} MB`,
      `  CTX   native=${body.nativeContexts}   DETACHED=${body.detachedContexts}`,
      `  OTHER ${renderers.length} non-browser processes, ${rendererMb} MB working set`,
      // The gap main's own pools cannot explain. If this is most of the growth,
      // no amount of JS-side bisecting will find it.
      `  UNATTRIBUTED private-minus-(heapTotal+external+malloced) = ${
        Math.round((body.privateMb - body.heapTotalMb - body.externalMb - body.mallocedMb) * 10) / 10
      } MB`,
    ].join('\n'),
  );
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
