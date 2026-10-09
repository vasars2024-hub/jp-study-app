/**
 * Export/import parity: a Gum deck exported as .apkg comes back through the
 * app's own .apkg importer with its cards, its schedule (SM-2 columns and the
 * FSRS memory pair) and its media references intact. Runs the real package
 * writer and the real reader; no Anki, no window.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterAll, describe, expect, it } from 'vitest';
import { buildDeckMediaExport, type DeckMediaExportCard } from '../../shared/deckMediaExport';
import type { LocalSrsState } from '../../shared/localSrs';
import { getSql } from '../anki/apkgCollection';
import { readApkgCardsFile } from '../anki/apkgNoteRead';
import { writeLocalDeckApkg } from '../anki/localDeckApkgCore';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-apkg-schedule-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const DAY = 86_400_000;

function must<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  return value as T;
}
const NOW = Date.UTC(2026, 9, 9, 12, 0, 0);

function srs(extra: Partial<LocalSrsState>): LocalSrsState {
  return {
    version: 2,
    algorithm: 'sm2',
    dueAt: NOW + 5 * DAY,
    intervalDays: 12,
    ease: 2.3,
    repetitions: 6,
    lapses: 1,
    lastReviewedAt: NOW - 7 * DAY,
    lastRating: 'good',
    ...extra,
  };
}

describe('.apkg export keeps schedule and media through the app\'s own importer', () => {
  it('round-trips SM-2 and FSRS schedules, suspension, new cards, audio and pictures', async () => {
    const audio = path.join(root, 'neko.mp3');
    const image = path.join(root, 'neko.png');
    fs.writeFileSync(audio, Buffer.from('ID3-neko-audio'));
    fs.writeFileSync(image, Buffer.from('PNG-neko-picture'));

    const cards: DeckMediaExportCard[] = [
      { id: 'c-sm2', word: '猫', reading: 'ねこ', meaning: 'cat', audioPath: audio, imagePath: image, srs: srs({}) },
      {
        id: 'c-fsrs',
        word: '犬',
        reading: 'いぬ',
        meaning: 'dog',
        srs: srs({ algorithm: 'fsrs', stability: 21.5, difficulty: 6.2, intervalDays: 20, dueAt: NOW + 9 * DAY }),
      },
      { id: 'c-susp', word: '鳥', reading: 'とり', meaning: 'bird', srs: srs({ dueAt: NOW + 2 * DAY }), suspended: true },
      { id: 'c-new', word: '魚', reading: 'さかな', meaning: 'fish' },
    ];
    const built = buildDeckMediaExport(cards, { includeImages: true, includeSchedule: true });
    expect(built.rows[0].at(-1)).toBe('Image');
    expect(built.schedules).toHaveLength(4);

    const outputPath = path.join(root, 'gum.apkg');
    const written = await writeLocalDeckApkg({
      kind: 'write',
      id: 'schedule-round-trip',
      outputPath,
      deckName: 'Gum deck',
      nowMs: NOW,
      rows: built.rows,
      media: built.media.map((item) => ({ fileName: item.fileName, filePath: item.sourcePath as string })),
      schedules: built.schedules,
    });
    expect(written).toEqual({ notes: 4, media: 2, scheduled: 3 });

    // The raw columns Anki reads: review queue, suspension, FSRS memory in `data`.
    const SQL = await getSql();
    const db = new SQL.Database(new AdmZip(outputPath).getEntry('collection.anki2')?.getData() ?? Buffer.alloc(0));
    const raw = db.exec('SELECT c.type, c.queue, c.ivl, c.factor, c.reps, c.lapses, c.data FROM cards c ORDER BY c.id')[0].values;
    db.close();
    expect(raw[0]).toEqual([2, 2, 12, 2300, 6, 1, '']);
    expect(raw[1].slice(0, 2)).toEqual([2, 2]);
    expect(JSON.parse(String(raw[1][6]))).toEqual({ s: 21.5, d: 6.2 });
    expect(raw[2].slice(0, 2)).toEqual([2, -1]);
    expect(raw[3].slice(0, 2)).toEqual([0, 0]);

    const mediaDir = path.join(root, 'imported-media');
    const read = await readApkgCardsFile(outputPath, { mediaDir, nowMs: NOW });
    expect(read.ok).toBe(true);
    expect(read.report).toMatchObject({ scheduledCards: 3, mediaKept: 2, mediaMissing: 0 });
    const byWord = new Map((read.cards ?? []).map((card) => [card.word, card]));
    expect([...byWord.keys()]).toEqual(['猫', '犬', '鳥', '魚']);

    const neko = must(byWord.get('猫'));
    expect(neko).toMatchObject({ reading: 'ねこ', meaning: 'cat' });
    expect(neko.srs).toMatchObject({ algorithm: 'sm2', intervalDays: 12, ease: 2.3, repetitions: 6, lapses: 1 });
    // Day-granular in Anki: the due date survives to the day.
    expect(Math.abs((neko.srs?.dueAt ?? 0) - (NOW + 5 * DAY))).toBeLessThan(DAY);
    expect(fs.readFileSync(must(neko.audioPath), 'utf8')).toBe('ID3-neko-audio');
    expect(fs.readFileSync(must(neko.imagePath), 'utf8')).toBe('PNG-neko-picture');

    const inu = must(byWord.get('犬'));
    expect(inu.srs).toMatchObject({ algorithm: 'fsrs', stability: 21.5, difficulty: 6.2, intervalDays: 20 });
    expect(Math.abs((inu.srs?.dueAt ?? 0) - (NOW + 9 * DAY))).toBeLessThan(DAY);

    expect(must(byWord.get('鳥')).srs).toMatchObject({ intervalDays: 12 });
    expect(must(byWord.get('魚')).srs).toBeUndefined();
  }, 30_000);

  it('without schedules every card is new, exactly as before', async () => {
    const outputPath = path.join(root, 'plain.apkg');
    const built = buildDeckMediaExport([{ id: 'a', word: '猫', meaning: 'cat', srs: srs({}) }]);
    expect(built.schedules).toBeUndefined();
    const written = await writeLocalDeckApkg({
      kind: 'write', id: 'plain', outputPath, deckName: 'Plain', nowMs: NOW, rows: built.rows, media: [],
    });
    expect(written.scheduled).toBe(0);
    const read = await readApkgCardsFile(outputPath, { nowMs: NOW });
    expect(read.cards?.[0].srs).toBeUndefined();
  }, 30_000);

  it('never writes a card\'s text as markup in the Image column', async () => {
    const outputPath = path.join(root, 'markup.apkg');
    await writeLocalDeckApkg({
      kind: 'write', id: 'markup', outputPath, deckName: 'Markup', nowMs: NOW, media: [],
      rows: [['Expression', 'Image'], ['猫', '<img src=x onerror=alert(1)>']],
    });
    const SQL = await getSql();
    const db = new SQL.Database(new AdmZip(outputPath).getEntry('collection.anki2')?.getData() ?? Buffer.alloc(0));
    const flds = String(db.exec('SELECT flds FROM notes')[0].values[0][0]);
    db.close();
    expect(flds).toContain('&lt;img src=x onerror=alert(1)&gt;');
  }, 30_000);
});
