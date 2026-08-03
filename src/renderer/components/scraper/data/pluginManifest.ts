import type { PluginInfo } from './scraperPort';

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/i;

export function parsePluginManifest(text: string, fileName: string): PluginInfo {
  const raw = JSON.parse(text) as Partial<PluginInfo>;
  if (
    typeof raw.id !== 'string'
    || !PLUGIN_ID_PATTERN.test(raw.id)
    || typeof raw.name !== 'string'
    || raw.name.trim().length === 0
    || typeof raw.version !== 'string'
    || raw.version.trim().length === 0
  ) {
    throw new Error('Manifest requires a valid id, name, and version.');
  }

  return {
    id: raw.id,
    name: raw.name.trim(),
    version: raw.version.trim(),
    publisher: typeof raw.publisher === 'string' && raw.publisher.trim()
      ? raw.publisher.trim()
      : 'Local package',
    enabled: raw.enabled !== false,
    compatible: raw.compatible !== false,
    updateAvailable: '',
    permissions: Array.isArray(raw.permissions)
      ? raw.permissions
        .filter((permission): permission is string => typeof permission === 'string')
        .map((permission) => permission.trim())
        .filter(Boolean)
        .slice(0, 20)
      : [],
    description: typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim()
      : `Locally installed from ${fileName}.`,
  };
}
