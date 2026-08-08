/**
 * The vault's IPC surface.
 *
 * Deliberately narrow: write a secret, remove a secret, ask what is configured.
 * There is no read channel and there will not be one — `vault.ts`'s `readSecret`
 * is main-only, and the shape this returns (`CredentialStatus`) has nowhere to
 * put a key even by accident. That is the same discipline
 * `subtitleProviderClients.ts` and `malSync.ts` already follow.
 *
 * Only credentials whose registry entry says `store: 'vault'` appear here. The
 * ones still owned by `mining.ts`, `subtitleProviderClients.ts` and
 * `malSync.ts` are read by the settings page through those modules' existing
 * channels — inventing a status for them here would mean this module guessing
 * at file formats it does not own, and guessing wrong the day one changes.
 */

import { ipcMain } from 'electron';
import type { CredentialStatus } from '../../shared/credentialRegistry';
import { credentialSpec } from '../../shared/credentialRegistry';
import { clearSecret, vaultCanStore, vaultStatuses, writeSecret, type VaultWriteResult } from './vault';

export interface CredentialVaultSnapshot {
  statuses: CredentialStatus[];
  /**
   * Whether this machine can encrypt at all. The page uses it to explain the
   * refusal *before* a key is pasted into a field that will reject it.
   */
  canStore: boolean;
}

function snapshot(): CredentialVaultSnapshot {
  return { statuses: vaultStatuses(), canStore: vaultCanStore() };
}

export interface CredentialWriteResponse extends VaultWriteResult {
  snapshot: CredentialVaultSnapshot;
}

/** Rejects any id that is not a vault-owned registry entry. */
function vaultOwned(id: string): boolean {
  return credentialSpec(id)?.store === 'vault';
}

function vaultFieldOwned(id: string, field: string): boolean {
  const spec = credentialSpec(id);
  return spec?.store === 'vault' && spec.fields.some((entry) => entry.name === field);
}

export function registerCredentialIpc(): void {
  ipcMain.handle('credentials:status', (): CredentialVaultSnapshot => snapshot());

  ipcMain.handle(
    'credentials:set',
    (_event, id: string, field: string, secret: string): CredentialWriteResponse => {
      const credentialId = String(id ?? '');
      const fieldName = String(field ?? '');
      if (!vaultFieldOwned(credentialId, fieldName)) {
        return { ok: false, messageKey: 'credential.result.badId', snapshot: snapshot() };
      }
      const result = writeSecret(credentialId, fieldName, String(secret ?? ''));
      return { ...result, snapshot: snapshot() };
    },
  );

  ipcMain.handle('credentials:clear', (_event, id: string): CredentialVaultSnapshot => {
    const credentialId = String(id ?? '');
    if (vaultOwned(credentialId)) clearSecret(credentialId);
    return snapshot();
  });

  // No `credentials:recordTest` channel: no vault-owned credential is
  // `testable` yet, and a handler nothing calls is what `dead-ipc` in
  // tools/architecture-audit.cjs exists to catch. `vault.ts` exports
  // `recordTestResult` ready for the phase that adds one.
}
