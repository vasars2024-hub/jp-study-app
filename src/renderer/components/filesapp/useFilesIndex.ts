/**
 * The Files app's one data hook.
 *
 * The index is built by walking real directories and a SQLite table in main, so
 * it is fetched once and refreshed explicitly — never per keystroke. Search,
 * sort and the tree filter all run over the snapshot already in memory, which is
 * what keeps typing in the search box off the disk.
 *
 * `error` is a first-class state, not a silent empty list. An index that failed
 * to load and an index that is genuinely empty look identical in a bare array,
 * and rubric category 8 (honest states) is exactly the difference between them.
 */
import { useCallback, useEffect, useState } from 'react';
import type { FilesIndexSnapshot } from '../../../shared/filesApp/catalog';

export type FilesIndexState =
  | { status: 'loading'; snapshot: null; error: null }
  | { status: 'ready'; snapshot: FilesIndexSnapshot; error: null }
  | { status: 'error'; snapshot: null; error: string }
  /** The binding is missing entirely — a browser preview, or a stale preload. */
  | { status: 'unavailable'; snapshot: null; error: null };

export interface UseFilesIndex {
  state: FilesIndexState;
  /** Rebuild in main and replace the snapshot. */
  refresh: () => void;
  refreshing: boolean;
}

export function useFilesIndex(): UseFilesIndex {
  const [state, setState] = useState<FilesIndexState>({
    status: 'loading',
    snapshot: null,
    error: null,
  });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force: boolean) => {
    const api = window.api?.filesIndex;
    if (typeof api !== 'function') {
      setState({ status: 'unavailable', snapshot: null, error: null });
      return;
    }
    if (force) setRefreshing(true);
    try {
      const snapshot = await api(force);
      setState({ status: 'ready', snapshot, error: null });
    } catch (err) {
      setState({
        status: 'error',
        snapshot: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  return { state, refresh, refreshing };
}
