/**
 * The WIRED study mechanics, mounted by the desktop only while Wired is the
 * live theme. Unmounting it (leaving Wired) tears down every listener, timer
 * and root attribute it set — nothing here runs under Study OS or Aero.
 *
 *  - Layer descent: event-driven depth tracking, `data-wired-depth` for the
 *    wallpaper, the crossing transmission.
 *  - Consoles: Navi terminal (TTY), Signal decrypt (DCR), intercept channel (ICP).
 *  - Intercepts: an idle-return dictation, rate-limited and gated.
 */
import { useEffect, useRef, useState } from 'react';
import NaviTerminal from './NaviTerminal';
import SignalDecrypt from './SignalDecrypt';
import InterceptPanel from './InterceptPanel';
import LayerTransmission from './LayerTransmission';
import {
  isWiredConsoleOpen,
  openWiredConsole,
  registerInterceptTrigger,
  setWiredConsoleHostMounted,
  useWiredConsoles,
} from '../../wiredMechanics/consoleBus';
import {
  loadWiredMechanicsSettings,
  onWiredMechanicsSettingsChanged,
  type WiredMechanicsSettings,
} from '../../wiredMechanics/settings';
import { startWiredLayerTracking, useWiredLayer } from '../../wiredMechanics/layerStore';
import { isUnlocked, wallpaperDepth } from '../../wiredMechanics/layer';
import { interceptCode, interceptGate, pickInterceptSource, INTERCEPT_IDLE_MS, type InterceptBlockers } from '../../wiredMechanics/intercept';
import { getActiveIntercept, loadInterceptRecord, noteInterceptRaised, setActiveIntercept } from '../../wiredMechanics/interceptStore';
import { loadDeck } from '../../flashcardDeck';
import { getWiredArchiveLifecycleState } from '../../wiredArchiveLifecycle';
import { playSound } from '../../audio/soundEngine';
import { wiredUiCuesEnabled } from '../../terminalModeSettings';

function readBlockers(): InterceptBlockers {
  const doc = document;
  const active = doc.activeElement as HTMLElement | null;
  const typing =
    !!active &&
    (active.isContentEditable ||
      active.tagName === 'TEXTAREA' ||
      (active.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|reset|color|file)$/i.test((active as HTMLInputElement).type)));
  const video = Array.from(doc.querySelectorAll('video')).some((v) => !v.paused && !v.ended && v.readyState > 2);
  const reviewing = isWiredConsoleOpen('decrypt') || !!doc.querySelector('.flash-card, .anki-card');
  const locked = getWiredArchiveLifecycleState().phase !== 'active' || !!doc.querySelector('.lockscreen');
  return { reviewing, video, typing, locked, hidden: doc.visibilityState === 'hidden' };
}

export default function WiredMechanicsHost() {
  const [settings, setSettings] = useState<WiredMechanicsSettings>(loadWiredMechanicsSettings);
  const consoles = useWiredConsoles();
  const { layer } = useWiredLayer();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => onWiredMechanicsSettingsChanged(setSettings), []);

  useEffect(() => {
    setWiredConsoleHostMounted(true);
    return () => setWiredConsoleHostMounted(false);
  }, []);

  // Layer tracking — only while descent is on.
  useEffect(() => (settings.layerDescent ? startWiredLayerTracking() : undefined), [settings.layerDescent]);

  // Wallpaper depth + cursor preset, stamped on <html> for the CSS.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.layerDescent) root.dataset.wiredDepth = String(wallpaperDepth(layer));
    else delete root.dataset.wiredDepth;
    if (settings.cursor === 'reticle' && isUnlocked(layer, 'cursor', 'reticle')) root.dataset.wiredCursor = 'reticle';
    else delete root.dataset.wiredCursor;
  }, [layer, settings.cursor, settings.layerDescent]);

  useEffect(
    () => () => {
      delete document.documentElement.dataset.wiredDepth;
      delete document.documentElement.dataset.wiredCursor;
    },
    [],
  );

  // Intercepts: the manual trigger always exists; the idle-return trigger only
  // while the schedule is on.
  useEffect(() => {
    const raise = (manual: boolean): string => {
      if (getActiveIntercept()) return 'busy';
      const s = settingsRef.current;
      const record = loadInterceptRecord();
      const reason = interceptGate({
        now: Date.now(),
        enabled: s.intercepts,
        lastAt: record.lastAt,
        intervalMin: s.interceptIntervalMin,
        idleForMs: manual ? 0 : INTERCEPT_IDLE_MS,
        blockers: readBlockers(),
        manual,
      });
      if (reason !== 'ok') return reason;
      const seed = Date.now() % 1_000_003;
      const source = pickInterceptSource(loadDeck(), seed);
      if (!source) return 'empty';
      noteInterceptRaised();
      setActiveIntercept({ source, code: interceptCode(seed), raisedAt: Date.now() });
      openWiredConsole('intercept');
      if (wiredUiCuesEnabled()) void playSound('system', 'handshake', { volume: 0.45 });
      return 'ok';
    };
    registerInterceptTrigger(() => raise(true));
    if (!settings.intercepts) {
      return () => registerInterceptTrigger(null);
    }
    let lastActivity = Date.now();
    let pending: number | null = null;
    const onActivity = (): void => {
      const now = Date.now();
      const idleFor = now - lastActivity;
      lastActivity = now;
      if (idleFor < INTERCEPT_IDLE_MS || pending !== null) return;
      // Let the returning click / key land first, then look at the screen.
      pending = window.setTimeout(() => {
        pending = null;
        raise(false);
      }, 1500);
    };
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    window.addEventListener('pointerdown', onActivity, opts);
    window.addEventListener('pointermove', onActivity, opts);
    window.addEventListener('keydown', onActivity, opts);
    window.addEventListener('wheel', onActivity, opts);
    return () => {
      registerInterceptTrigger(null);
      if (pending !== null) window.clearTimeout(pending);
      window.removeEventListener('pointerdown', onActivity, opts);
      window.removeEventListener('pointermove', onActivity, opts);
      window.removeEventListener('keydown', onActivity, opts);
      window.removeEventListener('wheel', onActivity, opts);
    };
  }, [settings.intercepts]);

  return (
    <div className="wmc-host">
      {consoles.map((id, i) => {
        const top = i === consoles.length - 1;
        if (id === 'tty' && settings.naviTerminal) return <NaviTerminal key={id} stackIndex={i} top={top} />;
        if (id === 'decrypt' && settings.signalDecrypt) return <SignalDecrypt key={id} stackIndex={i} top={top} />;
        if (id === 'intercept') return <InterceptPanel key={id} stackIndex={i} top={top} />;
        return null;
      })}
      {settings.layerDescent && <LayerTransmission />}
    </div>
  );
}
