// The scraper plugin permission vocabulary, and the capability groups the
// Plugins page reports it in.
//
// It lives in `shared/` rather than in `main/scraper/plugins.ts` for one
// reason: the manifest reader in main VALIDATES against this list and the
// Permission audit in the renderer SUMMARISES it, and when those two lived
// apart they drifted. D418 — the audit tested for `network:` / `browser:` /
// `storage:` prefixes, which is the vocabulary of the renderer's own
// `data/fixtures.ts`, while the reader has always validated bare words. A
// permission carrying one of those prefixes is not in KNOWN_PERMISSIONS, so it
// marks its plugin **incompatible**; the audit could therefore only ever count
// adapters the app had already rejected, and every counter read 0 for every
// plugin that works. Measured live 2026-09-08: `Jimaku Bridge` listed `http`
// and `subtitles` on its own card with `0 Network access` in the panel below it.

/** Permissions this build understands. Anything else marks a plugin incompatible. */
export const KNOWN_PERMISSIONS = [
  'http',
  'sources',
  'torrents',
  'metadata',
  'subtitles',
  'export',
  'settings',
] as const;

export type KnownPermission = (typeof KNOWN_PERMISSIONS)[number];

export type PermissionGroup = 'network' | 'browser' | 'storage' | 'broad';

/**
 * Which capability group each known permission belongs to.
 *
 * The assignment: every one of the five data capabilities exists so an adapter
 * can reach something off this machine, which is what a reader of "Network
 * access" wants to know; `export` and `settings` write things the user keeps.
 * `browser` has no member in v1 — this build has no browser-automation
 * capability, so a 0 there is the true answer rather than a missing one.
 *
 * A `Record` keyed by the union, not a partial map: adding a permission above
 * without giving it a group here is a type error, which is the whole point of
 * keeping the two in one file.
 */
export const PERMISSION_GROUPS: Record<KnownPermission, PermissionGroup> = {
  http: 'network',
  sources: 'network',
  torrents: 'network',
  metadata: 'network',
  subtitles: 'network',
  export: 'storage',
  settings: 'storage',
};

/**
 * The group a single declared permission falls in, or null.
 *
 * The legacy `network:` / `browser:` / `storage:` / `filesystem:` prefixes are
 * still recognised. They only ever appear on a plugin this build calls
 * incompatible, and that is exactly the plugin whose reach the audit most needs
 * to show — dropping them would hide the one real risk.
 */
export function permissionGroup(permission: string): PermissionGroup | null {
  if (permission.includes('*') || permission.startsWith('filesystem:')) return 'broad';
  if (permission.startsWith('network:')) return 'network';
  if (permission.startsWith('browser:')) return 'browser';
  if (permission.startsWith('storage:')) return 'storage';
  return PERMISSION_GROUPS[permission as KnownPermission] ?? null;
}
