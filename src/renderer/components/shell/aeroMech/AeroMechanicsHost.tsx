/**
 * AeroMechanicsHost — the Aero-only study mechanics, in one mount.
 * -----------------------------------------------------------------------------
 * DesktopShell mounts this next to Flip 3D while the Aero material is on. It
 * owns:
 *
 *  - the utility windows (Memory Defragmenter, Vocabulary Update, Welcome
 *    Center), opened by the `aero-mech:open` event from the Start menu, the
 *    balloons and the Welcome Center itself;
 *  - balloon tips: "Did you know?" on a leech or due word, rate-limited, and
 *    the once-a-day "updates are available" notice;
 *  - the idle screensaver;
 *  - the Welcome Center on the first Aero boot of the day.
 *
 * Every timer and listener here is torn down when the material leaves Aero
 * (the component unmounts or `aero` turns false), and nothing runs per frame
 * except the screensaver's own capped canvas loop while it is up.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useAppMaterialSet } from '../../ui';
import { useT } from '../../../i18n';
import { playSound } from '../../../audio/soundEngine';
import { openSectionSurface } from '../../../sectionSurface';
import {
  canShowBalloon,
  isFirstTimeToday,
  localDayKey,
  pickBalloonCard,
  planUpdates,
  screensaverShouldStart,
  screensaverWords,
  type MechCard,
} from '../../../aeroMechanics/aeroMechLogic';
import {
  AERO_MECH_OPEN_EVENT,
  loadAeroMechSettings,
  onAeroMechSettingsChanged,
  openAeroMechApp,
  readMark,
  saveAeroMechSettings,
  writeMark,
  type AeroMechApp,
  type AeroMechOpenDetail,
} from '../../../aeroMechanics/aeroMechSettings';
import {
  interruptionsBlocked,
  isBatteryTier,
  isReviewing,
  isSuspended,
  isTyping,
  isVideoPlaying,
} from '../../../aeroMechanics/aeroMechEnv';
import { useAeroDeck } from '../../../aeroMechanics/useAeroDeck';
import AeroMechWindow from './AeroMechWindow';
import AeroBalloon from './AeroBalloon';
import AeroScreensaver from './AeroScreensaver';
import DefragApp from './DefragApp';
import UpdateApp from './UpdateApp';
import WelcomeApp from './WelcomeApp';

interface OpenWin {
  app: AeroMechApp;
  focusCardId?: string;
  /** Bumped on every open request, so a repeat request re-targets the window. */
  nonce: number;
}

type Balloon =
  | { kind: 'tip'; card: MechCard; reason: 'leech' | 'due' }
  | { kind: 'update'; count: number };

const CHECK_MS = 60_000;
const FIRST_TIP_DELAY_MS = 90_000;
const FIRST_UPDATE_DELAY_MS = 25_000;
const IDLE_CHECK_MS = 10_000;

const WIN_SIZE: Record<AeroMechApp, { w: number; h: number }> = {
  defrag: { w: 720, h: 640 },
  update: { w: 760, h: 560 },
  welcome: { w: 640, h: 460 },
};

export default function AeroMechanicsHost({ taskbarRef }: { taskbarRef: RefObject<HTMLElement | null> }) {
  const { t } = useT();
  const aero = useAppMaterialSet() === 'aero';
  const [settings, setSettings] = useState(loadAeroMechSettings);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [wins, setWins] = useState<OpenWin[]>([]);
  const [front, setFront] = useState<AeroMechApp | null>(null);
  const [balloon, setBalloon] = useState<Balloon | null>(null);
  const [saver, setSaver] = useState(false);
  const deck = useAeroDeck(aero);
  const lastActivity = useRef(Date.now());
  const nonce = useRef(0);

  useEffect(() => onAeroMechSettingsChanged(setSettings), []);

  // The taskbar's parent is the desk frame (scaled with the 4:3 Aero viewport).
  // It can be missing on the very first commit, so look again next frame.
  useEffect(() => {
    let raf = 0;
    const find = (): void => {
      const el = taskbarRef.current?.parentElement ?? null;
      if (el) setHost(el);
      else raf = window.requestAnimationFrame(find);
    };
    find();
    return () => window.cancelAnimationFrame(raf);
  }, [taskbarRef, aero]);

  // Leaving Aero closes everything this host put on screen.
  useEffect(() => {
    if (aero) return;
    setWins([]);
    setBalloon(null);
    setSaver(false);
  }, [aero]);

  const allowed = useCallback(
    (app: AeroMechApp): boolean =>
      app === 'defrag' ? settings.defrag : app === 'update' ? settings.updates : true,
    [settings.defrag, settings.updates],
  );

  const open = useCallback(
    (detail: AeroMechOpenDetail) => {
      if (!allowed(detail.app)) return;
      nonce.current += 1;
      const entry: OpenWin = { app: detail.app, focusCardId: detail.focusCardId, nonce: nonce.current };
      setWins((prev) => {
        const existing = prev.find((w) => w.app === detail.app);
        if (existing) {
          // Re-focusing keeps a running session; only a new focus card re-targets it.
          return detail.focusCardId ? prev.map((w) => (w.app === detail.app ? entry : w)) : prev;
        }
        return [...prev, entry];
      });
      setFront(detail.app);
      void playSound('ui', 'window-open', { volume: 0.6 });
    },
    [allowed],
  );

  useEffect(() => {
    if (!aero) return undefined;
    const onOpen = (e: Event): void => {
      const detail = (e as CustomEvent<AeroMechOpenDetail>).detail;
      if (detail && (detail.app === 'defrag' || detail.app === 'update' || detail.app === 'welcome')) open(detail);
    };
    window.addEventListener(AERO_MECH_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(AERO_MECH_OPEN_EVENT, onOpen);
  }, [aero, open]);

  const close = useCallback((app: AeroMechApp) => {
    setWins((prev) => prev.filter((w) => w.app !== app));
    setFront((f) => (f === app ? null : f));
    void playSound('ui', 'window-close', { volume: 0.6 });
  }, []);

  // A click on a regular window sends these behind it, like any other window.
  useEffect(() => {
    if (!aero || wins.length === 0) return undefined;
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Element | null;
      if (!target || target.closest('.aero-mech-win')) return;
      if (target.closest('.fwin, .os-desk-icon')) setFront(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [aero, wins.length]);

  /* ---------------------------------------------------------------- balloons */

  const deckRef = useRef(deck);
  deckRef.current = deck;
  const balloonRef = useRef(balloon);
  balloonRef.current = balloon;
  const winsRef = useRef(wins);
  winsRef.current = wins;

  useEffect(() => {
    if (!aero) return undefined;
    const mountedAt = Date.now();
    const tick = (): void => {
      if (balloonRef.current) return;
      const now = Date.now();
      const blocked = interruptionsBlocked();
      const snap = deckRef.current;

      // Once a day: "updates are available".
      if (
        settings.updates
        && settings.updateBalloon
        && now - mountedAt >= FIRST_UPDATE_DELAY_MS
        && !blocked
        && readMark('update-notice-day') !== localDayKey(now)
        && !winsRef.current.some((w) => w.app === 'update')
      ) {
        const plan = planUpdates(snap.cards, snap.newPerDay, snap.introducedToday);
        if (plan.important.length > 0) {
          writeMark('update-notice-day', localDayKey(now));
          setBalloon({ kind: 'update', count: plan.important.length });
          void playSound('notification', 'notify');
          return;
        }
      }

      // "Did you know?" tips.
      if (!settings.balloons || now - mountedAt < FIRST_TIP_DELAY_MS) return;
      const ok = canShowBalloon({
        enabled: settings.balloons,
        now,
        lastShownAt: Number(readMark('balloon-last') ?? 0),
        intervalMin: settings.balloonIntervalMin,
        blocked,
      });
      if (!ok) return;
      const pick = pickBalloonCard(snap.cards, now, Math.floor(now / 60_000));
      if (!pick) return;
      writeMark('balloon-last', String(now));
      setBalloon({ kind: 'tip', card: pick.card, reason: pick.reason });
      void playSound('notification', 'notify');
    };
    const first = window.setTimeout(tick, Math.min(FIRST_UPDATE_DELAY_MS, FIRST_TIP_DELAY_MS) + 500);
    const id = window.setInterval(tick, CHECK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [aero, settings.balloons, settings.balloonIntervalMin, settings.updateBalloon, settings.updates]);

  // A balloon that became inappropriate (a review started, a video began)
  // folds away instead of sitting over it.
  useEffect(() => {
    if (!balloon) return undefined;
    const id = window.setInterval(() => {
      if (isReviewing() || isVideoPlaying() || isSuspended()) setBalloon(null);
    }, 2000);
    return () => window.clearInterval(id);
  }, [balloon]);

  /* ------------------------------------------------------------- screensaver */

  useEffect(() => {
    if (!aero || !settings.screensaver || settings.screensaverMinutes <= 0) return undefined;
    const mark = (): void => {
      lastActivity.current = Date.now();
    };
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((name) => window.addEventListener(name, mark, opts));
    mark();
    const id = window.setInterval(() => {
      if (document.querySelector('.aero-mech-saver')) return;
      const start = screensaverShouldStart({
        enabled: settings.screensaver,
        minutes: settings.screensaverMinutes,
        idleMs: Date.now() - lastActivity.current,
        aero: document.documentElement.getAttribute('data-materials') === 'aero',
        videoPlaying: isVideoPlaying(),
        typing: isTyping(),
        reviewing: isReviewing(),
        battery: isBatteryTier(),
        suspended: isSuspended(),
        hidden: document.hidden,
      });
      if (start && screensaverWords(deckRef.current.cards, Date.now()).length > 0) {
        setBalloon(null);
        setSaver(true);
      }
    }, IDLE_CHECK_MS);
    return () => {
      events.forEach((name) => window.removeEventListener(name, mark, opts));
      window.clearInterval(id);
    };
  }, [aero, settings.screensaver, settings.screensaverMinutes]);

  const saverWords = useMemo(
    () => (saver ? screensaverWords(deck.cards, Date.now()) : []),
    // Snapshot once per screensaver run: the bubbles keep their words.
    [saver],
  );

  const exitSaver = useCallback(() => {
    lastActivity.current = Date.now();
    setSaver(false);
  }, []);

  /* ---------------------------------------------------------- welcome center */

  useEffect(() => {
    if (!aero || !settings.welcome) return undefined;
    if (!isFirstTimeToday(readMark('welcome-day'), Date.now())) return undefined;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      // Wait for the boot / logon overlays to finish, for up to two minutes.
      if (isSuspended() && tries < 60) return;
      window.clearInterval(id);
      if (!isFirstTimeToday(readMark('welcome-day'), Date.now())) return;
      // The day is marked by the Welcome window itself once it is on screen,
      // so a shell that remounts mid-boot does not swallow today's welcome.
      open({ app: 'welcome' });
    }, 2000);
    return () => window.clearInterval(id);
  }, [aero, open, settings.welcome]);

  if (!aero) return null;

  const taskbarH = taskbarRef.current?.offsetHeight ?? 40;

  const balloonEl = balloon && (
    balloon.kind === 'update' ? (
      <AeroBalloon
        title={t('aeroMech.balloon.updateTitle')}
        icon="shield"
        bottom={taskbarH + 10}
        onClose={() => setBalloon(null)}
        onBodyClick={() => {
          setBalloon(null);
          open({ app: 'update' });
        }}
        actions={[]}
      >
        {t('aeroMech.balloon.updateBody', { count: balloon.count })}
      </AeroBalloon>
    ) : (
      <AeroBalloon
        title={balloon.reason === 'leech' ? t('aeroMech.balloon.tipLeech') : t('aeroMech.balloon.tipTitle')}
        icon="info"
        bottom={taskbarH + 10}
        onClose={() => setBalloon(null)}
        actions={[
          {
            label: t('aeroMech.balloon.reviewNow'),
            primary: true,
            onClick: () => {
              const id = balloon.card.id;
              setBalloon(null);
              if (settings.defrag) openAeroMechApp({ app: 'defrag', focusCardId: id });
              else openSectionSurface('flashcards');
            },
          },
          { label: t('aeroMech.balloon.dismiss'), onClick: () => setBalloon(null) },
        ]}
      >
        <span className="aero-mech-balloon-word" lang="ja">{balloon.card.word}</span>
        {balloon.card.reading && balloon.card.reading !== balloon.card.word && (
          <span className="aero-mech-balloon-reading" lang="ja">{balloon.card.reading}</span>
        )}
        <span className="aero-mech-balloon-meaning">{balloon.card.meaning}</span>
      </AeroBalloon>
    )
  );

  return (
    <>
      {host && createPortal(
        <>
          {wins.map((w, i) => {
            const size = WIN_SIZE[w.app];
            const title = w.app === 'defrag'
              ? t('aeroMech.defrag.title')
              : w.app === 'update'
                ? t('aeroMech.update.title')
                : t('aeroMech.welcome.title');
            return (
              <AeroMechWindow
                key={w.app}
                id={w.app}
                title={title}
                icon={<span className={`aero-mech-glyph is-${w.app}`} />}
                width={size.w}
                height={size.h}
                cascade={i}
                front={front === w.app}
                onFront={() => setFront(w.app)}
                onClose={() => close(w.app)}
              >
                {w.app === 'defrag' && <DefragApp deck={deck} focusCardId={w.focusCardId ?? null} key={w.nonce} />}
                {w.app === 'update' && <UpdateApp deck={deck} />}
                {w.app === 'welcome' && (
                  <WelcomeApp
                    deck={deck}
                    settings={settings}
                    onToggleStartup={(on) => setSettings(saveAeroMechSettings({ welcome: on }))}
                  />
                )}
              </AeroMechWindow>
            );
          })}
          {balloonEl}
        </>,
        host,
      )}
      {saver && <AeroScreensaver words={saverWords} onExit={exitSaver} />}
    </>
  );
}
