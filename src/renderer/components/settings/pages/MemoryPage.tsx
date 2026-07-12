import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icons';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import {
  clearSettingsDomain,
  exportAllData,
  formatBytes,
  importAllData,
  listSettingsDomains,
  type DomainInventoryItem,
} from '../../../storage/storage';
import { kvClear } from '../../../storage/db';
import { DEFAULT_TRADITIONAL_MINING_CONFIG } from '../../../../shared/mining';

interface SystemMetrics {
  freemem: number;
  totalmem: number;
  cpuLoad: number;
  platform: string;
  uptime: number;
}

function formatUptime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Meter({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className="memory-usage">
      <div className="memory-meter-head">
        <span className="os-viz-label">{label}</span>
        <span className="muted">{detail}</span>
      </div>
      <div
        className="memory-usage-bar"
        role="progressbar"
        aria-valuenow={Math.round(p)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="memory-usage-fill" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function tierLabel(tier: DomainInventoryItem['tier']): string {
  if (tier === 'host') return 'Host';
  if (tier === 'durable') return 'Durable';
  if (tier === 'mixed') return 'Mixed';
  return 'Local';
}

export default function MemoryPage() {
  const { focusSettingId } = useSettings();
  const [domains, setDomains] = useState<DomainInventoryItem[]>([]);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [sys, setSys] = useState<SystemMetrics | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const refreshStorage = useCallback(async () => {
    setLoadError('');
    try {
      setDomains(await listSettingsDomains());
    } catch (error) {
      setDomains([]);
      setLoadError(error instanceof Error ? error.message : 'Could not read settings inventory.');
    }
    try {
      const est = await navigator.storage.estimate();
      if (est.usage != null && est.quota != null) {
        setUsage({ used: est.usage, quota: est.quota });
      } else {
        setUsage(null);
      }
    } catch {
      setUsage(null);
    }
  }, []);

  const refreshSystem = useCallback(async () => {
    try {
      const m = await window.api.systemGetMetrics();
      setSys({
        freemem: m.freemem,
        totalmem: m.totalmem,
        cpuLoad: m.cpuLoad,
        platform: m.platform,
        uptime: m.uptime,
      });
    } catch {
      setSys(null);
    }
  }, []);

  useEffect(() => {
    void refreshStorage();
    void refreshSystem();
    const id = window.setInterval(() => void refreshSystem(), 3000);
    return () => window.clearInterval(id);
  }, [refreshStorage, refreshSystem]);

  const run = async (fn: () => Promise<void> | void, ok: string) => {
    setBusy(true);
    setStatus('');
    try {
      await fn();
      setStatus(ok);
      await refreshStorage();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  async function handleExport(): Promise<void> {
    setBusy(true);
    setStatus('');
    try {
      const backup = await exportAllData();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jp-study-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const n = backup.domains?.length ?? 0;
      setStatus(
        `Backup downloaded (format ${backup.format}) — ${n} settings domain(s), including particles, companions, wallpaper, display, and host configs.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFile(file: File): Promise<void> {
    setBusy(true);
    setStatus('');
    try {
      const error = await importAllData(await file.text());
      if (error) {
        setStatus(error);
        return;
      }
      setStatus('Backup restored (all settings + host configs) — reloading…');
      setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleClearDomain(d: DomainInventoryItem): Promise<void> {
    if (!d.clearable) return;
    const msg =
      d.clearConfirm ??
      `Clear “${d.label}”? This only removes that settings domain.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setStatus('');
    try {
      const err = await clearSettingsDomain(d.id);
      setStatus(err ?? `Cleared: ${d.label}`);
      await refreshStorage();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleFactoryReset(): Promise<void> {
    if (
      !window.confirm(
        'Factory reset: deletes local settings, decks, drafts, caches, and resets mining config, then restarts. Export a backup first. Continue?',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await window.api.miningSetConfig(DEFAULT_TRADITIONAL_MINING_CONFIG).catch(() => undefined);
      await kvClear();
      localStorage.clear();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  const usagePct = usage && usage.quota > 0 ? Math.min(100, (usage.used / usage.quota) * 100) : 0;
  const ramUsed = sys ? Math.max(0, sys.totalmem - sys.freemem) : 0;
  const ramPct = sys && sys.totalmem > 0 ? (ramUsed / sys.totalmem) * 100 : 0;

  const q = filter.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return domains;
    return domains.filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.detail.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q),
    );
  }, [domains, q]);

  const present = domains.filter((d) => d.present || d.bytes > 0);
  const totalBytes = present.reduce((n, d) => n + d.bytes, 0);

  const env = domains.find((d) => d.id === 'environment');

  return (
    <>
      <SettingsCard
        id="system-memory"
        title="System memory"
        description="Live RAM usage on this PC."
        highlight={focusSettingId === 'system-memory'}
        trailing={
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => {
              void refreshSystem();
              void refreshStorage();
            }}
          >
            Refresh
          </button>
        }
      >
        {sys ? (
          <>
            <Meter
              label="RAM"
              pct={ramPct}
              detail={`${formatBytes(ramUsed)} used of ${formatBytes(sys.totalmem)} · ${ramPct.toFixed(0)}%`}
            />
            <div className="memory-sys-meta muted">
              <span>CPU load {Math.round(sys.cpuLoad * 100)}%</span>
              <span aria-hidden>·</span>
              <span>Uptime {formatUptime(sys.uptime)}</span>
              <span aria-hidden>·</span>
              <span>{sys.platform}</span>
            </div>
          </>
        ) : (
          <p className="muted os-set-hint">System metrics unavailable.</p>
        )}
      </SettingsCard>

      <SettingsCard
        id="storage-usage"
        title="App storage"
        description="Browser quota plus catalogued settings size."
        highlight={focusSettingId === 'storage-usage' || focusSettingId === 'memory'}
      >
        {usage ? (
          <Meter
            label="Quota"
            pct={usagePct}
            detail={`${formatBytes(usage.used)} used of ${formatBytes(usage.quota)} · ${usagePct.toFixed(1)}%`}
          />
        ) : (
          <p className="muted os-set-hint">Storage estimate unavailable.</p>
        )}
        <p className="muted os-set-hint" style={{ marginTop: 8 }}>
          Settings catalog ≈ {formatBytes(totalBytes)} across {present.length} active domain
          {present.length === 1 ? '' : 's'} (particles, companions, wallpaper, display, study, host…).
        </p>
        {env && (
          <p className="memory-env-summary" style={{ marginTop: 8 }}>
            <strong>Living layer</strong>
            <span className="muted"> — {env.detail}</span>
          </p>
        )}
        {loadError && <p className="memory-status">{loadError}</p>}
      </SettingsCard>

      <SettingsCard
        id="storage-inventory"
        title="Settings inventory"
        description="Every settings domain: living layer, appearance, desktop, study, media, and host configs."
        highlight={focusSettingId === 'storage-inventory'}
      >
        <div className="memory-filter-row">
          <input
            type="search"
            className="os-set-search-input"
            placeholder="Filter domains…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter settings domains"
          />
        </div>
        <div className="memory-inventory-wrap">
          <table className="memory-inventory">
            <thead>
              <tr>
                <th>Settings</th>
                <th>Category</th>
                <th>Where</th>
                <th>Size</th>
                <th>Detail</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    {loadError ? 'Inventory failed to load.' : 'No matching domains.'}
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.id} className={d.present || d.bytes > 0 ? '' : 'memory-row-empty'}>
                  <td>
                    <strong className="memory-domain-label">{d.label}</strong>
                  </td>
                  <td className="muted">{d.category}</td>
                  <td className="muted">{tierLabel(d.tier)}</td>
                  <td>{d.bytes > 0 ? formatBytes(d.bytes) : '—'}</td>
                  <td className="memory-detail muted">{d.detail}</td>
                  <td>
                    {d.clearable ? (
                      <button
                        type="button"
                        className="btn small"
                        disabled={busy || !(d.present || d.bytes > 0)}
                        onClick={() => void handleClearDomain(d)}
                      >
                        Clear
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted os-set-hint" style={{ marginTop: 8 }}>
          Living layer includes particles (density / intensity / size), companions, buddy routines,
          wallpaper playlists, and lighting — export captures them all.
        </p>
      </SettingsCard>

      <SettingsCard
        id="backup"
        title="Backup & restore"
        description="Export or import every local setting plus host configs (mining, AI, desktop layout, profiles)."
        highlight={focusSettingId === 'backup'}
      >
        <p className="muted os-set-hint">
          Full backup (format 2): localStorage, IndexedDB, mining presets, AI config, desktop layout,
          and study profiles. Wallpaper image files on disk are not embedded — only layout references
          and living-layer playlists.
        </p>
        <div className="memory-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void handleExport()}>
            <Icon name="download" size={14} style={{ marginRight: 5, verticalAlign: '-2px' }} />
            Export all settings
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => importRef.current?.click()}
          >
            Import backup…
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        id="clear-data"
        title="Quick clear"
        description="Common wipe actions. Full domain list is above."
        highlight={focusSettingId === 'clear-data'}
      >
        <div className="memory-actions">
          {(
            [
              ['environment', 'Reset living layer'],
              ['flashcards', 'Clear flashcards'],
              ['clipboard', 'Clear clipboard'],
              ['lyrics-cache', 'Clear lyrics cache'],
              ['lookups', 'Clear lookups'],
              ['mining', 'Reset mining presets'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="btn small"
              disabled={busy}
              onClick={() => {
                const d = domains.find((x) => x.id === id);
                if (d) void handleClearDomain(d);
                else
                  void run(async () => {
                    const err = await clearSettingsDomain(id);
                    if (err) throw new Error(err);
                  }, `Cleared ${label}`);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="factory-reset"
        title="Factory reset"
        description="Wipe local app data and restart. Export a backup first."
        highlight={focusSettingId === 'factory-reset'}
      >
        <button
          type="button"
          className="btn danger"
          disabled={busy}
          onClick={() => void handleFactoryReset()}
        >
          Factory reset
        </button>
      </SettingsCard>

      {status && <p className="memory-status muted">{status}</p>}
    </>
  );
}
