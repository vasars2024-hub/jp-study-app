// @vitest-environment node
/**
 * Gate 10 — "Opening routes through `planForPath`. Clicking an item of each
 * handled type opens the app that owns it, and a type with more than one
 * candidate offers the ranked list rather than silently choosing. Proven with a
 * file whose extension is ambiguous and whose handler is settled by content
 * sniffing (`sniffZip`/`sniffJson`), so the sniffing path is exercised."
 *
 * Every clause of that sentence is a block below, and the sniffing clause is
 * exercised against REAL files written to a temp dir — a stubbed plan would
 * prove the table and not the routing, which is precisely what the gate says
 * to avoid by naming the two sniffers.
 *
 * The owning sections are re-derived from `DropRouter.tsx` and `AppSection.tsx`
 * rather than restated here, because a hand-copied second table is the failure
 * this gate exists to prevent: the Files app opening `video` for a `.mp4` while
 * a drop of the same file opens `player`.
 */
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, describe, expect, it, vi } from 'vitest';
import AdmZip from 'adm-zip';
import { DESKTOP_WIN_SECTIONS } from '../desktop';
import type { DropCandidate, DropTargetId } from '../fileRouting';
import type { FilesItem } from '../filesApp/catalog';
import {
  filesOpenDecision,
  isRoutableLocation,
  openFor,
  sectionForDropTarget,
  sectionForKind,
  decisionForRoutedPlan,
} from '../filesApp/openPlan';

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, on: () => undefined },
}));

const { planForPath } = await import('../../main/fileRouter');

const ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const DROP_ROUTER = read('src/renderer/components/DropRouter.tsx');
/*
 * The drop router's dispatch TABLE moved here when the Files app's scan-review
 * sheet needed to import through the same calls (gate 27) — one importer, for
 * the same reason there is one classifier. `DropRouter.tsx` still owns the drop
 * gesture and the triage sheet; the `onOpenSection` calls and the importers
 * this file re-derives from now live in `fileImportExecute.ts`, so that is what
 * is read. Reading the wrong file here would make these assertions vacuous.
 */
const IMPORT_EXECUTE = read('src/renderer/fileImportExecute.ts');
const APP_SECTION = read('src/renderer/components/AppSection.tsx');
const OPEN_PLAN = read('src/shared/filesApp/openPlan.ts');
const FILES_APP = read('src/renderer/components/filesapp/FilesApp.tsx');

const dir = mkdtempSync(join(tmpdir(), 'jp-filesopen-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Every `DropTargetId`, taken from the type's own declaration in the source. */
const ALL_TARGETS: DropTargetId[] = (() => {
  const src = read('src/shared/fileRouting.ts');
  const block = src.slice(src.indexOf('export type DropTargetId ='));
  const body = block.slice(0, block.indexOf(';'));
  return [...body.matchAll(/'([a-z-]+)'/g)].map((m) => m[1] as DropTargetId);
})();

function fileItem(path: string, kind: FilesItem['kind'] = 'package') {
  return { kind, location: { store: 'file' as const, path } };
}

describe('gate 10 — the owning section is derived, not restated', () => {
  it('covers every DropTargetId with a decision', () => {
    // The list is read from the type, so a new target added to `fileRouting.ts`
    // and not decided here fails this test rather than falling through to a
    // silent `null` refusal in the app.
    expect(ALL_TARGETS).toHaveLength(15);
    expect(ALL_TARGETS).toContain('unknown');
    for (const target of ALL_TARGETS) {
      expect(OPEN_PLAN, `SECTION_FOR_TARGET is missing ${target}`).toMatch(
        new RegExp(`(^|\\s)'?${target}'?:`, 'm'),
      );
    }
  });

  it('every section it can open is a real, rendered section', () => {
    const mapped = ALL_TARGETS.map(sectionForDropTarget).filter((s): s is string => s !== null);
    expect(mapped.length).toBe(12);
    for (const section of mapped) {
      expect((DESKTOP_WIN_SECTIONS as readonly string[])).toContain(section);
      expect(APP_SECTION, `AppSection has no case for '${section}'`).toContain(
        `case '${section}':`,
      );
    }
    // Control: the dead `media` id, which shared/desktop.ts documents as
    // restoring an empty window, must never be what a target maps to.
    expect(mapped).not.toContain('media');
    expect(APP_SECTION).not.toContain("case 'media':");
  });

  it('agrees with DropRouter about where each target lands', () => {
    // Re-derived from the shared importer's own `onOpenSection?.('x')` calls.
    // These are the targets it names a section for; the rest have no import
    // branch there, so there is nothing to disagree with.
    const fromRouter: Partial<Record<DropTargetId, string>> = {
      media: 'player',
      subtitle: 'player',
      // A level-check deck now runs the Level flow and lands in Stats (r2data #12).
      'anki-level': 'stats',
      'anki-cards': 'flashcards',
      'dictionary-yomitan': 'dictionary',
    };
    for (const [target, section] of Object.entries(fromRouter)) {
      expect(IMPORT_EXECUTE, `the importer no longer opens '${section}'`).toContain(
        `onOpenSection?.('${section}')`,
      );
      expect(sectionForDropTarget(target as DropTargetId)).toBe(section);
    }
    // The two library targets share one branch — the extraction collapsed the
    // router's `target === 'library-manga' ? 'library' : 'library'` ternary,
    // whose arms were identical, into the single call below.
    expect(IMPORT_EXECUTE).toContain("case 'library-book':");
    expect(IMPORT_EXECUTE).toContain("case 'library-manga':");
    expect(IMPORT_EXECUTE).toContain("onOpenSection?.('library')");
    expect(sectionForDropTarget('library-book')).toBe('library');
    expect(sectionForDropTarget('library-manga')).toBe('library');
    // Control: a section this table does NOT claim must not be findable this
    // way, or the assertions above would pass on any string in the file.
    expect(IMPORT_EXECUTE).not.toContain("onOpenSection?.('novels')");
    // And the drop gesture still routes through that one importer, so the two
    // surfaces cannot drift apart into two dispatch tables.
    expect(DROP_ROUTER).toContain("from '../fileImportExecute'");
  });

  it('refuses the three targets that own no application, each by name', () => {
    for (const target of ['shortcut', 'folder', 'unknown'] as DropTargetId[]) {
      expect(sectionForDropTarget(target)).toBe(null);
      const decision = openFor({ target, confidence: 'exact', reasonKey: 'x' }, false);
      expect(decision.mode).toBe('refuse');
      if (decision.mode !== 'refuse') throw new Error('unreachable');
      // A distinct key per target: "nothing opens this" and "this points
      // outside the app" are different facts and must not share one sentence.
      expect(decision.reasonKey).toMatch(/^filesApp\.open\.refuse\./);
    }
    const keys = (['shortcut', 'folder', 'unknown'] as DropTargetId[]).map((target) => {
      const d = openFor({ target, confidence: 'exact', reasonKey: 'x' }, false);
      return d.mode === 'refuse' ? d.reasonKey : '';
    });
    expect(new Set(keys).size).toBe(3);
  });

  it('never imports — the open path touches no importer the drop router calls', () => {
    // The one behaviour that separates opening from dropping. Asserted against
    // the component source because it is an ABSENCE, and an absence has no
    // runtime observation that would fail if it came back.
    for (const importer of [
      'importPaths',
      'addMediaPaths',
      'importApkg',
      'importApkgCards',
      'dictImportYomitan',
      'miningImportFrequencyDict',
      'setWallpaperFromPath',
    ]) {
      expect(IMPORT_EXECUTE, `${importer} is no longer an importer`).toContain(importer);
      expect(FILES_APP, `FilesApp must not call ${importer}`).not.toContain(importer);
    }
  });
});

describe('gate 10 — more than one candidate offers the ranked list', () => {
  it('offers both .apkg homes instead of silently taking the first', () => {
    const file = join(dir, 'deck.apkg');
    writeFileSync(file, 'not really a deck');
    const plan = planForPath(file);
    expect(plan.candidates.map((c) => c.target)).toEqual(['anki-cards', 'anki-level']);
    const decision = decisionForRoutedPlan(plan);
    expect(decision.mode).toBe('choose');
    if (decision.mode !== 'choose') throw new Error('unreachable');
    // The ROUTER's order, unchanged. Re-ranking in the view would make the two
    // surfaces disagree about which home is likeliest.
    expect(decision.candidates.map((c) => c.target)).toEqual(['anki-cards', 'anki-level']);
    // Both are real destinations — a "choice" with a dead option is not a choice.
    for (const c of decision.candidates) expect(sectionForDropTarget(c.target)).toBeTruthy();
  });

  it('the ranking is a COUNT, not a confidence — the .apkg top candidate is `likely`', () => {
    // The trap this pins: reading `needsTriage`, which fires on `ambiguous`,
    // would open `anki-cards` silently because it is ranked `likely`. The gate
    // says "more than one candidate", and that is what the code counts.
    const file = join(dir, 'deck2.apkg');
    writeFileSync(file, 'x');
    const plan = planForPath(file);
    expect(plan.candidates[0].confidence).toBe('likely');
    expect(decisionForRoutedPlan(plan).mode).toBe('choose');
  });

  it('picking one from the list opens exactly that one', () => {
    const picked: DropCandidate = {
      target: 'anki-level',
      confidence: 'ambiguous',
      reasonKey: 'fileDrop.reason.apkgLevel',
    };
    const decision = openFor(picked, false);
    expect(decision).toEqual({
      mode: 'open',
      target: 'anki-level',
      section: 'stats',
      reasonKey: 'fileDrop.reason.apkgLevel',
      sniffed: false,
    });
  });
});

describe('gate 10 — sniffing settles the ambiguous extension', () => {
  it('a .zip carrying a Yomitan index.json opens the dictionary, not the library', () => {
    // On the EXTENSION alone this file is two ambiguous candidates. Only
    // `sniffZip` reading `index.json` collapses it.
    const file = join(dir, 'jmdict.zip');
    const zip = new AdmZip();
    zip.addFile('index.json', Buffer.from(JSON.stringify({ format: 3, title: 'JMdict' })));
    zip.addFile('term_bank_1.json', Buffer.from('[]'));
    zip.writeZip(file);

    const plan = planForPath(file);
    expect(plan.sniffed).toBe(true);
    const decision = filesOpenDecision(fileItem(file), plan);
    expect(decision).toEqual({
      mode: 'open',
      target: 'dictionary-yomitan',
      section: 'dictionary',
      reasonKey: 'fileDrop.reason.zipDictConfirmed',
      sniffed: true,
    });
  });

  it('a .zip of page images opens the library instead — same extension, other answer', () => {
    const file = join(dir, 'volume.zip');
    const zip = new AdmZip();
    for (let i = 1; i <= 5; i += 1) zip.addFile(`${i}.jpg`, Buffer.from([0xff, 0xd8]));
    zip.writeZip(file);

    const plan = planForPath(file);
    expect(plan.sniffed).toBe(true);
    const decision = filesOpenDecision(fileItem(file), plan);
    expect(decision.mode).toBe('open');
    if (decision.mode !== 'open') throw new Error('unreachable');
    expect(decision.target).toBe('library-manga');
    expect(decision.section).toBe('library');
    expect(decision.sniffed).toBe(true);
  });

  it('CONTROL: the same extension with nothing to sniff still asks', () => {
    // The pass above must be the SNIFFER and not the extension. A .zip whose
    // contents settle nothing keeps both homes and reaches the ranked list.
    const file = join(dir, 'mixed.zip');
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('hello'));
    zip.addFile('notes.md', Buffer.from('hi'));
    zip.writeZip(file);

    const plan = planForPath(file);
    expect(plan.sniffed).toBeUndefined();
    const decision = filesOpenDecision(fileItem(file), plan);
    expect(decision.mode).toBe('choose');
    if (decision.mode !== 'choose') throw new Error('unreachable');
    expect(decision.candidates.map((c) => c.target)).toEqual([
      'dictionary-yomitan',
      'library-manga',
    ]);
  });

  it('sniffJson settles a backup .json, which three extensions-worth of ranking could not', () => {
    const file = join(dir, 'dump.json');
    writeFileSync(file, JSON.stringify({ schemaVersion: 4, settings: {} }), 'utf8');
    const plan = planForPath(file);
    expect(plan.sniffed).toBe(true);
    const decision = filesOpenDecision(fileItem(file), plan);
    expect(decision.mode).toBe('open');
    if (decision.mode !== 'open') throw new Error('unreachable');
    // Gate 8 moved the Backup card into the Files app, so a backup file's
    // owning app IS this one. Recorded here so the coupling is visible.
    expect(decision.target).toBe('backup');
    expect(decision.section).toBe('files');
  });

  it('CONTROL: an unsniffable .json keeps all three homes and asks', () => {
    const file = join(dir, 'plain.json');
    writeFileSync(file, JSON.stringify({ hello: 'world' }), 'utf8');
    const plan = planForPath(file);
    expect(plan.sniffed).toBeUndefined();
    expect(decisionForRoutedPlan(plan).mode).toBe('choose');
  });
});

describe('gate 15 — a track opens the existing Music app, and Music is untouched', () => {
  it('an audio row opens Music, not the media Player the router would import to', () => {
    // The finding gate 10's own table produced: `AUDIO_EXT` and `VIDEO_EXT`
    // share the router's `media` bucket, because both IMPORT to the same media
    // library. Ownership is not one bucket, and the index already knows which
    // this row is.
    const file = join(dir, 'track.mp3');
    writeFileSync(file, 'x');
    const plan = planForPath(file);
    expect(plan.candidates.map((c) => c.target)).toEqual(['media']);

    // Without the kind, the coarse answer — this is the pre-fix behaviour.
    expect(decisionForRoutedPlan(plan)).toMatchObject({ section: 'player' });
    // With it, the app that owns a track.
    expect(filesOpenDecision(fileItem(file, 'audio'), plan)).toMatchObject({
      target: 'media',
      section: 'music',
    });
  });

  it('CONTROL: the refinement is one PAIR, not "kind wins"', () => {
    // A video row through the same target keeps the player...
    const video = join(dir, 'ep.mp4');
    writeFileSync(video, 'x');
    expect(filesOpenDecision(fileItem(video, 'video'), planForPath(video))).toMatchObject({
      section: 'player',
    });
    // ...and the sniffed `.zip` keeps the sniffer's answer even though its
    // index kind is the coarser `package`. A general "kind wins" would send it
    // to whatever `sectionForKind('package')` said, which is nothing at all.
    const zip = join(dir, 'dict2.zip');
    const z = new AdmZip();
    z.addFile('index.json', Buffer.from(JSON.stringify({ format: 3 })));
    z.writeZip(zip);
    expect(sectionForKind('package')).toBe(null);
    expect(filesOpenDecision(fileItem(zip, 'package'), planForPath(zip))).toMatchObject({
      section: 'dictionary',
      sniffed: true,
    });
  });

  it('the picked-from-the-list route refines too', () => {
    const picked: DropCandidate = {
      target: 'media',
      confidence: 'exact',
      reasonKey: 'fileDrop.reason.media',
    };
    expect(openFor(picked, false, 'audio')).toMatchObject({ section: 'music' });
    expect(openFor(picked, false, 'video')).toMatchObject({ section: 'player' });
    expect(openFor(picked, false)).toMatchObject({ section: 'player' });
  });

  it('the Music app itself is untouched — the Files app imports nothing of it', () => {
    // "That app's behaviour is unchanged before and after" is an ABSENCE, so it
    // is asserted against the sources. The Files app names the SECTION and lets
    // the shell mount it; it does not reach into the music player's own modules.
    expect(APP_SECTION).toContain("case 'music':");
    expect(APP_SECTION).toContain('<MediaCenterView initialTab="music" />');
    for (const forbidden of ['musicPlayer', 'MediaCenterView', 'audioEngine', 'musicLibrary']) {
      expect(FILES_APP, `FilesApp must not reach into ${forbidden}`).not.toContain(forbidden);
    }
    // ...and the route it does use is the shared one every widget uses.
    expect(FILES_APP).toContain('openSectionSurface(decision.section)');
  });
});

describe('gate 10 — every handled type, including the rows with no file', () => {
  it('opens one item of each file-backed kind in the app that owns it', () => {
    const cases: [string, string, string][] = [
      ['episode.mp4', 'media', 'player'],
      ['episode.ja.srt', 'subtitle', 'player'],
      ['novel.epub', 'library-book', 'library'],
      ['volume.cbz', 'library-manga', 'library'],
    ];
    for (const [name, target, section] of cases) {
      const file = join(dir, name);
      writeFileSync(file, 'x');
      const decision = filesOpenDecision(fileItem(file), planForPath(file));
      expect(decision.mode, name).toBe('open');
      if (decision.mode !== 'open') throw new Error('unreachable');
      expect(decision.target, name).toBe(target);
      expect(decision.section, name).toBe(section);
      expect(decision.sniffed, name).toBe(false);
    }
  });

  it('a row with no file falls back to its kind, and says that is what it did', () => {
    const row = {
      kind: 'dictionary' as const,
      location: { store: 'sqlite' as const, database: 'dict.db', table: 'dicts', rowId: '3' },
    };
    expect(isRoutableLocation(row.location)).toBe(false);
    expect(filesOpenDecision(row, null)).toEqual({
      mode: 'open',
      target: 'unknown',
      section: 'dictionary',
      reasonKey: 'filesApp.open.reason.byKind',
      sniffed: false,
    });
  });

  it('a kind nothing opens refuses instead of picking a plausible section', () => {
    // `highlight` has a shelf in the tree and no reader of its own. Placing it
    // somewhere to avoid an empty answer is how a dead Open button ships.
    expect(sectionForKind('highlight')).toBe(null);
    expect(
      filesOpenDecision(
        { kind: 'highlight', location: { store: 'derived', describes: 'a highlight' } },
        null,
      ),
    ).toEqual({ mode: 'refuse', reasonKey: 'filesApp.open.refuse.noOwner' });
  });

  it('a file whose router call failed refuses rather than guessing from the kind', () => {
    // The whole reason `plan` is a parameter: a `.zip` is TWO homes by
    // extension, and downgrading to `kind` would pick one of them with the
    // sniffer never having run.
    expect(filesOpenDecision(fileItem('C:/x/thing.zip', 'package'), null)).toEqual({
      mode: 'refuse',
      reasonKey: 'filesApp.open.refuse.unrouted',
    });
  });

  it('an unreadable path refuses with the router\u2019s own reason', () => {
    const plan = planForPath(join(dir, 'no-such-file.mp4'));
    expect(plan.candidates).toEqual([
      { target: 'unknown', confidence: 'exact', reasonKey: 'fileDrop.reason.unreadable' },
    ]);
    expect(decisionForRoutedPlan(plan)).toEqual({
      mode: 'refuse',
      reasonKey: 'fileDrop.reason.unreadable',
    });
  });
});
