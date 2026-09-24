import { useCallback, useEffect, useState } from 'react';
import {
  isBusy,
  type AssetSpec,
  type AssetStatus,
} from '../shared/assetRegistry';
import type { AssetIntegrity, ReverifyOutcome } from '../main/downloads';

// Renderer-side view of the download manager. The main process owns the truth;
// this just mirrors it and pushes status events into React state.

export interface AssetView {
  spec: AssetSpec;
  status: AssetStatus;
}

function blank(spec: AssetSpec): AssetStatus {
  return {
    id: spec.id,
    state: 'not-installed',
    receivedBytes: 0,
    totalBytes: spec.sizeBytes,
    bytesPerSecond: 0,
  };
}

export function useAssets() {
  const [specs, setSpecs] = useState<AssetSpec[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AssetStatus>>({});
  const [freeSpace, setFreeSpace] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshFreeSpace = useCallback(() => {
    void window.api.assetsFreeSpace().then(setFreeSpace);
  }, []);

  useEffect(() => {
    let alive = true;
    void window.api.assetsList().then(({ assets, statuses: list }) => {
      if (!alive) return;
      setSpecs(assets);
      setStatuses(Object.fromEntries(list.map((s) => [s.id, s])));
      setLoading(false);
    });
    refreshFreeSpace();

    const off = window.api.onAssetStatus((status) => {
      setStatuses((prev) => ({ ...prev, [status.id]: status }));
      // Installs and deletes both move the disk-space needle; the user is
      // usually watching that number precisely when it changes.
      if (status.state === 'installed' || status.state === 'not-installed') refreshFreeSpace();
    });
    return () => {
      alive = false;
      off();
    };
  }, [refreshFreeSpace]);

  const views: AssetView[] = specs.map((spec) => ({
    spec,
    status: statuses[spec.id] ?? blank(spec),
  }));

  return {
    views,
    loading,
    freeSpace,
    anyBusy: views.some((v) => isBusy(v.status.state)),
    start: (id: string) => window.api.assetsStart(id),
    pause: (id: string) => window.api.assetsPause(id),
    cancel: (id: string) => window.api.assetsCancel(id),
    remove: (id: string) => window.api.assetsRemove(id),
  };
}

/**
 * Free bytes on the volume the app writes to, for callers that need the number
 * without the whole asset list.
 *
 * `null` means "not answered yet"; a non-finite value means the main process
 * could not measure it (`downloads.ts:313` returns `Infinity` rather than
 * inventing one on a filesystem without `statfs`). Callers must render nothing
 * in both cases — the Scraper's preflight and download pages previously
 * hardcoded `412 GB` on a machine with 42.7 GB free, and derived a
 * storage-pressure warning from that invented number.
 */
/**
 * Integrity state per asset, plus an on-demand re-verify (audit T6).
 *
 * Kept out of `useAssets` deliberately. Re-verify rehashes the file on disk —
 * hundreds of MB for the OCR models — so it must be something the user asks for,
 * never something a settings page does on mount.
 */
export function useAssetIntegrity() {
  const [rows, setRows] = useState<AssetIntegrity[]>([]);
  const [checking, setChecking] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ReverifyOutcome>>({});

  const refresh = useCallback(async () => {
    const next = await window.api.assetsIntegrity().catch(() => [] as AssetIntegrity[]);
    setRows(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reverify = useCallback(async (id: string) => {
    setChecking(id);
    try {
      const outcome = await window.api.assetsReverify(id);
      setResults((prev) => ({ ...prev, [id]: outcome }));
      return outcome;
    } finally {
      setChecking(null);
    }
  }, []);

  const byId = useCallback(
    (id: string): AssetIntegrity | undefined => rows.find((r) => r.id === id),
    [rows],
  );

  return { rows, byId, reverify, checking, results, refresh };
}

export function useFreeSpace(): number | null {
  const [freeSpace, setFreeSpace] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void window.api.assetsFreeSpace().then((bytes) => {
      if (alive) setFreeSpace(bytes);
    });
    return () => {
      alive = false;
    };
  }, []);

  return freeSpace;
}

/** True when the number is safe to show a user. Mirrors `StoragePage.tsx`. */
export function hasMeasuredFreeSpace(freeSpace: number | null): freeSpace is number {
  return freeSpace !== null && Number.isFinite(freeSpace);
}

/**
 * The graceful-degrade hook. A feature that needs a model calls this and renders
 * a "Download" prompt while `installed` is false, instead of erroring out. It
 * follows live status, so the feature lights up the moment the install lands and
 * greys out again the moment the asset is deleted.
 */
export function useAssetInstalled(id: string): { installed: boolean; status: AssetStatus | null } {
  const [status, setStatus] = useState<AssetStatus | null>(null);

  useEffect(() => {
    let alive = true;
    void window.api.assetsList().then(({ statuses }) => {
      if (!alive) return;
      setStatus(statuses.find((s) => s.id === id) ?? null);
    });
    const off = window.api.onAssetStatus((next) => {
      if (next.id === id) setStatus(next);
    });
    return () => {
      alive = false;
      off();
    };
  }, [id]);

  return { installed: status?.state === 'installed', status };
}

/**
 * `useAssetInstalled` for a SET of assets, in the order given. A feature that
 * needs a detector, a recognizer and a charset has to follow all three, or it
 * shows 0% while a companion downloads. `null` = not reported yet.
 */
export function useAssetStatuses(ids: readonly string[]): Array<AssetStatus | null> {
  const key = ids.join('|');
  const [byId, setById] = useState<Record<string, AssetStatus>>({});

  useEffect(() => {
    let alive = true;
    const wanted = new Set(key.split('|').filter(Boolean));
    setById({});
    void window.api.assetsList().then(({ statuses }) => {
      if (!alive) return;
      setById(Object.fromEntries(statuses.filter((s) => wanted.has(s.id)).map((s) => [s.id, s])));
    }).catch(() => undefined);
    const off = window.api.onAssetStatus((next) => {
      if (wanted.has(next.id)) setById((prev) => ({ ...prev, [next.id]: next }));
    });
    return () => {
      alive = false;
      off();
    };
  }, [key]);

  return ids.map((id) => byId[id] ?? null);
}
