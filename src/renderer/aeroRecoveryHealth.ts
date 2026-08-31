/** Read-only health check for Secret OS presentation preferences. */
export interface AeroRecoveryIssue {
  key: string;
  reason: 'invalid-json' | 'invalid-shape';
}

export interface AeroRecoveryHealth {
  storageAvailable: boolean;
  checked: number;
  issues: AeroRecoveryIssue[];
}

interface PreferenceSpec {
  key: string;
  valid(value: unknown): boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const recordPreference = (key: string): PreferenceSpec => ({ key, valid: isRecord });

const PREFERENCES: readonly PreferenceSpec[] = [
  recordPreference('jp-aero-environment-v1'),
  recordPreference('jp-study-environment-backup-v1'),
  recordPreference('jp-aero-legacy-features-v1'),
  recordPreference('jp-app-border-settings'),
  recordPreference('jp-pillarbox-settings'),
  recordPreference('jp-os-display-prefs-v1'),
  {
    key: 'jp-os-aero-safe-mode-v1',
    valid: (value) => isRecord(value) && value.version === 1 && typeof value.enabled === 'boolean',
  },
];

const PREFERENCE_KEYS = new Set(PREFERENCES.map((preference) => preference.key));
let storageSyncCleanup: (() => void) | null = null;
const listeners = new Set<(health: AeroRecoveryHealth) => void>();

export function inspectAeroRecoveryHealth(storage: Pick<Storage, 'getItem'> = localStorage): AeroRecoveryHealth {
  const issues: AeroRecoveryIssue[] = [];
  let checked = 0;
  try {
    for (const preference of PREFERENCES) {
      const raw = storage.getItem(preference.key);
      if (raw === null) continue;
      checked += 1;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        issues.push({ key: preference.key, reason: 'invalid-json' });
        continue;
      }
      if (!preference.valid(value)) {
        issues.push({ key: preference.key, reason: 'invalid-shape' });
      }
    }
    return { storageAvailable: true, checked, issues };
  } catch {
    return { storageAvailable: false, checked, issues: [] };
  }
}

function notify(): void {
  const health = inspectAeroRecoveryHealth();
  for (const listener of listeners) listener(health);
}

export function startAeroRecoveryHealthSync(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (storageSyncCleanup) return storageSyncCleanup;
  const onStorage = (event: StorageEvent): void => {
    if (!event.key || !PREFERENCE_KEYS.has(event.key)) return;
    notify();
  };
  window.addEventListener('storage', onStorage);
  const cleanup = (): void => {
    if (storageSyncCleanup !== cleanup) return;
    window.removeEventListener('storage', onStorage);
    storageSyncCleanup = null;
  };
  storageSyncCleanup = cleanup;
  return cleanup;
}

export function onAeroRecoveryHealthChanged(cb: (health: AeroRecoveryHealth) => void): () => void {
  startAeroRecoveryHealthSync();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
