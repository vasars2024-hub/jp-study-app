import { useT } from '../../i18n';
import './characterMetadataPanel.css';

/**
 * Shown for a one-character lookup that no enabled dictionary source can ground.
 * The character panel is deliberately absent in that state; without this note the
 * whole surface — facts, decomposition, containing words, writing practice — is
 * invisible and undiscoverable until the user happens to import KANJIDIC2.
 */
export default function CharacterMetadataUnavailable({ char }: { char: string }) {
  const { t } = useT();
  return (
    <section className="lexicon-character-unavailable" role="note">
      <strong>{t('lexicon.character.title')}</strong>
      <p>{t('lexicon.character.unavailable', { char })}</p>
      <p className="lexicon-character-unavailable-hint">
        {t('lexicon.character.unavailable.hint', {
          source: t('storage.dictionaryImport.kind.kanjidic'),
          section: t('settings.nav.storage'),
          card: t('storage.dictionaryImport.title'),
        })}
      </p>
    </section>
  );
}
