/**
 * Settings > Special > Wired mechanics: the switches for how studying behaves
 * inside the archive, and the operator's current depth (layer, signal depth,
 * next threshold, what each layer opened). Rendered next to the Wired service
 * panel; the consoles themselves only exist while Wired is the live theme.
 */
import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { Toggle, useWiredMaterials } from '../../ui';
import { useT } from '../../../i18n';
import {
  INTERCEPT_INTERVALS_MIN,
  loadWiredMechanicsSettings,
  onWiredMechanicsSettingsChanged,
  saveWiredMechanicsSettings,
  type WiredMechanicsSettings,
} from '../../../wiredMechanics/settings';
import {
  formatLayer,
  isUnlocked,
  LAYER_THRESHOLDS,
  LAYER_UNLOCKS,
  layerProgress,
  nextLayerThreshold,
  requiredLayer,
} from '../../../wiredMechanics/layer';
import { refreshWiredLayer, useWiredLayer } from '../../../wiredMechanics/layerStore';
import { openWiredConsole } from '../../../wiredMechanics/consoleBus';

export default function WiredMechanicsCard() {
  const { seg } = useSettings();
  const { t } = useT();
  const wired = useWiredMaterials();
  const [s, setS] = useState<WiredMechanicsSettings>(loadWiredMechanicsSettings);
  const { layer, depth } = useWiredLayer();

  useEffect(() => onWiredMechanicsSettingsChanged(setS), []);
  // A real reading on open, without announcing a crossing from a settings page.
  useEffect(() => {
    refreshWiredLayer(false);
  }, []);

  const save = (patch: Partial<WiredMechanicsSettings>): void => setS(saveWiredMechanicsSettings(patch));
  const next = nextLayerThreshold(layer);
  const reticleOpen = isUnlocked(layer, 'cursor', 'reticle');

  return (
    <SettingsCard id="wired-mechanics" title={t('wiredMech.settings.title')} description={t('wiredMech.settings.desc')}>
      <div className="wired-mech-depth" role="group" aria-label={t('wiredMech.settings.depthLabel')}>
        <div className="wired-mech-depth-head">
          <b>{formatLayer(layer)}</b>
          <span>{t('wiredMech.layer.depth', { depth })}</span>
          <span className="muted">
            {next === null
              ? t('wiredMech.layer.floor')
              : t('wiredMech.layer.next', { layer: formatLayer(layer + 1), at: next, left: Math.max(0, next - depth) })}
          </span>
        </div>
        <div className="wired-mech-rail" aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.max(0.02, layerProgress(depth, layer))})` }} />
        </div>
        <p className="muted os-set-hint">{t('wiredMech.layer.formula')}</p>
        <ul className="wired-mech-unlocks">
          {LAYER_UNLOCKS.map((u) => (
            <li key={`${u.kind}:${u.id}`} className={u.layer <= layer ? 'is-open' : 'is-sealed'}>
              <code>{formatLayer(u.layer)}</code>
              <span>{t(u.descKey)}</span>
              <small>{LAYER_THRESHOLDS[u.layer - 1]}</small>
            </li>
          ))}
        </ul>
      </div>

      <Toggle
        className="os-toggle"
        checked={s.layerDescent}
        onChange={(e) => save({ layerDescent: e.currentTarget.checked })}
        label={t('wiredMech.settings.layerDescent')}
      />
      <Toggle
        className="os-toggle"
        checked={s.signalDecrypt}
        onChange={(e) => save({ signalDecrypt: e.currentTarget.checked })}
        label={t('wiredMech.settings.signalDecrypt')}
      />
      <Toggle
        className="os-toggle"
        checked={s.naviTerminal}
        onChange={(e) => save({ naviTerminal: e.currentTarget.checked })}
        label={t('wiredMech.settings.naviTerminal')}
      />
      <Toggle
        className="os-toggle"
        checked={s.intercepts}
        onChange={(e) => save({ intercepts: e.currentTarget.checked })}
        label={t('wiredMech.settings.intercepts')}
      />
      <div className="os-viz-row">
        <span className="os-viz-label muted">{t('wiredMech.settings.interval')}</span>
        {INTERCEPT_INTERVALS_MIN.map((min) => (
          <button
            key={min}
            type="button"
            {...seg(s.interceptIntervalMin === min)}
            disabled={!s.intercepts}
            onClick={() => save({ interceptIntervalMin: min })}
          >
            {t('wiredMech.settings.intervalMin', { count: min })}
          </button>
        ))}
      </div>
      <Toggle
        className="os-toggle"
        checked={s.wiredRemembers}
        onChange={(e) => save({ wiredRemembers: e.currentTarget.checked })}
        label={t('wiredMech.settings.wiredRemembers')}
      />
      <div className="os-viz-row">
        <span className="os-viz-label muted">{t('wiredMech.settings.cursor')}</span>
        <button type="button" {...seg(s.cursor === 'navi')} onClick={() => save({ cursor: 'navi' })}>
          NAVI
        </button>
        <button
          type="button"
          {...seg(s.cursor === 'reticle')}
          disabled={!reticleOpen}
          title={reticleOpen ? undefined : t('wiredMech.term.sealedUntil', { layer: formatLayer(requiredLayer('cursor', 'reticle')) })}
          onClick={() => save({ cursor: 'reticle' })}
        >
          RETICLE
        </button>
      </div>
      <div className="os-viz-row">
        <button
          type="button"
          className="btn small"
          disabled={!wired || !s.naviTerminal}
          onClick={() => openWiredConsole('tty')}
        >
          {t('wiredMech.start.tty')}
        </button>
        <button
          type="button"
          className="btn small"
          disabled={!wired || !s.signalDecrypt}
          onClick={() => openWiredConsole('decrypt')}
        >
          {t('wiredMech.start.decrypt')}
        </button>
      </div>
      {!wired && <p className="muted os-set-hint">{t('wiredMech.settings.wiredOnly')}</p>}
    </SettingsCard>
  );
}
