import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { parseApkgDraftPage, readMediaManifest } from '../anki/apkgCollection';
import { writeLocalDeckApkg } from '../anki/localDeckApkgCore';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-local-apkg-'));

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('local deck APKG media round trip', () => {
  it('writes a real package whose note and attached audio survive the app reader', async () => {
    const audio = path.join(root, 'jpstudy-card.wav');
    fs.writeFileSync(audio, Buffer.from('RIFF-real-fixture-audio'));
    const outputPath = path.join(root, 'local.apkg');
    const result = await writeLocalDeckApkg({
      kind: 'write',
      id: 'round-trip',
      outputPath,
      deckName: 'Local Japanese',
      nowMs: 1_800_000_000_000,
      rows: [
        ['Expression', 'Reading', 'Meaning', 'Sentence', 'Front', 'Back', 'Audio'],
        ['猫', 'ねこ', 'cat', '猫がいます。', '', '', '[sound:jpstudy-card.wav]'],
      ],
      media: [{ fileName: 'jpstudy-card.wav', filePath: audio }],
    });

    expect(result).toEqual({ notes: 1, media: 1 });
    const zip = new AdmZip(outputPath);
    expect(readMediaManifest(zip)).toEqual(new Map([['0', 'jpstudy-card.wav']]));
    expect(zip.getEntry('0')?.getData()).toEqual(fs.readFileSync(audio));

    const parsed = await parseApkgDraftPage({ filePath: outputPath, noteLimit: 10 });
    expect(parsed.totalNotes).toBe(1);
    expect(parsed.page.counts.mediaReferences).toBe(1);
    expect(parsed.page.media).toMatchObject({ files: 1, unreferenced: 0 });
    expect(parsed.page.notes[0].fields.map((field) => field.normalized)).toEqual([
      '猫', 'ねこ', 'cat', '猫がいます。', '', '', '',
    ]);
    expect(parsed.page.notes[0].fields[6].raw).toBe('[sound:jpstudy-card.wav]');
    expect(parsed.page.notes[0].media).toMatchObject([
      { fileName: 'jpstudy-card.wav', present: true },
    ]);
  }, 30_000);

  it('removes a partial package when media is missing — the negative control', async () => {
    const outputPath = path.join(root, 'missing.apkg');
    await expect(writeLocalDeckApkg({
      kind: 'write', id: 'missing', outputPath, deckName: 'Missing', nowMs: 1_800_000_000_100,
      rows: [['Expression', 'Audio'], ['猫', '[sound:gone.wav]']],
      media: [{ fileName: 'gone.wav', filePath: path.join(root, 'gone.wav') }],
    })).rejects.toThrow('Export media is unavailable');
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
