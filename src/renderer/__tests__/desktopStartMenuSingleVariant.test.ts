/**
 * L9 bullet 4, cat2 repair — the Start panel must build ONE variant, not both.
 *
 * `DesktopShell` mounted `.os-start-legacy` AND `.os-start-aero-menu` on every open and let CSS
 * hide the loser. Measured live on 2026-08-31 in the Wired shell: one open added 531 nodes
 * (911 -> 1442) carrying 106 inline SVGs, of which at most half were ever painted, and the input
 * was acknowledged at 135.7 ms against an 11 ms inert floor — the cat2 latency bar is 100 ms.
 * Dropping the hidden variant took the open to 298 nodes and 95.4-114.0 ms in Wired, 234 nodes and
 * ~86 ms on the default material.
 *
 * The pairing this guards is the thing that is easy to get subtly wrong: the JS condition and the
 * CSS condition must name the SAME set of materials. If they ever disagree, the shell renders the
 * variant its own stylesheet then hides — a Start button that opens nothing. So the test reads the
 * render guard out of the component and the display rules out of the three stylesheets, and
 * asserts they describe one set: {aero, wired} get the secret-OS menu, everything else gets legacy.
 *
 * A source scan rather than a render, for the reason `desktopShellTrayNoDuplicates.test.ts` gives:
 * `vitest.config.ts` is `environment: 'node'` and `DesktopShell.tsx` pulls the whole shell tree at
 * module eval. The control block at the bottom is what stops the scan from passing vacuously.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const SHELL = 'src/renderer/components/DesktopShell.tsx';
const AERO_CSS = 'src/renderer/theme/aero-shell.css';
const WIRED_CSS = 'src/renderer/theme/wired-shell.css';

function read(rel: string): string {
  return readFileSync(resolve(REPO, rel), 'utf8');
}

/** The text between a guard opener and the first line of the panel it wraps. */
function guardBefore(source: string, className: string): string | null {
  const at = source.indexOf(`className="os-start ${className}"`);
  if (at < 0) return null;
  const head = source.slice(0, at);
  const lines = head.split('\n').map((l) => l.trim()).filter(Boolean);
  // <div is the line immediately above the className; the guard is the one above that.
  return lines[lines.length - 2] ?? null;
}

describe('the Start panel builds one variant', () => {
  const shell = read(SHELL);

  it('derives the variant from the material, naming aero and wired explicitly', () => {
    expect(shell).toContain("const secretStartMenu = material === 'aero' || material === 'wired';");
  });

  it('renders the legacy grid only when the material is NOT a secret OS', () => {
    expect(guardBefore(shell, 'os-start-legacy')).toBe('{!secretStartMenu && (');
  });

  it('renders the secret-OS menu only when the material IS one', () => {
    expect(guardBefore(shell, 'os-start-aero-menu')).toBe('{secretStartMenu && (');
  });

  it('never mounts both panels in one open', () => {
    // Two panels, two guards, opposite senses — so no material can reach both branches.
    const legacy = guardBefore(shell, 'os-start-legacy');
    const secret = guardBefore(shell, 'os-start-aero-menu');
    expect(legacy).not.toBe(secret);
    expect(`${legacy}${secret}`).toContain('!secretStartMenu');
    expect(`${legacy}${secret}`).toContain('{secretStartMenu &&');
  });

  it('agrees with the stylesheets about which materials hide the legacy grid', () => {
    // The JS set is {aero, wired}. These are the rules that hide legacy for exactly those two.
    expect(read(AERO_CSS)).toMatch(/:root\[data-materials='aero'\] \.os-start-legacy \{\s*display: none;/);
    expect(read(WIRED_CSS)).toMatch(/:root\[data-materials='wired'\] \.os-start-legacy \{\s*display: none;/);
  });

  it('agrees with the stylesheets about which materials show the secret-OS menu', () => {
    // Hidden by default, un-hidden by exactly the same two materials.
    expect(read(AERO_CSS)).toMatch(/\n\.os-start-aero-menu \{\s*display: none;/);
    expect(read(AERO_CSS)).toMatch(/:root\[data-materials='aero'\] \.os-start-aero-menu \{[^}]*display: flex;/);
    expect(read(WIRED_CSS)).toMatch(/:root\[data-materials='wired'\] \.os-start-aero-menu \{\s*display: flex;/);
  });

  it('control: the scan can tell a guarded panel from an unguarded one', () => {
    // Same reader, on a panel that is deliberately NOT behind a material guard. If `guardBefore`
    // returned the opener for anything placed above any <div, every assertion above would pass on
    // a shell that still mounted both. The backdrop sits directly under `{startOpen && (` inside a
    // fragment, so its "guard line" is the fragment, not a secretStartMenu test.
    const backdropAt = shell.indexOf('className={`os-start-backdrop');
    expect(backdropAt).toBeGreaterThan(0);
    const above = shell.slice(0, backdropAt).split('\n').map((l) => l.trim()).filter(Boolean);
    expect(above[above.length - 2]).not.toContain('secretStartMenu');
  });
});
