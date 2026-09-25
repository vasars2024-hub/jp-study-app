// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

/**
 * Settings ▸ Display & monitors showed a monitor as "display-193337900".
 *
 * Electron's `Display.label` is '' on some Windows driver/adapter combinations, and
 * `displays.ts` falls back to `display-<id>` so the key fingerprint stays unique per
 * panel. That fallback leaked into the summary the Settings page renders. The key
 * must keep it (stored assignments are keyed by it); the label must not.
 */

const h = vi.hoisted(() => ({
  displays: [
    {
      id: 193337900,
      label: '',
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
      workArea: { x: 0, y: 0, width: 1280, height: 672 },
      scaleFactor: 1.5,
    },
    {
      id: 2,
      label: 'DELL U2419H',
      bounds: { x: 853, y: 0, width: 1920, height: 1080 },
      workArea: { x: 853, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1,
    },
  ],
}));

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  screen: {
    getAllDisplays: () => h.displays,
    getPrimaryDisplay: () => h.displays[0],
    getDisplayNearestPoint: () => h.displays[0],
    on: () => undefined,
  },
}));

const { listDisplays, friendlyDisplayLabel, setVirtualDisplayCount } = await import('../displays');

describe('display names', () => {
  it('reports the OS monitor name, and no name rather than the synthetic id', () => {
    const [unnamed, dell] = listDisplays();
    expect(dell.label).toBe('DELL U2419H');
    expect(unnamed.label).toBe('');
    expect(unnamed.label).not.toMatch(/display-\d+/);
  });

  it('keeps the key fingerprint stored assignments are matched by', () => {
    const [unnamed, dell] = listDisplays();
    expect(unnamed.key).toBe('display-193337900|1280x720|1.5');
    expect(dell.key).toBe('dell-u2419h|1920x1080|1');
  });

  it('gives simulated displays no English name (the page tags and numbers them)', () => {
    setVirtualDisplayCount(1);
    try {
      const sim = listDisplays().find((d) => d.virtual);
      expect(sim?.label).toBe('');
      expect(sim?.key.startsWith('simulated-')).toBe(true);
    } finally {
      setVirtualDisplayCount(0);
    }
  });

  it('friendlyDisplayLabel trims and rejects only the synthetic fallback', () => {
    expect(friendlyDisplayLabel({ id: 5, label: '  LG HDR 4K ' })).toBe('LG HDR 4K');
    expect(friendlyDisplayLabel({ id: 5, label: 'display-5' })).toBe('');
    expect(friendlyDisplayLabel({ id: 5, label: undefined })).toBe('');
    // Another display's id is a real (if odd) name, not our fallback for this one.
    expect(friendlyDisplayLabel({ id: 5, label: 'display-6' })).toBe('display-6');
  });
});
