// Why is the FIRST `dict:examples` of a boot 6,590.8 ms when the second is 35.5 ms?
//
// Read-only, against the live dict.db. Answers three questions the timing alone
// cannot: does `limit EXAMPLE_SCAN_ROWS` ever actually stop the scan, what does
// SQLite's own plan say it is doing, and how many pages the table costs.
const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = process.argv[2]
  || path.join(process.env.APPDATA, 'jp-study-app', 'dictionary', 'dict.db');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const WORDS = process.argv.slice(3);
const words = WORDS.length ? WORDS : [
  String.fromCharCode(0x98df, 0x3079, 0x308b), // 食べる
  String.fromCharCode(0x6d77),                 // 海
  String.fromCharCode(0x75db, 0x3044),         // 痛い
  String.fromCharCode(0x7a93),                 // 窓
  String.fromCharCode(0x8a71, 0x3059),         // 話す
];

console.log('db', dbPath, (fs.statSync(dbPath).size / 1048576).toFixed(1), 'MB');
console.log('page_size', db.pragma('page_size', { simple: true }),
  'page_count', db.pragma('page_count', { simple: true }),
  'cache_size', db.pragma('cache_size', { simple: true }));

const EXAMPLE_KIND = 'examples';
const scanSql = `
    select e.id, e.lang, e.text, e.source, e.licence, e.dict_id, d.title as dict_title
    from examples e
    join dictionaries d on d.id = e.dict_id
    where d.enabled = 1
      and d.kind = '${EXAMPLE_KIND}'
      and e.lang in (?)
      and instr(e.text, ?) > 0
    limit ?
`;

console.log('--- query plan ---');
for (const r of db.prepare(`explain query plan ${scanSql}`).all('ja', 'x', 400)) {
  console.log(' ', r.detail);
}

console.log('--- examples table ---');
console.log(' total rows      ', db.prepare('select count(*) c from examples').get().c.toLocaleString());
for (const r of db.prepare('select lang, count(*) c from examples group by lang order by c desc').all()) {
  console.log(`  lang ${r.lang.padEnd(6)} ${r.c.toLocaleString()}`);
}
console.log(' indexes on examples:',
  db.prepare(`select name, sql from sqlite_master where type='index' and tbl_name='examples'`)
    .all().map((r) => r.name).join(', ') || '(none)');

console.log('--- per word: how many rows actually match, and does the cap ever bite ---');
const matchCount = db.prepare(
  `select count(*) c from examples e join dictionaries d on d.id = e.dict_id
   where d.enabled = 1 and d.kind = '${EXAMPLE_KIND}' and e.lang = ? and instr(e.text, ?) > 0`);
const scan = db.prepare(scanSql);
for (const w of words) {
  const t0 = process.hrtime.bigint();
  const n = matchCount.get('ja', w).c;
  const t1 = process.hrtime.bigint();
  const rows = scan.all('ja', w, 400);
  const t2 = process.hrtime.bigint();
  console.log(
    `  ${w.padEnd(4)} matches=${String(n).padStart(6)} capReached=${n >= 400}`,
    `countMs=${(Number(t1 - t0) / 1e6).toFixed(1)}`,
    `scanRows=${rows.length} scanMs=${(Number(t2 - t1) / 1e6).toFixed(1)}`,
  );
}
db.close();
