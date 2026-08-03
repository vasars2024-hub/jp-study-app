/**
 * i18n keys for the Media workspace's two machine enums.
 *
 * Both were rendered straight into the UI — `MediaWorkspaceHost` interpolated
 * `SeanimeStatus['kind']` into a sentence ("sidecar ready") and the mining history
 * printed `entry.status` ("exported") — which put raw lowercase English into the
 * JA/ZH/RU chrome that every other string in this surface goes through.
 *
 * They live here, keyed by the union, for two reasons:
 *   1. `Record<Union, string>` makes exhaustiveness a compile error, so adding a sidecar
 *      state or a history status cannot silently reintroduce an untranslated label.
 *   2. A key that does not exist in the catalog renders as the key itself, and TypeScript
 *      cannot see that. `mediaWorkspaceLabels.test.ts` resolves every entry against the
 *      real catalogs, which is the half tsc cannot cover.
 */
import type { SeanimeStatus } from './seanime';
import type { VideoCoreMiningHistoryStatus } from './videoCoreMining';

export const SIDECAR_STATUS_KEY: Record<SeanimeStatus['kind'], string> = {
  disabled: 'mediaWorkspace.sidecar.disabled',
  stopped: 'mediaWorkspace.sidecar.stopped',
  starting: 'mediaWorkspace.sidecar.starting',
  ready: 'mediaWorkspace.sidecar.ready',
  offline: 'mediaWorkspace.sidecar.offline',
  failed: 'mediaWorkspace.sidecar.failed',
};

export const MINING_HISTORY_STATUS_KEY: Record<VideoCoreMiningHistoryStatus, string> = {
  exported: 'mediaWorkspace.mining.statusExported',
  duplicate: 'mediaWorkspace.mining.statusDuplicate',
  failed: 'mediaWorkspace.mining.statusFailed',
  undone: 'mediaWorkspace.mining.statusUndone',
};
