/**
 * Tray readout of the operator's depth: `LAYER:07` over a thin progress rail
 * toward the next threshold. Clicking it opens the Navi terminal on `layer`.
 * Re-renders only when the layer store publishes (a recompute), never on a tick.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { formatLayer, layerProgress, nextLayerThreshold } from '../../wiredMechanics/layer';
import { useWiredLayer } from '../../wiredMechanics/layerStore';
import { runInWiredTerminal } from '../../wiredMechanics/consoleBus';
import { loadWiredMechanicsSettings, onWiredMechanicsSettingsChanged } from '../../wiredMechanics/settings';

export default function WiredLayerBadge() {
  const { t } = useT();
  const { layer, depth } = useWiredLayer();
  const [enabled, setEnabled] = useState(() => loadWiredMechanicsSettings().layerDescent);
  useEffect(() => onWiredMechanicsSettingsChanged((s) => setEnabled(s.layerDescent)), []);
  if (!enabled) return null;
  const next = nextLayerThreshold(layer);
  const label =
    next === null
      ? t('wiredMech.badge.floor', { layer: formatLayer(layer), depth })
      : t('wiredMech.badge.title', { layer: formatLayer(layer), depth, next });
  return (
    <button
      type="button"
      className="wired-layer-badge"
      title={label}
      aria-label={label}
      onClick={() => runInWiredTerminal('layer')}
    >
      <span className="wired-layer-badge-code">{formatLayer(layer)}</span>
      <i className="wired-layer-badge-rail" aria-hidden="true">
        <i style={{ transform: `scaleX(${Math.max(0.04, layerProgress(depth, layer))})` }} />
      </i>
    </button>
  );
}
