/**
 * "Import sprite pack…" — one flow shared by Settings › Companions and the pet
 * menu. Main opens the picker and validates everything; this turns the result
 * into a sentence in the UI language and, from the pet menu, dresses that pet in
 * the first imported pack so the user sees it at once.
 */
import type { CompanionPackImportError } from '../../shared/companionPacks';
import { t } from '../i18n';
import type { CompanionTypeId } from './companionCatalog';
import { setPackChoice } from './companionPackChoice';
import { refreshUserPacks } from './shimejiPacks';

const ERROR_KEYS: Record<Exclude<CompanionPackImportError, 'cancelled'>, string> = {
  unreadable: 'settings.companions.packs.error.unreadable',
  'not-a-pack': 'settings.companions.packs.error.notAPack',
  'no-frames': 'settings.companions.packs.error.noFrames',
  'too-large': 'settings.companions.packs.error.tooLarge',
  'too-many-files': 'settings.companions.packs.error.tooManyFiles',
  'write-failed': 'settings.companions.packs.error.writeFailed',
};

export interface PackImportOutcome {
  ok: boolean;
  message: string;
  /** Ids of the packs this import created (empty on failure). */
  packIds: string[];
}

/** Run an import. Null when the user cancelled the picker. */
export async function importSpritePack(
  kind: 'file' | 'folder' = 'file',
  wearOn?: CompanionTypeId,
): Promise<PackImportOutcome | null> {
  const run = window.api?.companionPacksImport;
  if (typeof run !== 'function') {
    return { ok: false, message: t('settings.companions.packs.unavailable'), packIds: [] };
  }
  let res: Awaited<ReturnType<typeof run>>;
  try {
    res = await run({ kind });
  } catch {
    return { ok: false, message: t('settings.companions.packs.error.unreadable'), packIds: [] };
  }
  if (!res.ok) {
    if (res.error === 'cancelled') return null;
    return { ok: false, message: t(ERROR_KEYS[res.error] ?? ERROR_KEYS.unreadable), packIds: [] };
  }
  await refreshUserPacks();
  const packIds = res.packs.map((p) => p.id);
  if (wearOn && packIds[0]) setPackChoice(wearOn, packIds[0]);
  const parts = [t('settings.companions.packs.imported', { count: res.packs.length })];
  if (res.skipped > 0) parts.push(t('settings.companions.packs.skipped', { count: res.skipped }));
  return { ok: true, message: parts.join(' '), packIds };
}
