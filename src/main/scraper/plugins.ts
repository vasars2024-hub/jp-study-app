// The plugin registry.
//
// A plugin is a folder under `userData/scraper/plugins` with a manifest. This
// module reads those manifests and reports what it found; it deliberately does
// not load or execute anything. Enumerating and describing extensions is a
// separate problem from running them, and shipping the first without the second
// is what lets the Plugins page tell the truth today.
//
// A manifest that does not parse, or that asks for permissions this build does
// not know, is listed as incompatible rather than hidden — a plugin the user
// installed and cannot see is worse than one shown with a problem.

import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ScraperPluginInfo } from '../../shared/scraperIpc';
import { scraperLog } from './logBus';
import { scraperStorePath } from './store';

const PLUGINS_DIR = 'plugins';
const MANIFEST = 'manifest.json';

// The permission vocabulary moved to `shared/scraperPluginPermissions.ts` on
// 2026-09-08 (D418) so the renderer's Permission audit reads the same list this
// reader validates against. Re-exported here because that is the name every
// existing importer knows.
// (A bare `export ... from` would not bind the name in this module's own scope,
// and `readManifest` below needs it.)
import { KNOWN_PERMISSIONS } from '../../shared/scraperPluginPermissions';

export { KNOWN_PERMISSIONS };

/** Manifest API versions this build can host. */
export const SUPPORTED_API_VERSIONS = [1];

interface RawManifest {
  id?: unknown;
  name?: unknown;
  version?: unknown;
  publisher?: unknown;
  description?: unknown;
  apiVersion?: unknown;
  permissions?: unknown;
  enabled?: unknown;
  updateUrl?: unknown;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

/**
 * Validates one manifest.
 *
 * `enabledIds` comes from the profile: whether a plugin is switched on is a
 * user setting, not something the plugin gets to declare about itself.
 */
export function readManifest(
  folder: string,
  raw: unknown,
  enabledIds: string[],
): ScraperPluginInfo {
  const manifest = (raw && typeof raw === 'object' ? raw : {}) as RawManifest;
  const id = asString(manifest.id) || folder;
  const permissions = Array.isArray(manifest.permissions)
    ? manifest.permissions.map((p) => asString(p)).filter(Boolean)
    : [];
  const apiVersion = typeof manifest.apiVersion === 'number' ? manifest.apiVersion : 0;
  const unknownPermissions = permissions.filter(
    (p) => !(KNOWN_PERMISSIONS as readonly string[]).includes(p),
  );
  const compatible = SUPPORTED_API_VERSIONS.includes(apiVersion) && unknownPermissions.length === 0;

  const problems: string[] = [];
  if (!SUPPORTED_API_VERSIONS.includes(apiVersion)) {
    problems.push(`Needs plugin API v${apiVersion || '?'}.`);
  }
  if (unknownPermissions.length) {
    problems.push(`Unknown permission(s): ${unknownPermissions.join(', ')}.`);
  }

  return {
    id,
    name: asString(manifest.name) || id,
    version: asString(manifest.version) || '0.0.0',
    publisher: asString(manifest.publisher) || 'Unknown',
    enabled: enabledIds.includes(id),
    compatible,
    // Update checking would mean a network call per plugin on every page visit;
    // an empty string is the honest answer until that is built.
    updateAvailable: '',
    permissions,
    description: problems.length
      ? [asString(manifest.description), ...problems].filter(Boolean).join(' ')
      : asString(manifest.description),
  };
}

export function pluginsRoot(): string {
  return scraperStorePath(PLUGINS_DIR);
}

/** Every plugin folder, sorted by name. Missing directory means none. */
export async function listPlugins(enabledIds: string[] = []): Promise<ScraperPluginInfo[]> {
  const root = pluginsRoot();
  let entries: string[] = [];
  try {
    const dir = await fsp.readdir(root, { withFileTypes: true });
    entries = dir.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    // No plugins directory is the normal case, not an error.
    return [];
  }

  const plugins: ScraperPluginInfo[] = [];
  for (const folder of entries) {
    const manifestPath = path.join(root, folder, MANIFEST);
    try {
      const raw = JSON.parse(await fsp.readFile(manifestPath, 'utf-8')) as unknown;
      plugins.push(readManifest(folder, raw, enabledIds));
    } catch (error) {
      scraperLog('warn', 'plugins', `${folder}: ${
        error instanceof Error ? error.message : String(error)
      }`);
      plugins.push({
        id: folder,
        name: folder,
        version: '0.0.0',
        publisher: 'Unknown',
        enabled: false,
        compatible: false,
        updateAvailable: '',
        permissions: [],
        description: 'The manifest is missing or could not be read.',
      });
    }
  }
  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}
