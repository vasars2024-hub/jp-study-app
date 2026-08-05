import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icons';
import SettingsCard from '../SettingsCard';
import { confirmDialog } from '../../ui';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import {
  clearSettingsDomain,
  exportAllData,
  importAllData,
  listSettingsDomains,
  type DomainInventoryItem,
} from '../../../storage/storage';
import { formatBytes } from '../../../../shared/assetRegistry';
import { kvClear } from '../../../storage/db';
import { DEFAULT_TRADITIONAL_MINING_CONFIG } from '../../../../shared/mining';
import type { AgentMemoryCategory } from '../../../../shared/localAgentMemory';
import {
  loadLocalAgentMemory,
  onLocalAgentMemoryChanged,
  removeLocalAgentMemory,
  resetLocalAgentMemory,
  saveLocalAgentMemory,
} from '../../../localAgentMemoryStore';

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

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function tierLabel(tier: DomainInventoryItem['tier'], t: TFn): string {
  if (tier === 'host') return t('settings.memory.tier.host');
  if (tier === 'durable') return t('settings.memory.tier.durable');
  if (tier === 'mixed') return t('settings.memory.tier.mixed');
  return t('settings.memory.tier.local');
}

export default function MemoryPage() {
  const { t, lang } = useT();
  const { focusSettingId } = useSettings();
  const [domains, setDomains] = useState<DomainInventoryItem[]>([]);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [sys, setSys] = useState<SystemMetrics | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('');
  const [agentMemory, setAgentMemory] = useState(() => loadLocalAgentMemory());
  const [agentMemoryId, setAgentMemoryId] = useState('');
  const [agentMemoryCategory, setAgentMemoryCategory] =
    useState<AgentMemoryCategory>('user-preference');
  const [agentMemoryKey, setAgentMemoryKey] = useState('');
  const [agentMemoryValue, setAgentMemoryValue] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const refreshStorage = useCallback(async () => {
    setLoadError('');
    try {
      setDomains(await listSettingsDomains());
    } catch (error) {
      setDomains([]);
      setLoadError(error instanceof Error ? error.message : t('settings.memory.inventoryFail'));
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

  useEffect(() => onLocalAgentMemoryChanged(setAgentMemory), []);

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
        t('settings.memory.backupDownloaded', { format: String(backup.format), count: n }),
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
      setStatus(t('settings.memory.backupRestored'));
      setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleClearDomain(d: DomainInventoryItem): Promise<void> {
    if (!d.clearable) return;
    const msg = d.clearConfirm ?? t('settings.memory.clearDomainMsg', { label: d.label });
    const ok = await confirmDialog({
      title: t('settings.memory.clearDomainTitle'),
      message: msg,
      confirmLabel: t('settings.memory.clear'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setStatus('');
    try {
      const err = await clearSettingsDomain(d.id);
      setStatus(err ?? t('settings.memory.clearedLabel', { label: d.label }));
      await refreshStorage();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleFactoryReset(): Promise<void> {
    const ok = await confirmDialog({
      title: t('settings.memory.factoryTitle'),
      message: t('settings.memory.factoryMessage'),
      confirmLabel: t('settings.memory.factoryButton'),
      danger: true,
    });
    if (!ok) return;
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

  function clearAgentMemoryEditor(): void {
    setAgentMemoryId('');
    setAgentMemoryCategory('user-preference');
    setAgentMemoryKey('');
    setAgentMemoryValue('');
  }

  function handleSaveAgentMemory(): void {
    const key = agentMemoryKey.trim();
    const value = agentMemoryValue.trim();
    if (!key || !value) {
      setStatus('A memory label and value are required.');
      return;
    }
    const id = agentMemoryId
      || (typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `memory-${Date.now()}`);
    setAgentMemory(saveLocalAgentMemory({
      id,
      category: agentMemoryCategory,
      key,
      value,
    }));
    clearAgentMemoryEditor();
    setStatus(agentMemoryId ? 'Agent memory updated.' : 'Agent memory added.');
  }

  async function handleDeleteAgentMemory(id: string, label: string): Promise<void> {
    const ok = await confirmDialog({
      title: 'Delete agent memory',
      message: `Delete “${label}” from the local agent's memory?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setAgentMemory(removeLocalAgentMemory(id));
    if (agentMemoryId === id) clearAgentMemoryEditor();
    setStatus('Agent memory deleted.');
  }

  async function handleClearAgentMemory(): Promise<void> {
    if (!agentMemory.entries.length) return;
    const ok = await confirmDialog({
      title: 'Clear agent memory',
      message: 'Delete all saved agent preferences, learning notes, and application memories?',
      confirmLabel: 'Clear memory',
      danger: true,
    });
    if (!ok) return;
    setAgentMemory(resetLocalAgentMemory());
    clearAgentMemoryEditor();
    setStatus('Agent memory cleared.');
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

  const quickActions = [
    { id: 'environment', labelKey: 'settings.memory.quick.environment' },
    { id: 'flashcards', labelKey: 'settings.memory.quick.flashcards' },
    { id: 'clipboard', labelKey: 'settings.memory.quick.clipboard' },
    { id: 'lyrics-cache', labelKey: 'settings.memory.quick.lyrics' },
    { id: 'lookups', labelKey: 'settings.memory.quick.lookups' },
    { id: 'mining', labelKey: 'settings.memory.quick.mining' },
  ] as const;

  return (
    <>
      <SettingsCard
        id="system-memory"
        title={t('search.systemMemory')}
        description={t('search.systemMemory.desc')}
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
            {t('settings.memory.refresh')}
          </button>
        }
      >
        {sys ? (
          <>
            <Meter
              label={t('settings.memory.ram')}
              pct={ramPct}
              detail={t('settings.memory.usedOf', {
                used: formatBytes(ramUsed),
                total: formatBytes(sys.totalmem),
                pct: String(Math.round(ramPct)),
              })}
            />
            <div className="memory-sys-meta muted">
              <span>
                {t('settings.memory.cpuLoad', { pct: String(Math.round(sys.cpuLoad * 100)) })}
              </span>
              <span aria-hidden>·</span>
              <span>{t('settings.memory.uptime', { uptime: formatUptime(sys.uptime) })}</span>
              <span aria-hidden>·</span>
              <span>{sys.platform}</span>
            </div>
          </>
        ) : (
          <p className="muted os-set-hint">{t('settings.memory.sysUnavailable')}</p>
        )}
      </SettingsCard>

      <SettingsCard
        id="storage-usage"
        title={t('search.storageUsage')}
        description={t('search.storageUsage.desc')}
        highlight={focusSettingId === 'storage-usage' || focusSettingId === 'memory'}
      >
        {usage ? (
          <Meter
            label={t('settings.memory.quota')}
            pct={usagePct}
            detail={t('settings.memory.usedOf', {
              used: formatBytes(usage.used),
              total: formatBytes(usage.quota),
              pct: usagePct.toFixed(1),
            })}
          />
        ) : (
          <p className="muted os-set-hint">{t('settings.memory.storageUnavailable')}</p>
        )}
        <p className="muted os-set-hint" style={{ marginTop: 8 }}>
          {t(
            present.length === 1
              ? 'settings.memory.catalogSummaryOne'
              : 'settings.memory.catalogSummary',
            { bytes: formatBytes(totalBytes), count: present.length },
          )}
        </p>
        {env && (
          <p className="memory-env-summary" style={{ marginTop: 8 }}>
            <strong>{t('settings.memory.livingLayer')}</strong>
            <span className="muted"> — {env.detail}</span>
          </p>
        )}
        {loadError && <p className="memory-status">{loadError}</p>}
      </SettingsCard>

      <SettingsCard
        id="storage-inventory"
        title={t('settings.memory.inventoryTitle')}
        description={t('settings.memory.inventoryDesc')}
        highlight={focusSettingId === 'storage-inventory'}
      >
        <div className="memory-filter-row">
          <input
            type="search"
            className="os-set-search-input"
            placeholder={t('settings.memory.filterPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label={t('settings.memory.filterAria')}
          />
        </div>
        <div className="memory-inventory-wrap">
          <table className="memory-inventory">
            <thead>
              <tr>
                <th>{t('settings.memory.col.settings')}</th>
                <th>{t('settings.memory.col.category')}</th>
                <th>{t('settings.memory.col.where')}</th>
                <th>{t('settings.memory.col.size')}</th>
                <th>{t('settings.memory.col.detail')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    {loadError
                      ? t('settings.memory.inventoryFailed')
                      : t('settings.memory.noMatches')}
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.id} className={d.present || d.bytes > 0 ? '' : 'memory-row-empty'}>
                  <td>
                    <strong className="memory-domain-label">{d.label}</strong>
                  </td>
                  <td className="muted">{d.category}</td>
                  <td className="muted">{tierLabel(d.tier, t)}</td>
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
                        {t('settings.memory.clear')}
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
          {t('settings.memory.inventoryHint')}
        </p>
      </SettingsCard>

      <SettingsCard
        id="agent-memory"
        title="Local agent memory"
        description="Review and control what the offline assistant remembers. Memories stay on this device."
        highlight={focusSettingId === 'agent-memory'}
      >
        <div className="memory-filter-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select
            className="os-set-search-input"
            value={agentMemoryCategory}
            aria-label="Memory category"
            onChange={(event) => setAgentMemoryCategory(event.target.value as AgentMemoryCategory)}
          >
            <option value="user-preference">User preference</option>
            <option value="learning">Learning</option>
            <option value="application">Application</option>
          </select>
          <input
            className="os-set-search-input"
            value={agentMemoryKey}
            maxLength={120}
            placeholder="Memory label"
            aria-label="Memory label"
            onChange={(event) => setAgentMemoryKey(event.target.value)}
          />
          <input
            className="os-set-search-input"
            value={agentMemoryValue}
            maxLength={2000}
            placeholder="What should the agent remember?"
            aria-label="Memory value"
            onChange={(event) => setAgentMemoryValue(event.target.value)}
          />
          <button type="button" className="btn" onClick={handleSaveAgentMemory}>
            {agentMemoryId ? 'Save changes' : 'Add memory'}
          </button>
          {agentMemoryId && (
            <button type="button" className="btn" onClick={clearAgentMemoryEditor}>
              Cancel
            </button>
          )}
        </div>
        <div className="memory-inventory-wrap" style={{ marginTop: 10 }}>
          <table className="memory-inventory">
            <thead>
              <tr>
                <th>Category</th>
                <th>Memory</th>
                <th>Value</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!agentMemory.entries.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    The local agent has no saved memories.
                  </td>
                </tr>
              )}
              {agentMemory.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="muted">{entry.category.replace('-', ' ')}</td>
                  <td><strong>{entry.key}</strong></td>
                  <td className="memory-detail">{entry.value}</td>
                  <td className="muted">
                    {entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString(LANG_TAGS[lang]) : '—'}
                  </td>
                  <td>
                    <div className="memory-actions">
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => {
                          setAgentMemoryId(entry.id);
                          setAgentMemoryCategory(entry.category);
                          setAgentMemoryKey(entry.key);
                          setAgentMemoryValue(entry.value);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => void handleDeleteAgentMemory(entry.id, entry.key)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="memory-actions" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn danger"
            disabled={!agentMemory.entries.length}
            onClick={() => void handleClearAgentMemory()}
          >
            Clear agent memory
          </button>
        </div>
      </SettingsCard>

      <SettingsCard
        id="backup"
        title={t('search.backup')}
        description={t('search.backup.desc')}
        highlight={focusSettingId === 'backup'}
      >
        <p className="muted os-set-hint">{t('settings.memory.backupHint')}</p>
        <div className="memory-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void handleExport()}>
            <Icon name="download" size={14} style={{ marginRight: 5, verticalAlign: '-2px' }} />
            {t('settings.memory.exportAll')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => importRef.current?.click()}
          >
            {t('settings.memory.importBackup')}
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
        title={t('settings.memory.quickTitle')}
        description={t('settings.memory.quickDesc')}
        highlight={focusSettingId === 'clear-data'}
      >
        <div className="memory-actions">
          {quickActions.map(({ id, labelKey }) => {
            const label = t(labelKey);
            return (
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
                    }, t('settings.memory.cleared', { label }));
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard
        id="factory-reset"
        title={t('search.factoryReset')}
        description={t('search.factoryReset.desc')}
        highlight={focusSettingId === 'factory-reset'}
      >
        <button
          type="button"
          className="btn danger"
          disabled={busy}
          onClick={() => void handleFactoryReset()}
        >
          {t('settings.memory.factoryButton')}
        </button>
      </SettingsCard>

      {status && <p className="memory-status muted">{status}</p>}
    </>
  );
}
