/**
 * The Files list's columns and status badges.
 *
 * The list used to have a fixed set of columns (name, kind, provenance, size,
 * modified) and to show none of the state flags the enumerators compute —
 * `transcribed`, `mined`, `exported`, `enabled`, `hasNotes` were filled in and
 * never rendered (audit r2 #6). Columns are now the user's choice, remembered
 * across restarts, and the flags are badges beside the name.
 */
import type { FilesItemFlags } from './catalog';

/** Every column except Name, which is always shown. */
export const FILES_OPTIONAL_COLUMNS = [
  'kind',
  'provenance',
  'size',
  'created',
  'modified',
  'lastUsed',
] as const;
export type FilesOptionalColumn = (typeof FILES_OPTIONAL_COLUMNS)[number];

/** What the list showed before the picker existed, so nobody's view changes on upgrade. */
export const DEFAULT_FILES_COLUMNS: readonly FilesOptionalColumn[] = ['kind', 'provenance', 'size', 'modified'];

export const FILES_COLUMNS_STORAGE_KEY = 'jp-files-columns-v1';

export function isFilesOptionalColumn(value: unknown): value is FilesOptionalColumn {
  return typeof value === 'string' && (FILES_OPTIONAL_COLUMNS as readonly string[]).includes(value);
}

/**
 * Parse a stored column list. Always in canonical order (the picker toggles,
 * it does not reorder), unknown ids dropped, and an unreadable value falls
 * back to the default rather than to "no columns".
 */
export function normalizeFilesColumns(raw: unknown): FilesOptionalColumn[] {
  if (!Array.isArray(raw)) return [...DEFAULT_FILES_COLUMNS];
  const wanted = new Set(raw.filter(isFilesOptionalColumn));
  return FILES_OPTIONAL_COLUMNS.filter((column) => wanted.has(column));
}

export function toggleFilesColumn(
  columns: readonly FilesOptionalColumn[],
  column: FilesOptionalColumn,
): FilesOptionalColumn[] {
  const next = new Set(columns);
  if (next.has(column)) next.delete(column);
  else next.add(column);
  return FILES_OPTIONAL_COLUMNS.filter((candidate) => next.has(candidate));
}

const COLUMN_TRACK: Record<'name' | FilesOptionalColumn, string> = {
  name: 'minmax(0, 3fr)',
  kind: 'minmax(0, 1fr)',
  provenance: 'minmax(0, 1.2fr)',
  size: 'minmax(0, 1fr)',
  created: 'minmax(0, 1.4fr)',
  modified: 'minmax(0, 1.4fr)',
  lastUsed: 'minmax(0, 1.4fr)',
};

/**
 * The row grid for a column set. The first track is the selection checkbox,
 * sized by the shared hit-target token exactly as the stylesheet's own
 * template does — ratios, never minimum widths, for the reason `filesApp.css`
 * records (a floor cost the narrowest window its whole row).
 */
export function filesGridTemplate(columns: readonly FilesOptionalColumn[]): string {
  return ['var(--lq-hit-target)', COLUMN_TRACK.name, ...columns.map((column) => COLUMN_TRACK[column])].join(' ');
}

export interface FilesStatusBadge {
  /** i18n key of the badge's word. */
  key: string;
  /** `warn` for a problem (a missing file), `muted` for an off switch. */
  tone: 'default' | 'warn' | 'muted';
}

/**
 * The badges one row earns, in a fixed order. Only true conditions produce a
 * badge; `enabled` is the one flag whose FALSE is news (a dictionary switched
 * off), so it is the one that shows either way.
 */
export function filesStatusBadges(flags: FilesItemFlags): FilesStatusBadge[] {
  const out: FilesStatusBadge[] = [];
  if (flags.brokenLink) out.push({ key: 'filesApp.flag.brokenLink', tone: 'warn' });
  if (flags.orphan) out.push({ key: 'filesApp.flag.orphan', tone: 'warn' });
  if (flags.enabled === true) out.push({ key: 'filesApp.flag.enabled', tone: 'default' });
  if (flags.enabled === false) out.push({ key: 'filesApp.flag.disabled', tone: 'muted' });
  if (flags.transcribed) out.push({ key: 'filesApp.flag.transcribed', tone: 'default' });
  if (flags.mined) out.push({ key: 'filesApp.flag.mined', tone: 'default' });
  if (flags.exported) out.push({ key: 'filesApp.flag.exported', tone: 'default' });
  if (flags.hasNotes) out.push({ key: 'filesApp.flag.hasNotes', tone: 'default' });
  return out;
}
