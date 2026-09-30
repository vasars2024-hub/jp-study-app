// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { EnvironmentSettings, RotationRule, WallpaperPlaylist } from '../environment/types';

vi.mock('../environment/buddyRoutines', () => ({
  mergeBuddyRoutines: (routines: unknown) => (Array.isArray(routines) ? routines : []),
}));

beforeAll(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
});

/** A playlist as the removed Aero pack used to seed it, saved by an older build. */
function legacySecretPlaylist(): WallpaperPlaylist {
  return {
    id: 'secret-aero-default-wallpaper',
    name: 'Secret OS Default',
    transition: 'crossfade',
    transitionMs: 900,
    items: [
      'aero-hillside-companion',
      'aero-coastal-morning',
      'aero-lagoon-night',
      'aero-rain-garden',
      'aero-study-room',
    ].map((ref) => ({ id: `secret-${ref}`, kind: 'preset' as const, ref, label: ref, durationSec: 0 })),
  };
}

const LEGACY_PIN: RotationRule = {
  id: 'secret-aero-default',
  when: { type: 'timeOfDay', fromHour: 0, toHour: 0 },
  itemId: 'secret-aero-hillside-companion',
  priority: 100,
};

describe('the five Aero scenery walls are gone', () => {
  it('no longer offers or resolves them', async () => {
    const { WALL_PRESETS, SELECTABLE_WALL_PRESETS, RETIRED_WALL_PRESET_IDS, getWallPreset } =
      await import('../environment/wallCatalog');
    expect(RETIRED_WALL_PRESET_IDS.size).toBe(5);
    for (const id of RETIRED_WALL_PRESET_IDS) {
      expect(WALL_PRESETS.some((preset) => preset.id === id)).toBe(false);
      expect(SELECTABLE_WALL_PRESETS.some((preset) => preset.id === id)).toBe(false);
    }
    expect(WALL_PRESETS.every((preset) => !preset.css.includes('.svg'))).toBe(true);
    // An unknown id still resolves to something paintable.
    expect(getWallPreset('aero-rain-garden').id).toBe('crimsonveil');
  });

  it('drops them from a saved playlist together with the rule that pinned one', async () => {
    const { stripRetiredWalls } = await import('../environment/environmentStore');
    const mine: WallpaperPlaylist = {
      id: 'pl-mine',
      name: 'Mine',
      transition: 'cut',
      transitionMs: 0,
      items: [
        { id: 'a', kind: 'preset', ref: 'aero-lagoon-night', durationSec: 0 },
        { id: 'b', kind: 'preset', ref: 'night', durationSec: 0 },
        // The owner's own image happens to share a retired name: it must survive.
        { id: 'c', kind: 'image', ref: 'aero-study-room', durationSec: 0 },
      ],
    };
    const keep: RotationRule = { ...LEGACY_PIN, id: 'r-keep', itemId: 'b' };
    const out = stripRetiredWalls([legacySecretPlaylist(), mine], [LEGACY_PIN, keep]);

    // The all-Aero playlist has nothing left, so it goes; the mixed one keeps the rest.
    expect(out.playlists.map((p) => p.id)).toEqual(['pl-mine']);
    expect(out.playlists[0].items.map((i) => i.id)).toEqual(['b', 'c']);
    expect(out.rules).toEqual([keep]);
  });

  it('returns the same arrays when there is nothing to remove', async () => {
    const { stripRetiredWalls } = await import('../environment/environmentStore');
    const playlists: WallpaperPlaylist[] = [
      { id: 'p', name: 'P', transition: 'cut', transitionMs: 0, items: [{ id: 'x', kind: 'preset', ref: 'snow' }] },
    ];
    const rules: RotationRule[] = [];
    const out = stripRetiredWalls(playlists, rules);
    expect(out.playlists).toBe(playlists);
    expect(out.rules).toBe(rules);
  });
});

describe('Secret OS wallpaper seeding', () => {
  it('replaces a saved all-Aero playlist with the built-in light walls', async () => {
    const { refreshSecretWallpaperRefs, SECRET_AERO_PLAYLIST_ID } = await import('../aeroEnvironment');
    const { getWallPreset } = await import('../environment/wallCatalog');
    const env = {
      playlists: [legacySecretPlaylist()],
      rules: [LEGACY_PIN],
      activePlaylistId: SECRET_AERO_PLAYLIST_ID,
    } as unknown as EnvironmentSettings;

    const next = refreshSecretWallpaperRefs(env);
    const secret = next.playlists.find((p) => p.id === SECRET_AERO_PLAYLIST_ID);

    expect(secret?.items.length).toBeGreaterThan(0);
    for (const item of secret?.items ?? []) {
      expect(item.kind).toBe('preset');
      expect(getWallPreset(item.ref).id).toBe(item.ref);
    }
    const pin = next.rules.find((rule) => rule.id === 'secret-aero-default');
    expect(secret?.items.some((item) => item.id === pin?.itemId)).toBe(true);
  });

  it('keeps the owner\'s edits instead of re-seeding on every entry', async () => {
    const { refreshSecretWallpaperRefs, buildSecretAeroWallpaperPlaylist, SECRET_AERO_PLAYLIST_ID } =
      await import('../aeroEnvironment');
    const seeded = buildSecretAeroWallpaperPlaylist();
    // The owner removed the pinned first wall and kept only the second.
    const edited: WallpaperPlaylist = { ...seeded, items: seeded.items.slice(1) };
    const pin: RotationRule = { ...LEGACY_PIN, itemId: seeded.items[0].id };
    const env = { playlists: [edited], rules: [pin] } as unknown as EnvironmentSettings;

    const next = refreshSecretWallpaperRefs(env);

    expect(next.playlists.find((p) => p.id === SECRET_AERO_PLAYLIST_ID)?.items).toEqual(edited.items);
    // The pin pointed at a wall that no longer exists, so it is dropped rather than re-added.
    expect(next.rules.some((rule) => rule.id === 'secret-aero-default')).toBe(false);
  });
});
