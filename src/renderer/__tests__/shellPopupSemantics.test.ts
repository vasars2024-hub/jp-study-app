/**
 * L9 bullet 4 — the shell taskbar's popup-owning chrome must declare itself.
 *
 * Measured live on the Wired shell 2026-08-31 through the debug bridge: every one of
 * `os-start-btn`, the two `os-desktop-switch` buttons and all six `os-tray-btn` buttons read
 * `aria-expanded=null` and `aria-haspopup=null`. Six of those nine open a menu or a flyout
 * (Start, Search, Widgets, Clipboard history, Quick settings, Notifications) and two are a
 * two-state desktop selector whose selected-ness lived only in a CSS class. So nothing but
 * sighted pointer use could tell the shell's launcher from a plain command, or say which
 * desktop you were on.
 *
 * `aria-expanded` is asserted only where the rendering component genuinely owns the open
 * state — Start and Widgets. The other four dispatch a CustomEvent and their panels own the
 * state, and a button that claims `aria-expanded="false"` while its panel is open is worse
 * than one that claims nothing. That split is the deliberate part of this slice, so it is
 * pinned here rather than left to drift.
 *
 * A source scan, not a render: `vitest.config.ts` is `environment: 'node'` and
 * `DesktopShell.tsx` pulls the whole shell tree at module eval — the same reason
 * `desktopShellTrayNoDuplicates.test.ts` scans. The control block is what stops a scan whose
 * matcher silently found nothing from reporting a pass forever.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const SHELL = 'src/renderer/components/DesktopShell.tsx';
const BELL = 'src/renderer/components/shell/NotificationBell.tsx';

const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

/**
 * The JSX element that opens with `<button`, up to the `>` that closes its ATTRIBUTE LIST.
 *
 * Brace- and quote-aware, and that is not defensive polish: the first draft took
 * `indexOf('>')` and every handler's `() => …` arrow ended the tag two attributes in, so
 * `switchDesktop(0)` was never inside any tag and the desktop-switch assertion read `''`.
 * That failure is reproduced in the control below rather than described.
 */
function buttonTag(source: string, marker: string): string {
  for (const m of source.matchAll(/<button\b/g)) {
    let depth = 0;
    let quote = '';
    let end = -1;
    for (let i = m.index; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) { if (ch === quote) quote = ''; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) { end = i; break; }
    }
    if (end < 0) continue;
    const tag = source.slice(m.index, end);
    if (tag.includes(marker)) return tag;
  }
  return '';
}

describe('the shell taskbar declares its popups', () => {
  it('the Start button is a menu button with a live expanded state', () => {
    const tag = buttonTag(read(SHELL), 'os-start-btn');
    expect(tag).toContain('aria-haspopup="menu"');
    expect(tag).toContain('aria-expanded={startOpen}');
  });

  it.each([
    ['search', "t('palette.searchPlaceholder')"],
    ['quick settings', "t('quickSettings.title')"],
  ])('the %s tray button declares its popup and claims no expanded state it cannot read', (_name, marker) => {
    const tag = buttonTag(read(SHELL), marker);
    expect(tag).toContain('aria-haspopup="dialog"');
    expect(tag).not.toContain('aria-expanded');
  });

  it('the tray overflow chevron is a dialog button that names the panel it reveals', () => {
    // Widgets, Clipboard history and Settings moved behind this chevron (L9 bullet 4,
    // cat5 Q4). Their own popup semantics are pinned in `shellTrayOverflow.test.ts`,
    // against the item descriptors that now carry them.
    const tag = buttonTag(read(SHELL), 'os-tray-overflow-btn');
    expect(tag).toContain('aria-haspopup="dialog"');
    expect(tag).toContain('aria-expanded={trayOverflowOpen}');
    expect(tag).toContain('aria-controls={TRAY_OVERFLOW_ID}');
  });

  it('the notification bell declares its popup and claims no expanded state it cannot read', () => {
    const tag = buttonTag(read(BELL), 'os-tray-btn-bell');
    expect(tag).toContain('aria-haspopup="dialog"');
    expect(tag).not.toContain('aria-expanded');
  });

  it('names the Wired error lamp in both the active and quiet states', () => {
    const source = read(SHELL);
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("'notifications.wired.unreadError'");
    expect(source).toContain("'notifications.wired.noUnreadError'");
  });

  /*
   * This case used to pin the two hardcoded switches by index —
   * `buttonTag(source, 'switchDesktop(0)')` then `(1)`. That stopped being
   * possible when the row became a map over every switchable desktop (D149):
   * there is no `switchDesktop(0)` literal any more, `buttonTag` returned '',
   * and a strictly BETTER implementation read as a regression. It is the same
   * shape the class-5 ratchet hit on 2026-09-07 — a source ratchet that pins
   * one spelling of a contract instead of the contract.
   *
   * So it asserts the contract: the one switch button carries `aria-pressed`
   * bound to whether it IS the active desktop, and the state is not left to
   * the `active` class alone.
   */
  it('the desktop switches carry their selected-ness programmatically, not only as a class', () => {
    const source = read(SHELL);
    const tag = buttonTag(source, 'switchDesktop(index)');
    expect(tag).toContain('aria-pressed={activeDesktop === index}');
    // The class is still there, and must not be the only carrier.
    expect(tag).toContain('os-desktop-switch');
    // And the row is genuinely a map, not two buttons that happen to share a
    // handler name — otherwise a desktop past the second has no button at all.
    expect(source).toContain('switchableDesktops.map(');
  });

});

describe('controls — so the scan cannot pass vacuously', () => {
  it('reads a shell file that actually contains the taskbar', () => {
    const source = read(SHELL);
    expect(source).toContain('os-tray');
    expect(source).toContain('os-task-wins');
    expect(source.length).toBeGreaterThan(10_000);
  });

  it('buttonTag survives an arrow handler, stops at its own >, and returns empty for an absent marker', () => {
    // Four failures this must be able to see: an attribute AFTER a `() =>` handler lost
    // (the real defect this helper was rewritten for), the wrong button matched, children
    // read as attributes, and a marker that no longer exists reported as a pass. The last
    // is the one that would make every assertion above vacuous, because `''` contains
    // nothing — which is exactly what the `not.toContain` cases assert.
    const fixture = [
      '<button className="a" onClick={() => go(0)} aria-pressed={n === 0}>A</button>',
      '<button className="b">B<span/></button>',
    ].join('\n');
    expect(buttonTag(fixture, 'go(0)')).toContain('aria-pressed={n === 0}');
    expect(buttonTag(fixture, 'className="b"')).toBe('<button className="b"');
    expect(buttonTag(fixture, 'className="b"')).not.toContain('span');
    expect(buttonTag(fixture, 'className="zzz"')).toBe('');
    // …so a positive assertion on a missing marker FAILS rather than passing silently.
    expect(buttonTag(fixture, 'className="zzz"')).not.toContain('aria-haspopup');
  });
});
