// The renderer snapshot as JSON text — the form the app sends for a backup.
// Its own module so the IPC layer can check it without loading the archive code.

/** The start every serialized renderer snapshot has (`backupSnapshot.ts`). */
export const RENDERER_SNAPSHOT_TEXT_PREFIX = '{"app":"jp-study-app","kind":"renderer-snapshot",';

/**
 * A renderer snapshot sent as JSON text: checked by its fixed header and its
 * closing brace, without parsing the (multi-MB) body on the main process. The
 * archive stores it verbatim; restore parses and validates it as before.
 */
export function isRendererSnapshotText(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith(RENDERER_SNAPSHOT_TEXT_PREFIX)) return false;
  let end = value.length - 1;
  while (end > 0 && /\s/.test(value[end])) end -= 1;
  return value[end] === '}' && value.includes('"localStorage":') && value.includes('"indexedDb":');
}
