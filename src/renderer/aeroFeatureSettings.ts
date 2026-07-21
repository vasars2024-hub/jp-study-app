/**
 * Aero "legacy gadget" feature flags.
 *
 * These ids used to be WIRED's verbatim — the 2007 Vista gadgets were named
 * `magiVote`, `akiraCapsule`, `bebopBounty` after Lain / Akira / Cowboy Bebop,
 * which belongs to the other world entirely. They now carry period-correct
 * names, with a one-time migration off the old ids.
 */
export type AeroLegacyFeature =
  | 'lyricRibbon'
  | 'bubbleAtmosphere'
  | 'commandPrompt'
  | 'officeHelper'
  | 'securityCenter'
  | 'networkPlaces'
  | 'desktopTicker'
  | 'desktopBuddy'
  | 'updateAdvisor'
  | 'setupWizard'
  | 'mediaGauge'
  | 'messengerNudge'
  | 'minesweeperBoard';

export interface AeroLegacySettings {
  overlayEnabled: boolean;
  features: AeroLegacyFeature[];
  /** Migration marker for the id rename. */
  featuresV: number;
}

const KEY = 'jp-aero-legacy-features-v1';
const EVENT = 'aero:legacy-features-changed';

/** Bump when `AeroLegacyFeature` ids change shape and need remapping. */
const FEATURES_VERSION = 2;

export const AERO_LEGACY_FEATURES: AeroLegacyFeature[] = [
  'lyricRibbon',
  'bubbleAtmosphere',
  'commandPrompt',
  'officeHelper',
  'securityCenter',
  'networkPlaces',
  'desktopTicker',
  'desktopBuddy',
  'updateAdvisor',
  'setupWizard',
  'mediaGauge',
  'messengerNudge',
  'minesweeperBoard',
];

/**
 * v1 ids → v2. Applied once, guarded by `featuresV`, so a user who later turns
 * a gadget off does not get it switched back on by the migration.
 */
const LEGACY_ID_MAP: Record<string, AeroLegacyFeature> = {
  particleAtmosphere: 'bubbleAtmosphere',
  hackerTerminal: 'commandPrompt',
  naviGuide: 'officeHelper',
  surveillanceEye: 'securityCenter',
  networkRadar: 'networkPlaces',
  broadcastTicker: 'desktopTicker',
  wiredShimeji: 'desktopBuddy',
  magiVote: 'updateAdvisor',
  voightKampff: 'setupWizard',
  akiraCapsule: 'mediaGauge',
  ghostProtocol: 'messengerNudge',
  bebopBounty: 'minesweeperBoard',
};

const DEFAULTS: AeroLegacySettings = {
  overlayEnabled: false,
  features: [],
  featuresV: FEATURES_VERSION,
};

function normalize(raw: Partial<AeroLegacySettings>): AeroLegacySettings {
  const needsMigration = raw.featuresV !== FEATURES_VERSION;
  const features = Array.isArray(raw.features)
    ? raw.features.flatMap((id): AeroLegacyFeature[] => {
        if (AERO_LEGACY_FEATURES.includes(id as AeroLegacyFeature)) return [id as AeroLegacyFeature];
        if (!needsMigration) return [];
        const mapped = LEGACY_ID_MAP[id as string];
        return mapped ? [mapped] : [];
      })
    : DEFAULTS.features;
  return {
    overlayEnabled: raw.overlayEnabled === true,
    features: [...new Set(features)],
    featuresV: FEATURES_VERSION,
  };
}

export function loadAeroLegacySettings(): AeroLegacySettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, features: [...DEFAULTS.features] };
    return normalize(JSON.parse(raw) as Partial<AeroLegacySettings>);
  } catch {
    return { ...DEFAULTS, features: [...DEFAULTS.features] };
  }
}

export function saveAeroLegacySettings(patch: Partial<AeroLegacySettings>): AeroLegacySettings {
  const next = normalize({ ...loadAeroLegacySettings(), ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<AeroLegacySettings>(EVENT, { detail: next }));
  return next;
}

export function onAeroLegacySettingsChanged(cb: (settings: AeroLegacySettings) => void): () => void {
  const handler = (event: Event): void => cb((event as CustomEvent<AeroLegacySettings>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
