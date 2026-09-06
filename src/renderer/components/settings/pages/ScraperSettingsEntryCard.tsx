import { useT } from '../../../i18n';
import { openScraperSettings } from '../../../scraperSettingsNavigation';
import SettingsCard from '../SettingsCard';

/** Engine settings have one editor; app-wide integrations remain in Settings. */
export default function ScraperSettingsEntryCard() {
  const { t } = useT();
  return (
    <SettingsCard id="scraper-network" title={t('scraperPage.engine.title')}
      description={t('scraperPage.engine.description')}>
      <p className="muted">{t('scraperPage.engine.body')}</p>
      <ul className="muted">
        <li>{t('scraperPage.engine.whereProfiles')}</li>
        <li>{t('scraperPage.engine.whereDrawer')}</li>
      </ul>
      <div className="fm-actions">
        <button type="button" className="btn primary" onClick={() => openScraperSettings('profiles')}>
          {t('scraperPage.engine.openProfiles')}
        </button>
        <button type="button" className="btn" onClick={() => openScraperSettings('drawer')}>
          {t('scraperPage.engine.openDrawer')}
        </button>
      </div>
    </SettingsCard>
  );
}
