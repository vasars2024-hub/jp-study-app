export const BLANC_TABS = [
  'read',
  'mine',
  'deck',
  'flashcards',
  'media',
  'stats',
  'tools',
  'blocks',
  'settings',
] as const;

export type BlancTabId = (typeof BLANC_TABS)[number];

export interface BlancModeSettings {
  enabled: boolean;
  darkMode: boolean;
  advanced: boolean;
  lastTab: BlancTabId;
}

export const DEFAULT_BLANC_MODE: BlancModeSettings = {
  enabled: false,
  darkMode: false,
  advanced: false,
  lastTab: 'read',
};

export function isBlancTabId(value: unknown): value is BlancTabId {
  return typeof value === 'string' && (BLANC_TABS as readonly string[]).includes(value);
}

export function normalizeBlancTabId(value: unknown): BlancTabId {
  if (value === 'music') return 'media';
  return isBlancTabId(value) ? value : DEFAULT_BLANC_MODE.lastTab;
}

export function sanitizeBlancModeSettings(value: unknown): BlancModeSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_BLANC_MODE };
  const input = value as Partial<BlancModeSettings>;
  return {
    enabled: input.enabled === true,
    darkMode: input.darkMode === true,
    advanced: input.advanced === true,
    lastTab: normalizeBlancTabId(input.lastTab),
  };
}

export function mergeBlancModeSettings(
  current: BlancModeSettings,
  patch: Partial<BlancModeSettings>,
): BlancModeSettings {
  return sanitizeBlancModeSettings({ ...current, ...patch });
}
