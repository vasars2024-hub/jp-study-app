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
type Gate = { themes: string[]; discovered: 'aero' | 'wired' | null };

function gateRequiredBy(guard: string, fileText: string): Gate | null {
  let expr = guard.replace(/^\{\s*/, '').replace(/&&\s*\($/, '').trim();
  // Resolve one alias level: a bare identifier defined in the same file.
  const bare = expr.match(/^!?([A-Za-z_$][\w$]*)$/);
  if (bare) {
    if (expr.startsWith('!')) return null;
    const decl = fileText.match(new RegExp(`const ${bare[1]}\\s*=\\s*([^;\\n]+)`));
    if (decl) expr = decl[1].trim();
    else if (!discoveryOf(bare[1], fileText)) return null;
  }
  expr = expr.replace(/^\((.*)\)$/s, '$1').trim();
  if (expr.includes('&&') || expr.includes('?')) return null;
  const gate: Gate = { themes: [], discovered: null };
  for (const raw of expr.split('||')) {
    const term = raw.replace(/^\(|\)$/g, '').trim();
    const eq = term.match(/^[\w$.]+\s*===\s*([A-Z_][A-Z0-9_]*)$/);
    if (eq && eq[1] in THEME_CONSTANTS) {
      gate.themes.push(THEME_CONSTANTS[eq[1]]);
      continue;
    }
    const found = /^[A-Za-z_$][\w$]*$/.test(term) ? discoveryOf(term, fileText) : null;
    if (!found) return null;
    gate.discovered = found;
  }
  return gate.themes.length || gate.discovered ? gate : null;
}

/**
 * A discovery flag is a `useState(hasDiscoveredAero)` binding, not a `const x =`
 * one, so the alias resolver above cannot see it — which is the whole reason the
 * four Special-page modules stayed ungated through the theme pass.
 */
function discoveryOf(name: string, fileText: string): 'aero' | 'wired' | null {
  const decl = fileText.match(
    new RegExp(`const \\[${name}[^\\]]*\\]\\s*=\\s*useState\\(\\s*hasDiscovered(Aero|Wired)\\s*\\)`),
  );
  return decl ? (decl[1].toLowerCase() as 'aero' | 'wired') : null;
}

/** card id → the render gate its guard requires (pure theme/discovery guards). */
function gatedCards(): Map<string, Gate> {
  const found = new Map<string, Gate>();
  for (const text of Object.values(sourceFiles(SETTINGS_DIR))) {
    for (const m of text.matchAll(/<SettingsCard\b[^>]*?\bid="([^"{]+)"/gs)) {
      const lines = text.slice(0, m.index).split('\n');
      const guard = (lines[lines.length - 2] ?? '').trim();
      if (!/&&\s*\($/.test(guard)) continue;
      const gate = gateRequiredBy(guard, text);
      if (gate) found.set(m[1], gate);
    }
  }
  return found;
}

/** The subset with a pure theme requirement and nothing else. */
function themeGuardedCards(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [id, gate] of gatedCards()) {
    if (gate.themes.length && !gate.discovered) out.set(id, gate.themes);
  }
  return out;
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

  it('gives every indexed discovery-guarded card the shell its guard names', () => {
    const gated = gatedCards();
    const ungated: string[] = [];
    for (const [id, gate] of gated) {
      if (!gate.discovered || gate.themes.length) continue; // mixed axes are named, not gated
      const entry = SETTINGS_REGISTRY.find((e) => e.id === id);
      if (!entry) continue; // not indexed at all is a coverage question, not this one
      if (entry.discovered !== gate.discovered) ungated.push(`${id}: ${entry.discovered} vs ${gate.discovered}`);
    }
    expect(ungated).toEqual([]);
    // Same vacuity guard as above: the derivation must still be finding them.
    expect([...gated.values()].filter((g) => g.discovered).length).toBeGreaterThanOrEqual(4);
  });

  it('hides an undiscovered module from search and shows it once discovered', () => {
    const hits = (discovered?: { aero?: boolean; wired?: boolean }) =>
      searchSettings('aero arcade', t, { advanced: true, themeId: DEFAULT_THEME_ID, discovered }).map(
        (e) => e.id,
      );
    expect(hits({ aero: false, wired: false })).not.toContain('aero-arcade');
    expect(hits({ aero: true, wired: false })).toContain('aero-arcade');
    // The two shells are independent — finding WIRED must not unlock Aero's row.
    expect(hits({ aero: false, wired: true })).not.toContain('aero-arcade');
    expect(hits()).not.toContain('aero-arcade');
  });

  it('keeps a discovered module visible under a theme that is not its shell', () => {
    // `discovered` and `themes` are different axes: WIRED's modules stay in
    // search for someone who found them and then went back to Study OS.
    const hits = searchSettings('wired arcade', t, {
      advanced: true,
      themeId: DEFAULT_THEME_ID,
      discovered: { wired: true },
    });
    expect(hits.map((e) => e.id)).toContain('wired-arcade');
  });

  it('still hides a gated entry from a matching theme when Advanced Mode is off', () => {
    // The two gates are independent; a theme gate must not become a way around
    // the advanced gate.
    const ids = searchSettings('pillarbox', t, { advanced: false, themeId: AERO_THEME_ID });
    expect(ids.map((e) => e.id)).not.toContain('pillarbox');
  });
});
