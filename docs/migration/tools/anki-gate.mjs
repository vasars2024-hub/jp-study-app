// §9 acceptance gate: exercise the FULL live AnkiConnect export path.
//
// Everything is created inside one namespaced probe deck and removed again at
// the end. Deletions are restricted to ids/filenames this script itself created
// — no query-based deletion ever touches the user's real notes.

const URL_ = 'http://127.0.0.1:8765';
const DECK = 'StudyOS::_MigrationProbe';
const MODEL = 'JP Study App::JA Immersion';
const STAMP = process.argv[2] || 'probe';
const IMG = `studyos-probe-${STAMP}.png`;
const AUD = `studyos-probe-${STAMP}.wav`;

const call = async (action, params = {}) => {
  const t0 = Date.now();
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params }),
  });
  const j = await r.json();
  const ms = Date.now() - t0;
  if (j.error) throw new Error(`${action} -> ${j.error}`);
  console.log(`  ok  ${action.padEnd(18)} ${String(ms).padStart(5)}ms`);
  return j.result;
};

// 1x1 transparent PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// 40 ms of silence, 16-bit mono 16 kHz — a real, playable WAV.
function silentWav(ms = 40, rate = 16000) {
  const n = Math.floor((rate * ms) / 1000);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  return buf.toString('base64');
}

let noteId = null;
let createdDeck = false;
const storedMedia = [];

try {
  console.log('--- read-only preconditions ---');
  await call('version');
  const models = await call('modelNames');
  if (!models.includes(MODEL)) throw new Error(`model missing: ${MODEL}`);
  const fields = await call('modelFieldNames', { modelName: MODEL });
  console.log('      fields:', JSON.stringify(fields));

  console.log('--- create probe deck ---');
  await call('createDeck', { deck: DECK });
  createdDeck = true;

  console.log('--- media attach (screenshot + audio clip) ---');
  const imgName = await call('storeMediaFile', { filename: IMG, data: PNG_B64 });
  storedMedia.push(imgName);
  const audName = await call('storeMediaFile', { filename: AUD, data: silentWav() });
  storedMedia.push(audName);
  console.log('      stored:', imgName, audName);

  const note = {
    deckName: DECK,
    modelName: MODEL,
    fields: {
      Term: '猫',
      Reading: 'ねこ',
      Sentence: `猫が窓辺で寝ている。<br><img src="${imgName}">[sound:${audName}]`,
    },
    tags: ['studyos-migration-probe'],
    options: { allowDuplicate: false },
  };

  console.log('--- duplicate pre-check ---');
  const can = await call('canAddNotes', { notes: [note] });
  console.log('      canAddNotes:', JSON.stringify(can));

  console.log('--- addNote (the gate) ---');
  noteId = await call('addNote', { note });
  console.log('      noteId:', noteId);

  console.log('--- read back ---');
  const found = await call('findNotes', { query: `tag:studyos-migration-probe` });
  const info = await call('notesInfo', { notes: [noteId] });
  const cards = await call('cardsInfo', { cards: info[0].cards });
  console.log('      findNotes matched:', found.length, '| cards:', info[0].cards.length);
  console.log('      Term      =', JSON.stringify(info[0].fields.Term.value));
  console.log('      Reading   =', JSON.stringify(info[0].fields.Reading.value));
  console.log('      Sentence  =', JSON.stringify(info[0].fields.Sentence.value));
  console.log('      card ivl  =', cards[0].interval, '| due card id', cards[0].cardId);

  console.log('--- duplicate rejection (allowDuplicate:false) ---');
  try {
    await call('addNote', { note });
    console.log('  !!  UNEXPECTED: duplicate was accepted');
  } catch (e) {
    console.log('  ok  duplicate rejected:', e.message.slice(0, 90));
  }

  console.log('--- findCards (due forecast path) ---');
  const due = await call('findCards', { query: 'prop:due<=1 -is:suspended' });
  console.log('      collection-wide cards due<=1:', due.length);
} finally {
  console.log('--- cleanup ---');
  if (noteId != null) await call('deleteNotes', { notes: [noteId] }).catch((e) => console.log('  !!', e.message));
  for (const f of storedMedia) {
    await call('deleteMediaFile', { filename: f }).catch((e) => console.log('  !!', e.message));
  }
  if (createdDeck) {
    await call('deleteDecks', { decks: [DECK], cardsToo: true }).catch((e) => console.log('  !!', e.message));
  }
  const left = await call('findNotes', { query: 'tag:studyos-migration-probe' }).catch(() => ['?']);
  const decks = await call('deckNames').catch(() => []);
  console.log('      residual probe notes:', Array.isArray(left) ? left.length : left);
  console.log('      probe deck still present:', decks.includes(DECK));
}
