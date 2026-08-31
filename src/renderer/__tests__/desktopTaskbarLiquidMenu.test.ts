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
