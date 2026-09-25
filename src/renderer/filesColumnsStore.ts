/**
 * The Files list's chosen columns, remembered across restarts. One global
 * choice rather than per folder: a column is a way of reading the list, and a
 * user who wants "Last used" wants it everywhere.
 */
import {
  FILES_COLUMNS_STORAGE_KEY,
  normalizeFilesColumns,
  type FilesOptionalColumn,
} from '../shared/filesApp/columns';
import { writeLocalStorageJson } from './localStorageWrite';

export function loadFilesColumns(): FilesOptionalColumn[] {
  try {
    const raw = localStorage.getItem(FILES_COLUMNS_STORAGE_KEY);
    return normalizeFilesColumns(raw === null ? undefined : JSON.parse(raw));
  } catch {
    return normalizeFilesColumns(undefined);
  }
}

/** Returns whether the choice will survive a restart. */
export function saveFilesColumns(columns: readonly FilesOptionalColumn[]): boolean {
  return writeLocalStorageJson(FILES_COLUMNS_STORAGE_KEY, [...columns]);
}
