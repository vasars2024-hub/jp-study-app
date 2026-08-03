/**
 * Removes the rank-22 QA fixture from the live Study document.
 *
 * The fixture is a synthetic "The Big O - 02" prepared workspace that clones
 * episode 1's candidates. It is identified by three exact keys plus the
 * `検証用の次話:` sentence prefix it stamped on every cloned cue.
 *
 * Run with no argument to audit. Run with --apply to write.
 * The app MUST be stopped first: it holds the document in memory and would
 * write the fixture back.
 */
const fs = require('fs');
const crypto = require('crypto');

const FILE = 'C:\\Users\\Arseniy\\AppData\\Roaming\\jp-study-app\\study-orchestrator-v2.json';
const READINESS = 'qa-series-recurrence-readiness-e2';
const WORKSPACE = 'qa-series-recurrence-workspace-e2';
const SUBTITLE = 'qa-series-recurrence-subtitle-e2';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').toUpperCase();

const original = fs.readFileSync(FILE, 'utf8');
const doc = JSON.parse(original);

console.log('current sha256 :', sha(original));
console.log('current bytes  :', Buffer.byteLength(original));

// Confirm the app's own writer format before trusting a rewrite.
const roundTrip = `${JSON.stringify(doc, null, 2)}\n`;
const roundTripNoNl = JSON.stringify(doc, null, 2);
const fmt = roundTrip === original ? '2-space + trailing newline'
  : roundTripNoNl === original ? '2-space, no trailing newline'
  : null;
console.log('format match   :', fmt ?? 'UNKNOWN — refusing to write');
if (!fmt) process.exit(2);
const render = (d) => (fmt.includes('trailing') ? `${JSON.stringify(d, null, 2)}\n` : JSON.stringify(d, null, 2));

const before = {
  readiness: Object.keys(doc.readiness).length,
  workspaces: Object.keys(doc.workspaces).length,
  opportunities: Object.keys(doc.opportunities).length,
};

// Derived opportunities are matched by what they point at. The rank-22 forecast
// is the one exception: it anchors on the *real* episode-1 readiness and exists
// only because the fixture supplied a later episode, so it is matched by its
// exact audited id rather than by a type heuristic that could catch a genuine one.
const FIXTURE_FORECAST_ID = 'study-opportunity-series-recurrence-ikla3x';
const fixtureOpportunities = Object.entries(doc.opportunities)
  .filter(([id, o]) => o.readinessId === READINESS
    || o.context?.subtitleRecordId === SUBTITLE
    || id === FIXTURE_FORECAST_ID)
  .map(([id]) => id);

console.log('\nfixture entries found:');
console.log('  readiness    :', Object.prototype.hasOwnProperty.call(doc.readiness, READINESS));
console.log('  workspace    :', Object.prototype.hasOwnProperty.call(doc.workspaces, WORKSPACE));
console.log('  opportunities:', fixtureOpportunities.join(', ') || '(none)');

delete doc.readiness[READINESS];
delete doc.workspaces[WORKSPACE];
for (const id of fixtureOpportunities) delete doc.opportunities[id];

const cleaned = render(doc);
const residue = (cleaned.match(/検証用/g) ?? []).length
  + (cleaned.match(/qa-series-recurrence/g) ?? []).length
  + (cleaned.match(/qa-e2-study-word/g) ?? []).length;

console.log('\nafter removal:');
console.log('  readiness    :', before.readiness, '->', Object.keys(doc.readiness).length);
console.log('  workspaces   :', before.workspaces, '->', Object.keys(doc.workspaces).length);
console.log('  opportunities:', before.opportunities, '->', Object.keys(doc.opportunities).length);
console.log('  fixture residue strings:', residue);
console.log('  resulting sha256:', sha(cleaned));
console.log('  resulting bytes :', Buffer.byteLength(cleaned));

if (residue !== 0) {
  console.log('\nREFUSING TO WRITE: fixture strings still present outside the removed keys.');
  process.exit(3);
}

if (process.argv.includes('--apply')) {
  fs.writeFileSync(`${FILE}.rank22-prefixture.bak`, original, 'utf8');
  fs.writeFileSync(FILE, cleaned, 'utf8');
  const after = fs.readFileSync(FILE, 'utf8');
  console.log('\nWRITTEN. verified on-disk sha256:', sha(after));
  console.log('backup of pre-cleanup state:', `${FILE}.rank22-prefixture.bak`);
} else {
  console.log('\n(audit only — pass --apply to write)');
}
