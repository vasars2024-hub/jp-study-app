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
import { BUNDLED_GLOSS_LANGS } from './glossLang';

/** Bumped by appending to MIGRATIONS. Never edit a released step. */
export const DICT_SCHEMA_VERSION = 6;

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
];

/** Every table name the schema owns, for the "did it actually build" assertion. */
export const DICT_TABLES = [
  'dictionaries', 'headwords', 'senses', 'glosses', 'xrefs', 'inflections',
  'collocations', 'etymology', 'audio', 'pitch', 'freq_corpora', 'user_notes',
  'explanations', 'chars', 'char_sources', 'examples', 'example_translations',
  'dict_pair_priority',
] as const;

export const DICT_FTS_TABLES = ['headwords_fts', 'glosses_fts', 'examples_fts'] as const;
