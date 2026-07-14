import { hasDiscoveredAero } from '../aeroDiscovery';

export type CompanionTypeId = 'study-buddy' | 'critter' | 'timekeeper' | 'noctis' | 'miko-shimeji';
export type CompanionMood = 'calm' | 'happy' | 'sleepy' | 'curious' | 'celebrate';
export type CompanionReactivity = 'quiet' | 'normal' | 'playful';
export type CompanionMotion = 'stand' | 'walk' | 'sit' | 'wall' | 'ceiling' | 'fall' | 'drag' | 'celebrate';

export interface CompanionDef {
  id: CompanionTypeId;
  label: string;
  blurb: string;
  /** CSS accent for the body fill. */
  color: string;
  accent: string;
  /** Extra class for silhouette variants. */
  variant?: string;
  /** Sprite renderer instead of the CSS-drawn blob body. */
  sprite?: 'miko-shimeji';
  /** Secret: only available after Aero discovery. */
  secret?: boolean;
}

const ALL_COMPANION_DEFS: CompanionDef[] = [
  {
    id: 'study-buddy',
    label: 'Study buddy',
    blurb: 'Cheers when you read or review cards.',
    color: '#ff6b81',
    accent: '#ffd0d7',
  },
  {
    id: 'critter',
    label: 'Critter',
    blurb: 'Explores the desktop floor and weather.',
    color: '#6b8cff',
    accent: '#c9d6ff',
  },
  {
    id: 'timekeeper',
    label: 'Timekeeper',
    blurb: 'Shifts mood with morning and night.',
    color: '#e6c35c',
    accent: '#ffe9a8',
  },
  {
    id: 'noctis',
    label: 'Noctis emissary',
    blurb: 'A quiet light from the city — reacts to study as growth.',
    color: '#7c5cff',
    accent: '#c4b5fd',
    variant: 'noctis',
  },
  {
    id: 'miko-shimeji',
    label: 'Hatsune Miko',
    blurb: 'Secret OS Shimeji pet. Walks, falls, and climbs the desktop frame.',
    color: '#4bd6cf',
    accent: '#d4fff8',
    variant: 'shimeji',
    sprite: 'miko-shimeji',
    secret: true,
  },
];

export function COMPANION_DEFS(): CompanionDef[] {
  return ALL_COMPANION_DEFS.filter((d) => !d.secret || hasDiscoveredAero());
}

export interface CompanionInstance {
  id: string;
  typeId: CompanionTypeId;
  x: number;
  y: number;
  facing: 1 | -1;
  mood: CompanionMood;
  locked?: boolean;
  /** Hidden until this timestamp (ms). */
  hiddenUntil?: number;
  status?: string;
  /** Programmable routines (see buddyRoutines.ts). Empty = type defaults. */
  primaryRoutineId?: string;
  secondaryRoutineId?: string;
  menuRoutineIds?: string[];
  /** Sprite movement state for Shimeji-style companions. */
  motion?: CompanionMotion;
  motionTargetX?: number;
  motionTargetY?: number;
  motionSide?: 'left' | 'right';
}

export function defaultCompanions(w = 900, h = 500): CompanionInstance[] {
  return [
    {
      id: 'c-buddy',
      typeId: 'study-buddy',
      x: Math.max(40, w * 0.18),
      y: Math.max(80, h * 0.55),
      facing: 1,
      mood: 'calm',
      status: 'Ready to study',
    },
    {
      id: 'c-critter',
      typeId: 'critter',
      x: Math.max(40, w * 0.55),
      y: Math.max(80, h * 0.72),
      facing: -1,
      mood: 'curious',
      status: 'Exploring',
    },
    {
      id: 'c-time',
      typeId: 'timekeeper',
      x: Math.max(40, w * 0.78),
      y: Math.max(80, h * 0.4),
      facing: 1,
      mood: 'calm',
      status: 'Watching the clock',
    },
    {
      id: 'c-noctis',
      typeId: 'noctis',
      x: Math.max(40, w * 0.38),
      y: Math.max(80, h * 0.48),
      facing: 1,
      mood: 'calm',
      status: 'Listening for light',
    },
    {
      id: 'c-miko',
      typeId: 'miko-shimeji',
      x: Math.max(40, w * 0.72),
      y: Math.max(80, h - 112),
      facing: -1,
      mood: 'curious',
      status: 'Find my treasure…',
      motion: 'walk',
      motionTargetX: Math.max(40, w * 0.22),
    },
  ];
}

export function defFor(typeId: CompanionTypeId): CompanionDef {
  const defs = COMPANION_DEFS();
  const hit = defs.find((d) => d.id === typeId);
  if (hit) return hit;
  return ALL_COMPANION_DEFS.find((d) => d.id === typeId) ?? defs[0] ?? ALL_COMPANION_DEFS[0]!;
}
