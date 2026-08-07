export { default as EnvironmentStack } from './EnvironmentStack';
export { default as WallpaperStage } from './WallpaperStage';
export { default as ParticleLayer } from './ParticleLayer';
export { default as CompanionLayer } from './CompanionLayer';
export {
  loadEnvironment,
  saveEnvironment,
  bootEnvironment,
  onEnvironmentChanged,
  isRotationActive,
} from './environmentStore';
export { resolveWall, getActivePlaylist, wallItemKey } from './schedules';
export { WALL_PRESETS, SELECTABLE_WALL_PRESETS, getWallPreset } from './wallCatalog';
export { PARTICLE_PRESETS, suggestPresetsFromTags, tierMaxParticles } from './particleEngine';
export { COMPANION_DEFS, defaultCompanions } from './companionCatalog';
export {
  getDefaultBuddyRoutines,
  runBuddyRoutine,
  mergeBuddyRoutines,
  resetBuiltinRoutines,
  resolvePrimaryRoutineId,
  resolveSecondaryRoutineId,
  BUDDY_TOAST_EVENT,
  BUDDY_RUN_EVENT,
} from './buddyRoutines';
export type { BuddyRoutine, BuddyStep } from './buddyRoutines';
export { emitCompanionEvent, onCompanionEvent, COMPANION_EVENT } from './companionEvents';
export {
  startCompanionOsBridge,
  stopCompanionOsBridge,
  pushCompanionOsState,
} from './companionOsBridge';
export { startAchievementWatcher, checkAchievements } from './achievements';
export { dayPhaseAt, lightingForTime } from './dayCycleLighting';
export { pulseCalendarCompanions } from './schedules';
export type {
  EnvironmentSettings,
  PerformanceTier,
  WallpaperItem,
  WallpaperPlaylist,
  RotationRule,
  TransitionKind,
  ResolvedWall,
  ParticlePresetId,
  CalendarCategory,
} from './types';
export type {
  CompanionTypeId,
  CompanionMood,
  CompanionReactivity,
  CompanionInstance,
  CompanionDef,
} from './companionCatalog';
export {
  DEFAULT_ENVIRONMENT,
  DAY_CYCLE_PLAYLIST_ID,
  buildDefaultDayCyclePlaylist,
  buildDefaultRules,
} from './types';
