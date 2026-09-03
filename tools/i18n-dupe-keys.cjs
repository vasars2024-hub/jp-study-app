#!/usr/bin/env node
/**
 * Duplicate-key scan over the four i18n catalogs.
 *
 * A repeated key in an object literal is not a syntax error: the LAST value silently wins and
 * the earlier entry is dead. Vite warns about it on every single dev boot -- that is how this
 * was found, in the boot log of an unrelated run -- but nothing in the repo's four gates fails
 * on it, so the warnings have simply accumulated. `i18n-check.cjs` compares key SETS across
 * languages and a duplicate is invisible to it: the key is present either way.
 *
 * Exits 1 when any catalog has a duplicate, and prints both line numbers plus whether the two
 * values agree -- because a duplicate with DIFFERENT values is a live product defect (a string
 * the author wrote is not the string that ships) while one with identical values is only dead
 * weight and a build warning.
 *
 * Run: node tools/i18n-dupe-keys.cjs
 */
'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- a .cjs build tool; `import` is not available here */
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'src', 'shared', 'i18n', 'catalogs');
const LANGS = ['en', 'ja', 'zh', 'ru'];

// Top-level catalog entries are indented two spaces and quoted. Values may contain escaped
// quotes, so the value side is matched lazily up to a quote not preceded by a backslash.
const ENTRY = /^\s{2}'((?:[^'\\]|\\.)*)':\s*(.*)$/;

let bad = 0;
for (const lang of LANGS) {
  const file = path.join(DIR, `${lang}.ts`);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const seen = new Map();
  const dupes = [];
  lines.forEach((line, i) => {
    const m = ENTRY.exec(line);
    if (!m) return;
    const key = m[1];
    const value = m[2].replace(/,\s*$/, '');
    if (seen.has(key)) dupes.push({ key, first: seen.get(key), second: { line: i + 1, value } });
    else seen.set(key, { line: i + 1, value });
  });
  if (dupes.length) {
    bad += dupes.length;
    console.log(`${lang}.ts — ${seen.size} keys, ${dupes.length} DUPLICATE(S):`);
    for (const d of dupes) {
      const same = d.first.value === d.second.value;
      console.log(`  '${d.key}' at line ${d.first.line} and line ${d.second.line} — values ${same ? 'IDENTICAL (dead weight + build warning)' : 'DIFFER, the LATER one ships'}`);
      if (!same) {
        console.log(`      line ${d.first.line}: ${d.first.value}`);
        console.log(`      line ${d.second.line}: ${d.second.value}`);
      }
    }
  } else {
    console.log(`${lang}.ts — ${seen.size} keys, no duplicates`);
  }
}
process.exit(bad ? 1 : 0);
