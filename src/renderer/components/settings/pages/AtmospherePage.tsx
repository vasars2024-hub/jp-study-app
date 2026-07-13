import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import PlaylistEditor from '../../PlaylistEditor';
import {
  PARTICLE_PRESETS,
  resolveWall,
  type ParticlePresetId,
  type PerformanceTier,
} from '../../../environment';
import { ENVIRONMENT_PRESETS, getEnvironmentPreset, presetPatch } from '../../../environment/environmentPresets';
import type { WeatherMode } from '../../../environment/types';

export default function AtmospherePage() {
  const s = useSettings();
  const { env, patchEnv, seg, focusSettingId } = s;
  const resolved = env.enabled && env.rotationEnabled ? resolveWall(env) : null;

  return (
    <>
      <SettingsCard
        id="living-layer"
        title="Living desktop layer"
        description="Optional atmosphere stack: rotation, particles, lighting, and companions. Off by default."
        highlight={focusSettingId === 'living-layer'}
        trailing={
          <label className="os-toggle os-toggle-compact">
            <input
              type="checkbox"
              checked={env.enabled}
              onChange={(e) => patchEnv({ enabled: e.target.checked })}
              aria-label="Enable living desktop layer"
            />
            <span>{env.enabled ? 'On' : 'Off'}</span>
          </label>
        }
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Performance</span>
          {([
            ['off', 'Off'],
            ['low', 'Low'],
            ['medium', 'Medium'],
            ['high', 'High'],
          ] as [PerformanceTier, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(env.performanceTier === id)}
              onClick={() => patchEnv({ performanceTier: id })}
              disabled={!env.enabled}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="environment-preset"
        title="Environment"
        description="Cohesive places that set particles, weather, lighting, and ambience together in one click."
        highlight={focusSettingId === 'environment-preset'}
      >
        <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
          {ENVIRONMENT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={seg(env.environmentPresetId === p.id)}
              title={p.description}
              onClick={() => patchEnv({ ...presetPatch(p.id), enabled: true })}
            >
              {p.label}
            </button>
          ))}
        </div>
        {env.environmentPresetId && (
          <p className="muted os-set-hint">{getEnvironmentPreset(env.environmentPresetId)?.description}</p>
        )}
      </SettingsCard>

      <SettingsCard
        id="rotation"
        title="Wallpaper rotation"
        description="Drive the background from playlists, time of day, and calendar rules."
        highlight={focusSettingId === 'rotation'}
        trailing={
          <label className="os-toggle os-toggle-compact">
            <input
              type="checkbox"
              checked={env.rotationEnabled}
              disabled={!env.enabled}
              onChange={(e) => patchEnv({ rotationEnabled: e.target.checked })}
              aria-label="Enable wallpaper rotation"
            />
            <span>{env.rotationEnabled ? 'On' : 'Off'}</span>
          </label>
        }
      >
        {resolved && (
          <p className="muted os-set-hint">
            Now: <strong>{resolved.item.label ?? resolved.item.ref}</strong>
            {' — '}
            {resolved.reason}
          </p>
        )}
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={env.calendarWallsEnabled}
            disabled={!env.enabled || !env.rotationEnabled}
            onChange={(e) => patchEnv({ calendarWallsEnabled: e.target.checked })}
          />
          <span>Calendar walls (exam / study days override time-of-day)</span>
        </label>
        <PlaylistEditor env={env} disabled={!env.enabled || !env.rotationEnabled} onChange={patchEnv} />
      </SettingsCard>

      <SettingsCard
        id="lighting"
        title="Day-cycle lighting"
        description="Soft ambient wash that follows the time of day."
        highlight={focusSettingId === 'lighting'}
        trailing={
          <label className="os-toggle os-toggle-compact">
            <input
              type="checkbox"
              checked={env.dayCycleLighting}
              disabled={!env.enabled}
              onChange={(e) => patchEnv({ dayCycleLighting: e.target.checked })}
              aria-label="Enable day-cycle lighting"
            />
            <span>{env.dayCycleLighting ? 'On' : 'Off'}</span>
          </label>
        }
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Intensity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={env.lightingIntensity}
            disabled={!env.enabled || !env.dayCycleLighting}
            onChange={(e) => patchEnv({ lightingIntensity: Number(e.target.value) })}
          />
          <span className="muted">{Math.round(env.lightingIntensity * 100)}%</span>
        </div>
      </SettingsCard>

      <SettingsCard
        id="particles"
        title="Particles"
        description="Fireflies, snow, rain, and more. Density is count; intensity is glow; size is radius."
        highlight={
          focusSettingId === 'particles' ||
          focusSettingId === 'particle-size' ||
          focusSettingId === 'snow-accumulation'
        }
        trailing={
          <label className="os-toggle os-toggle-compact">
            <input
              type="checkbox"
              checked={env.particlesEnabled}
              disabled={!env.enabled}
              onChange={(e) => patchEnv({ particlesEnabled: e.target.checked })}
              aria-label="Enable particles"
            />
            <span>{env.particlesEnabled ? 'On' : 'Off'}</span>
          </label>
        }
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={env.matchParticleSuggestions}
            disabled={!env.enabled || !env.particlesEnabled}
            onChange={(e) => patchEnv({ matchParticleSuggestions: e.target.checked })}
          />
          <span>Match wallpaper / time of day</span>
        </label>
        <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
          <span className="os-viz-label muted">Presets</span>
          {PARTICLE_PRESETS.map((p) => {
            const on = env.particlePresets.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={seg(on)}
                disabled={!env.enabled || !env.particlesEnabled || env.matchParticleSuggestions}
                title={p.label}
                onClick={() => {
                  const next: ParticlePresetId[] = on
                    ? env.particlePresets.filter((id) => id !== p.id)
                    : [...env.particlePresets, p.id];
                  patchEnv({ particlePresets: next.length ? next : [p.id] });
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Density</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={env.particleDensity}
            disabled={!env.enabled || !env.particlesEnabled}
            onChange={(e) => patchEnv({ particleDensity: Number(e.target.value) })}
          />
          <span className="muted">{Math.round(env.particleDensity * 100)}%</span>
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Intensity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={env.particleIntensity ?? 0.8}
            disabled={!env.enabled || !env.particlesEnabled}
            onChange={(e) => patchEnv({ particleIntensity: Number(e.target.value) })}
          />
          <span className="muted">{Math.round((env.particleIntensity ?? 0.8) * 100)}%</span>
        </div>
        <div className="os-viz-row" data-setting-id="particle-size">
          <span className="os-viz-label muted">Size</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={env.particleSize ?? 0.55}
            disabled={!env.enabled || !env.particlesEnabled}
            onChange={(e) => patchEnv({ particleSize: Number(e.target.value) })}
          />
          <span className="muted">{Math.round((env.particleSize ?? 0.55) * 100)}%</span>
        </div>
        <label className="os-toggle" data-setting-id="snow-accumulation">
          <input
            type="checkbox"
            checked={env.snowAccumulation !== false}
            disabled={!env.enabled || !env.particlesEnabled}
            onChange={(e) => patchEnv({ snowAccumulation: e.target.checked })}
          />
          <span>Snow accumulation (piles on the desk edge)</span>
        </label>
      </SettingsCard>

      <SettingsCard
        id="weather"
        title="Weather"
        description="Atmospheric fog, clouds, and precipitation over the desktop. Auto follows the wallpaper."
        highlight={focusSettingId === 'weather'}
      >
        <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
          <span className="os-viz-label muted">Mode</span>
          {([
            ['off', 'Off'],
            ['auto', 'Auto'],
            ['clouds', 'Clouds'],
            ['fog', 'Fog'],
            ['rain', 'Rain'],
            ['snow', 'Snow'],
          ] as [WeatherMode, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg((env.weather?.mode ?? 'off') === id)}
              disabled={!env.enabled}
              onClick={() => patchEnv({ weather: { mode: id, intensity: env.weather?.intensity ?? 0.5 } })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Intensity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={env.weather?.intensity ?? 0.5}
            disabled={!env.enabled || (env.weather?.mode ?? 'off') === 'off'}
            onChange={(e) => patchEnv({ weather: { mode: env.weather?.mode ?? 'off', intensity: Number(e.target.value) } })}
          />
          <span className="muted">{Math.round((env.weather?.intensity ?? 0.5) * 100)}%</span>
        </div>
      </SettingsCard>

      <SettingsCard
        id="ambient-audio"
        title="Ambient audio"
        description="Looping soundscapes matched to the environment."
        highlight={focusSettingId === 'ambient-audio'}
        trailing={
          <label className="os-toggle os-toggle-compact">
            <input
              type="checkbox"
              checked={env.ambientAudio?.enabled ?? false}
              disabled={!env.enabled}
              onChange={(e) => patchEnv({ ambientAudio: { enabled: e.target.checked, volume: env.ambientAudio?.volume ?? 0.5 } })}
              aria-label="Enable ambient audio"
            />
            <span>{env.ambientAudio?.enabled ? 'On' : 'Off'}</span>
          </label>
        }
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={env.ambientAudio?.volume ?? 0.5}
            disabled={!env.enabled || !env.ambientAudio?.enabled}
            onChange={(e) => patchEnv({ ambientAudio: { enabled: env.ambientAudio?.enabled ?? false, volume: Number(e.target.value) } })}
          />
          <span className="muted">{Math.round((env.ambientAudio?.volume ?? 0.5) * 100)}%</span>
        </div>
        <p className="muted os-set-hint">Ships silent — add a sound pack to hear environment ambience.</p>
      </SettingsCard>

      <SettingsCard
        id="achievements"
        title="Achievements"
        description="Celebrate streaks and daily reading milestones with companions."
        highlight={focusSettingId === 'achievements'}
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={env.achievementCelebrations}
            disabled={!env.enabled}
            onChange={(e) => patchEnv({ achievementCelebrations: e.target.checked })}
          />
          <span>Celebrate streaks and daily reading milestones</span>
        </label>
        <p className="muted os-set-hint">
          Noctis city simulation is not driven from the desktop layer yet — only soft pulses for the
          emissary companion.
        </p>
      </SettingsCard>
    </>
  );
}
