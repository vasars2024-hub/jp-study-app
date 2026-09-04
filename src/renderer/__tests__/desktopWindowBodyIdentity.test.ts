import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `FloatingWindow` is `memo()`'d, and a memo is only worth its comparison if every prop
 * it receives is reference-stable. `children` is a prop. An element literal at the call
 * site is a new object on every shell render, so one inline `<textarea>` or
 * `<DesktopSettings>` is enough to make the memo miss for that window on every keystroke
 * anywhere on the desk.
 *
 * Measured through the debug bridge, one keystroke into a sticky note to the second
 * animation frame after it, 12 scored samples per arm, keystrokes 400 ms apart so each
 * gets its own frame:
 *
 *                        note alone      note + Statistics + Settings     cost of the two
 *   HEAD before             21.4 ms                52.9 ms                    +31.5 ms
 *   with the caches         22.8 ms                27.9 ms                     +5.1 ms
 *
 * The two "note alone" arms are the negative control: they match, so the improvement is
 * the unrelated windows getting cheaper and not the machine or the instrument drifting.
 *
 * Comments are stripped before any assertion. This file's own prose names the very JSX
 * it forbids, and DesktopShell's does too — a raw-text ratchet would match the
 * explanation rather than the code, which has produced a false reading in this repo.
 */
const SRC = readFileSync(new URL('../components/DesktopShell.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*(\/\/|\*)/.test(line))
  .join('\n');

const CALL_SITE = (() => {
  const at = SRC.indexOf('<FloatingWindow');
  const end = SRC.indexOf('</FloatingWindow>', at);
  expect(at).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(at);
  return SRC.slice(at, end);
})();

describe('every floating window body is reference-stable', () => {
  it('hands FloatingWindow a cached element rather than a fresh literal', () => {
    expect(CALL_SITE).not.toMatch(/<textarea/);
    expect(CALL_SITE).not.toMatch(/<DesktopSettings/);
    expect(CALL_SITE).toContain('noteBodyCache.get(w.id, notes[w.id])');
    expect(CALL_SITE).toContain('desktopSettingsBody');
    expect(CALL_SITE).toContain('appSectionCache.get(w.section, null)');
  });

  it('hands it cached callbacks rather than fresh arrows', () => {
    // `onNoteColor` was the one prop still allocated inline, and by itself it was enough
    // to make the memo miss for every note on the desk.
    expect(CALL_SITE).toContain('noteColorCache.get(w.id, null)');
    expect(CALL_SITE).not.toMatch(/onNoteColor=\{w\.section === 'note'\s*\n?\s*\?\s*\(color\)/);
    expect(CALL_SITE).toContain('{...winHandlerCache.get(w.id, w.section)}');
  });

  it('rebuilds the note body per language, because it caches a translated placeholder', () => {
    expect(SRC).toContain('const { t, lang } = useT();');
    const at = SRC.indexOf('const noteBodyCache = useMemo(');
    expect(at).toBeGreaterThan(-1);
    expect(SRC.slice(at, SRC.indexOf('\n  );', at))).toContain("t('desktop.notePlaceholder')");
    expect(SRC.slice(at, SRC.indexOf('\n  );', at))).toContain('[lang],');
  });

  it('prunes the per-window caches when a window closes', () => {
    expect(SRC).toContain('winHandlerCache.prune(wins.map((w) => w.id));');
    expect(SRC).toContain('noteColorCache.prune(live);');
    expect(SRC).toContain('noteBodyCache.prune(live);');
  });

  it('reads the settings callbacks late, through a ref', () => {
    // The same reason `winActionsRef` exists: these are plain declarations recreated every
    // render, so a ref-stable bundle that closed over them directly would freeze the first
    // render's copies and, for example, keep resetting to the first render's wallpaper.
    expect(SRC).toContain('wallActionsRef.current = {');
    expect(SRC).toContain('const wallHandlers = useRef({');
    expect(SRC).toContain('onWallPreset: (id: string) => wallActionsRef.current.setPreset(id),');
    const memo = SRC.indexOf('const desktopSettingsBody = useMemo(');
    expect(memo).toBeGreaterThan(-1);
    expect(SRC.slice(memo, SRC.indexOf('\n  );', memo))).toContain(
      '[wall, userWalls, userWallThumbs, wallHandlers],',
    );
  });
});
