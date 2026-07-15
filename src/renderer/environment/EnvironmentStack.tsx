/**
 * Living desktop stack mounted under icons.
 * L1 wallpaper · L2 particles · L3 companions · L5 day-cycle lighting
 */
import { useCallback, useEffect, useState } from 'react';
import { loadEnvironment, onEnvironmentChanged } from './environmentStore';
import type { EnvironmentSettings } from './types';
import WallpaperStage from './WallpaperStage';
import ParticleLayer from './ParticleLayer';
import CompanionLayer from './CompanionLayer';
import DayCycleLighting from './DayCycleLightingLayer';
import WeatherLayer from './WeatherLayer';
import { pulseCalendarCompanions } from './schedules';
import { onCalendarChanged } from '../calendar';
import { hasDiscoveredAero } from '../aeroDiscovery';

const TREASURE_MIKO_ENV = (base: EnvironmentSettings): EnvironmentSettings => ({
  ...base,
  enabled: true,
  companionsEnabled: true,
  companionTypes: ['miko-shimeji'],
  companions: (base.companions ?? []).filter((c) => c.typeId === 'miko-shimeji'),
});

export default function EnvironmentStack({
  onRotationActive,
}: {
  onRotationActive?: (active: boolean, label?: string) => void;
}) {
  const [env, setEnv] = useState<EnvironmentSettings>(loadEnvironment);

  useEffect(() => onEnvironmentChanged(setEnv), []);

  // Calendar changes can swap walls / ping companions (also re-tick wallpaper rules)
  useEffect(() => {
    if (!env.enabled) return;
    const ping = () => {
      const cur = loadEnvironment();
      if (cur.calendarWallsEnabled) {
        pulseCalendarCompanions(cur);
      }
      // Nudge WallpaperStage soft tick even when calendar walls are off
      // (time-of-day rules still re-resolve promptly after any calendar edit).
      if (cur.rotationEnabled) {
        window.dispatchEvent(
          new CustomEvent('jp-os-environment-changed', { detail: cur }),
        );
      }
    };
    ping();
    return onCalendarChanged(ping);
  }, [env.enabled, env.calendarWallsEnabled, env.companionsEnabled, env.rotationEnabled]);

  const handleActive = useCallback(
    (active: boolean, label?: string) => {
      onRotationActive?.(active, label);
    },
    [onRotationActive],
  );

  // Always clear shell wall-from-env when living layer or rotation is off
  // (unmounting WallpaperStage alone used to leave wallFromEnv stuck true).
  useEffect(() => {
    const active = env.enabled && env.rotationEnabled;
    if (!active) onRotationActive?.(false);
  }, [env.enabled, env.rotationEnabled, onRotationActive]);

  if (!env.enabled) {
    if (hasDiscoveredAero()) return null;
    return (
      <div className="os-env-stack os-env-stack-treasure" aria-hidden={false} data-companions="1">
        <CompanionLayer env={TREASURE_MIKO_ENV(env)} />
      </div>
    );
  }

  const showTreasureMiko = !hasDiscoveredAero() && !env.companionsEnabled;

  return (
    <div
      className="os-env-stack"
      aria-hidden={false}
      data-env-tier={env.performanceTier}
      data-particles={env.particlesEnabled ? '1' : '0'}
      data-companions={env.companionsEnabled || showTreasureMiko ? '1' : '0'}
      data-rotation={env.rotationEnabled ? '1' : '0'}
      data-lighting={env.dayCycleLighting ? '1' : '0'}
      data-weather={env.weather?.mode && env.weather.mode !== 'off' ? env.weather.mode : '0'}
    >
      {env.rotationEnabled && <WallpaperStage onActiveChange={handleActive} />}
      {env.dayCycleLighting && <DayCycleLighting env={env} />}
      {env.weather?.mode !== 'off' && env.performanceTier !== 'off' && <WeatherLayer env={env} />}
      {env.particlesEnabled && env.performanceTier !== 'off' && <ParticleLayer env={env} />}
      {(env.companionsEnabled || showTreasureMiko) && (
        <CompanionLayer env={showTreasureMiko ? TREASURE_MIKO_ENV(env) : env} />
      )}
    </div>
  );
}
