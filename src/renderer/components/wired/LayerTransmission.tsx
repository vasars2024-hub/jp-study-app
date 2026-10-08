/**
 * INCOMING TRANSMISSION — shown when the operator descends a layer (or the
 * archive calibrates on first entry). Names the new layer and what it opened.
 * Stepped reveal in CSS (dead under reduced motion), handshake cue through
 * soundEngine, a log-only bulletin entry, dismissed by click / Enter / Escape
 * or after a few seconds.
 */
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { playSound } from '../../audio/soundEngine';
import { wiredUiCuesEnabled } from '../../terminalModeSettings';
import { notify } from '../../notificationStore';
import { formatLayer, unlocksAt } from '../../wiredMechanics/layer';
import { onWiredLayerCrossed, type LayerCrossedDetail } from '../../wiredMechanics/layerStore';

const AUTO_DISMISS_MS = 9000;

export default function LayerTransmission() {
  const { t } = useT();
  const [current, setCurrent] = useState<LayerCrossedDetail | null>(null);

  useEffect(
    () =>
      onWiredLayerCrossed((detail) => {
        setCurrent(detail);
        if (wiredUiCuesEnabled()) void playSound('system', 'handshake', { volume: 0.6 });
        notify({
          message: detail.calibrated
            ? t('wiredMech.layer.bulletinCalibrated', { layer: formatLayer(detail.to) })
            : t('wiredMech.layer.bulletin', { layer: formatLayer(detail.to) }),
          source: 'NAVI',
          silent: true,
        });
      }),
    [t],
  );

  const dismiss = useCallback(() => setCurrent(null), []);

  useEffect(() => {
    if (!current) return undefined;
    const id = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Enter') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [current, dismiss]);

  if (!current) return null;
  const unlocks = current.calibrated ? [] : current.crossed.flatMap((l) => unlocksAt(l));

  return (
    <div className="wmc-tx" role="alertdialog" aria-live="assertive" aria-label={t('wiredMech.layer.incoming')} onClick={dismiss}>
      <div className="wmc-tx-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wmc-tx-kicker">{t('wiredMech.layer.incoming')}</div>
        <div className="wmc-tx-layer">{formatLayer(current.to)}</div>
        <p className="wmc-tx-copy">
          {current.calibrated ? t('wiredMech.layer.calibrated') : t('wiredMech.layer.reached')}
        </p>
        {unlocks.length > 0 && (
          <ul className="wmc-tx-unlocks">
            {unlocks.map((u) => (
              <li key={`${u.kind}:${u.id}`}>
                <b>{formatLayer(u.layer)}</b> {t(u.descKey)}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="wmc-btn" onClick={dismiss} autoFocus>
          {t('wiredMech.layer.ack')}
        </button>
      </div>
    </div>
  );
}
