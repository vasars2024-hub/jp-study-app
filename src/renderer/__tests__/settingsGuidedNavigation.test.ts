/**
 * D95/D96. Every route INTO a settings page must survive the advanced-page guard.
 *
 * `SettingsApp` bounces you Home the moment you land on an `advanced` page while
 * advanced mode is off (`SettingsApp.tsx`, "If user turns Advanced off while on an
 * advanced-only page, bounce home"). The exemption for a deliberate route is
 * `navigate(page, settingId, { guided: true })`, and its own comment says what
 * happens without it: "the originating control is functionally dead".
 *
 * Measured live on a default profile before this gate existed: the Home page's
 * Blanc Mode and Particles & atmosphere quick actions, every RECENTLY OPENED entry
 * for an advanced page, and the API-keys row's Manage button all navigated, were
 * bounced, and read as no-ops.
 *
 * The invariant is deliberately blunt — EVERY `navigate(...)` call inside the
 * settings tree is a user-initiated route, so every one of them is guided. That is
 * cheaper to hold than a per-call-site judgement about whether today's destination
 * happens to be advanced, and it catches the next call site somebody adds.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SETTINGS_NAV } from '../components/settings/settingsRegistry';

const SETTINGS_DIR = join(__dirname, '..', 'components', 'settings');

/** `SettingsApp` DEFINES navigate and owns the guard; it is not a caller. */
const NOT_A_CALLER = 'SettingsApp.tsx';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith('.tsx') && name !== NOT_A_CALLER) out.push(full);
  }
  return out;
}

type Call = { file: string; text: string };

/**
 * Every `navigate(` call in the settings tree, with enough following source to
 * see its arguments. `onNavigate(` is excluded — that is a prop being invoked by
 * `SettingsSearch`, and its handler in `SettingsApp` is the one that guides.
 */
function navigateCalls(): Call[] {
  const calls: Call[] = [];
  for (const file of sourceFiles(SETTINGS_DIR)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(\w+\.)?\bnavigate\(/g)) {
      const at = match.index ?? 0;
      if (source.slice(Math.max(0, at - 2), at + 9).includes('onNavigate(')) continue;
      calls.push({ file: relative(SETTINGS_DIR, file), text: source.slice(at, at + 240) });
    }
  }
  return calls;
}

describe('settings navigation survives the advanced-page guard', () => {
  it('has advanced pages to be guarded against, and quick actions that reach them', () => {
    // The reason the rule exists. If nothing is advanced any more, this fails
    // first and the rule can be retired deliberately rather than by drift.
    const advanced = SETTINGS_NAV.filter((page) => page.advanced).map((page) => page.id);
    expect(advanced).toEqual(expect.arrayContaining(['atmosphere', 'scraper', 'special']));

    const home = readFileSync(join(SETTINGS_DIR, 'SettingsHome.tsx'), 'utf8');
    // Blanc Mode -> `special`, Particles & atmosphere -> `atmosphere`. Both are
    // on the DEFAULT Home page, which is what made this a first-run defect.
    expect(home).toContain("page: 'special'");
    expect(home).toContain("page: 'atmosphere'");
  });

  it('finds the call sites at all', () => {
    // Non-vacuity floor: a regex that stopped matching would make every
    // assertion below pass over an empty list.
    const calls = navigateCalls();
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(new Set(calls.map((call) => call.file)).size).toBeGreaterThanOrEqual(4);
  });

  it('routes every settings navigation as guided', () => {
    const unguided = navigateCalls()
      .filter((call) => !call.text.includes('guided: true'))
      .map((call) => `${call.file}: ${call.text.split('\n')[0].trim()}`);
    expect(unguided).toEqual([]);
  });
});
