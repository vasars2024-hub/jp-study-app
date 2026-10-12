import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { parseApkgDraftPage, readMediaManifest } from '../anki/apkgCollection';
import { writeLocalDeckApkg } from '../anki/localDeckApkgCore';
import { cardAiExtrasHtml } from '../../shared/cardAiExtrasHtml';

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

    expect(result).toEqual({ notes: 1, media: 1, scheduled: 0 });
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

  it('carries a card\'s saved extras in a Notes field, marked as generated', async () => {
    const outputPath = path.join(root, 'notes.apkg');
    const extras = { mnemonic: 'Neko: <b>knee</b> co<script>x</script>' };
    const notesLabels = { mnemonic: 'Memory aid', distinction: 'Not to confuse with', examples: 'Examples', accepted: 'Also accepted' };
    const header = ['Expression', 'Reading', 'Meaning', 'Sentence', 'Front', 'Back', 'Audio', 'Notes'];
    const result = await writeLocalDeckApkg({
      kind: 'write', id: 'notes', outputPath, deckName: 'Notes', nowMs: 1_800_000_000_200,
      // The row's own Notes string is NOT what is written: the writer builds the
      // markup from the validated `notes` entry, so a forged row cannot inject.
      rows: [header, ['猫', 'ねこ', 'cat', '', '', '', '', '<img src=x onerror=alert(1)>']],
      media: [],
      notes: [extras],
      notesLabels,
    });
    expect(result.notes).toBe(1);
    const parsed = await parseApkgDraftPage({ filePath: outputPath, noteLimit: 10 });
    const raw = parsed.page.notes[0].fields[7].raw;
    expect(raw).toBe(cardAiExtrasHtml(extras, notesLabels));
    expect(raw).toContain('class="jp-ai-gen"');
    expect(raw).toContain('<b>knee</b>');
    expect(raw).not.toMatch(/<script|<img/);
  }, 30_000);

  it('escapes a Notes column it was given no extras for', async () => {
    const outputPath = path.join(root, 'notes-forged.apkg');
    await writeLocalDeckApkg({
      kind: 'write', id: 'forged', outputPath, deckName: 'Forged', nowMs: 1_800_000_000_300,
      rows: [['Expression', 'Notes'], ['猫', '<img src=x onerror=alert(1)>']],
      media: [],
    });
    const parsed = await parseApkgDraftPage({ filePath: outputPath, noteLimit: 10 });
    expect(parsed.page.notes[0].fields[1].raw).toBe('&lt;img src=x onerror=alert(1)&gt;');
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
