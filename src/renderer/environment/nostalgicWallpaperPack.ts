import type { WallpaperDefinition, WallpaperPack } from './wallpaperFramework';
import type { WallPreset } from './wallCatalog';
import type { RotationRule, WallpaperPlaylist } from './types';

export const NOSTALGIC_WALLPAPER_PACK_ID = 'secret-aero-nostalgia';
export const DEFAULT_NOSTALGIC_WALLPAPER_ID = 'aero-hillside-companion';
export const SECRET_AERO_PLAYLIST_ID = 'secret-aero-default-wallpaper';

const ASSET_URLS = {
  'aero-hillside-companion': new URL(
    '../assets/wallpapers/aero-hillside-companion.svg',
    import.meta.url,
  ).href,
  'aero-coastal-morning': new URL(
    '../assets/wallpapers/aero-coastal-morning.svg',
    import.meta.url,
  ).href,
  'aero-lagoon-night': new URL(
    '../assets/wallpapers/aero-lagoon-night.svg',
    import.meta.url,
  ).href,
  'aero-rain-garden': new URL(
    '../assets/wallpapers/aero-rain-garden.svg',
    import.meta.url,
  ).href,
  'aero-study-room': new URL(
    '../assets/wallpapers/aero-study-room.svg',
    import.meta.url,
  ).href,
} as const;

type NostalgicAssetName = keyof typeof ASSET_URLS;

const assetUrl = (name: NostalgicAssetName): string => ASSET_URLS[name];

const FALLBACKS = {
  day: 'linear-gradient(160deg, #43bdec 0%, #d9f7ff 45%, #74c565 67%, #087fae 100%)',
  coast: 'linear-gradient(160deg, #55c8f0 0%, #e8fbff 46%, #74c565 68%, #087dad 100%)',
  night: 'linear-gradient(160deg, #102b61 0%, #316b9b 52%, #317d61 73%, #092f59 100%)',
  rain: 'linear-gradient(160deg, #6b9fb2 0%, #d4eee7 48%, #4b9b72 70%, #397f88 100%)',
  room: 'linear-gradient(160deg, #dff6ef 0%, #a9d7c8 66%, #6fae88 100%)',
} as const;

function background(name: NostalgicAssetName, fallback: string): string {
  return `url("${assetUrl(name)}"), ${fallback}`;
}

export const NOSTALGIC_WALLPAPERS: readonly WallpaperDefinition[] = [
  {
    id: DEFAULT_NOSTALGIC_WALLPAPER_ID,
    label: 'Sunlit Hillside',
    kind: 'static',
    category: 'nature',
    tags: ['aero', 'day', 'scenery', 'readable-icons'],
    css: background('aero-hillside-companion', FALLBACKS.day),
    thumbnail: assetUrl('aero-hillside-companion'),
    packId: NOSTALGIC_WALLPAPER_PACK_ID,
  },
  {
    id: 'aero-coastal-morning',
    label: 'Coastal Morning',
    kind: 'static',
    category: 'ocean',
    tags: ['aero', 'day', 'scenery', 'readable-icons'],
    css: background('aero-coastal-morning', FALLBACKS.coast),
    thumbnail: assetUrl('aero-coastal-morning'),
    packId: NOSTALGIC_WALLPAPER_PACK_ID,
  },
  {
    id: 'aero-lagoon-night',
    label: 'Lagoon Night',
    kind: 'static',
    category: 'nature',
    tags: ['aero', 'night', 'scenery', 'readable-icons'],
    css: background('aero-lagoon-night', FALLBACKS.night),
    thumbnail: assetUrl('aero-lagoon-night'),
    packId: NOSTALGIC_WALLPAPER_PACK_ID,
  },
  {
    id: 'aero-rain-garden',
    label: 'Rain Garden',
    kind: 'static',
    category: 'nature',
    tags: ['aero', 'rain', 'scenery', 'readable-icons'],
    css: background('aero-rain-garden', FALLBACKS.rain),
    thumbnail: assetUrl('aero-rain-garden'),
    packId: NOSTALGIC_WALLPAPER_PACK_ID,
  },
  {
    id: 'aero-study-room',
    label: 'Sunlit Study Room',
    kind: 'static',
    category: 'minimal',
    tags: ['aero', 'room', 'study', 'scenery', 'readable-icons'],
    css: background('aero-study-room', FALLBACKS.room),
    thumbnail: assetUrl('aero-study-room'),
    packId: NOSTALGIC_WALLPAPER_PACK_ID,
  },
] as const;

export const NOSTALGIC_WALLPAPER_PACK: WallpaperPack = {
  id: NOSTALGIC_WALLPAPER_PACK_ID,
  label: 'Secret Aero Nostalgia',
  description: 'Original offline scenery for the Secret OS.',
  wallpaperIds: NOSTALGIC_WALLPAPERS.map((wallpaper) => wallpaper.id),
};

export const NOSTALGIC_WALL_PRESETS: readonly WallPreset[] = NOSTALGIC_WALLPAPERS.map(
  (wallpaper) => ({
    id: wallpaper.id,
    label: wallpaper.label,
    css: wallpaper.css ?? FALLBACKS.day,
    tags: wallpaper.tags,
    packId: NOSTALGIC_WALLPAPER_PACK_ID,
  }),
);

export function buildNostalgicWallpaperPlaylist(): WallpaperPlaylist {
  return {
    id: SECRET_AERO_PLAYLIST_ID,
    name: 'Secret OS Default',
    transition: 'crossfade',
    transitionMs: 900,
    items: NOSTALGIC_WALLPAPERS.map((wallpaper) => ({
      id: `secret-${wallpaper.id}`,
      kind: 'preset',
      ref: wallpaper.id,
      label: wallpaper.label,
      tags: ['secret', ...(wallpaper.tags ?? [])],
      durationSec: 0,
    })),
  };
}

export function buildNostalgicDefaultRule(): RotationRule {
  return {
    id: 'secret-aero-default',
    when: { type: 'timeOfDay', fromHour: 0, toHour: 0 },
    itemId: `secret-${DEFAULT_NOSTALGIC_WALLPAPER_ID}`,
    priority: 100,
  };
}
