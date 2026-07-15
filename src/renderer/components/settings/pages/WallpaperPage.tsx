import Icon from '../../Icons';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';

export default function WallpaperPage() {
  const { t } = useT();
  const s = useSettings();
  const { look, patchLook, focusSettingId, wall } = s;
  const isSlide = wall.kind === 'slideshow';
  const users = s.userWallpapers ?? [];
  const thumbs = s.userWallThumbs ?? {};

  const INTERVALS: { sec: number; label: string }[] = [
    { sec: 10, label: t('settings.wallpaper.interval.10s') },
    { sec: 30, label: t('settings.wallpaper.interval.30s') },
    { sec: 60, label: t('settings.wallpaper.interval.1m') },
    { sec: 180, label: t('settings.wallpaper.interval.3m') },
    { sec: 600, label: t('settings.wallpaper.interval.10m') },
    { sec: 1800, label: t('settings.wallpaper.interval.30m') },
    { sec: 3600, label: t('settings.wallpaper.interval.1h') },
    { sec: 86400, label: t('settings.wallpaper.interval.1d') },
  ];

  function folderLabel(folder?: string): string {
    if (!folder) return t('settings.wallpaper.noFolder');
    const parts = folder.replace(/[/\\]+$/, '').split(/[/\\]/);
    return parts[parts.length - 1] || folder;
  }

  const userActive =
    (wall.kind === 'image' || wall.kind === 'video') &&
    !!wall.id &&
    users.some((u) => u.id === wall.id);

  return (
    <SettingsCard
      id="wallpaper"
      title={t('settings.nav.wallpaper')}
      description={t('settings.wallpaper.desc')}
      highlight={focusSettingId === 'wallpaper' || focusSettingId === 'wallpaper-dim'}
    >
      <p className="muted os-set-hint">{t('settings.wallpaper.defaultPresets')}</p>
      <div className="os-wall-grid">
        {s.presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`os-wall-swatch ${p.animated ? 'wall-anim' : ''} ${
              wall.kind === 'preset' && s.wallPreset === p.id ? 'active' : ''
            }`}
            style={{ background: p.css }}
            title={p.label + (p.animated ? t('settings.wallpaper.animatedSuffix') : '')}
            onClick={() => s.onWallPreset(p.id)}
          >
            {p.animated && <span className="os-wall-anim-dot" />}
          </button>
        ))}
      </div>

      {users.length > 0 && (
        <>
          <p className="muted os-set-hint" style={{ marginTop: 12 }}>
            {t('settings.wallpaper.yourWallpapers')}
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
                        title={t('settings.wallpaper.removeFromLibrary')}
                        onClick={() => s.onWallUserRemove?.(u.id)}
                      >
                        {t('common.remove')}
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
          {t('settings.wallpaper.image')}
        </button>
        <button type="button" className="btn small" onClick={s.onWallVideo}>
          <Icon name="video" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
          {t('settings.wallpaper.video')}
        </button>
        {s.onWallFolder && (
          <button type="button" className="btn small" onClick={s.onWallFolder}>
            <Icon name="folder" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            {t('settings.wallpaper.folderSlideshow')}
          </button>
        )}
        {wall.kind !== 'preset' && (
          <button type="button" className="btn small" onClick={s.onWallClear}>
            {t('common.remove')}
          </button>
        )}
      </div>
      <p className="muted os-set-hint">{t('settings.wallpaper.applyHint')}</p>

      {isSlide && (
        <div className="wall-slideshow-panel">
          <p className="muted os-set-hint">
            {t('settings.wallpaper.slideshowPrefix')} <strong title={wall.folder}>{folderLabel(wall.folder)}</strong>
            {wall.shuffle ? t('settings.wallpaper.shuffleOn') : t('settings.wallpaper.shuffleOff')}
          </p>
          <div className="os-viz-row">
            <span className="os-viz-label muted">{t('settings.wallpaper.changeEvery')}</span>
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
            <span>{t('settings.wallpaper.shuffleOrder')}</span>
          </label>
          <div className="os-set-btns">
            <button type="button" className="btn small" onClick={() => s.onWallSlideshowPrev?.()}>
              {t('settings.wallpaper.previous')}
            </button>
            <button type="button" className="btn small" onClick={() => s.onWallSlideshowNext?.()}>
              {t('settings.wallpaper.next')}
            </button>
            {s.onWallFolder && (
              <button type="button" className="btn small" onClick={s.onWallFolder}>
                {t('settings.wallpaper.changeFolder')}
              </button>
            )}
          </div>
          <p className="muted os-set-hint">{t('settings.wallpaper.slideshowHint')}</p>
        </div>
      )}

      <div className="os-viz-row" style={{ marginTop: 12 }} data-setting-id="wallpaper-dim">
        <span className="os-viz-label muted">{t('settings.wallpaper.dim')}</span>
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
