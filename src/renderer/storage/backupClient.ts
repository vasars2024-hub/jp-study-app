/**
 * Backup & restore, renderer side — the one place the UI and the boot-time
 * automatic backup call. The archive and the file swap belong to main
 * (`main/backup/backupService.ts`); localStorage and IndexedDB can only be read
 * and written here, so the snapshot is collected/applied in this module.
 *
 * Restore order is what makes it all-or-nothing across both processes:
 *   1. main stages + validates the archive (nothing touched yet);
 *   2. this module applies the renderer snapshot, keeping a rollback;
 *   3. main swaps the files in — and if any swap fails it undoes its own
 *      steps, and this module rolls the renderer data back too.
 */
import { applyRendererSnapshot, collectRendererSnapshot, isLegacyBackup, isRendererSnapshot, legacyToSnapshot, SnapshotApplyError } from './backupSnapshot';
import type { CreateBackupReply } from '../../main/backup/backupService';
import type { BackupManifest } from '../../main/backup/backupArchive';

type Api = Window['api'];

function api(): Partial<Api> | null {
  return typeof window !== 'undefined' ? ((window as { api?: Partial<Api> }).api ?? null) : null;
}

export function backupAvailable(): boolean {
  const a = api();
  return Boolean(a?.backupCreate && a.backupRestoreChoose && a.backupStatus);
}

export async function backUpNow(includeBookFiles: boolean): Promise<CreateBackupReply> {
  const a = api();
  if (!a?.backupCreate) return { ok: false, error: 'unavailable' };
  const renderer = await collectRendererSnapshot();
  return a.backupCreate({ includeBookFiles, renderer });
}

/** How long to wait before retrying an automatic backup main refused as busy. */
export const AUTO_BACKUP_BUSY_RETRY_MS = 2 * 60_000;
const AUTO_BACKUP_BUSY_ATTEMPTS = 6;

function isBusyReply(reply: unknown): boolean {
  return Boolean(reply && typeof reply === 'object' && (reply as { skipped?: unknown }).skipped === 'busy');
}

/**
 * Once a day, after the app is idle; the zip is written in main.
 *
 * `busy` means a manual backup or a restore holds main's lock right now, not
 * that today's backup is done — so it is retried a few times, a couple of
 * minutes apart, with a fresh snapshot each time. It used to be dropped, and
 * the day went without an automatic backup.
 */
export async function runAutoBackupIfDue(
  { retryMs = AUTO_BACKUP_BUSY_RETRY_MS, attempts = AUTO_BACKUP_BUSY_ATTEMPTS } = {},
): Promise<void> {
  const a = api();
  if (!a?.backupAutoDue || !a.backupCreateAuto) return;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (!(await a.backupAutoDue())) return;
      const renderer = await collectRendererSnapshot();
      const reply = await a.backupCreateAuto({ renderer });
      if (!isBusyReply(reply)) return;
    } catch (err) {
      console.warn('[backup] automatic backup failed:', err);
      return;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
}

export interface RestoreFailure {
  what: string;
  error: string;
}

export type RestorePlan =
  | { kind: 'archive'; token: string; manifest: BackupManifest; files: number; renderer: unknown | null }
  | { kind: 'legacy'; legacy: unknown; exportedAt: number | null };

export type ChooseResult = { ok: true; plan: RestorePlan } | { ok: false; cancelled: true } | { ok: false; errors: string[] };

export async function chooseRestoreFile(): Promise<ChooseResult> {
  const a = api();
  if (!a?.backupRestoreChoose) return { ok: false, errors: ['unavailable'] };
  const reply = await a.backupRestoreChoose();
  if (!reply.ok) return 'cancelled' in reply ? { ok: false, cancelled: true } : { ok: false, errors: reply.errors };
  if (reply.kind === 'legacy') return { ok: true, plan: { kind: 'legacy', legacy: reply.legacy, exportedAt: reply.exportedAt } };
  return { ok: true, plan: { kind: 'archive', token: reply.token, manifest: reply.manifest, files: reply.files, renderer: reply.renderer } };
}

export async function discardRestore(): Promise<void> {
  await api()?.backupRestoreDiscard?.();
}

function applyFailures(err: unknown): RestoreFailure[] {
  if (err instanceof SnapshotApplyError) {
    return [...err.failures, ...err.rollbackFailures].map((f) => ({ what: `${f.area}: ${f.target}`, error: f.error }));
  }
  return [{ what: 'renderer', error: err instanceof Error ? err.message : String(err) }];
}

/**
 * Apply a chosen backup. Resolves `{ ok: true }` when everything landed — the
 * app is restarting — or the exact list of what failed, with everything
 * rolled back.
 */
export type ApplyRestoreResult =
  /** `needsRelaunch`: call `relaunchAfterRestore()`; otherwise main is already restarting. */
  | { ok: true; warnings: RestoreFailure[]; needsRelaunch: boolean }
  | { ok: false; failures: RestoreFailure[] };

export async function relaunchAfterRestore(): Promise<void> {
  await api()?.backupRelaunch?.();
}

export async function applyRestore(plan: RestorePlan): Promise<ApplyRestoreResult> {
  const a = api();
  if (!a) return { ok: false, failures: [{ what: 'app', error: 'unavailable' }] };

  if (plan.kind === 'legacy') {
    if (!isLegacyBackup(plan.legacy)) return { ok: false, failures: [{ what: 'file', error: 'not a backup' }] };
    try {
      await applyRendererSnapshot(legacyToSnapshot(plan.legacy));
    } catch (err) {
      return { ok: false, failures: applyFailures(err) };
    }
    // The four host settings the old format carried go through their own
    // validated IPC. A failure there is reported, but the renderer data is in.
    const { restoreLegacyHost } = await import('./storage');
    const warnings = await restoreLegacyHost(plan.legacy.host);
    return { ok: true, warnings, needsRelaunch: true };
  }

  let rollback: (() => Promise<void>) | null = null;
  if (plan.renderer != null) {
    if (!isRendererSnapshot(plan.renderer)) {
      await discardRestore();
      return { ok: false, failures: [{ what: 'renderer.json', error: 'unexpected shape' }] };
    }
    try {
      rollback = (await applyRendererSnapshot(plan.renderer)).rollback;
    } catch (err) {
      await discardRestore();
      return { ok: false, failures: applyFailures(err) };
    }
  }
  const commit = await a.backupRestoreCommit?.(plan.token);
  if (commit?.ok) return { ok: true, warnings: [], needsRelaunch: false };
  const failures: RestoreFailure[] = (commit && !commit.ok ? [...commit.failures, ...commit.rollbackFailures] : [{ path: 'app', error: 'unavailable' }])
    .map((f) => ({ what: f.path, error: f.error }));
  if (rollback) {
    try {
      await rollback();
    } catch (err) {
      failures.push(...applyFailures(err));
    }
  }
  return { ok: false, failures };
}
