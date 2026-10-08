/** Shared wallpaper presets for the desktop shell and living-layer rotation. */

export interface WallPreset {
  id: string;
  label: string;
  css: string;
  animated?: boolean;
  /** Tags used by rotation / particle suggestions. */
  tags?: string[];
  /** Owning framework pack. Presets without one belong to the core pack. */
  packId?: string;
}

const CORE_WALL_PRESETS: WallPreset[] = [
  {
    id: 'crimsonveil',
    label: 'Crimson Veil',
    css: 'radial-gradient(1100px 640px at 78% -12%, rgba(255,46,77,0.16), transparent), radial-gradient(900px 520px at 8% 112%, rgba(255,107,129,0.10), transparent), #14131a',
    tags: ['night', 'study'],
  },
  {
    id: 'aurora',
    label: 'Aurora',
    css: 'linear-gradient(120deg, #17121e, #3a1030, #6a1030, #2a1030, #17121e)',
    animated: true,
    tags: ['night', 'evening'],
  },
  {
    id: 'ember',
    label: 'Ember',
    css: 'linear-gradient(130deg, #150d10, #3d0f1a, #7a1520, #3d0f1a, #150d10)',
    animated: true,
    tags: ['evening', 'warm'],
  },
  {
    id: 'night',
    label: 'Night',
    css: 'linear-gradient(160deg, #0c0b12 0%, #171526 55%, #241326 100%)',
    tags: ['night'],
  },
  {
    id: 'snow',
    label: 'Snow',
    css: 'linear-gradient(160deg, #e9e6ee 0%, #f6f3f8 50%, #ffffff 100%)',
    tags: ['day', 'winter', 'morning'],
  },
  {
    id: 'ink',
    label: 'Ink',
    css: '#100f15',
    tags: ['night', 'study'],
  },
  {
    id: 'dawn',
    label: 'Dawn',
    css: 'linear-gradient(160deg, #2a1a28 0%, #6a3a40 40%, #c4785a 70%, #f0c9a0 100%)',
    tags: ['morning', 'day'],
  },
  {
    id: 'midday',
    label: 'Midday',
    css: 'linear-gradient(160deg, #87b8d4 0%, #c5dff0 45%, #eef6fb 100%)',
    tags: ['day', 'afternoon'],
  },
  {
    id: 'dusk',
    label: 'Dusk',
    css: 'linear-gradient(160deg, #1a1528 0%, #4a2860 35%, #c45a40 70%, #f0a060 100%)',
    tags: ['evening'],
  },
  /*
   * Frutiger Aero scenery (Vista pass). Pure CSS image layers — no files, no
   * `.svg` — and original compositions in the era's idiom: light ribbons over
   * teal, glossy bubbles over a lagoon, rolling hills under a bright sky. Each
   * value is used as `background-image`, so it must be image layers only (no
   * trailing colour). The Aero playlist seeds these (aeroEnvironment.ts); the
   * harmony wall also gets drifting ribbons on the live desktop (aero-vista.css).
   */
  {
    id: 'harmony-aurora',
    label: 'Harmony Aurora',
    css: [
      'radial-gradient(150% 95% at 8% 122%, rgba(255,255,255,0) 61%, rgba(196,255,232,0.62) 63.2%, rgba(255,255,255,0.85) 63.8%, rgba(150,240,214,0.28) 65.4%, rgba(255,255,255,0) 68%)',
      'radial-gradient(170% 105% at 92% 128%, rgba(255,255,255,0) 58%, rgba(170,236,255,0.5) 60.6%, rgba(240,255,255,0.7) 61.2%, rgba(120,210,240,0.2) 63.4%, rgba(255,255,255,0) 66.5%)',
      'radial-gradient(135% 85% at 36% 134%, rgba(255,255,255,0) 63%, rgba(255,255,255,0.42) 65%, rgba(255,255,255,0) 68.5%)',
      'radial-gradient(120% 60% at 64% 118%, rgba(255,255,255,0) 66%, rgba(178,255,196,0.36) 68.5%, rgba(255,255,255,0) 72%)',
      'conic-gradient(from 214deg at 18% 112%, rgba(255,255,255,0) 0deg, rgba(170,255,222,0.2) 16deg, rgba(255,255,255,0) 34deg, rgba(130,222,255,0.16) 58deg, rgba(255,255,255,0) 84deg, rgba(255,255,255,0) 360deg)',
      'radial-gradient(70% 55% at 78% 8%, rgba(150,236,255,0.45), rgba(150,236,255,0) 70%)',
      'radial-gradient(90% 60% at 50% 112%, rgba(214,255,226,0.55), rgba(214,255,226,0) 68%)',
      'linear-gradient(168deg, #06505f 0%, #0c7d86 30%, #17a294 56%, #4cc69c 80%, #a8ecc6 100%)',
    ].join(', '),
    tags: ['day', 'aero', 'aurora'],
  },
  {
    id: 'bubble-lagoon',
    label: 'Bubble Lagoon',
    css: [
      // Bubbles: a specular highlight layer over a rimmed body layer each.
      'radial-gradient(circle 13px at calc(24% - 13px) calc(63% - 15px), rgba(255,255,255,0.95), rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 44px at 24% 63%, rgba(255,255,255,0.08) 0 66%, rgba(170,232,255,0.26) 84%, rgba(255,255,255,0.8) 95%, rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 8px at calc(34% - 8px) calc(79% - 9px), rgba(255,255,255,0.95), rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 26px at 34% 79%, rgba(255,255,255,0.08) 0 64%, rgba(170,232,255,0.26) 84%, rgba(255,255,255,0.78) 95%, rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 18px at calc(71% - 18px) calc(57% - 21px), rgba(255,255,255,0.95), rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 62px at 71% 57%, rgba(255,255,255,0.07) 0 68%, rgba(170,232,255,0.24) 85%, rgba(255,255,255,0.78) 95.5%, rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 6px at calc(80% - 6px) calc(80% - 7px), rgba(255,255,255,0.95), rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 19px at 80% 80%, rgba(255,255,255,0.08) 0 62%, rgba(170,232,255,0.26) 84%, rgba(255,255,255,0.78) 95%, rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 5px at calc(58% - 5px) calc(88% - 6px), rgba(255,255,255,0.95), rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 14px at 58% 88%, rgba(255,255,255,0.08) 0 60%, rgba(170,232,255,0.26) 84%, rgba(255,255,255,0.78) 95%, rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 9px at calc(13% - 9px) calc(36% - 10px), rgba(255,255,255,0.9), rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 30px at 13% 36%, rgba(255,255,255,0.06) 0 66%, rgba(200,240,255,0.22) 84%, rgba(255,255,255,0.7) 95%, rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 7px at calc(86% - 7px) calc(30% - 8px), rgba(255,255,255,0.9), rgba(255,255,255,0) 100%)',
      'radial-gradient(circle 22px at 86% 30%, rgba(255,255,255,0.06) 0 64%, rgba(200,240,255,0.22) 84%, rgba(255,255,255,0.7) 95%, rgba(255,255,255,0) 100%)',
      // Light on the water line, caustic shimmer below it, then sky into lagoon.
      'radial-gradient(65% 9% at 50% 47%, rgba(255,255,255,0.85), rgba(255,255,255,0) 72%)',
      'radial-gradient(50% 30% at 50% 100%, rgba(120,255,226,0.32), rgba(120,255,226,0) 70%)',
      'linear-gradient(180deg, #58c4f4 0%, #a6e4fb 30%, #e6fbff 45.5%, #7fd8ec 47%, #2fb0d4 58%, #1186b8 78%, #0a5a8a 100%)',
    ].join(', '),
    tags: ['day', 'aero', 'water'],
  },
  {
    id: 'green-hills',
    label: 'Green Hills',
    css: [
      // Sunlit crest on the near hill.
      'radial-gradient(46% 12% at 28% 76%, rgba(234,255,196,0.26), rgba(234,255,196,0) 72%)',
      // Near hill (left), then far hill (right) — hard edges for a clean silhouette.
      'radial-gradient(ellipse 74% 36% at 26% 104%, #9be863 0%, #5cc63c 46%, #2f9a2b 98.6%, rgba(47,154,43,0) 100%)',
      'radial-gradient(40% 10% at 80% 68%, rgba(226,255,190,0.22), rgba(226,255,190,0) 72%)',
      'radial-gradient(ellipse 82% 44% at 84% 108%, #b3ee77 0%, #79d24f 48%, #3f9f34 98.6%, rgba(63,159,52,0) 100%)',
      // Soft clouds.
      'radial-gradient(ellipse 13% 5% at 22% 24%, rgba(255,255,255,0.95), rgba(255,255,255,0) 72%)',
      'radial-gradient(ellipse 9% 4.5% at 29% 21%, rgba(255,255,255,0.9), rgba(255,255,255,0) 72%)',
      'radial-gradient(ellipse 16% 5.5% at 66% 15%, rgba(255,255,255,0.88), rgba(255,255,255,0) 72%)',
      'radial-gradient(ellipse 10% 4% at 74% 12%, rgba(255,255,255,0.85), rgba(255,255,255,0) 72%)',
      'radial-gradient(ellipse 12% 4% at 46% 36%, rgba(255,255,255,0.6), rgba(255,255,255,0) 72%)',
      // Sun glow and sky.
      'radial-gradient(40% 32% at 88% 4%, rgba(255,252,220,0.75), rgba(255,252,220,0) 70%)',
      'linear-gradient(180deg, #1f7fd8 0%, #4aa6ee 32%, #9ad3f7 62%, #dcf2ff 100%)',
    ].join(', '),
    tags: ['day', 'aero', 'nature'],
  },
];

/** Every preset the app can resolve. */
export const WALL_PRESETS: WallPreset[] = [...CORE_WALL_PRESETS];

/** Presets a user may choose in a picker. */
export const SELECTABLE_WALL_PRESETS: WallPreset[] = [...CORE_WALL_PRESETS];

/**
 * Preset ids that shipped once and were removed (the five Aero scenery walls).
 * Saved playlists can still reference them; `getWallPreset` would paint those
 * as Crimson Veil under their old label, so the environment store drops the
 * items on load instead (see `stripRetiredWalls`).
 */
export const RETIRED_WALL_PRESET_IDS: ReadonlySet<string> = new Set([
  'aero-hillside-companion',
  'aero-coastal-morning',
  'aero-lagoon-night',
  'aero-rain-garden',
  'aero-study-room',
]);

export function getWallPreset(id: string | undefined): WallPreset {
  return WALL_PRESETS.find((p) => p.id === id) ?? CORE_WALL_PRESETS[0];
}
