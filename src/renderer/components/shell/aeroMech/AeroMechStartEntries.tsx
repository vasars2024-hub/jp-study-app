/**
 * The Aero Start menu's "System Tools" for the study mechanics. Rendered only
 * by the Aero Start menu, so no other theme ever offers them.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../../i18n';
import {
  loadAeroMechSettings,
  onAeroMechSettingsChanged,
  openAeroMechApp,
  type AeroMechApp,
} from '../../../aeroMechanics/aeroMechSettings';
import { analyzeDeck, planUpdates } from '../../../aeroMechanics/aeroMechLogic';
import { readAeroDeck } from '../../../aeroMechanics/useAeroDeck';

export default function AeroMechStartEntries({ onLaunch }: { onLaunch: () => void }) {
  const { t } = useT();
  const [settings, setSettings] = useState(loadAeroMechSettings);
  useEffect(() => onAeroMechSettingsChanged(setSettings), []);
  // The Start menu mounts when it opens, so one read per opening is current.
  const counts = useMemo(() => {
    const deck = readAeroDeck();
    return {
      due: analyzeDeck(deck.cards, deck.at).dueReviews,
      updates: planUpdates(deck.cards, deck.newPerDay, deck.introducedToday).important.length,
    };
  }, []);

  const launch = (app: AeroMechApp): void => {
    onLaunch();
    openAeroMechApp({ app });
  };

  return (
    <>
      {settings.defrag && (
        <button type="button" className="os-start-aero-tool aero-mech-start-entry" onClick={() => launch('defrag')}>
          <span className="aero-mech-glyph is-defrag" aria-hidden="true" />
          <span>{t('aeroMech.defrag.title')}</span>
          {counts.due > 0 && <b className="aero-mech-start-badge">{counts.due}</b>}
        </button>
      )}
      {settings.updates && (
        <button type="button" className="os-start-aero-tool aero-mech-start-entry" onClick={() => launch('update')}>
          <span className="aero-mech-glyph is-update" aria-hidden="true" />
          <span>{t('aeroMech.update.title')}</span>
          {counts.updates > 0 && <b className="aero-mech-start-badge is-warn">{counts.updates}</b>}
        </button>
      )}
      <button type="button" className="os-start-aero-tool aero-mech-start-entry" onClick={() => launch('welcome')}>
        <span className="aero-mech-glyph is-welcome" aria-hidden="true" />
        <span>{t('aeroMech.welcome.title')}</span>
      </button>
    </>
  );
}
