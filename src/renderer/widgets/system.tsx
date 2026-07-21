import { useEffect, useState } from 'react';
import type { WidgetProps } from './types';
import {
  clearLookupHistory,
  loadLookupHistory,
  onLookupHistoryChanged,
  type LookupHistoryEntry,
} from '../lookupHistory';
import { loadClipboardHistory, onClipboardHistoryChanged, type ClipboardEntry } from '../clipboardHistory';
import { useT } from '../i18n';

interface Metrics {
  cpuLoad: number;
  freemem: number;
  totalmem: number;
  platform: string;
  uptime: number;
  battery?: number | null;
  onBattery?: boolean | null;
}

function useSystemMetrics(intervalMs = 2500): Metrics | null {
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => {
    let dead = false;
    const tick = async () => {
      try {
        const next = await window.api.systemGetMetrics();
        if (!dead) setM(next);
      } catch {
        /* IPC unavailable */
      }
    };
    void tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      dead = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return m;
}

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

function Meter({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  const p = Math.min(100, Math.max(0, Math.round(pct * 100)));
  return (
    <div className="wgt-sys-meter">
      <div className="wgt-sys-row">
        <span>{label}</span>
        <span className="muted">{detail}</span>
      </div>
      <div className="wgt-sys-bar">
        <span style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

export function CpuWidget(_props: WidgetProps) {
  const { t } = useT();
  const m = useSystemMetrics();
  const load = m?.cpuLoad ?? 0;
  return (
    <div className="wgt wgt-sys">
      <Meter label={t('widgets.title.cpu-usage')} pct={load} detail={m ? `${Math.round(load * 100)}%` : '…'} />
      {m && <div className="wgt-sys-meta muted">{m.platform}</div>}
    </div>
  );
}

export function MemoryWidget(_props: WidgetProps) {
  const { t } = useT();
  const m = useSystemMetrics();
  const used = m ? m.totalmem - m.freemem : 0;
  const pct = m && m.totalmem > 0 ? used / m.totalmem : 0;
  return (
    <div className="wgt wgt-sys">
      <Meter
        label={t('widgets.title.memory-usage')}
        pct={pct}
        detail={m ? `${formatBytes(used)} / ${formatBytes(m.totalmem)}` : '…'}
      />
    </div>
  );
}

export function BatteryWidget(_props: WidgetProps) {
  const { t } = useT();
  const m = useSystemMetrics();
  const [level, setLevel] = useState<number | null>(null);
  const [charging, setCharging] = useState<boolean | null>(null);

  useEffect(() => {
    let dead = false;
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        // Narrower than `Function`: the BatteryManager events this reads are
        // 'levelchange' and 'chargingchange', both of which take a bare handler.
        addEventListener: (type: string, listener: () => void) => void;
      }>;
    };
    if (!nav.getBattery) return;
    void nav.getBattery().then((b) => {
      if (dead) return;
      const sync = () => {
        setLevel(b.level);
        setCharging(b.charging);
      };
      sync();
      b.addEventListener('levelchange', sync);
      b.addEventListener('chargingchange', sync);
    });
    return () => {
      dead = true;
    };
  }, []);

  const pct = level ?? m?.battery ?? null;
  const onBat = charging === false || m?.onBattery === true;
  return (
    <div className="wgt wgt-sys">
      {pct == null ? (
        <div className="wgt-sys-meta muted">
          {m?.onBattery != null
            ? m.onBattery
              ? t('widgets.battery.onBatteryUnknown')
              : t('widgets.battery.pluggedIn')
            : t('widgets.battery.unavailable')}
        </div>
      ) : (
        <Meter
          label={t('widgets.title.battery')}
          pct={pct}
          detail={`${Math.round(pct * 100)}%${onBat ? '' : t('widgets.battery.acSuffix')}`}
        />
      )}
    </div>
  );
}

export function NetworkWidget(_props: WidgetProps) {
  const { t } = useT();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return (
    <div className="wgt wgt-sys">
      <div className={`wgt-sys-net ${online ? 'on' : 'off'}`}>
        <span className="wgt-sys-dot" />
        {online ? t('widgets.network.online') : t('widgets.network.offline')}
      </div>
    </div>
  );
}

export function RecentLookupsWidget(_props: WidgetProps) {
  const { t } = useT();
  const [list, setList] = useState<LookupHistoryEntry[]>(() => loadLookupHistory());
  useEffect(() => onLookupHistoryChanged(() => setList(loadLookupHistory())), []);
  return (
    <div className="wgt wgt-recent">
      <div className="wgt-recent-head">
        <span className="muted">{t('widgets.recentLookups.title')}</span>
        {list.length > 0 && (
          <button type="button" className="wgt-btn-icon sm" title={t('widgets.recentLookups.clear')} onClick={() => clearLookupHistory()}>
            ×
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="muted wgt-recent-empty">{t('widgets.recentLookups.emptyHint')}</p>
      ) : (
        <ul className="wgt-recent-list">
          {list.slice(0, 12).map((e) => (
            <li key={`${e.query}-${e.at}`}>
              <span lang="ja">{e.query}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Lightweight view into the global Clipboard History (see clipboardHistory.ts
 * and components/ClipboardHistoryPanel.tsx) — never duplicates the history
 * logic itself. Clicking an entry, or the header, opens the full panel.
 */
export function ClipboardWidget(_props: WidgetProps) {
  const { t } = useT();
  const [entries, setEntries] = useState<ClipboardEntry[]>(() => loadClipboardHistory());
  useEffect(() => onClipboardHistoryChanged(() => setEntries(loadClipboardHistory())), []);
  const openFull = () => window.dispatchEvent(new CustomEvent('clipboard:open'));
  const recent = entries.slice(0, 6);
  return (
    <div className="wgt wgt-clip">
      <div className="wgt-recent-head">
        <span className="muted">{t('widgets.clipboardWidget.title')}</span>
        <button type="button" className="wgt-btn-icon sm" title={t('widgets.clipboardWidget.open')} onClick={openFull}>
          ⤢
        </button>
      </div>
      {recent.length === 0 ? (
        <p className="muted wgt-recent-empty">{t('widgets.clipboardWidget.emptyHint')}</p>
      ) : (
        <ul className="wgt-recent-list">
          {recent.map((e) => (
            <li key={e.id}>
              <button type="button" className="wgt-clip-line" onClick={openFull}>
                {(e.dictMeta?.expression ?? e.text).slice(0, 80)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
