/**
 * A settings card can be gated on the ACTIVE THEME, not just on Advanced Mode:
 *
 *   {aeroActive && <SettingsCard id="pillarbox" …/>}
 *   {(activeThemeId === AERO_THEME_ID || activeThemeId === WIRED_ARCHIVE_THEME_ID) && …}
 *
 * `settingsSearchReachability.test.ts` proves such an entry's anchor exists in a
 * file its page renders, which is true here — the file is right, the card is
 * simply not on screen for this user. So a Study OS user searching "pillarbox"
 * got a hit, navigated to Appearance, and highlighted nothing: reachability by
 * file closure is not reachability by render.
 *
 * The gate is `SettingsRegistryEntry.themes`, and this file derives which
 * entries need it from each card's own guard rather than from a hand-kept list.
 * Aliases are resolved one level (`const aeroActive = theme === AERO_THEME_ID`),
 * because the two cards that carried this defect longest were written that way
 * and a regex for `THEME_ID` next to the tag would have missed both.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AERO_SHELL_THEME,
  SECRET_SHELL_THEMES,
  SETTINGS_REGISTRY,
  WIRED_SHELL_THEME,
  searchSettings,
} from '../components/settings/settingsRegistry';
import { AERO_THEME_ID } from '../theme/frutiger-aero';
import { WIRED_ARCHIVE_THEME_ID } from '../theme/wired-archive';
import { DEFAULT_THEME_ID } from '../theme/engine';
import { en } from '../../shared/i18n/catalogs';

const SETTINGS_DIR = join(__dirname, '..', 'components', 'settings');
const t = (key: string): string => (en[key] as string) ?? key;

/** Theme-id constant name → the id it holds, for reading a guard expression. */
const THEME_CONSTANTS: Record<string, string> = {
  AERO_THEME_ID,
  WIRED_ARCHIVE_THEME_ID,
};

function sourceFiles(dir: string, out: Record<string, string> = {}): Record<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out[full] = readFileSync(full, 'utf8');
    }
  }
  return out;
}

/**
 * The themes a guard expression requires, or `null` when it is not a pure theme
 * guard. "Pure" means every term is an equality against a known theme constant
 * and they are joined only by `||` — `{(wired || isWiredDiscovered) && …}` is
 * deliberately NOT pure, because a user who has discovered WIRED sees that card
 * under any theme and gating its search entry would hide a live destination.
 */
function themesRequiredBy(guard: string, fileText: string): string[] | null {
  let expr = guard.replace(/^\{\s*/, '').replace(/&&\s*\($/, '').trim();
  // Resolve one alias level: a bare identifier defined in the same file.
  const bare = expr.match(/^!?([A-Za-z_$][\w$]*)$/);
  if (bare) {
    const decl = fileText.match(new RegExp(`const ${bare[1]}\\s*=\\s*([^;\\n]+)`));
    if (!decl) return null;
    if (expr.startsWith('!')) return null;
    expr = decl[1].trim();
  }
  expr = expr.replace(/^\((.*)\)$/s, '$1').trim();
  if (expr.includes('&&') || expr.includes('?')) return null;
  const terms = expr.split('||').map((s) => s.trim());
  const themes: string[] = [];
  for (const term of terms) {
    const eq = term.replace(/^\(|\)$/g, '').trim().match(/^[\w$.]+\s*===\s*([A-Z_][A-Z0-9_]*)$/);
    if (!eq || !(eq[1] in THEME_CONSTANTS)) return null;
    themes.push(THEME_CONSTANTS[eq[1]]);
  }
  return themes.length ? themes : null;
}

/** card id → the theme ids its render guard requires (pure theme guards only). */
function themeGuardedCards(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const text of Object.values(sourceFiles(SETTINGS_DIR))) {
    for (const m of text.matchAll(/<SettingsCard\b[^>]*?\bid="([^"{]+)"/gs)) {
      const lines = text.slice(0, m.index).split('\n');
      const guard = (lines[lines.length - 2] ?? '').trim();
      if (!/&&\s*\($/.test(guard)) continue;
      const themes = themesRequiredBy(guard, text);
      if (themes) found.set(m[1], themes);
    }
  }
  return found;
}

describe('settings search theme gate', () => {
  it('names the same two shells the theme modules register', () => {
    // The registry stays a side-effect-free data module, so it spells the ids
    // rather than importing them; this is where that copy is held honest.
    expect(AERO_SHELL_THEME).toBe(AERO_THEME_ID);
    expect(WIRED_SHELL_THEME).toBe(WIRED_ARCHIVE_THEME_ID);
    expect(SECRET_SHELL_THEMES).toEqual([AERO_THEME_ID, WIRED_ARCHIVE_THEME_ID]);
  });

  it('finds the theme-guarded cards from source, not from a list', () => {
    const guarded = themeGuardedCards();
    // If this drops to zero the derivation broke and every assertion below
    // passes vacuously, which is the failure mode this case exists to catch.
    expect(guarded.size).toBeGreaterThanOrEqual(4);
    expect([...guarded.keys()].sort()).toContain('pillarbox');
    expect(guarded.get('pillarbox')).toEqual([AERO_THEME_ID]);
    expect(guarded.get('companions-leave-secret')).toEqual([AERO_THEME_ID, WIRED_ARCHIVE_THEME_ID]);
  });

  it('gives every indexed theme-guarded card the themes its guard requires', () => {
    const guarded = themeGuardedCards();
    const ungated: string[] = [];
    const wrong: string[] = [];
    for (const entry of SETTINGS_REGISTRY) {
      const required = guarded.get(entry.id);
      if (!required) continue;
      if (!entry.themes) ungated.push(entry.id);
      else if ([...entry.themes].sort().join() !== [...required].sort().join()) {
        wrong.push(`${entry.id}: themes ${entry.themes.join('/')} vs guard ${required.join('/')}`);
      }
    }
    expect(ungated).toEqual([]);
    expect(wrong).toEqual([]);
  });

  it('does not gate an entry whose card renders under every theme', () => {
    const guarded = themeGuardedCards();
    const overGated = SETTINGS_REGISTRY.filter((e) => e.themes && !guarded.has(e.id)).map((e) => e.id);
    expect(overGated).toEqual([]);
  });

  it('hides a secret-shell entry from a Study OS search and shows it under Aero', () => {
    const hits = (themeId?: string) =>
      searchSettings('pillarbox', t, { advanced: true, themeId }).map((e) => e.id);
    expect(hits(AERO_THEME_ID)).toContain('pillarbox');
    expect(hits(DEFAULT_THEME_ID)).not.toContain('pillarbox');
    // No theme supplied is treated as "not that shell": a missing result costs
    // less than one that navigates to a page and highlights nothing.
    expect(hits()).not.toContain('pillarbox');
  });

  it('leaves ungated entries identical across themes', () => {
    // The control. If the gate were filtering on something other than `themes`,
    // this set would move too and the case above would prove nothing.
    const ids = (themeId?: string) =>
      searchSettings('border', t, { advanced: true, themeId })
        .map((e) => e.id)
        .filter((id) => !SETTINGS_REGISTRY.find((e) => e.id === id)?.themes)
        .sort();
    expect(ids(DEFAULT_THEME_ID)).toEqual(ids(AERO_THEME_ID));
    expect(ids(DEFAULT_THEME_ID).length).toBeGreaterThan(0);
  });

  it('still hides a gated entry from a matching theme when Advanced Mode is off', () => {
    // The two gates are independent; a theme gate must not become a way around
    // the advanced gate.
    const ids = searchSettings('pillarbox', t, { advanced: false, themeId: AERO_THEME_ID });
    expect(ids.map((e) => e.id)).not.toContain('pillarbox');
  });
});
