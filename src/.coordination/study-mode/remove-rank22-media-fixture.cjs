/**
 * Surgical undo of the two rank-22 QA mutations in media.json.
 *
 *  1. The fixture Japanese subtitle record the QA attached to "The Big O - 02"
 *     (id `qa-series-recurrence-subtitle-e2`, label "QA fixture ...").
 *  2. The `lastPlayedAt` bump on "The Big O - 01" caused by clicking the
 *     panel's exact-scene action. `positionSec` was already 53.267 and the cue
 *     is 53.267, so position itself never moved.
 *
 * Nothing else is touched — in particular any metadata the app enriched while
 * running is left exactly as it is, because there is no baseline to justify
 * reverting it.
 *
 * Run with no argument to audit. Run with --apply to write. App must be stopped.
 */
const fs = require('fs');
const crypto = require('crypto');

const FILE = 'C:\\Users\\Arseniy\\AppData\\Roaming\\jp-study-app\\media.json';
const FIXTURE_SUBTITLE = 'qa-series-recurrence-subtitle-e2';
const EPISODE_1 = '7b984295-2d7a-4818-b17c-c89f850f7483';
const EPISODE_1_LAST_PLAYED_AT = 1785142935339; // measured at the start of this session, pre-QA

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').toUpperCase();

const original = fs.readFileSync(FILE, 'utf8');
const doc = JSON.parse(original);

console.log('current sha256:', sha(original));
console.log('current bytes :', Buffer.byteLength(original));

const roundTrip = `${JSON.stringify(doc, null, 2)}\n`;
const roundTripNoNl = JSON.stringify(doc, null, 2);
const fmt = roundTrip === original ? 'trailing'
  : roundTripNoNl === original ? 'none'
  : null;
console.log('format match  :', fmt ? `2-space, newline: ${fmt}` : 'UNKNOWN — refusing to write');
if (!fmt) process.exit(2);
const render = (d) => (fmt === 'trailing' ? `${JSON.stringify(d, null, 2)}\n` : JSON.stringify(d, null, 2));

let removedSubtitles = 0;
for (const item of doc.items) {
  if (!Array.isArray(item.subtitles)) continue;
  const before = item.subtitles.length;
  item.subtitles = item.subtitles.filter((s) => s.id !== FIXTURE_SUBTITLE);
  if (item.subtitles.length !== before) {
    removedSubtitles += before - item.subtitles.length;
    console.log(`  removed fixture subtitle from: ${item.title}`);
  }
}

const ep1 = doc.items.find((i) => i.id === EPISODE_1);
const playedBefore = ep1 ? ep1.lastPlayedAt : null;
if (ep1 && ep1.lastPlayedAt !== EPISODE_1_LAST_PLAYED_AT) {
  ep1.lastPlayedAt = EPISODE_1_LAST_PLAYED_AT;
}

console.log('\nfixture subtitles removed :', removedSubtitles);
console.log('episode 1 lastPlayedAt    :', playedBefore, '->', ep1 ? ep1.lastPlayedAt : '(missing)');
console.log('episode 1 positionSec     :', ep1 ? ep1.positionSec : '(missing)', '(untouched)');
console.log('library item count        :', doc.items.length, '(untouched)');

const cleaned = render(doc);
const residue = (cleaned.match(/qa-series-recurrence/g) ?? []).length
  + (cleaned.match(/QA fixture/g) ?? []).length
  + (cleaned.match(/検証用/g) ?? []).length;
console.log('fixture residue strings   :', residue);
console.log('resulting sha256          :', sha(cleaned));
console.log('resulting bytes           :', Buffer.byteLength(cleaned));

if (residue !== 0) {
  console.log('\nREFUSING TO WRITE: fixture strings remain.');
  process.exit(3);
}

if (process.argv.includes('--apply')) {
  fs.writeFileSync(`${FILE}.rank22-prefixture.bak`, original, 'utf8');
  fs.writeFileSync(FILE, cleaned, 'utf8');
  console.log('\nWRITTEN. verified on-disk sha256:', sha(fs.readFileSync(FILE, 'utf8')));
} else {
  console.log('\n(audit only — pass --apply to write)');
}
