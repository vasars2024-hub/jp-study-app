import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useT } from '../../i18n';
import {
  getWiredArchiveLifecycleState,
  requestWiredArchiveWake,
  skipWiredArchiveLifecycle,
  subscribeWiredArchiveLifecycle,
  type WiredArchivePhase,
} from '../../wiredArchiveLifecycle';

// 'breach' is owned by WiredBreachOverlay — the exit sequence has its own
// presentation and must not be double-rendered behind the boot panel.
const HIDDEN = new Set<WiredArchivePhase>(['inactive', 'active', 'breach']);

const BOOT_LINES = [
  'VITA_XP SUBSYSTEM HANDOFF',
  'PXE LINK: LEGACY NODE FOUND',
  'MOUNTING /archive/lingua',
  'JPN CORPUS INDEX ........ OK 0x3F2A',
  'SRS MEMORY MAP .......... OK 0x91C4',
  'IMMERSION FEED .......... DEGRADED 0x0000',
  'WIRED NODE .............. LISTENING 0x6D1F',
  'USER CLEARANCE .......... TEMPORARY 0x00C9',
];

function phaseTitleKey(phase: WiredArchivePhase): string {
  if (phase === 'preboot') return 'wired.boot.kicker.preboot';
  if (phase === 'boot') return 'wired.boot.kicker.boot';
  if (phase === 'warning') return 'wired.boot.kicker.warning';
  if (phase === 'reveal') return 'wired.boot.kicker.reveal';
  if (phase === 'sleeping') return 'wired.boot.kicker.sleeping';
  if (phase === 'waking') return 'wired.boot.kicker.waking';
  if (phase === 'shutting-down') return 'wired.boot.kicker.shuttingDown';
  return 'wired.boot.kicker.default';
}

export default function WiredArchiveBootOverlay() {
  const { t } = useT();
  const [lifecycle, setLifecycle] = useState(getWiredArchiveLifecycleState);

  useEffect(() => subscribeWiredArchiveLifecycle(setLifecycle), []);

  useEffect(() => {
    if (HIDDEN.has(lifecycle.phase) || !lifecycle.canSkip) return;
    const skip = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-wired-boot-control]')) return;
      skipWiredArchiveLifecycle();
    };
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    return () => {
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [lifecycle.canSkip, lifecycle.phase]);

  useEffect(() => {
    if (lifecycle.phase !== 'sleeping') return;
    const wake = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-wired-boot-control]')) return;
      requestWiredArchiveWake();
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [lifecycle.phase]);

  const visibleLines = useMemo(() => {
    if (lifecycle.phase === 'preboot') return BOOT_LINES.slice(0, 2);
    if (lifecycle.phase === 'boot') return BOOT_LINES;
    return BOOT_LINES.slice(-4);
  }, [lifecycle.phase]);

  if (HIDDEN.has(lifecycle.phase)) return null;

  const classes = [
    'wired-boot',
    `phase-${lifecycle.phase}`,
    lifecycle.reducedMotion ? 'reduced' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const now = new Date();

  return (
    <div className={classes} role="status" aria-live="polite" aria-label={lifecycle.message}>
      <div className="wired-boot-grid" aria-hidden="true" />
      <div className="wired-boot-noise" aria-hidden="true" />
      <div className="wired-boot-vignette" aria-hidden="true" />
      <div className="wired-boot-panel">
        <header className="wired-boot-head">
          <span>WIRED ARCHIVE</span>
          <span>TERMINAL ID: LAYER-09</span>
          <span>
            {now.toLocaleDateString([], { year: '2-digit', month: '2-digit', day: '2-digit' })} /{' '}
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </header>
        <div className="wired-boot-map" aria-hidden="true">
          <svg viewBox="0 0 520 220" focusable="false">
            <path className="wired-boot-route" d="M36 156 C92 74 142 64 206 112 S331 167 392 77 482 68 500 102" />
            <path className="wired-boot-route route-b" d="M58 58 C126 132 191 148 264 84 S389 52 470 164" />
            {[44, 118, 204, 292, 390, 478].map((x, i) => (
              <g key={x}>
                <circle cx={x} cy={i % 2 ? 74 : 145} r="8" />
                <text x={x + 14} y={(i % 2 ? 74 : 145) + 4}>{`NODE-${String(i + 1).padStart(2, '0')}`}</text>
              </g>
            ))}
          </svg>
        </div>
        <section className="wired-boot-console">
          <div className="wired-boot-kicker">{t(phaseTitleKey(lifecycle.phase))}</div>
          {lifecycle.phase === 'warning' ? (
            <div className="wired-boot-warning">{t('wired.boot.warningBanner')}</div>
          ) : lifecycle.phase === 'sleeping' ? (
            <div className="wired-boot-sleep">
              <strong>{t('wired.boot.sleepTitle')}</strong>
              <span>{t('wired.boot.sleepBody')}</span>
            </div>
          ) : lifecycle.phase === 'shutting-down' ? (
            <div className="wired-boot-sleep">
              <strong>{t('wired.boot.shutdownTitle')}</strong>
              <span>{t('wired.boot.shutdownBody')}</span>
            </div>
          ) : (
            <ol className="wired-boot-lines">
              {visibleLines.map((line, i) => (
                <li key={line} style={{ '--wired-line-index': i } as CSSProperties}>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="wired-boot-controls">
          {lifecycle.phase === 'sleeping' ? (
            <button type="button" data-wired-boot-control="" onClick={requestWiredArchiveWake}>
              {t('wired.boot.wake')}
            </button>
          ) : (
            <button type="button" data-wired-boot-control="" disabled={!lifecycle.canSkip} onClick={skipWiredArchiveLifecycle}>
              {t('wired.boot.skip')}
            </button>
          )}
          <span>{lifecycle.message}</span>
        </div>
      </div>
    </div>
  );
}
