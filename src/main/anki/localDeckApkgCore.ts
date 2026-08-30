import crypto from 'node:crypto';
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import { ANKI_FIELD_SEP } from '../../shared/ankiDraft';
import type { LocalDeckApkgRequest } from '../../shared/localDeckApkg';
import { getSql } from './apkgCollection';

function html(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function checksum(value: string): number {
  return Number.parseInt(crypto.createHash('sha1').update(value).digest('hex').slice(0, 8), 16);
}

/** Author a legacy-compatible Anki package and verify the archive before returning. */
export async function writeLocalDeckApkg(request: LocalDeckApkgRequest): Promise<{ notes: number; media: number }> {
  const headers = request.rows[0] ?? [];
  const rows = request.rows.slice(1);
  if (!headers.length || !rows.length) throw new Error('The local deck has no cards to package.');
  const SQL = await getSql();
  const db = new SQL.Database();
  const nowSec = Math.floor(request.nowMs / 1000);
  const baseId = request.nowMs;
  const deckId = baseId;
  const modelId = baseId + 1;
  try {
    db.run(`
      CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer,
        ver integer, dty integer, usn integer, ls integer, conf text, models text,
        decks text, dconf text, tags text);
      CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null,
        mod integer not null, usn integer not null, tags text not null, flds text not null,
        sfld integer not null, csum integer not null, flags integer not null, data text not null);
      CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null,
        ord integer not null, mod integer not null, usn integer not null, type integer not null,
        queue integer not null, due integer not null, ivl integer not null, factor integer not null,
        reps integer not null, lapses integer not null, left integer not null, odue integer not null,
        odid integer not null, flags integer not null, data text not null);
      CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null,
        ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null,
        time integer not null, type integer not null);
      CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
      CREATE INDEX ix_notes_usn on notes (usn);
      CREATE INDEX ix_cards_usn on cards (usn);
      CREATE INDEX ix_cards_nid on cards (nid);
      CREATE INDEX ix_cards_sched on cards (did, queue, due);
      CREATE INDEX ix_revlog_usn on revlog (usn);
      CREATE INDEX ix_revlog_cid on revlog (cid);
    `);
    const fields = headers.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20 }));
    const model = {
      id: modelId, name: 'JP Study local card', type: 0, mod: nowSec, usn: 0, sortf: 0,
      did: deckId, latexPre: '', latexPost: '', css: '.card{font-family:Arial;font-size:20px;text-align:left;color:black;background:white}',
      flds: fields,
      tmpls: [{
        name: 'Card 1', ord: 0,
        qfmt: '{{Expression}}{{#Reading}}<br>{{Reading}}{{/Reading}}{{#Front}}<br>{{Front}}{{/Front}}{{#Audio}}<br>{{Audio}}{{/Audio}}',
        afmt: '{{FrontSide}}<hr id=answer>{{Meaning}}{{#Sentence}}<br>{{Sentence}}{{/Sentence}}{{#Back}}<br>{{Back}}{{/Back}}',
        did: null, bqfmt: '', bafmt: '',
      }],
      req: [[0, 'any', [0, 4]]],
    };
    const deck = { id: deckId, name: request.deckName, mod: nowSec, usn: 0, desc: '', dyn: 0, collapsed: false, conf: 1, extendNew: 10, extendRev: 50 };
    db.run('INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      1, nowSec, request.nowMs, request.nowMs, 11, 0, 0, 0, '{}',
      JSON.stringify({ [modelId]: model }), JSON.stringify({ [deckId]: deck }), '{}', '{}',
    ]);
    rows.forEach((row, index) => {
      const values = headers.map((_header, field) => html(String(row[field] ?? '')));
      const noteId = baseId + 10 + index * 2;
      const cardId = noteId + 1;
      const sort = values[0] ?? '';
      const guid = crypto.createHash('sha1').update(`${request.deckName}\0${index}\0${values.join(ANKI_FIELD_SEP)}`).digest('base64url').slice(0, 10);
      db.run('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
        noteId, guid, modelId, nowSec, 0, '', values.join(ANKI_FIELD_SEP), sort, checksum(sort), 0, '',
      ]);
      db.run('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        cardId, noteId, deckId, 0, nowSec, 0, 0, 0, index + 1, 0, 0, 0, 0, 0, 0, 0, 0, '',
      ]);
    });
    const zip = new AdmZip();
    zip.addFile('collection.anki2', Buffer.from(db.export()));
    const manifest: Record<string, string> = {};
    request.media.forEach((item, index) => {
      if (!fs.existsSync(item.filePath) || !fs.statSync(item.filePath).isFile()) {
        throw new Error(`Export media is unavailable: ${item.fileName}`);
      }
      const key = String(index);
      manifest[key] = item.fileName;
      zip.addFile(key, fs.readFileSync(item.filePath));
    });
    zip.addFile('media', Buffer.from(JSON.stringify(manifest), 'utf8'));
    zip.writeZip(request.outputPath);
    const check = new AdmZip(request.outputPath);
    if (!check.getEntry('collection.anki2') || !check.getEntry('media')) throw new Error('The written Anki package failed read-back.');
    return { notes: rows.length, media: request.media.length };
  } catch (error) {
    try { fs.rmSync(request.outputPath, { force: true }); } catch { /* best effort */ }
    throw error;
  } finally {
    db.close();
  }
}
