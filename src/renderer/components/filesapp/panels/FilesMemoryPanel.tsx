/**
 * Memory, in the Files app — gate 8's first surface, and decision 1's sanctioned
 * migration out of Settings.
 *
 * **Every reader here is the call `MemoryPage` made, unchanged.** That is the
 * whole point of the gate: "the same numbers the old Settings page produced,
 * captured before removal and compared after". `listSettingsDomains()`,
 * `navigator.storage.estimate()`, `window.api.systemGetMetrics()`,
 * `loadLocalAgentMemory()` and `getAgentOperationHistorySnapshot()` are the same
 * five sources, called the same way, formatted through the same `formatBytes`.
 * A second implementation of any of them is the only way to produce a different
 * number, so there isn't one.
 *
 * The comparison anchor is `src/.coordination/files-app/gate8-before.json`.
 * Compare `totalmem`, `platform`, `domainsAll`, `domainsPresent` and the
 * inventory ids EXACTLY; `freemem`, `used` and `quota` are live machine state
 * and a different value there is correct — a NULL is not.
 *
 * Three things changed on the way across, all deliberate:
 *
 * 1. `SettingsCard` → `FilesPanelCard`. The former calls `useSettings()` and
 *    throws outside a Settings host; see that module's note.
 * 2. `focusSettingId` from context → a `focusCardId` prop. The Files app has no
 *    settings controller; the scope handoff carries the anchor instead.
 * 3. The agent-memory block's fourteen raw English literals are now catalog
 *    keys. They were a standing i18n violation on the old page and copying them
 *    forward would have carried it into a brand-new surface.
 *
 * **One reader was ADDED after the move: `inspectStorageHealth`.** It is not a
 * gate-8 parity number and is not compared against `gate8-before.json` — it is
 * audit item 5.7's hardening becoming visible. `storageHealth.ts` measures the
 * store and `localStorageWrite.ts` records the writes it refuses, and until this
 * panel read them neither had a consumer: the guard existed and nobody could see
 * it. It renders INSIDE the existing `storage-usage` card rather than as a tenth
 * one, because the card ids are gate 8's anchors and the parity test asserts the
 * rendered set EQUALS the captured set — a new card is a gate-8 failure.
 *
 * `confirmDialog` is imported from `ui/dialogService` and NOT the `ui` barrel —
 * the barrel re-exports `AppChrome`, and the Files app must not pull the Study
 * OS chrome into its bundle. Same reason `StatsContent` does it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icons';
import { confirmDialog } from '../../ui/dialogService';
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
import {
  DEFAULT_STORAGE_BUDGET,
  inspectStorageHealth,
  type StorageHealth,
  type StorageHealthStatus,
} from '../../../../shared/storageHealth';
import {
  clearLastStorageWriteFailure,
  getLastStorageWriteFailure,
  type StorageWriteFailure,
} from '../../../localStorageWrite';
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
import {
  AGENT_HISTORY_CHANGED_EVENT,
  clearAgentOperationHistorySnapshot,
  getAgentOperationHistorySnapshot,
} from '../../../agentOperationalClient';
import { AGENT_OPERATION_HISTORY_RETENTION_MS } from '../../../../shared/agentOperationHistory';
import { AGENT_TOOL_OPERATIONS } from '../../../../shared/localAgent';
import { FilesPanelCard } from './FilesPanelCard';

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

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function Meter({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className="fa-meter">
      <div className="fa-meter-head">
        <span className="fa-meter-label">{label}</span>
        <span className="fa-panel-note">{detail}</span>
      </div>
      <div
        className="fa-meter-bar"
        role="progressbar"
        aria-valuenow={Math.round(p)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="fa-meter-fill" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

/** Operation id to the registry's own label, built once rather than per row. */
const operationLabels = new Map(
  AGENT_TOOL_OPERATIONS.map((definition) => [definition.id, definition.label]),
);

/**
 * Status and reasons are resolved by explicit literal, not by building the key
 * from the union member. A composed `settings.memory.health.${status}` reads as
 * three missing keys to every tool that scans for `t('…')` call sites.
 */
function healthLabel(status: StorageHealthStatus, t: TFn): string {
  if (status === 'critical') return t('settings.memory.health.critical');
  if (status === 'warn') return t('settings.memory.health.warn');
  return t('settings.memory.health.ok');
}

function failureReason(kind: StorageWriteFailure['kind'], t: TFn): string {
  if (kind === 'quota') return t('settings.memory.health.kind.quota');
  if (kind === 'serialize') return t('settings.memory.health.kind.serialize');
  return t('settings.memory.health.kind.other');
}

function tierLabel(tier: DomainInventoryItem['tier'], t: TFn): string {
  if (tier === 'host') return t('settings.memory.tier.host');
  if (tier === 'durable') return t('settings.memory.tier.durable');
  if (tier === 'mixed') return t('settings.memory.tier.mixed');
  return t('settings.memory.tier.local');
}

export interface FilesMemoryPanelProps {
  /** Card anchor a search hit named, when it named one. */
  focusCardId?: string | null;
}

export function FilesMemoryPanel({ focusCardId = null }: FilesMemoryPanelProps) {
  const { t, lang } = useT();
  const [domains, setDomains] = useState<DomainInventoryItem[]>([]);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [writeFailure, setWriteFailure] = useState<StorageWriteFailure | null>(null);
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
  const [agentHistory, setAgentHistory] = useState(() => getAgentOperationHistorySnapshot());
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const listener = () => setAgentHistory(getAgentOperationHistorySnapshot());
    window.addEventListener(AGENT_HISTORY_CHANGED_EVENT, listener);
    return () => window.removeEventListener(AGENT_HISTORY_CHANGED_EVENT, listener);
  }, []);

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
    try {
      // `navigator.storage.estimate()` above is the whole ORIGIN — IndexedDB,
      // caches and localStorage together. This is localStorage alone, which is
      // the store 5.7 filled and the only one whose keys can be named.
      setHealth(inspectStorageHealth(localStorage));
    } catch {
      setHealth(null);
    }
    setWriteFailure(getLastStorageWriteFailure());
    // `t` is stable by design; depending on it would never re-fire anyway, and
    // the only string it produces here is an error fallback.
  }, [t]);

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
      setStatus(t('filesApp.system.agentMemory.needsBoth'));
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
    setStatus(
      agentMemoryId
        ? t('filesApp.system.agentMemory.updated')
        : t('filesApp.system.agentMemory.added'),
    );
  }

  async function handleDeleteAgentMemory(id: string, label: string): Promise<void> {
    const ok = await confirmDialog({
      title: t('filesApp.system.agentMemory.deleteTitle'),
      message: t('filesApp.system.agentMemory.deleteMessage', { label }),
      confirmLabel: t('filesApp.system.agentMemory.delete'),
      danger: true,
    });
    if (!ok) return;
    setAgentMemory(removeLocalAgentMemory(id));
    if (agentMemoryId === id) clearAgentMemoryEditor();
    setStatus(t('filesApp.system.agentMemory.deleted'));
  }

  async function handleClearAgentMemory(): Promise<void> {
    if (!agentMemory.entries.length) return;
    const ok = await confirmDialog({
      title: t('filesApp.system.agentMemory.clearTitle'),
      message: t('filesApp.system.agentMemory.clearMessage'),
      confirmLabel: t('filesApp.system.agentMemory.clear'),
      danger: true,
    });
    if (!ok) return;
    setAgentMemory(resetLocalAgentMemory());
    clearAgentMemoryEditor();
    setStatus(t('filesApp.system.agentMemory.cleared'));
  }

  /**
   * Deletion is exact and immediate, and the confirmation says what it does NOT
   * do: dropping the record does not reverse the operations it describes.
   */
  async function handleClearAgentHistory(): Promise<void> {
    if (!agentHistory.entries.length) return;
    const ok = await confirmDialog({
      title: t('search.agentHistory'),
      message: t('settings.memory.agentHistory.confirm', {
        count: agentHistory.entries.length,
      }),
      confirmLabel: t('settings.memory.agentHistory.clear'),
      danger: true,
    });
    if (!ok) return;
    setAgentHistory(clearAgentOperationHistorySnapshot());
    setStatus(t('settings.memory.agentHistory.cleared'));
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

  const agentCategories: { value: AgentMemoryCategory; labelKey: string }[] = [
    { value: 'user-preference', labelKey: 'filesApp.system.agentMemory.cat.userPreference' },
    { value: 'learning', labelKey: 'filesApp.system.agentMemory.cat.learning' },
    { value: 'application', labelKey: 'filesApp.system.agentMemory.cat.application' },
  ];

  return (
    <div className="fa-panel fa-panel-memory">
      <FilesPanelCard
        id="system-memory"
        title={t('search.systemMemory')}
        description={t('search.systemMemory.desc')}
        focused={focusCardId === 'system-memory'}
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
            <div className="fa-panel-meta">
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
          <p className="fa-panel-note">{t('settings.memory.sysUnavailable')}</p>
        )}
      </FilesPanelCard>

      <FilesPanelCard
        id="storage-usage"
        title={t('search.storageUsage')}
        description={t('search.storageUsage.desc')}
        // `memory` was the old page id and the old catch-all anchor; a search
        // hit still carrying it lands here rather than on nothing.
        focused={focusCardId === 'storage-usage' || focusCardId === 'memory'}
      >
        {usage ? (
          <Meter
            label={t('settings.memory.quota')}
            pct={usagePct}
            detail={t('settings.memory.usedOf', {
              used: formatBytes(usage.used),
              total: formatBytes(usage.quota),
              // Rounded as a NUMBER, not `toFixed(1)`: `t()` locale-formats
              // numbers via Intl and passes strings through verbatim, so the
              // string form prints "3.2" to a Russian reader whose every other
              // number on this panel says "3,2" (core.ts:62).
              pct: Math.round(usagePct * 10) / 10,
            })}
          />
        ) : (
          <p className="fa-panel-note">{t('settings.memory.storageUnavailable')}</p>
        )}
        <p className="fa-panel-note">
          {t(
            present.length === 1
              ? 'settings.memory.catalogSummaryOne'
              : 'settings.memory.catalogSummary',
            { bytes: formatBytes(totalBytes), count: present.length },
          )}
        </p>
        {health ? (
          <div className={`fa-panel-health is-${health.status}`} data-storage-health={health.status}>
            <p className="fa-panel-note">
              <strong>{healthLabel(health.status, t)}</strong>
              <span>
                {' — '}
                {t('settings.memory.health.footprint', {
                  bytes: formatBytes(health.footprint.totalBytes),
                  count: health.footprint.keyCount,
                })}
              </span>
            </p>
            {health.overEncoded.length > 0 ? (
              <p className="fa-panel-status">
                {t('settings.memory.health.overEncoded', {
                  keys: health.overEncoded.map((entry) => `${entry.key} ×${entry.layers}`).join(', '),
                })}
              </p>
            ) : null}
            {health.reasons.includes('total-over-budget') ? (
              <p className="fa-panel-status">
                {t('settings.memory.health.totalOverBudget', {
                  budget: formatBytes(DEFAULT_STORAGE_BUDGET.totalBudgetBytes),
                })}
              </p>
            ) : null}
            {health.oversizedKeys.length > 0 ? (
              <p className="fa-panel-status">
                {t('settings.memory.health.keyOverBudget', {
                  budget: formatBytes(DEFAULT_STORAGE_BUDGET.keyBudgetBytes),
                  keys: health.oversizedKeys
                    .map((entry) => `${entry.key} (${formatBytes(entry.bytes)})`)
                    .join(', '),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
        {writeFailure ? (
          <p className="fa-panel-status" data-storage-write-failure={writeFailure.kind}>
            {t('settings.memory.health.lastFailure', {
              key: writeFailure.key,
              bytes: formatBytes(writeFailure.bytes),
              when: new Date(writeFailure.at).toLocaleTimeString(LANG_TAGS[lang]),
              reason: failureReason(writeFailure.kind, t),
            })}{' '}
            <button
              type="button"
              className="btn small"
              onClick={() => {
                clearLastStorageWriteFailure();
                setWriteFailure(null);
              }}
            >
              {t('settings.memory.health.dismiss')}
            </button>
          </p>
        ) : null}
        {env ? (
          <p className="fa-panel-env">
            <strong>{t('settings.memory.livingLayer')}</strong>
            <span className="fa-panel-note"> — {env.detail}</span>
          </p>
        ) : null}
        {loadError ? <p className="fa-panel-status">{loadError}</p> : null}
      </FilesPanelCard>

      <FilesPanelCard
        id="storage-inventory"
        title={t('settings.memory.inventoryTitle')}
        description={t('settings.memory.inventoryDesc')}
        focused={focusCardId === 'storage-inventory'}
      >
        <div className="fa-panel-filter">
          <input
            type="search"
            placeholder={t('settings.memory.filterPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label={t('settings.memory.filterAria')}
          />
        </div>
        <div className="fa-panel-table-wrap">
          <table className="fa-panel-table">
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="fa-panel-note">
                    {loadError
                      ? t('settings.memory.inventoryFailed')
                      : t('settings.memory.noMatches')}
                  </td>
                </tr>
              ) : null}
              {filtered.map((d) => (
                <tr key={d.id} data-empty={d.present || d.bytes > 0 ? undefined : 'true'}>
                  <td>
                    <strong>{d.label}</strong>
                  </td>
                  <td className="fa-panel-note">{d.category}</td>
                  <td className="fa-panel-note">{tierLabel(d.tier, t)}</td>
                  <td>{d.bytes > 0 ? formatBytes(d.bytes) : '—'}</td>
                  <td className="fa-panel-note">{d.detail}</td>
                  <td>
                    {d.clearable ? (
                      /* D344. The visible word stays "Clear" — the column head
                         says which column it is and 27 rows of the domain name
                         would be unreadable. The ACCESSIBLE name carries the
                         domain, because a screen reader offers these as a flat
                         list of 27 buttons all called "Clear", each destroying
                         a different settings domain. */
                      <button
                        type="button"
                        className="btn small"
                        aria-label={t('settings.memory.clearDomainAria', { label: d.label })}
                        disabled={busy || !(d.present || d.bytes > 0)}
                        onClick={() => void handleClearDomain(d)}
                      >
                        {t('settings.memory.clear')}
                      </button>
                    ) : (
                      <span className="fa-panel-note">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fa-panel-note">{t('settings.memory.inventoryHint')}</p>
      </FilesPanelCard>

      <FilesPanelCard
        id="agent-memory"
        title={t('search.agentMemory')}
        description={t('search.agentMemory.desc')}
        focused={focusCardId === 'agent-memory'}
      >
        <div className="fa-panel-filter fa-panel-editor">
          <select
            value={agentMemoryCategory}
            aria-label={t('filesApp.system.agentMemory.categoryLabel')}
            onChange={(event) => setAgentMemoryCategory(event.target.value as AgentMemoryCategory)}
          >
            {agentCategories.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.labelKey)}
              </option>
            ))}
          </select>
          <input
            value={agentMemoryKey}
            maxLength={120}
            placeholder={t('filesApp.system.agentMemory.keyLabel')}
            aria-label={t('filesApp.system.agentMemory.keyLabel')}
            onChange={(event) => setAgentMemoryKey(event.target.value)}
          />
          <input
            value={agentMemoryValue}
            maxLength={2000}
            placeholder={t('filesApp.system.agentMemory.valuePlaceholder')}
            aria-label={t('filesApp.system.agentMemory.valueLabel')}
            onChange={(event) => setAgentMemoryValue(event.target.value)}
          />
          <button type="button" className="btn" onClick={handleSaveAgentMemory}>
            {agentMemoryId
              ? t('filesApp.system.agentMemory.save')
              : t('filesApp.system.agentMemory.add')}
          </button>
          {agentMemoryId ? (
            <button type="button" className="btn" onClick={clearAgentMemoryEditor}>
              {t('common.cancel')}
            </button>
          ) : null}
        </div>
        <div className="fa-panel-table-wrap">
          <table className="fa-panel-table">
            <thead>
              <tr>
                <th>{t('filesApp.system.agentMemory.colCategory')}</th>
                <th>{t('filesApp.system.agentMemory.colMemory')}</th>
                <th>{t('filesApp.system.agentMemory.colValue')}</th>
                <th>{t('filesApp.system.agentMemory.colUpdated')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!agentMemory.entries.length ? (
                <tr>
                  <td colSpan={5} className="fa-panel-note">
                    {t('filesApp.system.agentMemory.empty')}
                  </td>
                </tr>
              ) : null}
              {agentMemory.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="fa-panel-note">
                    {t(
                      agentCategories.find((c) => c.value === entry.category)?.labelKey
                        ?? 'filesApp.system.agentMemory.cat.userPreference',
                    )}
                  </td>
                  <td>
                    <strong>{entry.key}</strong>
                  </td>
                  <td>{entry.value}</td>
                  <td className="fa-panel-note">
                    {entry.updatedAt
                      ? new Date(entry.updatedAt).toLocaleDateString(LANG_TAGS[lang])
                      : '—'}
                  </td>
                  <td>
                    <div className="fa-panel-actions">
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
                        {t('filesApp.system.agentMemory.edit')}
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => void handleDeleteAgentMemory(entry.id, entry.key)}
                      >
                        {t('filesApp.system.agentMemory.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fa-panel-actions">
          <button
            type="button"
            className="btn danger"
            disabled={!agentMemory.entries.length}
            onClick={() => void handleClearAgentMemory()}
          >
            {t('filesApp.system.agentMemory.clear')}
          </button>
        </div>
      </FilesPanelCard>

      <FilesPanelCard
        id="agent-history"
        title={t('search.agentHistory')}
        description={t('search.agentHistory.desc')}
        focused={focusCardId === 'agent-history'}
      >
        <p className="fa-panel-note">
          {t('settings.memory.agentHistory.retention', {
            count: agentHistory.entries.length,
            days: Math.round(AGENT_OPERATION_HISTORY_RETENTION_MS / 86_400_000),
          })}
        </p>
        <div className="fa-panel-table-wrap">
          <table className="fa-panel-table">
            <thead>
              <tr>
                <th>{t('settings.memory.agentHistory.colOperation')}</th>
                <th>{t('settings.memory.agentHistory.colClaim')}</th>
                <th>{t('settings.memory.agentHistory.colWhen')}</th>
              </tr>
            </thead>
            <tbody>
              {!agentHistory.entries.length ? (
                <tr>
                  <td colSpan={3} className="fa-panel-note">
                    {t('settings.memory.agentHistory.empty')}
                  </td>
                </tr>
              ) : null}
              {agentHistory.entries.map((entry) => (
                <tr key={entry.id}>
                  {/* The registry's own label, not the raw id: a row reading
                      `flashcard.add-cards` looks like a bug, not a record. */}
                  <td>
                    <strong>{operationLabels.get(entry.operation) ?? entry.operation}</strong>
                  </td>
                  <td>
                    {t(`settings.memory.agentHistory.claim.${entry.claim}`)}
                    {entry.entityIds.length > 0 ? (
                      <span className="fa-panel-note">
                        {' · '}
                        {t('settings.memory.agentHistory.entities', {
                          count: entry.entityIds.length,
                        })}
                      </span>
                    ) : null}
                  </td>
                  <td className="fa-panel-note">
                    {new Date(entry.at).toLocaleString(LANG_TAGS[lang])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fa-panel-actions">
          <button
            type="button"
            className="btn danger"
            disabled={!agentHistory.entries.length}
            onClick={() => void handleClearAgentHistory()}
          >
            {t('settings.memory.agentHistory.clear')}
          </button>
        </div>
      </FilesPanelCard>

      <FilesPanelCard
        id="backup"
        title={t('search.backup')}
        description={t('search.backup.desc')}
        focused={focusCardId === 'backup'}
      >
        <p className="fa-panel-note">{t('settings.memory.backupHint')}</p>
        <div className="fa-panel-actions">
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
      </FilesPanelCard>

      <FilesPanelCard
        id="clear-data"
        title={t('settings.memory.quickTitle')}
        description={t('settings.memory.quickDesc')}
        focused={focusCardId === 'clear-data'}
      >
        <div className="fa-panel-actions">
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
      </FilesPanelCard>

      <FilesPanelCard
        id="factory-reset"
        title={t('search.factoryReset')}
        description={t('search.factoryReset.desc')}
        focused={focusCardId === 'factory-reset'}
      >
        <button
          type="button"
          className="btn danger"
          disabled={busy}
          onClick={() => void handleFactoryReset()}
        >
          {t('settings.memory.factoryButton')}
        </button>
      </FilesPanelCard>

      {status ? (
        <p className="fa-panel-status" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}

export default FilesMemoryPanel;
