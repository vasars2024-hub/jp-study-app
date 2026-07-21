export type WiredCrtIntensity = 'clean' | 'standard' | 'heavy';
export type WiredFindingFeature =
  | 'lyricRibbon'
  | 'particleAtmosphere'
  | 'hackerTerminal'
  | 'naviGuide'
  | 'surveillanceEye'
  | 'networkMap'
  | 'networkRadar'
  | 'broadcastTicker'
  | 'wiredShimeji'
  | 'magiVote'
  | 'voightKampff'
  | 'akiraCapsule'
  | 'ghostProtocol'
  | 'bebopBounty';

export type WiredMotionLevel = 'full' | 'reduced' | 'off';

export interface WiredArchiveSettings {
  crtIntensity: WiredCrtIntensity;
  replayBoot: boolean;
  ambientEnabled: boolean;
  reducedStatic: boolean;
  findingOverlayEnabled: boolean;
  findingFeatures: WiredFindingFeature[];
  /** Migration marker for `findingFeatures` id remapping. */
  findingFeaturesV: number;
  /** Bespoke §9: window/panel motion (`data-wired-motion`). */
  motionLevel: WiredMotionLevel;
  /** Bespoke §9: gates the §8 interaction cues (ambient is separate). */
  uiCues: boolean;
  /** Bespoke §9: idle loops — wallpaper drift, globe spin, heatmap flicker. */
  idleAnimations: boolean;
}

const KEY = 'jp-wired-archive-settings-v1';
const BOOT_SEEN_KEY = 'jp-wired-archive-boot-seen-v1';
const EVENT = 'wired:settings-changed';
export const WIRED_FINDING_FEATURES: WiredFindingFeature[] = [
  'lyricRibbon',
  'particleAtmosphere',
  'hackerTerminal',
  'naviGuide',
  'surveillanceEye',
  'networkMap',
  'networkRadar',
  'broadcastTicker',
  'wiredShimeji',
  'magiVote',
  'voightKampff',
  'akiraCapsule',
  'ghostProtocol',
  'bebopBounty',
];

/**
 * `networkRadar` used to draw both the node map and the radar scope off one
 * flag, so the two could never be controlled separately. Splitting it means a
 * stored `networkRadar` should light up both panels, the way it used to.
 *
 * Guarded by `findingFeaturesV` so it runs once. Without the marker the
 * expansion would re-fire on every load and silently switch the map back on
 * every time the user turned it off.
 */
const LEGACY_FEATURE_EXPANSIONS: Partial<Record<string, WiredFindingFeature[]>> = {
  networkRadar: ['networkMap', 'networkRadar'],
};

/** Bump when `WiredFindingFeature` ids change shape and need remapping. */
const FINDING_FEATURES_VERSION = 2;

const DEFAULTS: WiredArchiveSettings = {
  crtIntensity: 'standard',
  replayBoot: false,
  ambientEnabled: true,
  reducedStatic: false,
  findingOverlayEnabled: false,
  findingFeatures: [],
  findingFeaturesV: FINDING_FEATURES_VERSION,
  motionLevel: 'full',
  uiCues: true,
  idleAnimations: true,
};

function normalize(raw: Partial<WiredArchiveSettings>): WiredArchiveSettings {
  const crtIntensity =
    raw.crtIntensity === 'clean' || raw.crtIntensity === 'heavy'
      ? raw.crtIntensity
      : 'standard';
  const needsExpansion = raw.findingFeaturesV !== FINDING_FEATURES_VERSION;
  const findingFeatures = Array.isArray(raw.findingFeatures)
    ? raw.findingFeatures.flatMap((id): WiredFindingFeature[] => {
        const expanded = needsExpansion ? LEGACY_FEATURE_EXPANSIONS[id as string] : undefined;
        if (expanded) return expanded;
        return WIRED_FINDING_FEATURES.includes(id as WiredFindingFeature)
          ? [id as WiredFindingFeature]
          : [];
      })
    : DEFAULTS.findingFeatures;
  return {
    crtIntensity,
    replayBoot: raw.replayBoot === true,
    ambientEnabled: raw.ambientEnabled !== false,
    reducedStatic: raw.reducedStatic === true,
    findingOverlayEnabled: raw.findingOverlayEnabled === true,
    findingFeatures: [...new Set(findingFeatures)],
    findingFeaturesV: FINDING_FEATURES_VERSION,
    motionLevel: raw.motionLevel === 'reduced' || raw.motionLevel === 'off' ? raw.motionLevel : 'full',
    uiCues: raw.uiCues !== false,
    idleAnimations: raw.idleAnimations !== false,
  };
}

export function loadWiredArchiveSettings(): WiredArchiveSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return normalize(JSON.parse(raw) as Partial<WiredArchiveSettings>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveWiredArchiveSettings(patch: Partial<WiredArchiveSettings>): WiredArchiveSettings {
  const next = normalize({ ...loadWiredArchiveSettings(), ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  applyWiredArchiveSettings(next);
  window.dispatchEvent(new CustomEvent<WiredArchiveSettings>(EVENT, { detail: next }));
  return next;
}

export function applyWiredArchiveSettings(settings = loadWiredArchiveSettings()): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.wiredCrt = settings.crtIntensity;
  root.dataset.wiredStatic = settings.reducedStatic ? 'reduced' : 'full';
  root.dataset.wiredAmbient = settings.ambientEnabled ? 'on' : 'off';
  root.dataset.wiredFinding = settings.findingOverlayEnabled ? 'on' : 'off';
  root.dataset.wiredMotion = settings.motionLevel;
  root.dataset.wiredIdle = settings.idleAnimations ? 'on' : 'off';
}

/** Bespoke §8/§9: whether the wired interaction cues should sound right now. */
export function wiredUiCuesEnabled(): boolean {
  return loadWiredArchiveSettings().uiCues;
}

export function bootWiredArchiveSettings(): void {
  applyWiredArchiveSettings();
}

export function onWiredArchiveSettingsChanged(cb: (settings: WiredArchiveSettings) => void): () => void {
  const handler = (event: Event): void => cb((event as CustomEvent<WiredArchiveSettings>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export function hasSeenWiredArchiveBoot(): boolean {
  try {
    return localStorage.getItem(BOOT_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markWiredArchiveBootSeen(): void {
  try {
    localStorage.setItem(BOOT_SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function resetWiredArchiveBootSeen(): void {
  try {
    localStorage.removeItem(BOOT_SEEN_KEY);
  } catch {
    /* ignore */
  }
}

export function shouldReplayWiredArchiveBoot(): boolean {
  const settings = loadWiredArchiveSettings();
  return settings.replayBoot || !hasSeenWiredArchiveBoot();
}
