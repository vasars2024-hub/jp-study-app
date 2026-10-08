import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import AeroMechanicsCard from './AeroMechanicsCard';
import { useSettings } from '../SettingsContext';
import { Toggle, useAeroMaterials, useWiredMaterials } from '../../ui';
import { hasDiscoveredAero, onAeroDiscoveryChanged } from '../../../aeroDiscovery';
import {
  AERO_LEGACY_FEATURES,
  loadAeroLegacySettings,
  onAeroLegacySettingsChanged,
  saveAeroLegacySettings,
  type AeroLegacyFeature,
} from '../../../aeroFeatureSettings';
import {
  loadWiredArchiveSettings,
  onWiredArchiveSettingsChanged,
  resetWiredArchiveBootSeen,
  saveWiredArchiveSettings,
  WIRED_FINDING_FEATURES,
  type WiredCrtIntensity,
  type WiredFindingFeature,
  type WiredMotionLevel,
} from '../../../terminalModeSettings';
import { useT } from '../../../i18n';
import { isSummonPresent, setSummonedCompanion, toggleSummonedCompanion } from '../../../findingReadouts';
import { requestWiredArchiveRestart, requestWiredArchiveShutdown } from '../../../wiredArchiveLifecycle';
import { hasDiscoveredWired, onWiredDiscoveryChanged } from '../../../wiredDiscovery';
import { exitSecretAero } from '../../../theme/SecretAeroTrigger';
import { AERO_THEME_ID } from '../../../theme/frutiger-aero';
import { WIRED_ARCHIVE_THEME_ID } from '../../../theme/wired-archive';
import { loadThemeId, onThemeChanged } from '../../../theme';
import {
  loadBlancMode,
  onBlancModeChanged,
  setBlancModeEnabled,
  type BlancModeSettings,
} from '../../../blancMode';
import { nextHistoryEntry } from '../../../secretHistory';
import { isKnownCommand as isKnownTerminalCommand, runTerminalCommand } from '../../../wiredMechanics/terminalEngine';
import WiredMechanicsCard from './WiredMechanicsCard';

import type { ArcadeGameId } from '../../../games/ArcadeGames';

const WIRED_GAME_MODULES: {
  id: ArcadeGameId;
  titleKey: string;
  descKey: string;
  command: string;
}[] = [
  { id: 'star-invaders', command: 'invaders', titleKey: 'special.game.wired.invaders.title', descKey: 'special.game.wired.invaders.desc' },
  { id: 'comet-courier', command: 'lander', titleKey: 'special.game.wired.lander.title', descKey: 'special.game.wired.lander.desc' },
  { id: 'capsule-sorter', command: 'capsules', titleKey: 'special.game.wired.capsules.title', descKey: 'special.game.wired.capsules.desc' },
  { id: 'signal-simon', command: 'mines', titleKey: 'special.game.wired.mines.title', descKey: 'special.game.wired.mines.desc' },
];

const AERO_GAME_MODULES: {
  id: ArcadeGameId;
  titleKey: string;
  descKey: string;
  command: string;
}[] = [
  { id: 'aero-breakout', command: 'breakout', titleKey: 'special.game.aero.breakout.title', descKey: 'special.game.aero.breakout.desc' },
  { id: 'aero-blocks', command: 'blocks', titleKey: 'special.game.aero.blocks.title', descKey: 'special.game.aero.blocks.desc' },
  { id: 'aero-pong', command: 'pong', titleKey: 'special.game.aero.pong.title', descKey: 'special.game.aero.pong.desc' },
  { id: 'aero-snake', command: 'snake', titleKey: 'special.game.aero.snake.title', descKey: 'special.game.aero.snake.desc' },
];

// Module-level catalogs can't call useT() at declaration time, so each entry
// carries i18n keys resolved by the consumer at render (the pattern used by
// widgets/registry.tsx and settings/settingsRegistry.ts). `command` is the
// terminal token and stays literal — it is typed, not read.
const WIRED_TERMINAL_FEATURES: {
  id: WiredFindingFeature;
  command: string;
  titleKey: string;
  descKey: string;
}[] = [
  { id: 'lyricRibbon', command: 'lyrics', titleKey: 'special.wired.mod.lyricRibbon.title', descKey: 'special.wired.mod.lyricRibbon.desc' },
  { id: 'particleAtmosphere', command: 'mist', titleKey: 'special.wired.mod.particleAtmosphere.title', descKey: 'special.wired.mod.particleAtmosphere.desc' },
  { id: 'hackerTerminal', command: 'terminal', titleKey: 'special.wired.mod.hackerTerminal.title', descKey: 'special.wired.mod.hackerTerminal.desc' },
  { id: 'naviGuide', command: 'navi', titleKey: 'special.wired.mod.naviGuide.title', descKey: 'special.wired.mod.naviGuide.desc' },
  { id: 'surveillanceEye', command: 'eye', titleKey: 'special.wired.mod.surveillanceEye.title', descKey: 'special.wired.mod.surveillanceEye.desc' },
  { id: 'networkMap', command: 'map', titleKey: 'special.wired.mod.networkMap.title', descKey: 'special.wired.mod.networkMap.desc' },
  { id: 'networkRadar', command: 'radar', titleKey: 'special.wired.mod.networkRadar.title', descKey: 'special.wired.mod.networkRadar.desc' },
  { id: 'broadcastTicker', command: 'ticker', titleKey: 'special.wired.mod.broadcastTicker.title', descKey: 'special.wired.mod.broadcastTicker.desc' },
  { id: 'wiredShimeji', command: 'shimeji', titleKey: 'special.wired.mod.wiredShimeji.title', descKey: 'special.wired.mod.wiredShimeji.desc' },
  { id: 'magiVote', command: 'magi', titleKey: 'special.wired.mod.magiVote.title', descKey: 'special.wired.mod.magiVote.desc' },
  { id: 'voightKampff', command: 'vk', titleKey: 'special.wired.mod.voightKampff.title', descKey: 'special.wired.mod.voightKampff.desc' },
  { id: 'akiraCapsule', command: 'capsule', titleKey: 'special.wired.mod.akiraCapsule.title', descKey: 'special.wired.mod.akiraCapsule.desc' },
  { id: 'ghostProtocol', command: 'ghost', titleKey: 'special.wired.mod.ghostProtocol.title', descKey: 'special.wired.mod.ghostProtocol.desc' },
  { id: 'bebopBounty', command: 'bounty', titleKey: 'special.wired.mod.bebopBounty.title', descKey: 'special.wired.mod.bebopBounty.desc' },
];

/** The low-noise subset: instruments that carry data, minus the ambient layers. */
const QUIET_WIRED_FEATURES: WiredFindingFeature[] = [
  'lyricRibbon',
  'naviGuide',
  'magiVote',
  'voightKampff',
  'akiraCapsule',
  'ghostProtocol',
];

const AERO_GADGET_FEATURES: {
  id: AeroLegacyFeature;
  command: string;
  titleKey: string;
  descKey: string;
}[] = [
  { id: 'lyricRibbon', command: 'wmp', titleKey: 'special.aero.mod.lyricRibbon.title', descKey: 'special.aero.mod.lyricRibbon.desc' },
  { id: 'bubbleAtmosphere', command: 'bubbles', titleKey: 'special.aero.mod.bubbleAtmosphere.title', descKey: 'special.aero.mod.bubbleAtmosphere.desc' },
  { id: 'commandPrompt', command: 'cmd', titleKey: 'special.aero.mod.commandPrompt.title', descKey: 'special.aero.mod.commandPrompt.desc' },
  { id: 'officeHelper', command: 'helper', titleKey: 'special.aero.mod.officeHelper.title', descKey: 'special.aero.mod.officeHelper.desc' },
  { id: 'securityCenter', command: 'shield', titleKey: 'special.aero.mod.securityCenter.title', descKey: 'special.aero.mod.securityCenter.desc' },
  { id: 'networkPlaces', command: 'network', titleKey: 'special.aero.mod.networkPlaces.title', descKey: 'special.aero.mod.networkPlaces.desc' },
  { id: 'desktopTicker', command: 'ticker', titleKey: 'special.aero.mod.desktopTicker.title', descKey: 'special.aero.mod.desktopTicker.desc' },
  { id: 'desktopBuddy', command: 'buddy', titleKey: 'special.aero.mod.desktopBuddy.title', descKey: 'special.aero.mod.desktopBuddy.desc' },
  { id: 'updateAdvisor', command: 'update', titleKey: 'special.aero.mod.updateAdvisor.title', descKey: 'special.aero.mod.updateAdvisor.desc' },
  { id: 'setupWizard', command: 'wizard', titleKey: 'special.aero.mod.setupWizard.title', descKey: 'special.aero.mod.setupWizard.desc' },
  { id: 'mediaGauge', command: 'capsule', titleKey: 'special.aero.mod.mediaGauge.title', descKey: 'special.aero.mod.mediaGauge.desc' },
  { id: 'messengerNudge', command: 'msn', titleKey: 'special.aero.mod.messengerNudge.title', descKey: 'special.aero.mod.messengerNudge.desc' },
  { id: 'minesweeperBoard', command: 'mines', titleKey: 'special.aero.mod.minesweeperBoard.title', descKey: 'special.aero.mod.minesweeperBoard.desc' },
];

const QUIET_AERO_FEATURES: AeroLegacyFeature[] = [
  'lyricRibbon',
  'officeHelper',
  'securityCenter',
  'networkPlaces',
  'updateAdvisor',
  'setupWizard',
  'mediaGauge',
];

export default function SpecialPage() {
  const s = useSettings();
  const { seg, focusSettingId } = s;
  const { t, lang } = useT();
  const aero = useAeroMaterials();
  const wired = useWiredMaterials();
  const [wiredSettings, setWiredSettings] = useState(() => loadWiredArchiveSettings());
  const [aeroSettings, setAeroSettings] = useState(() => loadAeroLegacySettings());
  const [isWiredDiscovered, setIsWiredDiscovered] = useState(hasDiscoveredWired);
  const [isAeroDiscovered, setIsAeroDiscovered] = useState(hasDiscoveredAero);
  const [blancMode, setBlancMode] = useState<BlancModeSettings>(() => loadBlancMode());
  const [blancMsg, setBlancMsg] = useState('');
  const [wiredCommand, setWiredCommand] = useState('');
  const [aeroCommand, setAeroCommand] = useState('');
  const [wiredTerminalLines, setWiredTerminalLines] = useState<string[]>([]);
  const [aeroTerminalLines, setAeroTerminalLines] = useState<string[]>([]);
  const [wiredGamesOpen, setWiredGamesOpen] = useState(true);
  const [aeroGamesOpen, setAeroGamesOpen] = useState(false);
  const [activeThemeId, setActiveThemeId] = useState(loadThemeId);
  const [wiredSummonOn, setWiredSummonOn] = useState(() => isSummonPresent('wired'));
  const [aeroSummonOn, setAeroSummonOn] = useState(() => isSummonPresent('aero'));

  // Seeded in an effect rather than useState so the banners re-render in the
  // new language when the UI language changes.
  useEffect(() => {
    setWiredTerminalLines([t('special.term.wiredBanner'), t('special.term.wiredHint')]);
    setAeroTerminalLines([t('special.term.aeroBanner'), t('special.term.aeroHint')]);
  }, [lang, t]);

  useEffect(() => onWiredArchiveSettingsChanged(setWiredSettings), []);
  useEffect(() => onAeroLegacySettingsChanged(setAeroSettings), []);
  useEffect(() => onWiredDiscoveryChanged(setIsWiredDiscovered), []);
  useEffect(() => onAeroDiscoveryChanged(setIsAeroDiscovered), []);
  useEffect(() => onBlancModeChanged(setBlancMode), []);
  useEffect(() => onThemeChanged(setActiveThemeId), []);
  useEffect(() => {
    const sync = () => {
      setWiredSummonOn(isSummonPresent('wired'));
      setAeroSummonOn(isSummonPresent('aero'));
    };
    sync();
    const id = window.setInterval(sync, 800);
    return () => window.clearInterval(id);
  }, []);

  const pushWiredTerminal = (line: string) => setWiredTerminalLines((prev) => [...prev.slice(-4), line]);
  const pushAeroTerminal = (line: string) => setAeroTerminalLines((prev) => [...prev.slice(-4), line]);

  const saveFindingFeatures = (features: WiredFindingFeature[]) => {
    const next = features.filter((id, index) => WIRED_FINDING_FEATURES.includes(id) && features.indexOf(id) === index);
    setWiredSettings(saveWiredArchiveSettings({ findingFeatures: next }));
  };

  const toggleFindingFeature = (id: WiredFindingFeature, force?: boolean) => {
    const active = wiredSettings.findingFeatures.includes(id);
    const shouldEnable = force ?? !active;
    const next = shouldEnable
      ? [...wiredSettings.findingFeatures, id]
      : wiredSettings.findingFeatures.filter((feature) => feature !== id);
    saveFindingFeatures(next);
    if (id === 'wiredShimeji') {
      setWiredSummonOn(setSummonedCompanion('wired', shouldEnable));
    }
    pushWiredTerminal(`> ${shouldEnable ? t('special.term.mounted') : t('special.term.unmounted')} ${id}`);
  };

  /**
   * Summon actually puts a companion on the desktop now.
   *
   * It used to only flip the `wiredShimeji` flag — which no renderer read — so
   * the SUMMON button was a no-op. It now drives the real companion layer and
   * mounts the module that surfaces the control.
   */
  const summonWiredShimeji = () => {
    const present = toggleSummonedCompanion('wired');
    setWiredSummonOn(present);
    const features = present
      ? [...wiredSettings.findingFeatures.filter((f) => f !== 'wiredShimeji'), 'wiredShimeji']
      : wiredSettings.findingFeatures.filter((f) => f !== 'wiredShimeji');
    saveFindingFeatures(features);
    pushWiredTerminal(`> ${present ? t('special.term.summonOn') : t('special.term.summonOff')}`);
  };

  const saveAeroFeatures = (features: AeroLegacyFeature[]) => {
    const next = features.filter((id, index) => AERO_LEGACY_FEATURES.includes(id) && features.indexOf(id) === index);
    setAeroSettings(saveAeroLegacySettings({ features: next }));
  };

  const toggleAeroFeature = (id: AeroLegacyFeature, force?: boolean) => {
    const active = aeroSettings.features.includes(id);
    const shouldEnable = force ?? !active;
    const next = shouldEnable
      ? [...aeroSettings.features, id]
      : aeroSettings.features.filter((feature) => feature !== id);
    saveAeroFeatures(next);
    if (id === 'desktopBuddy') {
      setAeroSummonOn(setSummonedCompanion('aero', shouldEnable));
    }
    // The gadget's translated title, not its internal id ("desktopBuddy").
    const feature = AERO_GADGET_FEATURES.find((f) => f.id === id);
    pushAeroTerminal(
      `${shouldEnable ? t('special.term.enabled') : t('special.term.disabled')} ${feature ? t(feature.titleKey) : id}.`,
    );
  };

  const summonAeroBuddy = () => {
    const present = toggleSummonedCompanion('aero');
    setAeroSummonOn(present);
    const features = present
      ? [...aeroSettings.features.filter((f) => f !== 'desktopBuddy'), 'desktopBuddy']
      : aeroSettings.features.filter((f) => f !== 'desktopBuddy');
    saveAeroFeatures(features);
    pushAeroTerminal(present ? t('special.term.aeroBuddyOn') : t('special.term.aeroBuddyOff'));
  };

  const runWiredCommand = (raw: string) => {
    const input = raw.trim().toLowerCase();
    if (!input) return;
    pushWiredTerminal(`> ${input}`);
    if (input === 'help') {
      pushWiredTerminal(`> ${t('special.term.wiredHelp')}`);
      return;
    }
    if (input === 'scan') {
      pushWiredTerminal(
        `> ${t('special.term.wiredScan', {
          count: wiredSettings.findingFeatures.length,
          total: WIRED_FINDING_FEATURES.length,
        })}`,
      );
      return;
    }
    if (input === 'quiet') {
      saveFindingFeatures(QUIET_WIRED_FEATURES);
      pushWiredTerminal(`> ${t('special.term.wiredQuiet')}`);
      return;
    }
    if (input === 'all') {
      saveFindingFeatures(WIRED_FINDING_FEATURES);
      pushWiredTerminal(`> ${t('special.term.wiredAll')}`);
      return;
    }
    if (input === 'summon') {
      summonWiredShimeji();
      return;
    }
    if (input === 'history' || input === 'log') {
      const entry = nextHistoryEntry();
      pushWiredTerminal(`> [${entry.version}] ${t(entry.titleKey)} — ${t(entry.bodyKey)}`);
      return;
    }
    const head = input.split(/\s+/)[0];
    if (isKnownTerminalCommand(input) && !WIRED_TERMINAL_FEATURES.some((f) => f.command === head)) {
      runSharedWiredCommand(raw.trim());
      return;
    }
    const token = input.replace(/^(toggle|enable|disable)\s+/, '');
    const match = WIRED_TERMINAL_FEATURES.find((feature) =>
      feature.command === token ||
      feature.id.toLowerCase() === token ||
      t(feature.titleKey).toLowerCase().includes(token),
    );
    if (!match) {
      pushWiredTerminal(`> ${t('special.term.wiredUnknown')}`);
      return;
    }
    const force = input.startsWith('enable ') ? true : input.startsWith('disable ') ? false : undefined;
    toggleFindingFeature(match.id, force);
  };

  /**
   * Study commands (lookup, stats, due, layer, mine, sync…) come from the Navi
   * terminal's shared engine, so this terminal and the TTY console answer the
   * same command the same way. Loaded on first use.
   */
  const runSharedWiredCommand = (raw: string) => {
    void import('../../../wiredMechanics/terminalRuntime').then(async (runtime) => {
      const result = await runTerminalCommand(raw, runtime.createTerminalContext(() => []));
      if (result.clear) setWiredTerminalLines([]);
      result.lines.forEach((line) => pushWiredTerminal(line.text));
    });
  };

  const runAeroCommand = (raw: string) => {
    const input = raw.trim().toLowerCase();
    if (!input) return;
    pushAeroTerminal(`> ${input}`);
    if (input === 'help') {
      pushAeroTerminal(t('special.term.aeroHelp'));
      return;
    }
    if (input === 'scan') {
      pushAeroTerminal(
        t('special.term.aeroScan', {
          count: aeroSettings.features.length,
          total: AERO_LEGACY_FEATURES.length,
        }),
      );
      return;
    }
    if (input === 'quiet') {
      saveAeroFeatures(QUIET_AERO_FEATURES);
      pushAeroTerminal(t('special.term.aeroQuiet'));
      return;
    }
    if (input === 'all') {
      saveAeroFeatures(AERO_LEGACY_FEATURES);
      pushAeroTerminal(t('special.term.aeroAll'));
      return;
    }
    if (input === 'summon' || input === 'buddy') {
      summonAeroBuddy();
      return;
    }
    if (input === 'history' || input === 'log') {
      const entry = nextHistoryEntry();
      pushAeroTerminal(`> [${entry.version}] ${t(entry.titleKey)} — ${t(entry.bodyKey)}`);
      return;
    }
    // The arcade cards print a command under each game; it has to work here.
    const gameToken = input.replace(/^(play|run|start)\s+/, '');
    const game = AERO_GAME_MODULES.find((g) => g.command === gameToken);
    if (game) {
      pushAeroTerminal(t('aero.special.launching', { name: t(game.titleKey) }));
      openArenaGame(game.id, 'aero');
      return;
    }
    const token = input.replace(/^(toggle|enable|disable)\s+/, '');
    const match = AERO_GADGET_FEATURES.find((feature) =>
      feature.command === token ||
      feature.id.toLowerCase() === token ||
      t(feature.titleKey).toLowerCase().includes(token),
    );
    if (!match) {
      pushAeroTerminal(t('special.term.aeroUnknown'));
      return;
    }
    const force = input.startsWith('enable ') ? true : input.startsWith('disable ') ? false : undefined;
    toggleAeroFeature(match.id, force);
  };

  const showLockedState = !wired && !isWiredDiscovered && !isAeroDiscovered;
  // The `special-modules` search entry ("Special modules — WIRED and Aero
  // terminals, overlays, and secret feature labs") has no card of its own,
  // because which module cards exist depends on what has been discovered.
  // Resolve it to whichever card is genuinely the first module surface in the
  // current state, so the search result lands on something real and exactly one
  // card highlights rather than none or two.
  const modulesAnchor: string = showLockedState
    ? 'special-locked'
    : wired || isWiredDiscovered
      ? 'wired-archive'
      : 'aero-gadget-lab';
  const anchorsModules = (cardId: string): boolean =>
    focusSettingId === 'special-modules' && modulesAnchor === cardId;
  const openArenaGame = (gameId: ArcadeGameId, theme: 'wired' | 'aero') => {
    window.dispatchEvent(new CustomEvent('os:open', { detail: 'games' }));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('game-arena:select', { detail: { gameId, theme } }));
    }, 80);
  };

  return (
    <>
      <SettingsCard
        id="blanc-mode"
        title={t('special.blancMode')}
        description={t('special.blanc.desc')}
        highlight={focusSettingId === 'blanc-mode'}
      >
        <Toggle
          className="os-toggle"
          checked={blancMode.enabled}
          onChange={(event) => {
            const next = event.currentTarget.checked;
            setBlancMsg(t(next ? 'special.blanc.opening' : 'special.blanc.closing'));
            void setBlancModeEnabled(next)
              .then(setBlancMode)
              .catch((error) => {
                setBlancMsg(error instanceof Error ? error.message : t('special.blanc.openFailed'));
              });
          }}
          label={t('special.useBlancMode')}
        />
        <p className="muted os-set-hint">
          {t('special.blanc.hint')}
        </p>
        {blancMsg && <p className="muted os-set-hint">{blancMsg}</p>}
      </SettingsCard>

      {(activeThemeId === AERO_THEME_ID || activeThemeId === WIRED_ARCHIVE_THEME_ID) && (
        <SettingsCard
          id="secret-os-leave"
          title={t('special.leave.title')}
          description={t('special.leave.desc')}
          highlight={focusSettingId === 'secret-os-leave'}
        >
          {activeThemeId === AERO_THEME_ID && (
            <button type="button" className="btn" onClick={() => exitSecretAero()}>
              {t('special.leave.aero')}
            </button>
          )}
          {activeThemeId === WIRED_ARCHIVE_THEME_ID && (
            <button type="button" className="btn" onClick={() => requestWiredArchiveShutdown()}>
              {t('special.leave.wired')}
            </button>
          )}
          <p className="muted os-set-hint">{t('special.leave.hint')}</p>
        </SettingsCard>
      )}

      {showLockedState && (
        <SettingsCard
          id="special-locked"
          title={t('special.locked.title')}
          description={t('special.locked.desc')}
          highlight={focusSettingId === 'special-locked' || anchorsModules('special-locked')}
        >
          <p className="muted os-set-hint">
            {t('special.locked.hint')}
          </p>
        </SettingsCard>
      )}

      {(wired || isWiredDiscovered) && (
        <SettingsCard
          id="wired-archive"
          title={t('special.wired.service')}
          description={t('special.wired.serviceDesc')}
          highlight={focusSettingId === 'wired-archive' || anchorsModules('wired-archive')}
        >
          <div className="os-viz-row">
            <span className="os-viz-label muted">{t('special.crtIntensity')}</span>
            {(['clean', 'standard', 'heavy'] as WiredCrtIntensity[]).map((id) => (
              <button
                key={id}
                type="button"
                {...seg(wiredSettings.crtIntensity === id)}
                onClick={() => setWiredSettings(saveWiredArchiveSettings({ crtIntensity: id }))}
              >
                {id.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="os-viz-row">
            <span className="os-viz-label muted">{t('wired.settings.motion')}</span>
            {(['full', 'reduced', 'off'] as WiredMotionLevel[]).map((id) => (
              <button
                key={id}
                type="button"
                {...seg(wiredSettings.motionLevel === id)}
                onClick={() => setWiredSettings(saveWiredArchiveSettings({ motionLevel: id }))}
              >
                {id.toUpperCase()}
              </button>
            ))}
          </div>
          <Toggle
            className="os-toggle"
            checked={wiredSettings.uiCues}
            onChange={(e) => setWiredSettings(saveWiredArchiveSettings({ uiCues: e.currentTarget.checked }))}
            label={t('wired.settings.uiCues')}
          />
          <Toggle
            className="os-toggle"
            checked={wiredSettings.idleAnimations}
            onChange={(e) => setWiredSettings(saveWiredArchiveSettings({ idleAnimations: e.currentTarget.checked }))}
            label={t('wired.settings.idleAnimations')}
          />
          <Toggle
            className="os-toggle"
            checked={wiredSettings.reducedStatic}
            onChange={(e) => setWiredSettings(saveWiredArchiveSettings({ reducedStatic: e.currentTarget.checked }))}
            label={t('special.reducedStatic')}
          />
          <Toggle
            className="os-toggle"
            checked={wiredSettings.ambientEnabled}
            onChange={(e) => setWiredSettings(saveWiredArchiveSettings({ ambientEnabled: e.currentTarget.checked }))}
            label={t('special.terminalAmbient')}
          />
          <Toggle
            className="os-toggle"
            checked={wiredSettings.replayBoot}
            onChange={(e) => setWiredSettings(saveWiredArchiveSettings({ replayBoot: e.currentTarget.checked }))}
            label={t('special.replayBoot')}
          />
          <button
            type="button"
            className="btn small"
            onClick={() => {
              resetWiredArchiveBootSeen();
              requestWiredArchiveRestart();
            }}
          >
            {t('special.wired.replayNow')}
          </button>
        </SettingsCard>
      )}

      {/* Wired study mechanics: layer descent, TTY, signal decrypt, intercepts. */}
      {(wired || isWiredDiscovered) && <WiredMechanicsCard />}

      {isWiredDiscovered && (
        <SettingsCard
          id="wired-finding-terminal"
          title={t('special.wired.naviTerminal')}
          description={t('special.wired.naviDesc')}
          highlight={focusSettingId === 'wired-finding-terminal'}
        >
          <Toggle
            className="os-toggle"
            checked={wiredSettings.findingOverlayEnabled}
            onChange={(e) => setWiredSettings(saveWiredArchiveSettings({ findingOverlayEnabled: e.currentTarget.checked }))}
            label={t('special.wired.findingOverlay')}
          />

          <form
            className="wired-settings-terminal"
            onSubmit={(event) => {
              event.preventDefault();
              runWiredCommand(wiredCommand);
              setWiredCommand('');
            }}
          >
            <div className="wired-settings-terminal-screen" aria-live="polite">
              {wiredTerminalLines.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>
            <div className="wired-settings-terminal-command">
              <span aria-hidden="true">&gt;</span>
              <input
                value={wiredCommand}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setWiredCommand(event.currentTarget.value)}
                placeholder={t('special.term.wiredPlaceholder')}
              />
              <button type="submit">{t('special.term.run')}</button>
            </div>
            <div className="wired-settings-terminal-actions">
              <button type="button" onClick={() => runWiredCommand('quiet')}>{t('special.term.quiet')}</button>
              <button type="button" onClick={() => runWiredCommand('scan')}>{t('special.term.scan')}</button>
              <button type="button" onClick={() => runWiredCommand('all')}>{t('special.term.all')}</button>
              <button type="button" onClick={summonWiredShimeji}>
                {wiredSummonOn ? t('special.term.dismiss') : t('special.term.summon')}
              </button>
            </div>
          </form>

          <div className="wired-feature-grid">
            {WIRED_TERMINAL_FEATURES.map((feature) => {
              const active = wiredSettings.findingFeatures.includes(feature.id);
              return (
                <label key={feature.id} className={`wired-feature-toggle${active ? ' is-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) => toggleFindingFeature(feature.id, event.currentTarget.checked)}
                  />
                  <span>
                    <strong>{t(feature.titleKey)}</strong>
                    <small>{t(feature.descKey)}</small>
                  </span>
                  <code>{feature.command}</code>
                </label>
              );
            })}
          </div>
        </SettingsCard>
      )}

      {isWiredDiscovered && (
        <SettingsCard
          id="wired-arcade"
          title={t('special.game.wired.title')}
          description={t('special.game.wired.desc')}
          highlight={focusSettingId === 'wired-arcade'}
        >
          <button
            type="button"
            className="special-collapse-toggle"
            aria-expanded={wiredGamesOpen}
            onClick={() => setWiredGamesOpen((open) => !open)}
          >
            <span>{t(wiredGamesOpen ? 'special.game.wired.hide' : 'special.game.wired.show')}</span>
            <code>{t('special.game.online', { count: WIRED_GAME_MODULES.length })}</code>
          </button>
          {wiredGamesOpen && (
            <div className="special-game-grid special-game-grid--wired">
              {WIRED_GAME_MODULES.map((game) => (
                <article key={game.id} className="special-game-card">
                  <div className={`scifi-loader scifi-loader--${game.id} special-game-loader`} aria-hidden="true">
                    <div className="scifi-loader-orbit">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                  <div>
                    <strong>{t(game.titleKey)}</strong>
                    <small>{t(game.descKey)}</small>
                  </div>
                  <button type="button" className="btn small" onClick={() => openArenaGame(game.id, 'wired')}>
                    {t('special.game.launch')}
                  </button>
                  <code>{game.command}</code>
                </article>
              ))}
            </div>
          )}
        </SettingsCard>
      )}

      {isAeroDiscovered && (
        <SettingsCard
          id="aero-gadget-lab"
          title={t('special.aero.gadgetLab')}
          description={t('special.aero.gadgetLabDesc')}
          highlight={focusSettingId === 'aero-gadget-lab' || anchorsModules('aero-gadget-lab')}
        >
          <Toggle
            className="os-toggle"
            checked={aeroSettings.overlayEnabled}
            onChange={(e) => setAeroSettings(saveAeroLegacySettings({ overlayEnabled: e.currentTarget.checked }))}
            label={t('special.aeroLyricGadgets')}
          />

          <form
            className="aero-settings-terminal"
            onSubmit={(event) => {
              event.preventDefault();
              runAeroCommand(aeroCommand);
              setAeroCommand('');
            }}
          >
            <div className="aero-settings-terminal-screen" aria-live="polite">
              {aeroTerminalLines.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>
            <div className="aero-settings-terminal-command">
              <span aria-hidden="true">C:\&gt;</span>
              <input
                value={aeroCommand}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setAeroCommand(event.currentTarget.value)}
                placeholder={t('special.term.aeroPlaceholder')}
              />
              <button type="submit">{t('special.term.run')}</button>
            </div>
            <div className="aero-settings-terminal-actions">
              <button type="button" onClick={() => runAeroCommand('quiet')}>{t('special.term.quiet')}</button>
              <button type="button" onClick={() => runAeroCommand('scan')}>{t('special.term.scan')}</button>
              <button type="button" onClick={() => runAeroCommand('all')}>{t('special.term.all')}</button>
              <button type="button" onClick={summonAeroBuddy}>
                {aeroSummonOn ? t('special.term.dismiss') : t('special.term.summon')}
              </button>
            </div>
          </form>

          <div className="aero-feature-grid">
            {AERO_GADGET_FEATURES.map((feature) => {
              const active = aeroSettings.features.includes(feature.id);
              return (
                <label key={feature.id} className={`aero-feature-toggle${active ? ' is-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) => toggleAeroFeature(feature.id, event.currentTarget.checked)}
                  />
                  <span>
                    <strong>{t(feature.titleKey)}</strong>
                    <small>{t(feature.descKey)}</small>
                  </span>
                  <code>{feature.command}</code>
                </label>
              );
            })}
          </div>
          {!aero && <p className="muted os-set-hint">{t('special.aero.gadgetHint')}</p>}
        </SettingsCard>
      )}

      {isAeroDiscovered && <AeroMechanicsCard />}

      {isAeroDiscovered && (
        <SettingsCard
          id="aero-arcade"
          title={t('special.game.aero.title')}
          description={t('special.game.aero.desc')}
          highlight={focusSettingId === 'aero-arcade'}
        >
          <button
            type="button"
            className="special-collapse-toggle special-collapse-toggle--aero"
            aria-expanded={aeroGamesOpen}
            onClick={() => setAeroGamesOpen((open) => !open)}
          >
            <span>{t(aeroGamesOpen ? 'special.game.aero.hide' : 'special.game.aero.show')}</span>
            <code>{t('special.game.ready', { count: AERO_GAME_MODULES.length })}</code>
          </button>
          {aeroGamesOpen && (
            <div className="special-game-grid special-game-grid--aero">
              {AERO_GAME_MODULES.map((game) => (
                <article key={game.id} className="special-game-card special-game-card--aero">
                  <div className={`scifi-loader scifi-loader--${game.id} special-game-loader`} aria-hidden="true">
                    <div className="scifi-loader-orbit">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                  <div>
                    <strong>{t(game.titleKey)}</strong>
                    <small>{t(game.descKey)}</small>
                  </div>
                  <button type="button" className="btn small" onClick={() => openArenaGame(game.id, 'aero')}>
                    {t('special.game.launch')}
                  </button>
                  <code>{game.command}</code>
                </article>
              ))}
            </div>
          )}
        </SettingsCard>
      )}
    </>
  );
}
