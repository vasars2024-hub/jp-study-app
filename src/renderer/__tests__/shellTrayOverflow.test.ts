/**
 * L9 bullet 4 — the shell taskbar's tray overflow ("show hidden icons").
 *
 * Measured live on the Wired shell 2026-08-31 through the debug bridge: the shell's
 * default view offered **13** controls to scan (Start + 2 desktop switches + 3 window
 * buttons + 1 window close + 6 tray buttons) against cat5 Q4's bar of 12, so the shell
 * failed the "advanced tools discoverable without cluttering" question on count alone.
 * The product answer is the OS's own idiom rather than an instrument change: Windows
 * tucks its secondary tray icons behind a chevron, and CLAUDE.md's Liquid definition
 * literally names "smart progressive disclosure".
 *
 * What this pins, and why each half matters:
 *   - the three moved commands are NOT in the taskbar tray any more (the count moves), and
 *   - they are all still reachable from the panel with their labels showing (nothing is
 *     obscured — the load-bearing half; a disclosure that loses a capability is a
 *     regression, not a cleanup).
 *
 * A source scan, not a render: `vitest.config.ts` is `environment: 'node'` and
 * `DesktopShell.tsx` pulls the whole shell tree at module eval — the same reason
 * `shellPopupSemantics.test.ts` and `desktopShellTrayNoDuplicates.test.ts` scan. The
 * control block is what stops a scan whose matcher silently found nothing from reporting
 * a pass forever.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { ru } from '../../shared/i18n/catalogs/ru';
import { zh } from '../../shared/i18n/catalogs/zh';

const REPO = resolve(__dirname, '../../..');
const SHELL = 'src/renderer/components/DesktopShell.tsx';
const SHELL_CSS = 'src/renderer/components/shell/shell.css';

const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

/**
 * The `<div className="os-tray">` element's own subtree, brace-aware.
 *
 * Bounded by the JSX indentation the tray closes at rather than by a nesting counter:
 * `</div>` inside a template literal or a comment would defeat a naive count, and the
 * tray is the last child of the taskbar, so its closing tag is the first one at its own
 * indentation. Verified by the control below — the returned slice must contain the clock
 * (the tray's last child) and must NOT contain the task-window strip that precedes it.
 */
function trayMarkup(source: string): string {
  const at = source.indexOf('<div className="os-tray">');
  if (at === -1) return '';
  const indent = at - (source.lastIndexOf('\n', at) + 1);
  const close = source.indexOf(`\n${' '.repeat(indent)}</div>`, at);
  return close === -1 ? '' : source.slice(at, close);
}

/** The `TrayOverflow` function component's own body, from its declaration to the next one. */
function trayOverflowComponent(source: string): string {
  const at = source.indexOf('function TrayOverflow(');
  if (at === -1) return '';
  const end = source.indexOf('\n/** Isolated clock', at);
  return end === -1 ? '' : source.slice(at, end);
}

describe('the tray overflow removes clutter without removing capability', () => {
  it.each([
    ['Widgets', "t('desktop.widgets')"],
    ['Clipboard history', "t('desktop.clipboardHistory')"],
    ['Settings', "t('palette.section.settings')"],
  ])('%s is no longer a button in the taskbar tray itself', (_name, marker) => {
    expect(trayMarkup(read(SHELL))).not.toContain(marker);
  });

  it.each([
    ['Widgets', "t('desktop.widgets')"],
    ['Clipboard history', "t('desktop.clipboardHistory')"],
    ['Settings', "t('palette.section.settings')"],
  ])('%s is still offered, by label, inside the overflow panel', (_name, marker) => {
    const body = trayOverflowComponent(read(SHELL));
    expect(body).toContain(marker);
    // Its label RENDERS — the panel is not a row of the same unlabelled 32px icons.
    expect(body).toContain('<span>{item.label}</span>');
  });

  it('the chevron and the panel agree on one id, so aria-controls cannot point at nothing', () => {
    const source = read(SHELL);
    expect(source).toContain("const TRAY_OVERFLOW_ID = 'os-tray-overflow';");
    expect(source).toContain('aria-controls={TRAY_OVERFLOW_ID}');
    expect(trayOverflowComponent(source)).toContain('id={TRAY_OVERFLOW_ID}');
  });

  it('the moved commands keep the bar\'s own popup contract', () => {
    const body = trayOverflowComponent(read(SHELL));
    // Widgets: a flyout this component owns the open state of, so it declares both.
    expect(body).toMatch(/id: 'widgets',[\s\S]{0,240}?popup: true,[\s\S]{0,80}?expanded: galleryOpen,/);
    // Clipboard: a flyout whose own panel owns the state — popup, but no expanded.
    expect(body).toMatch(/id: 'clipboard',[\s\S]{0,240}?popup: true,/);
    expect(body).not.toMatch(/id: 'clipboard',[\s\S]{0,240}?expanded:/);
    // Settings opens a WINDOW, so it stays a plain command in the panel too.
    expect(body).not.toMatch(/id: 'settings',[\s\S]{0,240}?popup: true,/);
    // …and the descriptors are not inert: the rendered button applies both.
    expect(body).toContain("aria-haspopup={item.popup ? 'dialog' : undefined}");
    expect(body).toContain('aria-expanded={item.expanded}');
  });

  it('the panel has a reverse transition: Escape closes it and focus returns to the chevron', () => {
    const source = read(SHELL);
    expect(trayOverflowComponent(source)).toContain("if (e.key !== 'Escape') return;");
    expect(source).toContain('trayOverflowBtnRef.current?.focus();');
    // Pointer users get the same exit through the shared backdrop the other flyouts use.
    expect(trayOverflowComponent(source)).toContain('className="os-panel-backdrop" onMouseDown={onClose}');
  });

  it('the chevron flips with its state and honours reduced motion', () => {
    const css = read(SHELL_CSS);
    expect(css).toContain(".os-tray-overflow-btn[aria-expanded='true'] svg");
    expect(css).toContain('html.reduce-motion .os-tray-overflow-btn svg');
  });

  it('the label is translated in all four catalogs', () => {
    for (const catalog of [en, ja, ru, zh]) {
      expect(catalog['desktop.tray.hiddenIcons']).toBeTruthy();
    }
    // Not the same string four times — that is what an untranslated copy-paste looks like.
    expect(new Set([en, ja, ru, zh].map((c) => c['desktop.tray.hiddenIcons'])).size).toBe(4);
  });
});

describe('controls — so the scan cannot pass vacuously', () => {
  it('trayMarkup returns the tray and nothing above it', () => {
    const tray = trayMarkup(read(SHELL));
    expect(tray).toContain('os-tray-overflow-btn');
    expect(tray).toContain('<TaskbarClock'); // the tray's last child
    expect(tray).not.toContain('os-task-win'); // the strip that precedes the tray
    expect(tray.length).toBeGreaterThan(400);
  });

  it('trayOverflowComponent returns the panel and not the whole file', () => {
    const source = read(SHELL);
    const body = trayOverflowComponent(source);
    expect(body).toContain('os-flyout--tray');
    expect(body).not.toContain('os-start-btn');
    expect(body.length).toBeLessThan(source.length / 4);
  });

  it('both helpers return empty for a source that lacks their anchor', () => {
    // …so every `not.toContain` above would fail rather than pass on a renamed anchor.
    expect(trayMarkup('<div className="something-else" />')).toBe('');
    expect(trayOverflowComponent('const x = 1;')).toBe('');
  });
});
