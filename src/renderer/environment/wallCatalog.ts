/** Shared wallpaper presets for the desktop shell and living-layer rotation. */

export interface WallPreset {
  id: string;
  label: string;
  css: string;
  animated?: boolean;
  /** Tags used by rotation / particle suggestions. */
  tags?: string[];
}

export const WALL_PRESETS: WallPreset[] = [
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
];

export function getWallPreset(id: string | undefined): WallPreset {
  return WALL_PRESETS.find((p) => p.id === id) ?? WALL_PRESETS[0];
}
