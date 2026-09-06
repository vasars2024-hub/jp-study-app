import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '..', 'components', 'DesktopShell.tsx'), 'utf8')
  .replace(/\r\n?/g, '\n');

function taskbarMenuBlock(): string {
  const start = source.indexOf('<ContextMenu\n        open={!!taskCtx}');
  const end = source.indexOf('<ContextMenu\n        open={!!ctxPos}', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('taskbar context menu — Liquid presentation entry point', () => {
  it('offers the same reversible command as the title bar', () => {
    const menu = taskbarMenuBlock();
    expect(menu).toContain("id: 'toggle-liquid'");
    expect(menu).toContain("t('desktop.makeLiquid')");
    expect(menu).toContain("t('desktop.returnToStandard')");
    expect(menu).toContain('onSelect: () => toggleLiquid(taskCtx.win.id)');
  });

  it('uses the shared presentability predicate instead of forcing every window Liquid', () => {
    const menu = taskbarMenuBlock();
    expect(menu).toContain('canPresentLiquid(taskCtx.win.section)');
    expect(menu).toContain('isWinLiquid(taskCtx.win)');
    expect(menu).not.toMatch(/taskCtx\.win\.section\s*[!=]==?\s*['"]/);
  });
});

/**
 * D67 — the mini player is the one taskbar entry that deliberately renders no wordmark, and
 * that visible choice took the button's NAME with it. Measured live 2026-09-06 on the running
 * desk: its taskbar button had `title=""`, no `aria-label`, and its only text content was its
 * own `×`; the close affordance fell through to `w.section` and read **"Close musicwidget"**,
 * an internal id, in every language. Its neighbour read `title="Music"` / "Close Music".
 *
 * `taskName` is the fix: the visible `label` may still be empty, the name may not be.
 */
function taskButtonBlock(): string {
  const start = source.indexOf('<div className="os-task-wins">');
  const end = source.indexOf('className="os-task-close"', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 900);
}

describe('every taskbar button has a name, including the icon-only one', () => {
  it('keeps the wordmark optional and the name mandatory', () => {
    const block = taskButtonBlock();
    // The visible span is still gated on `label`, so the icon-only entry stays icon-only.
    expect(block).toContain('{label ? <span>{label}</span> : null}');
    expect(block).toContain('title={wired ? wiredModuleLabel(w.section) : taskName}');
    expect(block).toContain('aria-label={wired ? wiredModuleLabel(w.section) : taskName}');
  });

  it('names the mini player from the catalogue rather than falling through to its section id', () => {
    const block = taskButtonBlock();
    expect(block).toContain("t('settings.mini.app.musicwidget')");
    expect(block).toContain("t('desktop.task.close', { name: taskName })");
    expect(block, 'the raw section id is back in a user-visible string')
      .not.toContain('{ name: label || w.section }');
  });
});
