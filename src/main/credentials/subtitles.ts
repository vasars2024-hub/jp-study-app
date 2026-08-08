/** Subtitle-provider key adapters for the shared credential vault. */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  clearSecret,
  openSecret,
  readSecret,
  writeSecret,
  type VaultWriteResult,
} from './vault';

export type SubtitleCredentialId = 'jimaku' | 'opensubtitles';
type LegacySubtitleKeyFile = Partial<Record<SubtitleCredentialId, string>>;

function legacyPath(): string {
  return path.join(app.getPath('userData'), 'subtitle-keys.json');
}

function readLegacyFile(): LegacySubtitleKeyFile {
  try {
    return JSON.parse(fs.readFileSync(legacyPath(), 'utf-8')) as LegacySubtitleKeyFile;
  } catch {
    return {};
  }
}

function legacyValue(id: SubtitleCredentialId): string {
  const stored = readLegacyFile()[id];
  if (typeof stored !== 'string' || !stored) return '';
  // The old format had no encryption marker: decrypt when possible, otherwise
  // treat the value as the plaintext fallback that old versions wrote.
  return (openSecret(stored) || stored).trim();
}

function removeLegacyValue(id: SubtitleCredentialId): void {
  const file = readLegacyFile();
  if (!(id in file)) return;
  delete file[id];
  if (!file.jimaku && !file.opensubtitles) {
    try {
      fs.rmSync(legacyPath(), { force: true });
    } catch {
      /* absent or not removable */
    }
    return;
  }

  try {
    const target = legacyPath();
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(file), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(temp, target);
  } catch {
    /* leaving an obsolete copy is safer than damaging the remaining provider */
  }
}

export function readSubtitleProviderSecret(id: SubtitleCredentialId): string {
  const current = readSecret(id, 'apiKey');
  if (current) return current;

  const legacy = legacyValue(id);
  if (!legacy) return '';
  const migrated = writeSecret(id, 'apiKey', legacy);
  if (migrated.ok) removeLegacyValue(id);
  return readSecret(id, 'apiKey') || legacy;
}

export function writeSubtitleProviderSecret(
  id: SubtitleCredentialId,
  value: string,
): VaultWriteResult {
  const normalized = value.trim();
  if (!normalized) {
    clearSecret(id, 'apiKey');
    removeLegacyValue(id);
    return { ok: true, messageKey: 'credential.result.removed' };
  }

  const result = writeSecret(id, 'apiKey', normalized);
  if (result.ok) removeLegacyValue(id);
  return result;
}
