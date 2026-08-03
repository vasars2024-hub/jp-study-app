/**
 * Slice 57 — the taskbar tray must not paint two identical notification bells.
 *
 * `DesktopShell` rendered `<NotificationBell />` twice inside the same `<div className="os-tray">`.
 * Both painted a `button.os-tray-btn.os-tray-btn-bell` with the identical `aria-label`, both
 * dispatched `shell:toggleNotifications`, and both were keyboard focusable — so a screen-reader
 * user heard "Notifications, button" twice in the tray with nothing to tell them apart, and a
 * sighted user saw the bell twice. The tray is mounted in every window, so it shipped on every
 * surface.
 *
 * How it hid for so long is the more useful half. Slice 50 read "every surface is exactly one
 * short" off the packaged a11y gate and recorded it as a coverage gap. It was not: the gate's
 * `distinctStops` counts `describe|name` STRINGS while `focusableVisible` counts ELEMENTS, and the
 * two bells collapse into one Set entry. The two numbers were never commensurable. Slice 53's own
 * artifact already carried the element-level answer (`unreachedByTab: []`, `coveredAllFocusable:
 * true`) sitting right next to the contradicting headline, and nobody reconciled them. Slice 55
 * did, and found a real UI defect underneath a measurement artifact.
 *
 * A source scan rather than a render: `vitest.config.ts` is `environment: 'node'` and
 * `DesktopShell.tsx` pulls the whole shell tree at module eval. The control block below is what
 * stops that scan from passing vacuously.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const SHELL = 'src/renderer/components/DesktopShell.tsx';

function shellSource(): string {
  return readFileSync(resolve(REPO, SHELL), 'utf8');
}

function countJsx(source: string, component: string): number {
  return (source.match(new RegExp(`<${component}\\s*/>|<${component}\\s`, 'g')) ?? []).length;
}

describe('the desktop tray renders each control once', () => {
  it('mounts exactly one NotificationBell', () => {
    expect(countJsx(shellSource(), 'NotificationBell')).toBe(1);
  });

  it('keeps the bell adjacent to the clock, where the tray convention puts it', () => {
    // Which of the two duplicates to keep was the only judgement here. The surviving one is the
    // one that sat beside the tray lamps and TaskbarClock — the Windows-11 tray convention this
    // project's CLAUDE.md names as its aesthetic. Pinned so a future edit that moves it away from
    // the clock is a deliberate decision rather than a silent drift.
    const source = shellSource();
    const bell = source.indexOf('<NotificationBell />');
    const clock = source.indexOf('<TaskbarClock');
    expect(bell).toBeGreaterThan(-1);
    expect(clock).toBeGreaterThan(-1);
    expect(bell).toBeLessThan(clock);
    // Nothing focusable should sit between them except the wired-only decorations.
    const between = source.slice(bell, clock);
    expect(between).not.toMatch(/<button/);
  });
});

describe('controls — so the scan cannot pass vacuously', () => {
  it('reads a shell file that actually contains the tray', () => {
    const source = shellSource();
    expect(source).toContain('os-tray');
    expect(source).toContain('TaskbarClock');
    expect(source.length).toBeGreaterThan(10_000);
  });

  it('the counter can see a component that IS mounted more than once', () => {
    // Without this, a matcher that silently found nothing would report "exactly one" forever.
    const fixture = '<Thing />\n<Other />\n<Thing />';
    expect(countJsx(fixture, 'Thing')).toBe(2);
    expect(countJsx(fixture, 'Other')).toBe(1);
    expect(countJsx(fixture, 'Absent')).toBe(0);
  });
});
