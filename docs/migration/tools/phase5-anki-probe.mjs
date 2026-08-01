/**
 * Arm / disarm a namespaced Anki probe destination for a live mining gate.
 *
 * Anki here is a real ~83-deck collection, so a mining gate must not aim at a
 * deck the user studies. Aiming it is not as simple as picking a deck in the UI:
 * `profile-rules.json` owns the destination, and a matching rule silently
 * overrides any per-panel choice (the finding recorded in
 * `docs/migration/NEXT_SESSION.md` under "G-PLAY asset gap"). So the honest way
 * to redirect a real UI mine is to add a real profile and a real first rule, run
 * the gate, and put both files back.
 *
 * `arm` snapshots the two files it touches and writes the snapshot beside them,
 * so `disarm` restores the exact prior bytes rather than a reconstruction.
 * `disarm` also removes the probe deck and every note in it through AnkiConnect,
 * and reports what it deleted.
 *
 * **It redirects an existing seed profile's deck rather than adding a profile,
 * and that is not a style choice — it is the only way to leave no residue.** The
 * first version of this tool added a temporary custom profile. A custom profile's
 * note type is always derived from its label (`shared/profiles.ts`
 * `makeCustomProfile` → `JP Study App::Custom::<label>`, and
 * `main/profiles.ts` `mergeAnkiBinding` resets any stored `modelName` that
 * differs from it, treating it as a legacy migration). So the run minted a new
 * note type — and **AnkiConnect has no `deleteModel` action**, so that note type
 * could not be removed afterwards. Redirecting a seed profile keeps the real
 * shipped note type and leaves nothing behind but the deck, which *can* be
 * deleted.
 *
 * Run `arm` while the app is NOT running — it reads these files at startup, and
 * it rewrites them on quit, which would undo a restore performed underneath it.
 *
 * Usage:
 *   node docs/migration/tools/phase5-anki-probe.mjs arm
 *   node docs/migration/tools/phase5-anki-probe.mjs disarm
 *   node docs/migration/tools/phase5-anki-probe.mjs status
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const USER_DATA = path.join(os.homedir(), 'AppData', 'Roaming', 'jp-study-app');
const PROFILES = path.join(USER_DATA, 'profiles.json');
const RULES = path.join(USER_DATA, 'profile-rules.json');
const SNAPSHOT = path.join(USER_DATA, 'phase5-probe-restore.json');

const PROBE_RULE_ID = 'phase5-manga-probe-rule';
export const DEFAULT_PROBE_DECK = 'StudyOS::_Phase5MangaProbe';

/**
 * The destination deck. Overridable with `JP_PROBE_DECK` so a different gate can
 * name its own deck (the Phase 3 G-PLAY video mine uses
 * `StudyOS::_Phase3GplayProbe`). `arm` records the deck it actually used in the
 * snapshot, and `disarm` deletes *that* deck rather than whatever the
 * environment happens to say — otherwise a disarm run without the variable set
 * would leave the real probe deck behind and try to delete a deck that never
 * existed.
 */
const PROBE_DECK = process.env.JP_PROBE_DECK || DEFAULT_PROBE_DECK;

/**
 * The seed profile whose deck is temporarily redirected. It is the one the
 * existing always-matching first rule already routes to, so the run exercises
 * the same note type, field templates and card layout the user's real mining
 * uses — only the destination deck changes.
 */
const PROBE_PROFILE_ID = 'seed-ja-immersion';

const ANKI_URL = 'http://127.0.0.1:8765';

function log(...parts) {
  console.log('[phase5-anki-probe]', ...parts);
}

async function anki(action, params = {}) {
  const res = await fetch(ANKI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`AnkiConnect ${action}: ${body.error}`);
  return body.result;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ------------------------------------------------------------------- arm

function arm() {
  if (fs.existsSync(SNAPSHOT)) {
    throw new Error(
      `Already armed (${SNAPSHOT} exists). Run disarm first, or delete it if a previous run died.`,
    );
  }

  const profilesRaw = fs.readFileSync(PROFILES, 'utf8');
  const rulesRaw = fs.readFileSync(RULES, 'utf8');
  fs.writeFileSync(
    SNAPSHOT,
    `${JSON.stringify({ armedAt: new Date().toISOString(), deck: PROBE_DECK, profilesRaw, rulesRaw }, null, 2)}\n`,
  );

  const profiles = JSON.parse(profilesRaw);
  const profile = profiles.profiles?.[PROBE_PROFILE_ID];
  if (!profile) throw new Error(`Profile "${PROBE_PROFILE_ID}" not found.`);

  // Only the deck moves. `modelName`, `noteFields` and `fieldTemplates` are left
  // exactly as shipped, so no new note type is provisioned.
  const previousDeck = profile.anki?.deckName ?? null;
  profile.anki.deckName = PROBE_DECK;
  if (profile.deckParams) profile.deckParams.syncQuery = `deck:"${PROBE_DECK}"`;
  profiles.activeProfileId = PROBE_PROFILE_ID;
  fs.writeFileSync(PROFILES, `${JSON.stringify(profiles, null, 2)}\n`);

  const rules = JSON.parse(rulesRaw);
  rules.rules = [
    {
      id: PROBE_RULE_ID,
      enabled: true,
      label: `Migration probe (temporary) — ${PROBE_DECK}`,
      profileId: PROBE_PROFILE_ID,
      match: { source: 'any', cardKind: 'any', language: 'any', category: 'any' },
    },
    ...(rules.rules ?? []),
  ];
  fs.writeFileSync(RULES, `${JSON.stringify(rules, null, 2)}\n`);

  log(`armed: profile "${PROBE_PROFILE_ID}" redirected ${previousDeck} -> ${PROBE_DECK}`);
  log(`note type unchanged: ${profile.anki.modelName}`);
  log(`snapshot: ${SNAPSHOT}`);
}

// ---------------------------------------------------------------- disarm

async function disarm() {
  // The deck to clean up comes from the snapshot, not the environment — see the
  // note on PROBE_DECK.
  const armedDeck = fs.existsSync(SNAPSHOT) ? (readJson(SNAPSHOT).deck ?? PROBE_DECK) : PROBE_DECK;
  const result = { deck: armedDeck, notesDeleted: 0, deckRemoved: false, filesRestored: [] };

  try {
    const noteIds = await anki('findNotes', { query: `deck:"${armedDeck}"` });
    if (noteIds.length) {
      await anki('deleteNotes', { notes: noteIds });
      result.notesDeleted = noteIds.length;
    }
    const decks = await anki('deckNames');
    if (decks.includes(armedDeck)) {
      await anki('deleteDecks', { decks: [armedDeck], cardsToo: true });
      result.deckRemoved = true;
    }
    result.deckCountAfter = (await anki('deckNames')).length;
  } catch (error) {
    result.ankiError = error instanceof Error ? error.message : String(error);
  }

  if (fs.existsSync(SNAPSHOT)) {
    const snap = readJson(SNAPSHOT);
    fs.writeFileSync(PROFILES, snap.profilesRaw);
    fs.writeFileSync(RULES, snap.rulesRaw);
    fs.rmSync(SNAPSHOT, { force: true });
    result.filesRestored = [PROFILES, RULES];
    // Restoration is asserted, not assumed: the probe profile and rule must be
    // gone from what is now on disk.
    const profiles = readJson(PROFILES);
    const rules = readJson(RULES);
    result.probeDeckGoneFromProfile =
      profiles.profiles?.[PROBE_PROFILE_ID]?.anki?.deckName !== armedDeck;
    result.restoredDeckName = profiles.profiles?.[PROBE_PROFILE_ID]?.anki?.deckName ?? null;
    result.probeRuleGone = !(rules.rules ?? []).some((r) => r.id === PROBE_RULE_ID);
    result.activeProfileId = profiles.activeProfileId;
  } else {
    result.note = 'No snapshot found — nothing to restore.';
  }

  log(JSON.stringify(result, null, 2));
  return result;
}

// ---------------------------------------------------------------- status

async function status() {
  const armed = fs.existsSync(SNAPSHOT);
  const deck = armed ? (readJson(SNAPSHOT).deck ?? PROBE_DECK) : PROBE_DECK;
  const out = {
    armed,
    deck,
    activeProfileId: readJson(PROFILES).activeProfileId,
    firstRule: (readJson(RULES).rules ?? [])[0] ?? null,
  };
  try {
    out.probeDeckNotes = (await anki('findNotes', { query: `deck:"${deck}"` })).length;
    out.deckCount = (await anki('deckNames')).length;
  } catch (error) {
    out.ankiError = error instanceof Error ? error.message : String(error);
  }
  log(JSON.stringify(out, null, 2));
  return out;
}

const command = process.argv[2];
if (command === 'arm') arm();
else if (command === 'disarm') await disarm();
else if (command === 'status') await status();
else {
  console.error('Usage: node docs/migration/tools/phase5-anki-probe.mjs <arm|disarm|status>');
  process.exit(2);
}
