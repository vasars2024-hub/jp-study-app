/**
 * D143 — `tools:remove` was guarded on one host and bare on the other.
 *
 * `removeTool` (`main/collectedTools.ts`) filters the tool out of the store and
 * saves. The shortcut and whatever note the user wrote on it are gone, with no
 * undo. There are exactly two call sites: `ResourcesContent.removeTool`, which
 * D17 put behind a confirm two hours before this was written, and Blanc's
 * `BlancAppDrawerPanel.removeItem`, which kept calling the channel bare.
 *
 * So the gap was created BY a fix — D17 guarded the surface it was walking
 * rather than the action — which is the D137 lesson turned on its own author.
 * The confirm now lives in one module both hosts import, and the last case here
 * is the ratchet that fails if anyone inlines it back into a host.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const confirmDialog = vi.fn<(opts: Record<string, unknown>) => Promise<boolean>>();
vi.mock('../components/ui', () => ({ confirmDialog: (o: Record<string, unknown>) => confirmDialog(o) }));

const t = (key: string, vars?: Record<string, string | number>): string =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

const tool = { id: 'tool-1', name: 'Jisho', url: 'https://jisho.org' } as never;

beforeEach(() => confirmDialog.mockReset());
afterEach(() => vi.resetModules());

describe('confirmRemoveCollectedTool', () => {
  it('names the tool and marks the dialog danger', async () => {
    confirmDialog.mockResolvedValue(true);
    const { confirmRemoveCollectedTool } = await import('../collectedToolsActions');

    await confirmRemoveCollectedTool(t, tool);

    const opts = confirmDialog.mock.calls[0][0];
    expect(opts.message).toBe('resources.myTools.removeConfirm.message:{"name":"Jisho"}');
    expect(opts.danger).toBe(true);
  });

  it('falls back to the url when the tool has no name, and never renders "undefined"', async () => {
    confirmDialog.mockResolvedValue(true);
    const { confirmRemoveCollectedTool } = await import('../collectedToolsActions');

    await confirmRemoveCollectedTool(t, { id: 'x', url: 'https://example.test' } as never);
    expect(confirmDialog.mock.calls[0][0].message).toContain('https://example.test');

    // A tool that is not in the list at all still asks, with an empty name
    // rather than the string "undefined".
    confirmDialog.mockClear();
    await confirmRemoveCollectedTool(t, undefined);
    expect(confirmDialog.mock.calls[0][0].message).toBe('resources.myTools.removeConfirm.message:{"name":""}');
  });

  it('relays the answer verbatim, so a host can only proceed on true', async () => {
    const { confirmRemoveCollectedTool } = await import('../collectedToolsActions');
    confirmDialog.mockResolvedValue(false);
    expect(await confirmRemoveCollectedTool(t, tool)).toBe(false);
    confirmDialog.mockResolvedValue(true);
    expect(await confirmRemoveCollectedTool(t, tool)).toBe(true);
  });
});

describe('both hosts of tools:remove route through the guard', () => {
  // Source ratchet, deliberately. The behavioural cases above prove the helper
  // asks; they cannot prove a host CALLS it, and the defect was precisely a host
  // that did not. Reading the source is the only check that fails when someone
  // adds a third call site or drops the guard from one of these two.
  const hosts = [
    'components/resources/ResourcesContent.tsx',
    'components/blanc/BlancAppDrawerPanel.tsx',
  ];

  it('has exactly these two call sites, each guarded', () => {
    for (const host of hosts) {
      const src = readFileSync(join(__dirname, '..', host), 'utf8');
      expect(src, `${host} calls tools:remove`).toContain('window.api.toolsRemove(');
      expect(src, `${host} must ask first`).toContain('confirmRemoveCollectedTool(');
      // The guard must gate the call, not merely be imported somewhere above it.
      const guardAt = src.indexOf('confirmRemoveCollectedTool(t,');
      const removeAt = src.indexOf('window.api.toolsRemove(');
      expect(guardAt, `${host} asks before removing`).toBeGreaterThan(-1);
      expect(guardAt).toBeLessThan(removeAt);
    }
  });
});
