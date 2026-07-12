import Icon from '../../Icons';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';

const INTERVALS: { sec: number; label: string }[] = [
  { sec: 10, label: '10 seconds' },
  { sec: 30, label: '30 seconds' },
  { sec: 60, label: '1 minute' },
  { sec: 180, label: '3 minutes' },
  { sec: 600, label: '10 minutes' },
  { sec: 1800, label: '30 minutes' },
  { sec: 3600, label: '1 hour' },
  { sec: 86400, label: '1 day' },
];

export default function WallpaperPage() {
  const s = useSettings();
  const { look, patchLook, focusSettingId, wall } = s;
  const isSlide = wall.kind === 'slideshow';
  const users = s.userWallpapers ?? [];
  const thumbs = s.userWallThumbs ?? {};

  const userActive =
    (wall.kind === 'image' || wall.kind === 'video') &&
    !!wall.id &&
    users.some((u) => u.id === wall.id);

  return (
    <SettingsCard
      id="wallpaper"
      title="Wallpaper"
      description="Static preset, your images and videos, folder slideshow, or live video."
      highlight={focusSettingId === 'wallpaper' || focusSettingId === 'wallpaper-dim'}
    >
      <p className="muted os-set-hint">Default presets</p>
      <div className="os-wall-grid">
        {s.presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`os-wall-swatch ${p.animated ? 'wall-anim' : ''} ${
              wall.kind === 'preset' && s.wallPreset === p.id ? 'active' : ''
            }`}
            style={{ background: p.css }}
            title={p.label + (p.animated ? ' (animated)' : '')}
            onClick={() => s.onWallPreset(p.id)}
          >
            {p.animated && <span className="os-wall-anim-dot" />}
          </button>
        ))}
      </div>

      {users.length > 0 && (
        <>
          <p className="muted os-set-hint" style={{ marginTop: 12 }}>
            Your wallpapers
          </p>
          <div className="os-wall-grid os-wall-grid-user">
            {users.map((u) => {
              const thumb = thumbs[u.id];
              const active =
                userActive && wall.id === u.id
                  ? true
                  : wall.kind === u.kind && wall.path === u.path;
              return (
                <div key={u.id} className={`os-wall-user-tile${active ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="os-wall-swatch os-wall-user-swatch"
                    title={u.label}
                    onClick={() => s.onWallUser?.(u.id)}
                    style={
                      u.kind === 'image' && thumb
                        ? {
                            backgroundImage: `url("${thumb}")`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }
                        : u.kind === 'video'
                          ? { background: '#1a1218' }
                          : { background: 'var(--panel-2)' }
                    }
                  >
                    {u.kind === 'video' && (
                      <span className="os-wall-user-badge">
                        <Icon name="video" size={14} />
                      </span>
                    )}
                    {u.kind === 'video' && thumb && (
                      <video
                        className="os-wall-user-video-preview"
                        src={thumb}
                        muted
                        playsInline
                        loop
                        autoPlay
                      />
                    )}
                  </button>
                  <div className="os-wall-user-meta">
                    <span className="os-wall-user-label" title={u.label}>
                      {u.label}
                    </span>
                    {s.onWallUserRemove && (
                      <button
                        type="button"
                        className="btn small os-wall-user-remove"
                        title="Remove from library"
                        onClick={() => s.onWallUserRemove?.(u.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="os-set-btns">
        <button type="button" className="btn small" onClick={s.onWallImage}>
          <Icon name="image" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
          Image…
        </button>
        <button type="button" className="btn small" onClick={s.onWallVideo}>
          <Icon name="video" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
          Video (live)…
        </button>
        {s.onWallFolder && (
          <button type="button" className="btn small" onClick={s.onWallFolder}>
            <Icon name="folder" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            Folder slideshow…
          </button>
        )}
        {wall.kind !== 'preset' && (
          <button type="button" className="btn small" onClick={s.onWallClear}>
            Remove
          </button>
        )}
      </div>
      <p className="muted os-set-hint">
        Adding an image or video applies it immediately and lists it under Your wallpapers. Living-layer
        wallpaper rotation is turned off when you pick a wall so the desktop updates.
      </p>

      {isSlide && (
        <div className="wall-slideshow-panel">
          <p className="muted os-set-hint">
            Slideshow: <strong title={wall.folder}>{folderLabel(wall.folder)}</strong>
            {wall.shuffle ? ' · Shuffle' : ' · In order'}
          </p>
          <div className="os-viz-row">
            <span className="os-viz-label muted">Change every</span>
            <select
              className="set-select"
              value={wall.intervalSec ?? 60}
              onChange={(e) => s.onWallSlideshowOptions?.({ intervalSec: Number(e.target.value) })}
            >
              {INTERVALS.map((iv) => (
                <option key={iv.sec} value={iv.sec}>
                  {iv.label}
                </option>
              ))}
            </select>
          </div>
          <label className="os-toggle">
            <input
              type="checkbox"
              checked={!!wall.shuffle}
              onChange={(e) => s.onWallSlideshowOptions?.({ shuffle: e.target.checked })}
            />
            <span>Shuffle order</span>
          </label>
          <div className="os-set-btns">
            <button type="button" className="btn small" onClick={() => s.onWallSlideshowPrev?.()}>
              Previous
            </button>
            <button type="button" className="btn small" onClick={() => s.onWallSlideshowNext?.()}>
              Next
            </button>
            {s.onWallFolder && (
              <button type="button" className="btn small" onClick={s.onWallFolder}>
                Change folder…
              </button>
            )}
          </div>
          <p className="muted os-set-hint">
            Cycles images in the folder like Windows desktop slideshow. Living-layer rotation overrides
            this when enabled.
          </p>
        </div>
      )}

      <div className="os-viz-row" style={{ marginTop: 12 }} data-setting-id="wallpaper-dim">
        <span className="os-viz-label muted">Dim</span>
        <input
          type="range"
          min={0}
          max={0.75}
          step={0.05}
          value={look.wallpaperDim}
          onChange={(e) => patchLook({ wallpaperDim: Number(e.target.value) })}
        />
        <span className="muted">{Math.round(look.wallpaperDim * 100)}%</span>
      </div>
    </SettingsCard>
  );
}

function folderLabel(folder?: string): string {
  if (!folder) return 'No folder';
  const parts = folder.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || folder;
}
