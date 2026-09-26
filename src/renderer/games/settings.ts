import type { LevelTier } from '../../shared/levelScale';
import {
  DEFAULT_KANA_SELECTION,
  KANA_GROUPS,
  type KanaGroupId,
  type KanaScript,
  type KanaSelection,
} from './kanaGroups';
import type { SourceLang } from './types';
import { writeLocalStorageJson } from '../localStorageWrite';

export type ArenaLevelOverride = 'auto' | LevelTier;
export type MirrorEvaluatorBackend = 'local' | 'api';

export interface GameArenaSettings {
  gameLength: number;
  sourceLang: SourceLang;
  levelOverride: ArenaLevelOverride;
  sounds: boolean;
  mirrorBackend: MirrorEvaluatorBackend;
  mirrorApiUrl: string;
  mirrorApiKey: string;
  /** Kana Sprint scope — auto widens with progress, manual is the user's pick. */
  kana: KanaSelection;
  /**
   * What the fast games draw from: `auto` is the bundled pack plus the deck and
   * every imported list; `folder:<name>` is one flashcard deck folder;
   * `list:<id>` is one imported word list — "make a game from my list".
   */
  material: string;
}

const KEY = 'jp-game-arena-settings-v1';
export const GAME_ARENA_SETTINGS_EVENT = 'game-arena-settings-changed';

export const DEFAULT_GAME_ARENA_SETTINGS: GameArenaSettings = {
  gameLength: 5,
  sourceLang: 'en',
  levelOverride: 'auto',
  sounds: true,
  mirrorBackend: 'local',
  mirrorApiUrl: '',
  mirrorApiKey: '',
  kana: DEFAULT_KANA_SELECTION,
  material: 'auto',
};

function validSourceLang(value: unknown): value is SourceLang {
  return value === 'en' || value === 'ru' || value === 'zh';
}

const VALID_SCRIPTS: readonly KanaScript[] = ['hiragana', 'katakana'];
const VALID_GROUPS: readonly KanaGroupId[] = KANA_GROUPS.map((g) => g.id);

function sanitizeKana(value: unknown): KanaSelection {
  if (!value || typeof value !== 'object') return DEFAULT_KANA_SELECTION;
  const raw = value as Partial<KanaSelection>;
  const scripts = Array.isArray(raw.scripts)
    ? VALID_SCRIPTS.filter((s) => raw.scripts?.includes(s))
    : [];
  const groups = Array.isArray(raw.groups)
    ? VALID_GROUPS.filter((g) => raw.groups?.includes(g))
    : [];
  return {
    mode: raw.mode === 'manual' ? 'manual' : 'auto',
    // An empty manual selection would filter every kana out; fall back rather
    // than persist an unplayable scope.
    scripts: scripts.length ? scripts : DEFAULT_KANA_SELECTION.scripts,
    groups: groups.length ? groups : DEFAULT_KANA_SELECTION.groups,
  };
}

function validMaterial(value: unknown): value is string {
  return value === 'auto' || (typeof value === 'string' && /^(folder|list):.+/.test(value));
}

function validLevelOverride(value: unknown): value is ArenaLevelOverride {
  return value === 'auto' || value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6 || value === 7;
}

export function loadGameArenaSettings(): GameArenaSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_GAME_ARENA_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameArenaSettings>;
    return {
      gameLength: Math.min(12, Math.max(3, Math.round(Number(parsed.gameLength) || DEFAULT_GAME_ARENA_SETTINGS.gameLength))),
      sourceLang: validSourceLang(parsed.sourceLang) ? parsed.sourceLang : DEFAULT_GAME_ARENA_SETTINGS.sourceLang,
      levelOverride: validLevelOverride(parsed.levelOverride) ? parsed.levelOverride : DEFAULT_GAME_ARENA_SETTINGS.levelOverride,
      sounds: typeof parsed.sounds === 'boolean' ? parsed.sounds : DEFAULT_GAME_ARENA_SETTINGS.sounds,
      mirrorBackend: parsed.mirrorBackend === 'api' ? 'api' : 'local',
      mirrorApiUrl: typeof parsed.mirrorApiUrl === 'string' ? parsed.mirrorApiUrl : '',
      mirrorApiKey: typeof parsed.mirrorApiKey === 'string' ? parsed.mirrorApiKey : '',
      kana: sanitizeKana(parsed.kana),
      material: validMaterial(parsed.material) ? parsed.material : 'auto',
    };
  } catch {
    return DEFAULT_GAME_ARENA_SETTINGS;
  }
}

export function saveGameArenaSettings(patch: Partial<GameArenaSettings>): GameArenaSettings {
  const current = loadGameArenaSettings();
  const next: GameArenaSettings = {
    ...current,
    ...patch,
    gameLength: Math.min(12, Math.max(3, Math.round(Number(patch.gameLength ?? current.gameLength) || current.gameLength))),
    kana: sanitizeKana(patch.kana ?? current.kana),
    material: validMaterial(patch.material) ? patch.material : current.material,
  };
  // A failed write only means the defaults come back on next boot.
  writeLocalStorageJson(KEY, next);
  window.dispatchEvent(new CustomEvent(GAME_ARENA_SETTINGS_EVENT));
  return next;
}

export function onGameArenaSettingsChanged(cb: () => void): () => void {
  const handler = (): void => cb();
  window.addEventListener(GAME_ARENA_SETTINGS_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(GAME_ARENA_SETTINGS_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
