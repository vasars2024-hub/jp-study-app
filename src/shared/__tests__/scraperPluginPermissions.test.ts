/**
 * D418, measured live 2026-09-08 (pid 11736, window 2, Scraper > Plugins).
 *
 * The `Jimaku Bridge` adapter listed `http` and `subtitles` on its own card and
 * the Permission audit directly beneath it read `0 Network access`, `0 Browser
 * control`, `0 Storage access`, `0 Broad access`. It was not a rendering bug:
 * the audit tested for `network:` / `browser:` / `storage:` PREFIXES, which is
 * the vocabulary of the renderer's `data/fixtures.ts`, while the manifest
 * reader in main has always validated bare words. A permission carrying one of
 * those prefixes is therefore not in KNOWN_PERMISSIONS, which marks its plugin
 * INCOMPATIBLE — so the audit could only ever count adapters the app had
 * already rejected, and read 0 for every plugin that actually works.
 *
 * The two lists now live in one file. These cases are the reason they cannot
 * drift again: the first fails if a permission is added without a group, the
 * second fails if the audit is ever pointed back at the fixture vocabulary.
 */
import { describe, expect, it } from 'vitest';
import {
  KNOWN_PERMISSIONS,
  PERMISSION_GROUPS,
  permissionGroup,
  type PermissionGroup,
} from '../scraperPluginPermissions';

/** The renderer's audit, as a function of the permission strings it is given. */
function auditCounts(plugins: { permissions: string[] }[]): Record<PermissionGroup, number> {
  const count = (group: PermissionGroup) =>
    plugins.filter((p) => p.permissions.some((perm) => permissionGroup(perm) === group)).length;
  return {
    network: count('network'),
    browser: count('browser'),
    storage: count('storage'),
    broad: count('broad'),
  };
}

describe('scraper plugin permission groups', () => {
  it('gives every permission the manifest reader accepts a group', () => {
    // Non-vacuity: the vocabulary is not empty, so the walk below means something.
    expect(KNOWN_PERMISSIONS.length).toBeGreaterThanOrEqual(7);
    for (const permission of KNOWN_PERMISSIONS) {
      expect(PERMISSION_GROUPS[permission], `no group for '${permission}'`).toBeTruthy();
      expect(permissionGroup(permission)).toBe(PERMISSION_GROUPS[permission]);
    }
  });

  /**
   * The regression itself, written with the live subject. Mutation control:
   * point `permissionGroup` back at `permission.startsWith('network:')` and
   * this case reports network 0.
   */
  it('counts the real Jimaku Bridge manifest as network access', () => {
    const live = [
      { permissions: ['http', 'subtitles'] }, // Jimaku Bridge, as installed
      { permissions: [] }, //                    broken-one, manifest unreadable
    ];
    expect(auditCounts(live)).toEqual({ network: 1, browser: 0, storage: 0, broad: 0 });
  });

  it('still recognises the legacy prefixed vocabulary, so a risky adapter is not hidden', () => {
    // These only ever appear on a plugin this build calls incompatible — which
    // is exactly the one whose reach the audit most needs to show.
    expect(permissionGroup('network:*')).toBe('broad');
    expect(permissionGroup('filesystem:write')).toBe('broad');
    expect(permissionGroup('network:jimaku.example')).toBe('network');
    expect(permissionGroup('browser:automation')).toBe('browser');
    expect(permissionGroup('storage:cache')).toBe('storage');
  });

  it('answers null for a permission it has never heard of', () => {
    expect(permissionGroup('telepathy')).toBeNull();
    expect(permissionGroup('')).toBeNull();
  });

  /**
   * The panel's four counters must not all be structurally unreachable. This is
   * the shape of the defect rather than one instance of it: if a future edit
   * makes some group impossible to reach from the accepted vocabulary, say so
   * here on purpose rather than shipping a tile that can only read 0.
   */
  it('can reach network and storage from the accepted vocabulary alone', () => {
    const reachable = new Set(KNOWN_PERMISSIONS.map((p) => permissionGroup(p)));
    expect(reachable.has('network')).toBe(true);
    expect(reachable.has('storage')).toBe(true);
    // `browser` deliberately has no member in v1: this build has no
    // browser-automation capability, so a 0 there is the true answer. Remove
    // that tile or add the capability — do not quietly map something else to it.
    expect(reachable.has('browser')).toBe(false);
  });
});
