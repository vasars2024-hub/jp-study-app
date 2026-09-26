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
import { onAeroDiscoveryChanged, showsTreasureCompanion } from '../aeroDiscovery';

const TREASURE_COMPANION_ENV = (base: EnvironmentSettings): EnvironmentSettings => ({
  ...base,
  enabled: true,
  companionsEnabled: true,
  companionTypes: ['aero-assistant'],
  companions: (base.companions ?? []).filter((c) => c.typeId === 'aero-assistant'),
});

export default function EnvironmentStack({
  onRotationActive,
  /** Session-only: hide living wallpaper so a shell wall can show, without mutating rotationEnabled. */
  suppressWallpaper = false,
}: {
  onRotationActive?: (active: boolean, label?: string) => void;
  suppressWallpaper?: boolean;
}) {
  const [env, setEnv] = useState<EnvironmentSettings>(loadEnvironment);

  useEffect(() => onEnvironmentChanged(setEnv), []);
  // Discovery and "hide the locked companion" both change what shows here.
  const [treasure, setTreasure] = useState(showsTreasureCompanion);
  useEffect(() => onAeroDiscoveryChanged(() => setTreasure(showsTreasureCompanion())), []);

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
      if (cur.rotationEnabled && !suppressWallpaper) {
        window.dispatchEvent(
          new CustomEvent('jp-os-environment-changed', { detail: cur }),
        );
      }
    };
    ping();
    return onCalendarChanged(ping);
  }, [env.enabled, env.calendarWallsEnabled, env.companionsEnabled, env.rotationEnabled, suppressWallpaper]);

  const handleActive = useCallback(
    (active: boolean, label?: string) => {
      onRotationActive?.(active, label);
    },
    [onRotationActive],
  );

  // Always clear shell wall-from-env when living layer or rotation is off
  // (unmounting WallpaperStage alone used to leave wallFromEnv stuck true).
  useEffect(() => {
    const active = env.enabled && env.rotationEnabled && !suppressWallpaper;
    if (!active) onRotationActive?.(false);
  }, [env.enabled, env.rotationEnabled, suppressWallpaper, onRotationActive]);

  if (!env.enabled) {
    if (!treasure) return null;
    return (
      <div className="os-env-stack os-env-stack-treasure" aria-hidden={false} data-companions="1">
        <CompanionLayer env={TREASURE_COMPANION_ENV(env)} />
      </div>
    );
  }

  const showTreasureCompanion = treasure && !env.companionsEnabled;
  const showLivingWallpaper = env.rotationEnabled && !suppressWallpaper;

  return (
    <div
      className="os-env-stack"
      aria-hidden={false}
      data-env-tier={env.performanceTier}
      data-particles={env.particlesEnabled ? '1' : '0'}
      data-companions={env.companionsEnabled || showTreasureCompanion ? '1' : '0'}
      data-rotation={showLivingWallpaper ? '1' : '0'}
      data-lighting={env.dayCycleLighting ? '1' : '0'}
      data-weather={env.weather?.mode && env.weather.mode !== 'off' ? env.weather.mode : '0'}
    >
      {showLivingWallpaper && <WallpaperStage onActiveChange={handleActive} />}
      {env.dayCycleLighting && <DayCycleLighting env={env} />}
      {env.weather?.mode !== 'off' && env.performanceTier !== 'off' && <WeatherLayer env={env} />}
      {env.particlesEnabled && env.performanceTier !== 'off' && <ParticleLayer env={env} />}
      {(env.companionsEnabled || showTreasureCompanion) && (
        <CompanionLayer env={showTreasureCompanion ? TREASURE_COMPANION_ENV(env) : env} />
      )}
    </div>
  );
}
