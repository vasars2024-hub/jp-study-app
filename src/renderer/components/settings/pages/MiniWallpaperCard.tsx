/**
 * Mini wallpaper — the backdrop behind the Mini (craft) window.
 *
 * v1.0 audit §1.3 moved this card from Settings → Mini View to Settings →
 * Wallpaper, so every wallpaper surface lives on one page. It is a standalone
 * component rather than inlined JSX because it owns two things the Wallpaper
 * page has no other use for: the `MiniWallPreview` thumbnail and its own
 * transient status line.
 */
import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { type MiniWallpaperMode } from '../../../miniMode';
import { useT } from '../../../i18n';

function MiniWallPreview({ path, blur, title }: { path: string; blur: number; title: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let dead = false;
    void window.api.imageFileUrl(path).then((url) => {
      if (!dead && url) setSrc(url);
    });
    return () => {
      dead = true;
    };
  }, [path]);
  if (!src) return null;
  return (
    <div className="mini-wall-preview" title={title}>
      <img
        src={src}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: blur > 0 ? `blur(${Math.min(12, blur / 3)}px)` : undefined,
          transform: blur > 0 ? 'scale(1.05)' : undefined,
        }}
      />
    </div>
  );
}

export default function MiniWallpaperCard() {
  const { t } = useT();
  const { mini, patchMini, focusSettingId } = useSettings();
  const [note, setNote] = useState('');

  const flash = (text: string) => {
    setNote(text);
    window.setTimeout(() => setNote(''), 2200);
  };

  return (
    <SettingsCard
      id="mini-wallpaper"
      title={t('settings.mini.wall.title')}
      description={t('settings.mini.wall.desc')}
      highlight={focusSettingId === 'mini-wallpaper'}
    >
      <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
        <span className="os-viz-label muted">{t('settings.mini.wall.mode')}</span>
        {(
          [
            ['none', 'settings.mini.wall.off'],
            ['icons', 'settings.mini.wall.icons'],
            ['image', 'settings.mini.wall.image'],
            ['desktop', 'settings.mini.wall.desktop'],
          ] as [MiniWallpaperMode, string][]
        ).map(([id, labelKey]) => (
          <button
            key={id}
            type="button"
            className={`btn small${mini.wallpaperMode === id ? ' primary' : ''}`}
            onClick={() => patchMini({ wallpaperMode: id })}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className="os-viz-row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            void (async () => {
              try {
                let abs = await window.api.pickEnvImage();
                if (!abs) {
                  const picked = await window.api.pickWallpaper();
                  if (!picked) return;
                  abs = picked.path;
                }
                const url =
                  (await window.api.imageFileUrl(abs)) ??
                  (await window.api.setWallpaperFromPath(abs));
                if (!url) {
                  flash(t('settings.mini.msg.loadFail'));
                  return;
                }
                patchMini({
                  wallpaperMode: 'image',
                  wallpaperPath: abs,
                  wallpaperUrl: url,
                });
                flash(t('settings.mini.msg.set'));
              } catch {
                flash(t('settings.mini.msg.pickFail'));
              }
            })();
          }}
        >
          {t('settings.mini.wall.pick')}
        </button>
        <button
          type="button"
          className="btn small"
          disabled={!mini.wallpaperPath && mini.wallpaperMode !== 'image'}
          onClick={() => {
            patchMini({ wallpaperPath: '', wallpaperUrl: '', wallpaperMode: 'none' });
            flash(t('settings.mini.msg.cleared'));
          }}
        >
          {t('settings.mini.wall.clear')}
        </button>
      </div>
      {mini.wallpaperMode === 'image' && mini.wallpaperPath && (
        <MiniWallPreview path={mini.wallpaperPath} blur={mini.wallpaperBlur} title={t('settings.mini.preview')} />
      )}
      <div className="os-viz-row" style={{ marginTop: 10 }}>
        <span className="os-viz-label muted">{t('settings.mini.wall.blur', { px: mini.wallpaperBlur })}</span>
      </div>
      <input
        type="range"
        min={0}
        max={40}
        step={1}
        value={mini.wallpaperBlur}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
        onChange={(e) => patchMini({ wallpaperBlur: Number(e.target.value) })}
        aria-label={t('a11y.slider.miniWallpaperBlur')}
      />
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.4 }}>
        {t('settings.mini.wall.hint')}
      </p>
      {note && (
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }} role="status">
          {note}
        </p>
      )}
    </SettingsCard>
  );
}
