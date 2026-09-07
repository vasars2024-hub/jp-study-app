/**
 * The `i18n-shadow-check` gate, tested the only way a gate can honestly be
 * tested: by planting the defect it exists for and proving it fires.
 *
 * The gate was written after D188, D189 and D231 turned out to be one class —
 * a second shell re-typing an English string whose key already exists and is
 * already translated, because some OTHER shell consumes that key. All five
 * other i18n checks are structurally blind to it (see the tool's header), so
 * three surfaces shipped fully English while every gate read green.
 *
 * A gate with no test is a gate nobody can trust after the first refactor, and
 * this one has two moving parts that are easy to break silently: the value
 * index (which must see plural arms, and must normalise `…` against `...`) and
 * the `distinctive()` filter (which is the only thing keeping the false
 * positive rate near zero).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const TOOL = join(REPO, 'tools', 'i18n-shadow-check.cjs');
const VICTIM = join(REPO, 'src', 'renderer', 'components', 'MiniShell.tsx');

/** `--file` mode, which never touches the baseline, so this is read-only. */
function runOnFile(rel: string): string {
  try {
    return execFileSync('node', [TOOL, '--file', rel], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 120_000,
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

describe('the gate is clean on a file that was just fixed', () => {
  it('reports nothing for MiniShell, which D231 converted', () => {
    const out = runOnFile('renderer/components/MiniShell.tsx');
    expect(out).toContain('no literal shadows an existing catalog value');
  });
});

describe('the gate fires on a planted shadow', () => {
  let restore: string | null = null;

  afterEach(() => {
    if (restore !== null) writeFileSync(VICTIM, restore, 'utf8');
    restore = null;
  });

  /**
   * Plant a literal whose exact text IS a translated catalog value, in a
   * position the extractor scores, and assert the tool names both the string
   * and the key that already carries it. Naming the key is the half that makes
   * a finding actionable rather than a lead.
   */
  it('names the literal AND the key that already carries it', () => {
    restore = readFileSync(VICTIM, 'utf8');
    const planted = restore.replace(
      "aria-label={t('miniShell.a11y.appSlots')}",
      'aria-label="Exit to full desktop"',
    );
    expect(planted, 'the plant did not apply — has MiniShell drifted?').not.toBe(restore);
    writeFileSync(VICTIM, planted, 'utf8');

    const out = runOnFile('renderer/components/MiniShell.tsx');
    expect(out, 'the planted shadow was not caught').toContain('Exit to full desktop');
    expect(out, 'the tool did not name the existing key').toContain('settings.mini.exitDesktop');
  });

  /**
   * The normaliser earns its place here. `Loading...` in a component and
   * `Loading…` in the catalog are the same string to a reader — D188's own
   * banner was the `...` spelling against a catalog `…`. A gate that compared
   * raw text would have missed it.
   */
  it('matches across the ellipsis and dash spellings', () => {
    restore = readFileSync(VICTIM, 'utf8');
    const planted = restore.replace(
      "aria-label={t('miniShell.a11y.appSlots')}",
      'aria-label="Backdrop behind the craft window. Match your Study desktop wallpaper, use app-icon mosaic, or a custom image."',
    );
    expect(planted).not.toBe(restore);
    writeFileSync(VICTIM, planted, 'utf8');

    const out = runOnFile('renderer/components/MiniShell.tsx');
    expect(out).toContain('settings.mini.wall.desc');
  });

  /**
   * The negative half. `Size` is a catalog value AND an ordinary English word;
   * flagging it would put noise in front of every real finding, and a noisy
   * gate gets baselined away wholesale. `distinctive()` is what stops that, so
   * it needs a control of its own or nobody will know when it is removed.
   */
  it('does NOT fire on a short common word that merely collides', () => {
    restore = readFileSync(VICTIM, 'utf8');
    const planted = restore.replace("{t('miniShell.size')}", 'Size');
    expect(planted).not.toBe(restore);
    writeFileSync(VICTIM, planted, 'utf8');

    const out = runOnFile('renderer/components/MiniShell.tsx');
    expect(out, '"Size" was reported — distinctive() is not filtering').toContain(
      'no literal shadows an existing catalog value',
    );
  });
});

describe('the baseline is a real file and covers the known population', () => {
  /**
   * D236 — this assertion was written as a FLOOR (>= 11 files, >= 35 strings)
   * on a number whose whole purpose is to fall. D233 cleared FieldMappingEditor
   * in the very commit that introduced the gate, taking the baseline to 10 / 24,
   * so the test was red the moment it landed and every future fix would have
   * re-broken it. A ratchet test asserts the direction, not a magic number.
   *
   * The real risk the original was reaching for is the opposite one, and it is
   * named in the tool's own header: a noisy gate gets baselined away WHOLESALE.
   * So: a ceiling that only moves down, and a non-empty floor of 1.
   */
  // Lowered 2026-09-07 by D239, which cleared SettingsApp's 4 and
  // FlashcardsView's 1. Only ever moves down, and only when work removed
  // entries — see the note above.
  const CEILING_FILES = 8;
  const CEILING_STRINGS = 19;

  it('shrinks and never grows, and is never emptied wholesale', () => {
    const baseline = JSON.parse(
      readFileSync(join(REPO, 'tools', 'i18n-shadow-baseline.json'), 'utf8'),
    ) as Record<string, number>;
    const files = Object.keys(baseline);
    const total = Object.values(baseline).reduce((a, b) => a + b, 0);

    expect(files.length, 'the baseline was emptied — the gate now guards nothing').toBeGreaterThan(0);
    expect(
      files.length,
      `the baseline GREW to ${files.length} files; lower CEILING_FILES only when work removed entries`,
    ).toBeLessThanOrEqual(CEILING_FILES);
    expect(
      total,
      `the baseline GREW to ${total} strings; lower CEILING_STRINGS only when work removed entries`,
    ).toBeLessThanOrEqual(CEILING_STRINGS);

    // Every entry must be a real path — a stale key silences a whole file.
    for (const file of files) {
      expect(() => readFileSync(join(REPO, 'src', file), 'utf8'), `${file} is gone`).not.toThrow();
    }
  });
});

/**
 * A temp-dir round trip on the normaliser itself, kept separate from the tool
 * run because it is the one piece of logic worth exercising directly rather
 * than through a subprocess.
 */
describe('the tool loads and its baseline round-trips', () => {
  it('writes a baseline it can read back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shadow-'));
    try {
      const sample = { 'renderer/components/MiniShell.tsx': 0 };
      const file = join(dir, 'b.json');
      writeFileSync(file, `${JSON.stringify(sample, null, 2)}\n`);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(sample);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
