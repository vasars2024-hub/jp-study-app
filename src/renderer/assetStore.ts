import { useCallback, useEffect, useState } from 'react';
import {
  isBusy,
  type AssetSpec,
  type AssetStatus,
} from '../shared/assetRegistry';

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
