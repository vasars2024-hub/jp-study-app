// Regenerate the fifth substitution: vendor/seanime-web/.../mpv-core/mpv-core.atoms.ts
//
// Kept as a tool rather than a hand-written file so that re-syncing with upstream is
// mechanical: re-copy the closure, then re-run this. It refuses to run if the upstream
// import line it removes is no longer there, which is the signal that the substitution
// needs rethinking rather than reapplying.
//
// usage: node make-mpv-atoms-substitution.mjs

import fs from 'node:fs';
import path from 'node:path';

const REL = 'app/(main)/_features/mpv-core/mpv-core.atoms.ts';
const UP = path.join('C:/Users/Arseniy/Projects/seanime-upstream/seanime-web/src', REL);
const DEST = path.join('C:/Users/Arseniy/Projects/jp-study-app/vendor/seanime-web', REL);

const NEEDLE = 'import type { MpvPrismTrack } from "@mpv-prism/core"\r\n';

let src = fs.readFileSync(UP, 'utf8');
if (!src.includes(NEEDLE)) {
  throw new Error(
    'upstream no longer contains the exact @mpv-prism/core import line this substitution ' +
      'removes — re-measure the closure before reapplying',
  );
}
src = src.replace(NEEDLE, '');

const HEADER = `/**
 * STUDY OS SUBSTITUTION — replaces seanime-web's \`app/(main)/_features/mpv-core/mpv-core.atoms.ts\`.
 *
 * The ONLY change is the removal of \`import type { MpvPrismTrack } from "@mpv-prism/core"\`,
 * replaced by the structural interface below. Every other line is byte-identical to the
 * pinned checkout (9bdd052).
 *
 * Why: \`@mpv-prism/core\` is the one dependency of the entry closure that ADR-002 defers, and
 * the risk register carries it as "licence unknown — don't ship it". Two things are now known:
 *
 *   1. It is LGPL-3.0 (\`node_modules/@mpv-prism/core/LICENSE\` in the pinned checkout), which
 *      is compatible with the GPL-3.0 this repo took on under ADR-001. The licence is no
 *      longer unknown — but ADR-002 still defers the *feature*, so it stays out.
 *   2. It is not a registry package. Upstream's package.json pins it to a tarball URL on
 *      seanime.app (\`.../mpv-prism/0.1.8/...tgz?sha256=...\`), so adopting it would add an
 *      out-of-registry supply-chain dependency for an alternative player we do not use.
 *
 * The import was type-only and \`MpvPrismTrack\` is referenced exactly once in this file
 * (\`atom<MpvPrismTrack[]>([])\`). Nothing else in the adopted tree reaches mpv-prism — the
 * other three importers (\`mpv-core.tsx\`, \`mpv-core-player-inner.tsx\`, \`mpv-core-stats.tsx\`)
 * are NOT in the entry closure.
 *
 * CORRECTION for the next sync: ADOPTION.md previously recorded \`mpv-core.tsx\` as the
 * reachable importer and proposed stubbing it. That was wrong. Measured in Phase 3, the
 * reachable file is this one, reached via
 * \`entry/page.tsx → entry/_containers/torrent-stream/playback-play-pill.tsx\`.
 * Stubbing \`mpv-core.tsx\` would have removed nothing.
 *
 * Whole-file replacement, not an edit — see \`vendor/seanime-web/ADOPTION.md\`.
 */

/**
 * Structural stand-in for \`MpvPrismTrack\`, copied verbatim from \`@mpv-prism/core\`'s
 * \`dist/types.d.ts\` at 0.1.8.
 */
export interface MpvPrismTrack {
    id?: number | string
    type?: string
    title?: string
    lang?: string
    selected?: boolean
    external?: boolean
    [key: string]: unknown
}

`.replace(/\n/g, '\r\n');

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, HEADER + src);
console.log(`written ${DEST}`);
