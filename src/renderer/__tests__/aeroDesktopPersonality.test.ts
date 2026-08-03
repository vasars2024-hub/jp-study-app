// @vitest-environment node
/**
 * Phase 5 · M8 — first-run desktop personality.
 *
 * The interesting failures are not "does it add widgets" but "does it ever add
 * them a second time" and "does it refuse to touch a desktop the user already
 * put something on" — those are the two ways a first-run seed turns into a
 * standing annoyance instead of a one-time surprise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopLayout, DesktopLayoutSnapshot, WindowSnapshot, IconSnapshot } from '../../shared/desktop';

function seedLayout(index: 0 | 1 = 0): DesktopLayout {
  return {
    desktopIndex: index,
    windows: [] as WindowSnapshot[],
    icons: [] as IconSnapshot[],
    notes: {},
    widgets: [],
    wallpaper: { kind: 'preset' as const, id: 'crimsonveil' },
    layoutEpoch: 1,
  };
}

function makeApiStub(): {
  api: {
    onDesktopChanged: (cb: (snap: DesktopLayoutSnapshot) => void) => () => void;
    desktopGetLayout: () => Promise<DesktopLayoutSnapshot>;
    desktopCommitLayout: (index: 0 | 1, layout: unknown) => Promise<{ ok: boolean }>;
  };
  commits: unknown[];
  setSnapshot: (next: DesktopLayoutSnapshot) => void;
} {
  let snapshot: DesktopLayoutSnapshot = {
    activeDesktopIndex: 0,
    viewports: [seedLayout(0), seedLayout(1)],
    globalZTop: 10,
    switching: false,
  };
  const commits: unknown[] = [];
  // The real main process broadcasts `desktop:changed` to every window after
  // every commitLayout (src/main/desktop.ts `broadcast()`), which is how
  // desktopState.ts's in-memory snapshot stays current without a re-fetch.
  // Mirror that here — a stub that only echoes desktopGetLayout's first read
  // would hide a double-commit bug behind a stale-cache false negative.
  let onChanged: (snap: DesktopLayoutSnapshot) => void = () => undefined;
  return {
    api: {
      onDesktopChanged: (cb: (snap: DesktopLayoutSnapshot) => void) => {
        onChanged = cb;
        return () => undefined;
      },
      desktopGetLayout: async (): Promise<DesktopLayoutSnapshot> => snapshot,
      desktopCommitLayout: async (index: 0 | 1, layout: unknown) => {
        commits.push({ index, layout });
        snapshot = {
          ...snapshot,
          viewports: snapshot.viewports.map((v) => (v.desktopIndex === index ? (layout as (typeof v)) : v)),
        };
        onChanged(snapshot);
        return { ok: true };
      },
    },
    commits,
    setSnapshot: (next: DesktopLayoutSnapshot) => {
      snapshot = next;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (): string | null => null,
    setItem: (): void => undefined,
    removeItem: (): void => undefined,
  });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

// The widget registry (renderer/widgets/registry.tsx) pulls in the full React
// widget component tree, which in turn touches browser globals this suite
// deliberately doesn't stub — checking sizes against it belongs in a DOM-level
// test, not here. This suite hard-codes the two expected sizes instead, so a
// registry default drifting out from under the seed still fails loudly.
const EXPECTED_SIZES: Record<string, { w: number; h: number }> = {
  'clock-analog': { w: 200, h: 200 },
  'word-of-the-day': { w: 260, h: 160 },
};

describe('buildAeroPersonalityWidgets (pure)', () => {
  it('seeds a clock and a word-of-the-day widget onto an empty desktop', async () => {
    const { buildAeroPersonalityWidgets } = await import('../aeroDesktopPersonality');
    const widgets = buildAeroPersonalityWidgets([], 10);
    expect(widgets.map((w) => w.type)).toEqual(['clock-analog', 'word-of-the-day']);
    expect(widgets.every((w) => w.z > 10)).toBe(true);
    // Unique, stable ids so a second call against the (now non-empty) result
    // cannot double-add — belt-and-braces on top of the length check below.
    expect(new Set(widgets.map((w) => w.id)).size).toBe(widgets.length);
  });

  it('adds nothing to a desktop that already carries any widget', async () => {
    const { buildAeroPersonalityWidgets } = await import('../aeroDesktopPersonality');
    const existing = [{ id: 'user-clock', type: 'clock-digital', x: 0, y: 0, w: 240, h: 140, z: 1 }];
    expect(buildAeroPersonalityWidgets(existing, 10)).toEqual([]);
  });

  it('is a no-op the second time it is run against its own output', async () => {
    const { buildAeroPersonalityWidgets } = await import('../aeroDesktopPersonality');
    const first = buildAeroPersonalityWidgets([], 10);
    const second = buildAeroPersonalityWidgets(first, 10);
    expect(second).toEqual([]);
  });

  it('matches the widget registry default sizes, so the seed looks gallery-placed', async () => {
    const { buildAeroPersonalityWidgets } = await import('../aeroDesktopPersonality');
    for (const w of buildAeroPersonalityWidgets([], 10)) {
      expect({ w: w.w, h: w.h }, w.type).toEqual(EXPECTED_SIZES[w.type]);
    }
  });
});

describe('seedAeroDesktopPersonality (wired)', () => {
  it('commits the curated pair onto the active, empty desktop', async () => {
    const stub = makeApiStub();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { api: stub.api }));
    const { initDesktopState } = await import('../desktopState');
    await initDesktopState();

    const { seedAeroDesktopPersonality } = await import('../aeroDesktopPersonality');
    await seedAeroDesktopPersonality();

    expect(stub.commits).toHaveLength(1);
    const committed = (stub.commits[0] as { layout: { widgets: { type: string }[] } }).layout;
    expect(committed.widgets.map((w) => w.type)).toEqual(['clock-analog', 'word-of-the-day']);
  });

  it('does not commit anything for a desktop that already has widgets', async () => {
    const stub = makeApiStub();
    stub.setSnapshot({
      activeDesktopIndex: 0,
      viewports: [
        {
          ...seedLayout(0),
          widgets: [{ id: 'user-clock', type: 'clock-digital', x: 0, y: 0, w: 240, h: 140, z: 1 }],
        },
        seedLayout(1),
      ],
      globalZTop: 10,
      switching: false,
    });
    vi.stubGlobal('window', Object.assign(new EventTarget(), { api: stub.api }));
    const { initDesktopState } = await import('../desktopState');
    await initDesktopState();

    const { seedAeroDesktopPersonality } = await import('../aeroDesktopPersonality');
    await seedAeroDesktopPersonality();

    expect(stub.commits).toHaveLength(0);
  });

  it('is safe to call twice — the second call is a no-op', async () => {
    const stub = makeApiStub();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { api: stub.api }));
    const { initDesktopState } = await import('../desktopState');
    await initDesktopState();

    const { seedAeroDesktopPersonality } = await import('../aeroDesktopPersonality');
    await seedAeroDesktopPersonality();
    await seedAeroDesktopPersonality();

    expect(stub.commits).toHaveLength(1);
  });
});
