import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { playSound } from '../../audio/soundEngine';
import {
  getWiredArchiveLifecycleState,
  requestWiredArchiveWake,
  skipWiredArchiveLifecycle,
  subscribeWiredArchiveLifecycle,
  type WiredArchivePhase,
} from '../../wiredArchiveLifecycle';
import { formatLayer } from '../../wiredMechanics/layer';
import { getWiredLayerState } from '../../wiredMechanics/layerStore';
import { peekWiredMemory } from '../../wiredMechanics/memoryFeed';
import { loadWiredMechanicsSettings } from '../../wiredMechanics/settings';

// 'breach' is owned by WiredBreachOverlay — the exit sequence has its own
// presentation and must not be double-rendered behind the boot panel.
const HIDDEN = new Set<WiredArchivePhase>(['inactive', 'active', 'breach']);

/**
 * Boot console lines. Content-neutral fiction codes (device ids, checksums),
 * deliberately literal — the translated chrome around them is the kicker and
 * the status line.
 */
const BOOT_LINES = [
  'NAVI SHELL 0.9 / SUBSYSTEM HANDOFF',
  'PXE LINK: LEGACY NODE FOUND',
  'MOUNTING /archive/lingua',
  'JPN CORPUS INDEX ........ OK 0x3F2A',
  'SRS MEMORY MAP .......... OK 0x91C4',
  'IMMERSION FEED .......... DEGRADED 0x0000',
  'WIRED NODE .............. LISTENING 0x6D1F',
  'USER CLEARANCE .......... TEMPORARY 0x00C9',
];

/**
 * Protocol layers the boot "descends" through: every layer down to the deepest
 * one the operator has reached (layer descent, `wiredMechanics/layer.ts`). With
 * descent switched off the boot keeps its original nine.
 */
function bootLayers(): string[] {
  const depth = loadWiredMechanicsSettings().layerDescent ? getWiredLayerState().layer : 9;
  return Array.from({ length: depth }, (_, i) => formatLayer(i + 1));
}

/** Simulated memory test ceiling, in KB. */
const MEM_TOTAL_KB = 524288;

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

/**
 * BIOS-style memory count. Runs only while the boot console is showing, in
 * coarse steps (a POST counter is not smooth), and lands on the total at once
 * under reduced motion.
 */
function useMemoryCount(active: boolean, reduced: boolean): number {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    if (reduced) {
      setKb(MEM_TOTAL_KB);
      return undefined;
    }
    setKb(0);
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      const next = Math.min(MEM_TOTAL_KB, Math.round((MEM_TOTAL_KB * n) / 18 / 64) * 64);
      setKb(next);
      if (next >= MEM_TOTAL_KB) window.clearInterval(id);
    }, 60);
    return () => window.clearInterval(id);
  }, [active, reduced]);
  return kb;
}

export default function WiredArchiveBootOverlay() {
  const { t, lang } = useT();
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

  // Handshake: the line negotiating with the archive, partway through the
  // layer descent. Goes through soundEngine like every cue (mute/volume apply).
  useEffect(() => {
    if (lifecycle.phase !== 'boot') return undefined;
    const id = window.setTimeout(() => void playSound('system', 'handshake'), lifecycle.reducedMotion ? 0 : 1300);
    return () => window.clearTimeout(id);
  }, [lifecycle.phase, lifecycle.sequenceId, lifecycle.reducedMotion]);

  const booting = lifecycle.phase === 'preboot' || lifecycle.phase === 'boot';
  const memKb = useMemoryCount(booting, lifecycle.reducedMotion);

  // Read once per boot sequence, not per frame: the layer and the recall
  // buffer line are what the archive "finds" while it mounts.
  const layers = useMemo(() => bootLayers(), [lifecycle.sequenceId]);
  const bootLines = useMemo(() => {
    const due = loadWiredMechanicsSettings().wiredRemembers ? peekWiredMemory().dueCount : null;
    if (due === null) return BOOT_LINES;
    // Literal POST line, same shape as its neighbours; the count is real.
    const recall = `RECALL BUFFER ........... ${String(due).padStart(4, '0')} DUE`;
    return [...BOOT_LINES.slice(0, 5), recall, ...BOOT_LINES.slice(5)];
  }, [lifecycle.sequenceId]);

  const visibleLines = useMemo(() => {
    if (lifecycle.phase === 'preboot') return bootLines.slice(0, 2);
    if (lifecycle.phase === 'boot') return bootLines;
    return bootLines.slice(-4);
  }, [bootLines, lifecycle.phase]);

  if (HIDDEN.has(lifecycle.phase)) return null;

  const classes = [
    'wired-boot',
    `phase-${lifecycle.phase}`,
    lifecycle.reducedMotion ? 'reduced' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const now = new Date();
  const status = t(lifecycle.messageKey);
  const showConsole = lifecycle.phase !== 'warning' && lifecycle.phase !== 'sleeping' && lifecycle.phase !== 'shutting-down';

  return (
    <div className={classes} role="status" aria-live="polite" aria-label={status}>
      <div className="wired-boot-grid" aria-hidden="true" />
      <div className="wired-boot-noise" aria-hidden="true" />
      <div className="wired-boot-vignette" aria-hidden="true" />
      {/* CRT power-on: the beam opens from a single bright line. */}
      <div className="wired-boot-beam" aria-hidden="true" />
      <div className="wired-boot-panel" key={lifecycle.sequenceId}>
        <header className="wired-boot-head">
          <span>WIRED ARCHIVE / NAVI SHELL</span>
          <span>TERMINAL ID: {layers[layers.length - 1].replace(':', '-')}</span>
          <span>
            {now.toLocaleDateString(LANG_TAGS[lang], { year: '2-digit', month: '2-digit', day: '2-digit' })} /{' '}
            {now.toLocaleTimeString(LANG_TAGS[lang], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </header>
        <div className="wired-boot-post" aria-hidden="true">
          <span>MEM TEST</span>
          <span className="wired-boot-mem">{String(memKb).padStart(6, '0')}K</span>
          <span className={memKb >= MEM_TOTAL_KB ? 'wired-boot-mem-ok is-ok' : 'wired-boot-mem-ok'}>
            {memKb >= MEM_TOTAL_KB ? 'OK' : '..'}
          </span>
        </div>
        <ol className="wired-boot-layers" aria-hidden="true">
          {layers.map((layer, i) => (
            <li key={layer} style={{ '--wb-layer': i } as CSSProperties}>
              {layer}
            </li>
          ))}
        </ol>
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
          ) : showConsole ? (
            <ol className="wired-boot-lines">
              {visibleLines.map((line, i) => (
                <li key={line} style={{ '--wired-line-index': i } as CSSProperties}>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          ) : null}
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
          <span>{status}</span>
        </div>
      </div>
    </div>
  );
}
