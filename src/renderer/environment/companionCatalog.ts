import { hasDiscoveredAero } from '../aeroDiscovery';
import { hasDiscoveredWired } from '../wiredDiscovery';
import type { ShimejiPackId } from './shimejiPacks';
import type { CompanionEdge } from './shimejiPhysics';
import type { VoiceProfile } from './beepSpeech';

export type CompanionTypeId =
  | 'study-buddy'
  | 'critter'
  | 'timekeeper'
  | 'miko-shimeji'
  | 'wired-navi';
export type CompanionMood = 'calm' | 'happy' | 'sleepy' | 'curious' | 'celebrate';
export type CompanionReactivity = 'quiet' | 'normal' | 'playful';
export type CompanionMotion = 'stand' | 'walk' | 'sit' | 'wall' | 'ceiling' | 'fall' | 'drag' | 'celebrate';
export type { CompanionEdge };

export interface CompanionDef {
  id: CompanionTypeId;
  label: string;
  blurb: string;
  /** CSS accent for the body fill. */
  color: string;
  accent: string;
  /** Extra class for silhouette variants. */
  variant?: string;
  /** Sprite pack renderer instead of the CSS-drawn blob body. */
  spritePack?: ShimejiPackId;
  /** Animalese beep-speech profile (local oscillators only). */
  voice?: VoiceProfile;
  /** Secret: only available after the matching discovery. */
  secret?: boolean;
  secretMode?: 'aero' | 'wired';
}

const ALL_COMPANION_DEFS: CompanionDef[] = [
  {
    id: 'study-buddy',
    label: 'Study buddy',
    blurb: 'Cheers when you read or review cards.',
    color: '#ff6b81',
    accent: '#ffd0d7',
    variant: 'shimeji',
    spritePack: 'tamamo',
    voice: { baseHz: 520, wave: 'square', stepPerMora: 38 },
  },
  {
    id: 'critter',
    label: 'Critter',
    blurb: 'Explores the desktop floor and weather.',
    color: '#6b8cff',
    accent: '#c9d6ff',
    variant: 'shimeji',
    spritePack: 'ene',
    voice: { baseHz: 640, wave: 'triangle', stepPerMora: 48 },
  },
  {
    id: 'timekeeper',
    label: 'Timekeeper',
    blurb: 'Shifts mood with morning and night.',
    color: '#e6c35c',
    accent: '#ffe9a8',
    variant: 'shimeji',
    spritePack: 'maka',
    voice: { baseHz: 440, wave: 'sine', stepPerMora: 28 },
  },
  {
    id: 'miko-shimeji',
    label: 'Remilia',
    blurb: 'Aero discovery shimeji. Walks, falls, and climbs the desktop frame.',
    color: '#4bd6cf',
    accent: '#d4fff8',
    variant: 'shimeji',
    spritePack: 'remilia',
    voice: { baseHz: 700, wave: 'square', stepPerMora: 55 },
    secret: true,
    secretMode: 'aero',
  },
  {
    id: 'wired-navi',
    label: 'Fateburn',
    blurb: 'Wired discovery signal-guide shimeji.',
    color: '#4bc7ff',
    accent: '#dff8ff',
    variant: 'wired-navi',
    spritePack: 'fateburn',
    voice: { baseHz: 300, wave: 'sawtooth', stepPerMora: 18 },
    secret: true,
    secretMode: 'wired',
  },
];

export function COMPANION_DEFS(): CompanionDef[] {
  const aero = hasDiscoveredAero();
  const wired = hasDiscoveredWired();
  return ALL_COMPANION_DEFS.filter((d) => {
    if (!d.secret) return true;
    if (d.secretMode === 'wired') return wired;
    return aero;
  });
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
  /** Surface the feet attach to — drives sprite rotation (edge normal). */
  edge?: CompanionEdge;
  /** Horizontal throw / fall velocity (px/s). */
  motionVx?: number;
  /** Live fall velocity (px/s) — accumulated under gravity, see motion/. */
  motionVy?: number;
  /** Subtitle bubble text while beep-speaking. */
  speechBubble?: string;
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
      id: 'c-bonzi',
      typeId: 'miko-shimeji',
      x: Math.max(40, w * 0.72),
      y: Math.max(80, h - 112),
      facing: -1,
      mood: 'curious',
      status: 'Find my treasure…',
      motion: 'walk',
      motionTargetX: Math.max(40, w * 0.22),
    },
    {
      id: 'c-fateburn',
      typeId: 'wired-navi',
      x: Math.max(40, w * 0.86),
      y: Math.max(80, h - 118),
      facing: -1,
      mood: 'curious',
      status: 'Signal acquired',
      motion: 'walk',
      motionTargetX: Math.max(40, w * 0.54),
    },
  ];
}

export function defFor(typeId: CompanionTypeId): CompanionDef {
  const defs = COMPANION_DEFS();
  const hit = defs.find((d) => d.id === typeId);
  if (hit) return hit;
  const fallback = ALL_COMPANION_DEFS.find((d) => d.id === typeId) ?? defs[0] ?? ALL_COMPANION_DEFS[0];
  if (fallback) return fallback;
  return {
    id: 'study-buddy',
    label: 'Study buddy',
    blurb: 'Cheers when you read or review cards.',
    color: '#ff6b81',
    accent: '#ffd0d7',
  };
}
