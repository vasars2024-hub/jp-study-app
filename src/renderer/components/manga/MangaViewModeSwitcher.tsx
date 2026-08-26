import { useT } from '../../i18n';

export type MangaViewMode = 'original' | 'regions' | 'overlay' | 'clean' | 'compare';

export const MANGA_VIEW_MODE_STORAGE_KEY = 'jp-manga-view-mode';

export function loadMangaViewMode(): MangaViewMode {
  try {
    const raw = localStorage.getItem(MANGA_VIEW_MODE_STORAGE_KEY);
    if (raw === 'original' || raw === 'regions' || raw === 'overlay' || raw === 'clean' || raw === 'compare') {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return 'overlay';
}

export function saveMangaViewMode(mode: MangaViewMode): void {
  try {
    localStorage.setItem(MANGA_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

const MODES: MangaViewMode[] = ['original', 'regions', 'overlay', 'clean', 'compare'];

interface Props {
  value: MangaViewMode;
  onChange: (mode: MangaViewMode) => void;
}

export default function MangaViewModeSwitcher({ value, onChange }: Props) {
  const { t } = useT();
  return (
    <div className="sp-seg manga-view-mode-switcher lq-hit-scope" role="group" aria-label={t('manga.viewMode.label')}>
      {MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          className={`sp-seg-btn ${value === mode ? 'active' : ''}`}
          onClick={() => onChange(mode)}
        >
          {t(`manga.viewMode.${mode}`)}
        </button>
      ))}
    </div>
  );
}
