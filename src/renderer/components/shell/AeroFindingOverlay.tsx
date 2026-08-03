import { useCallback, useEffect, useState } from 'react';
import { hasDiscoveredAero, onAeroDiscoveryChanged } from '../../aeroDiscovery';
import {
  loadAeroLegacySettings,
  onAeroLegacySettingsChanged,
  type AeroLegacyFeature,
} from '../../aeroFeatureSettings';
import { useT } from '../../i18n';
import { useLiveLyrics } from '../../liveLyrics';
import * as player from '../../playerBus';
import { useAppMaterialSet } from '../ui';
import {
  isSummonPresent,
  toggleSummonedCompanion,
  useFindingReadouts,
  usePointerParallax,
} from '../../findingReadouts';
import type { VerdictAction } from '../../findingModules';

function cleanLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Bubble geometry, computed once at module load.
 *
 * The previous build regenerated all 22 bubbles every 240ms via
 * `useMemo(() => pixels(seed), [seed])`, which restarted their CSS animations
 * four times a second — they twitched in place instead of drifting upward.
 */
const BUBBLES = Array.from({ length: 22 }, (_, i) => {
  const s = (i * 67 + 31) % 997;
  return {
    left: (s % 1000) / 10,
    top: 42 + ((s * 13) % 420) / 10,
    delay: (s % 700) / 1000,
    duration: 6 + ((s * 17) % 400) / 100,
    size: 2 + (s % 5),
  };
});

export default function AeroFindingOverlay() {
  const { t, lang } = useT();
  const material = useAppMaterialSet();
  const aero = material === 'aero';
  const [discovered, setDiscovered] = useState(hasDiscoveredAero);
  const [settings, setSettings] = useState(loadAeroLegacySettings);
  const [state, setState] = useState(player.getState);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [summoned, setSummoned] = useState(false);
  const [wizardPick, setWizardPick] = useState<number | null>(null);
  const [nudgeOpen, setNudgeOpen] = useState(false);

  useEffect(() => onAeroDiscoveryChanged(setDiscovered), []);
  useEffect(() => onAeroLegacySettingsChanged(setSettings), []);
  useEffect(() => player.subscribe(setState), []);

  const live = useLiveLyrics(state.current, state.duration, state.time);

  // Only the lyric ribbon needs a track. Gating the whole gadget set behind
  // synced lyrics made most of them unreachable.
  const enabled = aero && discovered && settings.overlayEnabled;
  const hasLyrics = live.lyrics.kind === 'synced' || live.lyrics.kind === 'plain';
  const featureOn = useCallback(
    (id: AeroLegacyFeature) => settings.features.includes(id),
    [settings.features],
  );

  const readouts = useFindingReadouts(enabled);
  const parallaxRef = usePointerParallax<HTMLDivElement>(enabled);

  useEffect(() => {
    setConsoleLines([t('aero.found.console.scan'), t('aero.found.loading')]);
  }, [lang, t]);

  useEffect(() => setSummoned(isSummonPresent('aero')), [enabled]);

  const pushLine = useCallback((line: string) => {
    setConsoleLines((prev) => [...prev.slice(-4), line]);
  }, []);

  const cues = live.lyrics.kind === 'synced' ? live.lyrics.cues : [];
  const currentCue = live.lyrics.kind === 'synced' && live.activeIndex >= 0 ? cues[live.activeIndex] ?? null : null;
  const nextCue = live.lyrics.kind === 'synced' && live.activeIndex >= 0 ? cues[live.activeIndex + 1] ?? null : null;
  const plainLine = live.lyrics.kind === 'plain' ? live.lyrics.lines[0] ?? '' : '';
  const lineText = cleanLine(currentCue?.text ?? plainLine ?? t('aero.found.ready'));
  const duration = currentCue ? Math.max(1.1, (nextCue?.start ?? state.duration) - currentCue.start) : 6;
  const progress = currentCue ? Math.min(1, Math.max(0, (state.time - currentCue.start) / duration)) : 0.45;
  const x = currentCue ? `${112 - progress * 224}vw` : '0vw';

  const actionLabel = useCallback((action: VerdictAction) => t(`aero.found.advice.${action}`), [t]);

  const onSummon = useCallback(() => {
    const now = toggleSummonedCompanion('aero');
    setSummoned(now);
    pushLine(now ? t('aero.found.buddyOn') : t('aero.found.buddyOff'));
  }, [pushLine, t]);

  const challenge = readouts.challenge;
  const onWizardPick = useCallback(
    (index: number) => {
      if (!challenge || wizardPick !== null) return;
      setWizardPick(index);
      pushLine(index === challenge.answerIndex ? t('aero.found.wizard.right') : t('aero.found.wizard.wrong'));
    },
    [challenge, pushLine, t, wizardPick],
  );

  const nextWizard = useCallback(() => {
    setWizardPick(null);
    readouts.reroll();
  }, [readouts.reroll]);

  const openArena = useCallback(() => {
    window.dispatchEvent(new CustomEvent('os:open', { detail: 'games' }));
  }, []);

  if (!enabled) return null;

  return (
    <div className="aero-found-overlay" ref={parallaxRef}>
      {featureOn('bubbleAtmosphere') && (
        <section className="aero-found-bubbles" aria-hidden="true">
          {BUBBLES.map((p, i) => (
            <span
              key={i}
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
              }}
            />
          ))}
        </section>
      )}

      {featureOn('lyricRibbon') && hasLyrics && (
        <section
          className={`aero-found-lyric${progress > 0.42 && progress < 0.58 ? ' is-pop' : ''}`}
          aria-hidden="true"
        >
          <div style={{ transform: `translate3d(${x}, 0, 0)`, animationDuration: `${duration}s` }}>
            <span>{lineText}</span>
          </div>
        </section>
      )}

      {featureOn('commandPrompt') && (
        <aside className="aero-found-cmd">
          <div className="aero-found-titlebar">{t('aero.found.cmdTitle')}</div>
          <div className="aero-found-screen">
            {consoleLines.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        </aside>
      )}

      {/* Office Helper — the Clippy slot. It now says something true: the
          recommendation computed from the user's real session. */}
      {featureOn('officeHelper') && (
        <section className="aero-found-assistant">
          <div className="aero-found-assistant-head" aria-hidden="true">
            <span />
          </div>
          <div>
            <strong>{t('aero.found.assistantTitle')}</strong>
            <span>{t('aero.found.assistantAdvice', { action: actionLabel(readouts.verdict.consensus) })}</span>
          </div>
        </section>
      )}

      {featureOn('securityCenter') && (
        <section className="aero-found-security">
          <div className="aero-found-shield" />
          <span>{t('aero.found.security')}</span>
        </section>
      )}

      {featureOn('networkPlaces') && (
        <section className="aero-found-network">
          <span>{t('aero.found.networkTitle')}</span>
          <i />
          <b>{t('aero.found.networkLan', { pct: Math.round(readouts.gauge.pct * 100) })}</b>
        </section>
      )}

      <section className="aero-found-gadgets">
        {/* Update advisor — three prompts, each carrying one unit's real vote. */}
        {featureOn('updateAdvisor') && (
          <article className="aero-found-gadget">
            <header>{t('aero.found.update')}</header>
            <ul className="aero-found-update-list">
              {readouts.verdict.units.map((unit, i) => (
                <li key={unit.id}>
                  <b>{t('aero.found.update.item', { n: i + 1 })}</b>
                  <span>{actionLabel(unit.vote)}</span>
                </li>
              ))}
            </ul>
            <footer>
              {t('aero.found.update.summary', {
                agree: readouts.verdict.agreement,
                total: readouts.verdict.total,
              })}
            </footer>
          </article>
        )}

        {/* Setup Wizard — a real reading quiz dressed as an unnecessary
            installer step. */}
        {featureOn('setupWizard') && (
          <article className="aero-found-gadget aero-found-wizard">
            <header>{t('aero.found.wizard')}</header>
            {challenge ? (
              <>
                <p className="aero-found-wizard-q">{t('aero.found.wizard.question')}</p>
                <div className="aero-found-wizard-word" lang="ja">
                  {challenge.word}
                </div>
                <ul className="aero-found-wizard-choices">
                  {challenge.choices.map((choice, i) => {
                    const revealed = wizardPick !== null;
                    const cls = !revealed
                      ? ''
                      : i === challenge.answerIndex
                        ? ' is-right'
                        : i === wizardPick
                          ? ' is-wrong'
                          : '';
                    return (
                      <li key={choice}>
                        <button
                          type="button"
                          className={`aero-found-wizard-choice${cls}`}
                          onClick={() => onWizardPick(i)}
                          disabled={revealed}
                          lang="ja"
                        >
                          {choice}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {wizardPick !== null && (
                  <button type="button" className="aero-found-wizard-next" onClick={nextWizard}>
                    {t('aero.found.wizard.next')}
                  </button>
                )}
              </>
            ) : (
              <p className="aero-found-gadget-empty">{t('aero.found.wizard.empty')}</p>
            )}
          </article>
        )}

        {/* WMP capsule meter — today's minutes and the streak. */}
        {featureOn('mediaGauge') && (
          <article className="aero-found-gadget aero-found-meter" data-band={readouts.gauge.band}>
            <header>{t('aero.found.meter')}</header>
            <div className="aero-found-meter-bar">
              <i style={{ transform: `scaleX(${Math.max(0.02, readouts.gauge.pct)})` }} />
            </div>
            <footer>
              <span>{t('aero.found.meter.today', { pct: Math.round(readouts.gauge.pct * 100) })}</span>
              <span>{t('aero.found.meter.streak', { count: readouts.gauge.streak })}</span>
            </footer>
          </article>
        )}

        {/* MSN nudge — one word from the deck, meaning hidden until asked. */}
        {featureOn('messengerNudge') && (
          <article className="aero-found-gadget aero-found-nudge">
            <header>{t('aero.found.messenger')}</header>
            {readouts.intercepted ? (
              <>
                <div className="aero-found-nudge-word" lang="ja">
                  {readouts.intercepted.word}
                  {readouts.intercepted.reading && <em>{readouts.intercepted.reading}</em>}
                </div>
                <button type="button" className="aero-found-nudge-btn" onClick={() => setNudgeOpen((v) => !v)}>
                  {nudgeOpen ? readouts.intercepted.meaning : t('aero.found.messengerHint')}
                </button>
              </>
            ) : (
              <p className="aero-found-gadget-empty">{t('aero.found.messenger.empty')}</p>
            )}
          </article>
        )}

        {/* Minesweeper board — weakest words as a score board, plus a route
            into the Game Arena, which drills exactly this material. */}
        {featureOn('minesweeperBoard') && (
          <article className="aero-found-gadget aero-found-mines">
            <header>{t('aero.found.mines')}</header>
            {readouts.bounties.length ? (
              <>
                <ul className="aero-found-mines-list">
                  {readouts.bounties.map((b) => (
                    <li key={b.word}>
                      <b lang="ja">{b.word}</b>
                      <span>{b.meaning}</span>
                      <i>{t('aero.found.minesPoints', { points: b.bounty })}</i>
                    </li>
                  ))}
                </ul>
                <button type="button" className="aero-found-mines-btn" onClick={openArena}>
                  {t('aero.found.mines.play')}
                </button>
              </>
            ) : (
              <p className="aero-found-gadget-empty">{t('aero.found.mines.empty')}</p>
            )}
          </article>
        )}

        {/* Desktop buddy — a real companion, not a tray rumour. */}
        {featureOn('desktopBuddy') && (
          <article className="aero-found-gadget">
            <header>{t('aero.found.buddy')}</header>
            <button type="button" className="aero-found-buddy-btn" onClick={onSummon}>
              {summoned ? t('aero.found.buddyDismiss') : t('aero.found.buddyCall')}
            </button>
          </article>
        )}
      </section>

      {featureOn('desktopTicker') && (
        <section className="aero-found-ticker" aria-hidden="true">
          <div>
            <span>{t('aero.found.ticker.wmp')}</span>
            <span>{t('aero.found.ticker.msn')}</span>
            <span>{t('aero.found.ticker.vista')}</span>
            <span>{lineText}</span>
          </div>
        </section>
      )}
    </div>
  );
}
