// The dictionary database schema and its migration ladder.
//
// This is §3.1 of docs/plans/PROFESSIONAL_DICTIONARY_PLAN.md made executable. The
// one idea the whole thing rests on is `lang` on BOTH sides: `headwords.lang` is
// the source language and `glosses.lang` is the target, so JA→RU and RU→JA are the
// same query with two columns swapped. Every "any-to-any" claim downstream reduces
// to that, and nothing else in here is load-bearing by comparison.
//
// Three things the plan's DDL leaves implicit and this file makes explicit:
//
//   1. **FTS5 triggers.** The plan declares `content='headwords'` external-content
//      FTS tables and stops there. An external-content table does not track its
//      source — without INSERT/UPDATE/DELETE triggers it simply returns nothing,
//      silently, which is the worst possible failure for a search index. The
//      triggers are the feature, not boilerplate.
//   2. **Foreign keys.** The plan asks for `PRAGMA foreign_keys=ON` but declares no
//      references, which would make the pragma decorative. Dropping a dictionary has
//      to remove its headwords, their senses and their glosses, so the cascade is
//      declared where the ownership is genuinely exclusive.
//   3. **`norm` is required, `text` is what was written.** Every lookup goes through
//      `norm`; `text` is only ever displayed. Keeping both is what lets NFKC folding,
//      tone stripping and case folding change without a re-import of the display form.
//
// Adding a migration: append a step, never edit a shipped one. `user_version` is the
// only thing that decides what has run, so an edited step is a step that never runs
// again on any machine that already applied it.

import type { SqliteDb } from './db';
import { BUNDLED_GLOSS_LANGS, BUNDLED_SOURCE_LANGS, DEFAULT_SOURCE_LANG } from './glossLang';
import { parseLegacyXref } from './migrate';
import { relabelDictionarySourceLang } from './sourceLang';
import { CORPUS_LANG_ALIAS_PAIRS } from '../../shared/dictionarySources';

/** Bumped by appending to MIGRATIONS. Never edit a released step. */
export const DICT_SCHEMA_VERSION = 12;

export interface MigrationStep {
  version: number;
  /** Human-readable, used in logs and in the migration test's failure output. */
  name: string;
  up(db: SqliteDb): void;
}

const V1_TABLES = `
CREATE TABLE dictionaries (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  revision     TEXT,
  source_lang  TEXT NOT NULL,
  target_langs TEXT NOT NULL DEFAULT '',   -- 'en,ru'
  priority     INTEGER NOT NULL DEFAULT 0,
  enabled      INTEGER NOT NULL DEFAULT 1,
  kind         TEXT NOT NULL DEFAULT 'term', -- term|name|char|freq|pitch|example|collocation
  licence      TEXT,
  attribution  TEXT,
  entry_count  INTEGER NOT NULL DEFAULT 0,
  bytes        INTEGER NOT NULL DEFAULT 0,
  imported_at  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE headwords (
  id           INTEGER PRIMARY KEY,
  dict_id      TEXT NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
  lang         TEXT NOT NULL,
  text         TEXT NOT NULL,
  norm         TEXT NOT NULL,
  reading      TEXT,
  reading_norm TEXT,
  variant_of   INTEGER REFERENCES headwords(id) ON DELETE SET NULL,
  score        INTEGER NOT NULL DEFAULT 0,
  freq_rank    INTEGER
);
CREATE INDEX idx_hw_norm    ON headwords(lang, norm);
CREATE INDEX idx_hw_reading ON headwords(lang, reading_norm);
CREATE INDEX idx_hw_dict    ON headwords(dict_id);
-- Not in §3.1, and it is not a micro-optimisation. Any per-dictionary lookup
-- ("this term, in THIS dictionary") filters on the pair, and with only the two
-- indexes above SQLite picks idx_hw_dict and then scans every row of that
-- dictionary: measured at ~100 ms per lookup over a real 524k-entry JMdict, versus
-- microseconds here. A synthetic 50k-row test cannot show this — the scan is cheap
-- at that size — which is why it took a run against the real dictionaries to find.
CREATE INDEX idx_hw_dict_norm ON headwords(dict_id, norm);

CREATE TABLE senses (
  id          INTEGER PRIMARY KEY,
  headword_id INTEGER NOT NULL REFERENCES headwords(id) ON DELETE CASCADE,
  ord         INTEGER NOT NULL DEFAULT 0,
  pos         TEXT,
  tags        TEXT,
  misc        TEXT,
  register    TEXT,
  field       TEXT,
  dialect     TEXT
);
CREATE INDEX idx_sense_hw ON senses(headword_id, ord);

CREATE TABLE glosses (
  id       INTEGER PRIMARY KEY,
  sense_id INTEGER NOT NULL REFERENCES senses(id) ON DELETE CASCADE,
  lang     TEXT NOT NULL,
  text     TEXT NOT NULL,
  html     TEXT,
  ord      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_gloss_lang ON glosses(lang, sense_id);
-- §3.1 stops at the index above, and that index cannot serve the query every
-- lookup actually makes. "The glosses of this sense" filters on sense_id alone,
-- and idx_gloss_lang leads with lang, so SQLite falls back to SCAN glosses —
-- measured at 95 ms per call over 1.33 M real rows, on the hot path of EVERY
-- lookup, not just of bulk work. Ordering by ord here as well makes it covering
-- and removes the temp B-tree the ORDER BY otherwise builds.
CREATE INDEX idx_gloss_sense ON glosses(sense_id, ord);

CREATE TABLE xrefs (
  from_sense INTEGER NOT NULL REFERENCES senses(id) ON DELETE CASCADE,
  to_text    TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'see'   -- see|ant|syn|cf
);
CREATE INDEX idx_xref_from ON xrefs(from_sense);

CREATE TABLE inflections (
  headword_id INTEGER NOT NULL REFERENCES headwords(id) ON DELETE CASCADE,
  form        TEXT NOT NULL,
  name        TEXT,
  tags        TEXT
);
CREATE INDEX idx_infl_form ON inflections(form);

CREATE TABLE collocations (
  lang    TEXT NOT NULL,
  head    TEXT NOT NULL,
  partner TEXT NOT NULL,
  pattern TEXT,
  count   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_colloc_head ON collocations(lang, head);

CREATE TABLE etymology (
  headword_id INTEGER NOT NULL REFERENCES headwords(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL,
  text        TEXT NOT NULL,
  source      TEXT
);
CREATE INDEX idx_etym_head ON etymology(headword_id);

CREATE TABLE audio (
  headword_id INTEGER NOT NULL REFERENCES headwords(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL,
  accent      TEXT,
  provider    TEXT,
  url         TEXT,
  local_path  TEXT
);

-- Not in §3.1 of the plan. The plan lists 'pitch' as a dictionary kind and then
-- provides nowhere to put pitch data, so migrating the bundled Kanjium accents
-- would have silently dropped them. Positions are stored as a comma-separated
-- list of downstep morae (0 = heiban) — the shape pitchPatternHtml already reads.
CREATE TABLE pitch (
  dict_id   TEXT NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
  lang      TEXT NOT NULL,
  norm      TEXT NOT NULL,
  reading   TEXT NOT NULL,
  positions TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (dict_id, lang, norm, reading)
);
CREATE INDEX idx_pitch_lookup ON pitch(lang, norm);

CREATE TABLE freq_corpora (
  lang        TEXT NOT NULL,
  norm        TEXT NOT NULL,
  corpus      TEXT NOT NULL,
  rank        INTEGER,
  per_million REAL
);
CREATE INDEX idx_freq_norm ON freq_corpora(lang, norm);

-- User-owned rows. Deliberately NOT cascaded from headwords: a note must survive
-- re-importing the dictionary it was attached to, which is the whole point of
-- keying on the headword's identity rather than its row.
CREATE TABLE user_notes (
  headword_id INTEGER NOT NULL,
  note        TEXT,
  tags        TEXT,
  starred     INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_note_hw ON user_notes(headword_id);

CREATE TABLE explanations (
  headword_id    INTEGER NOT NULL,
  lang           TEXT NOT NULL,
  model          TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  json           TEXT NOT NULL,
  created_at     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (headword_id, lang, model, prompt_version)
);

CREATE TABLE chars (
  lang       TEXT NOT NULL,
  char       TEXT NOT NULL,
  strokes    INTEGER,
  radical    TEXT,
  components TEXT,
  readings   TEXT,
  meanings   TEXT,
  jlpt       TEXT,
  hsk        TEXT,
  grade      INTEGER,
  freq       INTEGER,
  PRIMARY KEY (lang, char)
);

CREATE TABLE examples (
  id      INTEGER PRIMARY KEY,
  lang    TEXT NOT NULL,
  text    TEXT NOT NULL,
  source  TEXT,
  licence TEXT
);

CREATE TABLE example_translations (
  example_id INTEGER NOT NULL REFERENCES examples(id) ON DELETE CASCADE,
  lang       TEXT NOT NULL,
  text       TEXT NOT NULL
);
CREATE INDEX idx_extrans ON example_translations(example_id, lang);
`;

// unicode61 with remove_diacritics=2 is what makes Cyrillic and Latin search
// diacritic-insensitive; CJK falls through it as individual codepoints, which is
// why an FTS MATCH on 食べる works without a Japanese tokenizer. Verified against
// the shipped SQLite (3.53.4) rather than assumed — see docs/plans/DICTIONARY_BUILD_LOG.md.
const V1_FTS = `
CREATE VIRTUAL TABLE headwords_fts USING fts5(
  text, reading, norm, reading_norm,
  content='headwords', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE VIRTUAL TABLE glosses_fts USING fts5(
  text, content='glosses', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE VIRTUAL TABLE examples_fts USING fts5(
  text, content='examples', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
`;

// External-content FTS5 tables hold no copy of the data; they hold a term index
// keyed by rowid. Nothing keeps them in step automatically, so these triggers are
// the entire synchronisation mechanism. The 'delete' command rows are how FTS5
// retracts an old value — omitting them on UPDATE leaves the previous terms
// matchable forever, which reads as "search returns rows that no longer exist".
const V1_TRIGGERS = `
CREATE TRIGGER headwords_ai AFTER INSERT ON headwords BEGIN
  INSERT INTO headwords_fts(rowid, text, reading, norm, reading_norm)
  VALUES (new.id, new.text, new.reading, new.norm, new.reading_norm);
END;
CREATE TRIGGER headwords_ad AFTER DELETE ON headwords BEGIN
  INSERT INTO headwords_fts(headwords_fts, rowid, text, reading, norm, reading_norm)
  VALUES ('delete', old.id, old.text, old.reading, old.norm, old.reading_norm);
END;
CREATE TRIGGER headwords_au AFTER UPDATE ON headwords BEGIN
  INSERT INTO headwords_fts(headwords_fts, rowid, text, reading, norm, reading_norm)
  VALUES ('delete', old.id, old.text, old.reading, old.norm, old.reading_norm);
  INSERT INTO headwords_fts(rowid, text, reading, norm, reading_norm)
  VALUES (new.id, new.text, new.reading, new.norm, new.reading_norm);
END;

CREATE TRIGGER glosses_ai AFTER INSERT ON glosses BEGIN
  INSERT INTO glosses_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER glosses_ad AFTER DELETE ON glosses BEGIN
  INSERT INTO glosses_fts(glosses_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER glosses_au AFTER UPDATE ON glosses BEGIN
  INSERT INTO glosses_fts(glosses_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO glosses_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER examples_ai AFTER INSERT ON examples BEGIN
  INSERT INTO examples_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER examples_ad AFTER DELETE ON examples BEGIN
  INSERT INTO examples_fts(examples_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER examples_au AFTER UPDATE ON examples BEGIN
  INSERT INTO examples_fts(examples_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO examples_fts(rowid, text) VALUES (new.id, new.text);
END;
`;

export const MIGRATIONS: MigrationStep[] = [
  {
    version: 1,
    name: 'initial schema, FTS5 indexes and their synchronisation triggers',
    up(db) {
      db.exec(V1_TABLES);
      db.exec(V1_FTS);
      db.exec(V1_TRIGGERS);
    },
  },
  {
    version: 2,
    name: 'versioned character-source ownership and provenance',
    up(db) {
      db.exec(`
        ALTER TABLE chars ADD COLUMN primary_source_id TEXT;
        ALTER TABLE chars ADD COLUMN source_ids TEXT NOT NULL DEFAULT '[]';
        CREATE TABLE char_sources (
          dict_id    TEXT NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
          lang       TEXT NOT NULL,
          char       TEXT NOT NULL,
          strokes    INTEGER,
          radical    TEXT,
          components TEXT,
          readings   TEXT,
          meanings   TEXT,
          jlpt       TEXT,
          grade      INTEGER,
          freq       INTEGER,
          PRIMARY KEY (dict_id, lang, char)
        );
        CREATE INDEX idx_char_sources_lookup ON char_sources(lang, char);
      `);
    },
  },
  {
    version: 3,
    name: 'bundled legacy-source licence and attribution backfill',
    up(db) {
      const update = db.prepare(`
        update dictionaries
        set licence = case when licence is null or trim(licence) = '' then ? else licence end,
            attribution = case when attribution is null or trim(attribution) = '' then ? else attribution end
        where id = ?
      `);
      update.run(
        'CC BY-SA 4.0',
        'JMdict — Electronic Dictionary Research and Development Group (EDRDG) — https://www.edrdg.org/jmdict/j_jmdict.html',
        'bundled-jmdict-en',
      );
      update.run(
        'CC BY-SA 4.0',
        'JMdict — Electronic Dictionary Research and Development Group (EDRDG) — https://www.edrdg.org/jmdict/j_jmdict.html',
        'bundled-jmdict-ru',
      );
      update.run(
        'CC BY-SA 4.0',
        'Kanjium pitch accent data — Uros O. — https://github.com/mifunetoshiro/kanjium',
        'bundled-kanjium-pitch',
      );
      update.run(
        'CC BY-ND 3.0 TW',
        'Ministry of Education, Taiwan dictionaries — https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/index.html',
        'bundled-moedict-zh',
      );
    },
  },
  {
    version: 4,
    name: 'per-language-pair source priority overrides',
    up(db) {
      // `dictionaries.priority` is one number per source, applied to every
      // direction at once. That cannot express the ordering people actually
      // want: CC-CEDICT should outrank JMdict for ZH→EN and lose to it for
      // JA→EN, and the single column forces one of those to be wrong.
      //
      // Overrides rather than a full ordering, deliberately. A row here means
      // "for this pair only, use this number instead of dictionaries.priority";
      // absent rows fall back through `coalesce`, so a pair nobody has touched
      // keeps its global order and importing a new source never leaves a hole
      // that would have to be backfilled for every pair in existence.
      db.exec(`
        CREATE TABLE dict_pair_priority (
          dict_id     TEXT NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
          source_lang TEXT NOT NULL,
          target_lang TEXT NOT NULL,
          priority    INTEGER NOT NULL,
          PRIMARY KEY (dict_id, source_lang, target_lang)
        );
        CREATE INDEX idx_pair_priority ON dict_pair_priority(source_lang, target_lang, priority);
      `);
    },
  },
  {
    version: 5,
    name: 'repair bundled dictionaries migrated under the wrong gloss language',
    up(db) {
      // Legacy `index.json` stores predate `glossLangs`, and the migration used to
      // fall straight through to `'en'` when the field was absent. On a default
      // install that wrote the Russian JMdict's ~161k Cyrillic glosses as English:
      // they surfaced inside English-scoped results, and asking for Russian
      // returned nothing at all, so ja→ru was unreachable however it was requested.
      //
      // The data is intact — only its label is wrong — so this relabels rather than
      // re-imports. Two guards keep it from touching anything it should not:
      //
      //   * only ids this app provisions itself are considered, because only for
      //     those is the true language known rather than guessed;
      //   * only `target_langs` that is *exactly* the silent `'en'` default is
      //     rewritten, so a language a user or a later import chose deliberately
      //     is left alone.
      //
      // The gloss UPDATE fires the FTS synchronisation triggers once per row. That
      // is real work on a large store, and it is correct work: the trigger retracts
      // and re-adds the same text, leaving the index consistent. It happens once,
      // inside this step's transaction, and never again.
      const readCurrent = db.prepare('select target_langs from dictionaries where id = ?');
      const setTargets = db.prepare('update dictionaries set target_langs = ? where id = ?');
      const relabelGlosses = db.prepare(`
        update glosses set lang = ?
        where lang = ? and sense_id in (
          select senses.id from senses
          join headwords on headwords.id = senses.headword_id
          where headwords.dict_id = ?
        )
      `);

      for (const [dictId, langs] of Object.entries(BUNDLED_GLOSS_LANGS)) {
        const expected = langs.join(',');
        if (!expected || expected === 'en') continue;
        const row = readCurrent.get(dictId) as { target_langs?: string } | undefined;
        if (!row || (row.target_langs ?? '').trim() !== 'en') continue;
        setTargets.run(expected, dictId);
        relabelGlosses.run(langs[0], 'en', dictId);
      }
    },
  },
  {
    version: 6,
    name: 'key user notes on the word they annotate rather than a headword row id',
    up(db) {
      // `user_notes` shipped in v1 with a comment claiming notes key on "the
      // headword's identity rather than its row" — while the only column it has
      // is `headword_id`, which *is* the row. Every re-import runs
      // `delete from dictionaries`, the cascade takes the headwords with it, and
      // the next import hands the same autoincrement ids to different words. So
      // a surviving note would not merely be orphaned; it would eventually be
      // read back attached to a word its author never looked at. The v1 test
      // asserting notes survive a dictionary removal measured the row count,
      // which is exactly the reassurance that hid this.
      //
      // Identity is language + written form + reading, normalised with the same
      // NFKC+casefold rule `headwords.norm` is built with, so the note for a
      // word is found by the same string that found the word. The display forms
      // are stored alongside it because the whole promise is that a note outlives
      // its dictionary — once the headword is gone there is nothing else left to
      // ask what the word looked like.
      //
      // Additive rather than a table rebuild, so no existing row is dropped.
      // `headword_id` stays because it is NOT NULL and a released step must not
      // be edited; nothing reads it any more, and new rows write 0 into it.
      //
      // Re-runnable, like every step before it. `ALTER TABLE ADD COLUMN` has no
      // `IF NOT EXISTS`, and a step that throws on a second application would
      // strand the whole ladder — which is exactly what happens when a caller
      // rewinds `user_version` on a file that already has these columns.
      const existing = new Set(
        (db.pragma('table_info(user_notes)') as Array<{ name: string }>).map((column) => column.name),
      );
      for (const column of ['lang', 'text', 'norm', 'reading', 'reading_norm']) {
        if (existing.has(column)) continue;
        db.exec(`ALTER TABLE user_notes ADD COLUMN ${column} TEXT`);
      }
      // Backfill only rows whose headword is still present. One that is already
      // orphaned cannot be resolved to a word by anything, so it keeps a null
      // `lang`, stays in the table, and is never matched by a read.
      //
      // The WHERE is a narrowing, not a load-bearing guard: the correlated
      // subqueries already yield NULL for a missing headword, so removing it
      // produces the same rows. It stays because it says what the statement is
      // for, and because it keeps the update off rows it has nothing to write.
      db.exec(`
        UPDATE user_notes SET
          lang         = (select h.lang from headwords h where h.id = user_notes.headword_id),
          text         = (select h.text from headwords h where h.id = user_notes.headword_id),
          norm         = (select h.norm from headwords h where h.id = user_notes.headword_id),
          reading      = (select coalesce(h.reading, '') from headwords h where h.id = user_notes.headword_id),
          reading_norm = (select coalesce(h.reading_norm, '') from headwords h where h.id = user_notes.headword_id)
        WHERE exists (select 1 from headwords h where h.id = user_notes.headword_id)
      `);
      // Two legacy notes can point at the same word through two dictionaries'
      // headwords, and the identity index below would refuse the pair. Demoting
      // the older duplicate's `lang` to null loses no text and keeps the ladder
      // from throwing — a migration that fails leaves the whole database on the
      // previous version, which is a far worse outcome than a shadowed note.
      const duplicates = db.prepare(`
        select lang, norm, reading_norm from user_notes
        where lang is not null
        group by lang, norm, reading_norm having count(*) > 1
      `).all() as Array<{ lang: string; norm: string; reading_norm: string }>;
      const demote = db.prepare(`
        update user_notes set lang = null
        where lang = ? and norm = ? and reading_norm = ?
          and rowid <> (
            select rowid from user_notes
            where lang = ? and norm = ? and reading_norm = ?
            order by updated_at desc, rowid desc limit 1
          )
      `);
      for (const row of duplicates) {
        demote.run(row.lang, row.norm, row.reading_norm, row.lang, row.norm, row.reading_norm);
      }
      // Partial, so the unresolved legacy rows above are simply not in it.
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_note_identity
          ON user_notes(lang, norm, reading_norm) WHERE lang IS NOT NULL
      `);
    },
  },
  {
    version: 7,
    name: 'repair bundled dictionaries migrated under the wrong source language',
    up(db) {
      // Step 5's defect, on the other side of the row. The legacy migration wrote
      // `'ja'` as a *literal* into `dictionaries.source_lang` and into every
      // `headwords.lang`, so the bundled Chinese monolingual dictionary's 71,888
      // Chinese headwords were stored as Japanese. Two consequences, both live:
      //
      //   * `lookupChineseInDb` pins `sourceLangs: ['zh']` and then keeps only
      //     `lang === 'zh'` entries, so the Chinese surface could not see the only
      //     Chinese dictionary the app installs — it fell through to CC-CEDICT;
      //   * the same rows surfaced inside Japanese-scoped results instead, carrying
      //     `lang: 'ja'` onto the `lang` attribute of everything that rendered them.
      //
      // Relabel, not re-import: the headwords, readings and glosses were always
      // right. The same two guards as step 5 — only ids this app provisions itself,
      // and only a `source_lang` that is *exactly* the silent default, so a value
      // some later import or repair chose deliberately is never overwritten.
      //
      // The headword UPDATE fires the FTS synchronisation triggers once per row,
      // which retract and re-add identical text. That is real work on a large store
      // and it is correct work; it happens once, inside this step's transaction.
      // The statements themselves live in `./sourceLang`, because a user
      // correcting a source's language by hand needs exactly the same five —
      // the legacy format declares no source language, so a Chinese or Korean
      // archive a *user* imported still lands under the default.
      const readCurrent = db.prepare('select source_lang from dictionaries where id = ?');

      for (const [dictId, lang] of Object.entries(BUNDLED_SOURCE_LANGS)) {
        if (!lang || lang === DEFAULT_SOURCE_LANG) continue;
        const row = readCurrent.get(dictId) as { source_lang?: string } | undefined;
        if (!row || (row.source_lang ?? '').trim() !== DEFAULT_SOURCE_LANG) continue;
        relabelDictionarySourceLang(db, dictId, DEFAULT_SOURCE_LANG, lang);
      }
    },
  },
  {
    version: 8,
    name: 'index the etymology table now that something reads it',
    up(db) {
      // `etymology` shipped in v1 with no writer and no reader, so it needed no
      // index and had none. Both landed together (`importWiktextract` writes it,
      // `findLexiconEtymology` reads it), and the read is `where headword_id in
      // (…)` — which without this index is a full table scan of every etymology
      // in every installed dictionary, on the main process, for a panel that
      // renders on every lookup.
      //
      // A plain `CREATE INDEX` on a fresh database is in the base DDL above; this
      // step exists for the installed ones. `IF NOT EXISTS` because every step in
      // this ladder must survive being applied twice — a caller that rewinds
      // `user_version` on a file that already has the index would otherwise
      // strand the whole ladder.
      db.exec('CREATE INDEX IF NOT EXISTS idx_etym_head ON etymology(headword_id)');
    },
  },
  {
    version: 9,
    name: 'count the rows a pitch or frequency dictionary actually owns',
    up(db) {
      // The legacy migration wrote `entry_count = headwords`, which is zero for
      // the two kinds that carry no headwords. On a default install the bundled
      // Kanjium store therefore printed "pitch · 0" in Settings while owning
      // 107,978 accent rows, and a frequency-only store printed the same. The
      // writer now counts by kind (`legacyEntryCount` in `./migrate`); this step
      // repairs the databases that already ran the old one.
      //
      // The correlated subqueries are the same joins the writer counted: pitch
      // rows are keyed by `dict_id`, frequency rows by `corpus` (`freq_corpora`
      // is shared across dictionaries and carries the source id in that column,
      // not a `dict_id`).
      //
      // `entry_count = 0` is the guard, so a number some other path set on
      // purpose is never overwritten, and a genuinely empty store stays at zero
      // because both subqueries then also return zero. Re-running the step is a
      // no-op for the same reason.
      db.exec(`
        UPDATE dictionaries SET entry_count =
          (select count(*) from pitch p where p.dict_id = dictionaries.id)
        WHERE kind = 'pitch' AND entry_count = 0
      `);
      db.exec(`
        UPDATE dictionaries SET entry_count =
          (select count(*) from freq_corpora f where f.corpus = dictionaries.id)
        WHERE kind = 'freq' AND entry_count = 0
      `);
    },
  },
  {
    version: 10,
    name: 'sentences move out of the headword index and into the examples tables',
    up(db) {
      // `examples`/`example_translations` shipped in v1 with FTS5 and its three
      // triggers and no writer at all. The Tatoeba importer stored its sentences
      // as `headwords`/`senses`/`glosses` instead, so a whole sentence was a
      // headword: it answered ordinary word lookups, it fed the compound and
      // neighbour probes, and `examples_fts` stayed permanently empty.
      //
      // `examples` has no owner column, which is why the importer could not have
      // used it correctly even if it had tried — an example dictionary could
      // neither be disabled nor deleted without stranding its rows. Adding the
      // column is what makes the table usable, and SQLite accepts a REFERENCES
      // clause on ADD COLUMN as long as the new column defaults to NULL.
      const columns = db.prepare('PRAGMA table_info(examples)').all() as { name: string }[];
      if (!columns.some((column) => column.name === 'dict_id')) {
        db.exec('ALTER TABLE examples ADD COLUMN dict_id TEXT REFERENCES dictionaries(id) ON DELETE CASCADE');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_examples_dict ON examples(dict_id)');

      // Move what the old writer already stored. Ids are offset past the current
      // maximum rather than reused, so the step is correct on a database that
      // somehow already holds example rows instead of only on the empty ones every
      // install actually has. `senses`/`glosses` cascade off `headwords`, and the
      // FTS triggers retract the deleted terms, so the delete is the whole cleanup.
      const offset = (db.prepare('select coalesce(max(id), 0) as top from examples').get() as { top: number }).top;
      db.prepare(`
        INSERT INTO examples (id, lang, text, source, licence, dict_id)
        SELECT h.id + ?, h.lang, h.text, null, d.licence, d.id
        FROM headwords h JOIN dictionaries d ON d.id = h.dict_id
        WHERE d.kind = 'examples'
      `).run(offset);
      db.prepare(`
        INSERT INTO example_translations (example_id, lang, text)
        SELECT s.headword_id + ?, g.lang, g.text
        FROM senses s
        JOIN glosses g ON g.sense_id = s.id
        JOIN headwords h ON h.id = s.headword_id
        JOIN dictionaries d ON d.id = h.dict_id
        WHERE d.kind = 'examples'
        ORDER BY s.headword_id, s.ord, g.ord
      `).run(offset);
      db.exec(`DELETE FROM headwords WHERE dict_id IN (SELECT id FROM dictionaries WHERE kind = 'examples')`);

      // Tatoeba's own ISO 639-3 codes went straight into `headwords.lang`, so a
      // Japanese sentence sits under `jpn` where every language filter in this app
      // says `ja`. Canonicalise here as well as in the importer, or a migrated
      // corpus stays unreachable by the reader that was just built for it.
      const canonicalise = db.prepare(`
        UPDATE examples SET lang = ? WHERE lang = ?
          AND dict_id IN (SELECT id FROM dictionaries WHERE kind = 'examples')
      `);
      const canonicaliseTranslations = db.prepare(`
        UPDATE example_translations SET lang = ? WHERE lang = ?
          AND example_id IN (SELECT id FROM examples)
      `);
      for (const [alias, canonical] of CORPUS_LANG_ALIAS_PAIRS) {
        canonicalise.run(canonical, alias);
        canonicaliseTranslations.run(canonical, alias);
      }
    },
  },
  {
    version: 11,
    name: 'JMdict cross references move out of the definition list and into xrefs',
    up(db) {
      // `xrefs` had exactly one writer, the Wiktextract importer, and no bundled
      // dictionary uses it — so on a default install the cross-reference panel was
      // empty for every word. Meanwhile JMdict's own `<xref>` elements were sitting
      // in `glosses`: the Yomitan conversion renders them as definition strings
      // beginning `see: `, and the legacy migration stored them verbatim. On this
      // machine's real store that is 53,540 rows, so 裏表 listed
      // "see: 表裏 2. duplicity; double-dealing" among its own meanings.
      //
      // `./migrate` now splits them at import time. This step does the same lift in
      // place, because `pendingLegacyStores` only re-reads a store whose id is *not*
      // already in `dictionaries` — without this, every existing install keeps the
      // polluted glosses and an empty panel until it deletes and re-imports 97 MB.
      //
      // Deliberately not restricted to `bundled-jmdict-*`: a user's own JMdict
      // Yomitan archive produces identical rows, and it is `parseLegacyXref`'s own
      // guards — a target with a non-ASCII character, no longer than a word, not the
      // headword itself — that keep a genuine definition opening with "see" from
      // being lifted, not the dictionary it came from.
      //
      // Measured on the real 378 MB install: 53,540 candidates in, **53,089** xrefs
      // out in 3.2 s, 26,940 of 27,534 distinct targets resolving to a headword. The
      // **451** that stay are every one of them a self reference by text — JMdict
      // cross-referencing two readings of one spelling (更衣 こうい/ころもがえ). They
      // are kept as glosses on purpose: `to_text` is a bare string with nowhere to
      // put the reading, so storing one would render as a reference to the entry the
      // reader is already on, and deleting one would take a pointer to a real other
      // reading with it. 451 of 1.33 M glosses stay mildly ugly; none is invented.
      const candidates = db.prepare(`
        SELECT g.id AS id, g.sense_id AS senseId, g.text AS text, g.html AS html, h.text AS word
        FROM glosses g
        JOIN senses s ON s.id = g.sense_id
        JOIN headwords h ON h.id = s.headword_id
        WHERE g.text LIKE 'see: %'
      `).all() as { id: number; senseId: number; text: string; html: string | null; word: string }[];
      if (candidates.length === 0) return;

      const insertXref = db.prepare('INSERT INTO xrefs (from_sense, to_text, kind) VALUES (?, ?, ?)');
      const deleteGloss = db.prepare('DELETE FROM glosses WHERE id = ?');
      const touched = new Set<number>();
      // The entry's structured HTML rides on gloss ord 0, so when the row being
      // deleted is the one carrying it, the HTML has to be rescued *before* the
      // delete — after it there is nothing left to read it off.
      const rescuedHtml = new Map<number, string>();
      for (const row of candidates) {
        const xref = parseLegacyXref(row.text, row.word);
        // A string this parser will not commit to stays a gloss. Being ugly is
        // recoverable; deleting a meaning is not.
        if (!xref) continue;
        insertXref.run(row.senseId, xref.text, xref.kind);
        if (row.html !== null && !rescuedHtml.has(row.senseId)) rescuedHtml.set(row.senseId, row.html);
        deleteGloss.run(row.id);
        touched.add(row.senseId);
      }
      if (touched.size === 0) return;

      // Then the hole in `ord`. Every reader sorts glosses by it and the delete
      // leaves gaps (0,1,2,3 → 1,3), so renumber the survivors contiguously and
      // put any rescued HTML on the new first row.
      const survivors = db.prepare('SELECT id, ord, html FROM glosses WHERE sense_id = ? ORDER BY ord, id');
      const carryHtml = db.prepare('UPDATE glosses SET html = ? WHERE id = ?');
      const setOrd = db.prepare('UPDATE glosses SET ord = ? WHERE id = ?');
      for (const senseId of touched) {
        const rows = survivors.all(senseId) as { id: number; ord: number; html: string | null }[];
        if (rows.length === 0) continue;
        const html = rows.find((row) => row.html !== null)?.html ?? rescuedHtml.get(senseId) ?? null;
        if (html !== null && rows[0].html === null) carryHtml.run(html, rows[0].id);
        rows.forEach((row, index) => {
          if (row.ord !== index) setOrd.run(index, row.id);
        });
      }
    },
  },
  {
    version: 12,
    name: 'explanations key on the word they explain rather than a headword row id',
    up(db) {
      // `explanations` shipped in v1 keyed `(headword_id, lang, model,
      // prompt_version)` and has never had an insert statement anywhere in this
      // source tree, so on every installation in existence it holds zero rows.
      // That is what makes a rebuild rather than an ALTER the honest step here:
      // the primary key is the problem, SQLite cannot drop one in place, and
      // there is no row to lose.
      //
      // The key is wrong for the reason migration 6 gives about notes, only
      // sharper. A re-import runs `delete from dictionaries`, the cascade takes
      // every headword, and the next import hands the same autoincrement ids to
      // different words — so a surviving explanation of 猫 is eventually read
      // back and rendered under 犬. Following notes and writing `headword_id = 0`
      // instead is not available: `headword_id` is *in* the primary key, so every
      // word's explanation would collide with every other word's.
      //
      // `lang` keeps the meaning it has in `user_notes` after migration 6 — the
      // language of the *word*. The prose language is a new column: "explain 猫 in
      // Russian" and "explain 猫 in English" are two answers, not one answer shown
      // twice, and the plan lists explanation-language selection as a v1 feature.
      // Splitting them costs a column; overloading `lang` would cost a reader
      // being shown the wrong-language explanation with no way to tell.
      //
      // Re-runnable like every step before it: a caller that rewinds
      // `user_version` on a file that already has the new shape must not drop the
      // rows written since. `norm` is the sentinel because it exists only after
      // this step.
      const columns = (db.pragma('table_info(explanations)') as Array<{ name: string }>)
        .map((column) => column.name);
      if (!columns.includes('norm')) {
        db.exec('DROP TABLE IF EXISTS explanations');
        db.exec(`
          CREATE TABLE explanations (
            lang           TEXT NOT NULL,
            text           TEXT NOT NULL,
            norm           TEXT NOT NULL,
            reading        TEXT NOT NULL DEFAULT '',
            reading_norm   TEXT NOT NULL DEFAULT '',
            gloss_lang     TEXT NOT NULL,
            model          TEXT NOT NULL,
            prompt_version INTEGER NOT NULL,
            json           TEXT NOT NULL,
            created_at     INTEGER NOT NULL DEFAULT 0
          )
        `);
      }
      // Unique on the whole key, so a re-explain replaces its own answer and can
      // never leave two rows a reader has to choose between. `created_at` carries
      // the eviction order, and it is the only thing the row cap sorts on.
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_expl_key
        ON explanations(lang, norm, reading_norm, gloss_lang, model, prompt_version)
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_expl_created ON explanations(created_at)');
    },
  },
];

/** Every table name the schema owns, for the "did it actually build" assertion. */
export const DICT_TABLES = [
  'dictionaries', 'headwords', 'senses', 'glosses', 'xrefs', 'inflections',
  'collocations', 'etymology', 'audio', 'pitch', 'freq_corpora', 'user_notes',
  'explanations', 'chars', 'char_sources', 'examples', 'example_translations',
  'dict_pair_priority',
] as const;

export const DICT_FTS_TABLES = ['headwords_fts', 'glosses_fts', 'examples_fts'] as const;
