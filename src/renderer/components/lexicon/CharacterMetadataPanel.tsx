import type { DictEntry, DictResult } from '../../../shared/types';
import { useT } from '../../i18n';
import './characterMetadataPanel.css';
import CharacterWritingPractice from './CharacterWritingPractice';

type CharacterMetadata = NonNullable<DictResult['character']>;

interface Props {
  character: CharacterMetadata;
  entries?: DictEntry[];
}

function joined(values: string[]): string | null {
  return values.length > 0 ? values.join(' · ') : null;
}

export default function CharacterMetadataPanel({ character, entries = [] }: Props) {
  const { t } = useT();
  const containingEntries = entries
    .filter((entry) => entry.word.includes(character.char))
    .slice(0, 12);
  const components = joined(character.components);
  const facts = [
    character.strokes === undefined
      ? null
      : [t('lexicon.character.strokes'), String(character.strokes)],
    character.radical ? [t('lexicon.character.radical'), character.radical] : null,
    components
      ? [t('lexicon.character.components'), components]
      : null,
    character.jlpt ? [t('lexicon.character.jlpt'), character.jlpt] : null,
    character.hsk ? [t('lexicon.character.hsk'), character.hsk] : null,
    character.grade === undefined
      ? null
      : [t('lexicon.character.grade'), String(character.grade)],
    character.frequency === undefined
      ? null
      : [t('lexicon.character.frequency'), String(character.frequency)],
  ].filter((fact): fact is string[] => fact !== null);

  return (
    <section className="lexicon-character" aria-labelledby="lexicon-character-title">
      <header>
        <span className="lexicon-character-glyph" lang={character.lang}>{character.char}</span>
        <div>
          <h3 id="lexicon-character-title">{t('lexicon.character.title')}</h3>
          <p>{t('lexicon.character.grounded')}</p>
        </div>
      </header>
      {facts.length > 0 && (
        <dl className="lexicon-character-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd lang={character.lang}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {character.components.length > 0 && (
        <div className="lexicon-character-decomposition" aria-label={t('lexicon.character.components')}>
          <strong>{t('lexicon.character.components')}</strong>
          <div className="lexicon-character-components" lang={character.lang}>
            {character.components.map((component, index) => (
              <span key={`${component}-${index}`} aria-label={component}>{component}</span>
            ))}
          </div>
        </div>
      )}
      {character.readings.length > 0 && (
        <div className="lexicon-character-list">
          <strong>{t('lexicon.character.readings')}</strong>
          <span lang={character.lang}>{joined(character.readings)}</span>
        </div>
      )}
      {character.meanings.length > 0 && (
        <div className="lexicon-character-list">
          <strong>{t('lexicon.character.meanings')}</strong>
          <span>{joined(character.meanings)}</span>
        </div>
      )}
      {containingEntries.length > 0 && (
        <div className="lexicon-character-words">
          <strong>{t('lexicon.character.wordsContaining')}</strong>
          <ul>
            {containingEntries.map((entry) => (
              <li key={`${entry.word}-${entry.reading}`}>
                <span lang={character.lang}>{entry.word}</span>
                {entry.reading && entry.reading !== entry.word && (
                  <span lang={character.lang}>（{entry.reading}）</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <CharacterWritingPractice target={character.char} expectedStrokes={character.strokes} lang={character.lang} />
      <details className="lexicon-character-sources">
        <summary>{t('lexicon.character.sources', { count: character.sources.length })}</summary>
        <ul>
          {character.sources.map((source) => (
            <li key={source.dictId}>
              <strong>{source.dictTitle}</strong>
              {source.licence && <span>{source.licence}</span>}
              {source.attribution && <span>{source.attribution}</span>}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
