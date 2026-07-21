/**
 * Custom title bar for borderless main window — drag region + window controls.
 */
import { useEffect, useState } from 'react';
import Icon from '../Icons';
import { useT } from '../../i18n';

export default function MainWindowChrome() {
  const { t } = useT();
  const [maximized, setMaximized] = useState(false);

  const control = (action: 'minimize' | 'maximize' | 'close') => {
    void window.api.popoutControl(action);
    if (action === 'maximize') setMaximized((m) => !m);
  };

  return (
    <header className="main-window-chrome" aria-label={t('settings.display.borderless.title')}>
      <div className="main-window-chrome-drag">
        <Icon name="logo" size={15} className="main-window-chrome-mark" />
        <span className="main-window-chrome-title">{t('app.title')}</span>
      </div>
      <div className="main-window-chrome-controls">
        <button
          type="button"
          className="main-window-chrome-btn"
          title={t('desktop.minimize')}
          aria-label={t('desktop.minimize')}
          onClick={() => control('minimize')}
        >
          <span aria-hidden>─</span>
        </button>
        <button
          type="button"
          className="main-window-chrome-btn"
          title={maximized ? t('settings.display.borderless.restore') : t('settings.display.borderless.maximize')}
          aria-label={maximized ? t('settings.display.borderless.restore') : t('settings.display.borderless.maximize')}
          onClick={() => control('maximize')}
        >
          <span aria-hidden>{maximized ? '❐' : '▢'}</span>
        </button>
        <button
          type="button"
          className="main-window-chrome-btn main-window-chrome-close"
          title={t('common.close')}
          aria-label={t('common.close')}
          onClick={() => control('close')}
        >
          <span aria-hidden>×</span>
        </button>
      </div>
    </header>
  );
}
