import { useEffect, useRef, useState } from 'react';
import type { LexiconEtymology as Etymology } from '../../../shared/lexiconEtymology';
import { useT } from '../../i18n';
import './lexiconEtymology.css';

interface Props {
  /** The headword the lookup resolved, not the raw query string. */
  query: string;
  /** Source language of the lookup, so a Han word is not probed in both. */
  lang: string;
}

/**
 * Where a word came from, in the installed dictionaries' own words.
 *
 * Unlike the compound and neighbour expansions below it, this runs unasked: the
 * read is two indexed probes rather than a partition scan, so there is nothing
 * for a button to protect. It also renders **nothing at all** when there is
 * nothing to show. An opt-in control that answers "no etymology" is worse than an
 * absent one — it advertises a fact the install cannot supply, and on a default
 * install nothing supplies it, because only the Wiktextract importer writes this
 * table.
 *
 * Every paragraph is a dictionary's own sentence, shown verbatim and attributed.
 * Nothing on this surface is model-generated; the Explain lens is where an
 * invented memory aid belongs, and it labels itself as one.
 */
export default function LexiconEtymology({ query, lang }: Props) {
  const { t } = useT();
  const [etymologies, setEtymologies] = useState<Etymology[]>([]);
  const run = useRef(0);

  useEffect(() => {
    const attempt = ++run.current;
    setEtymologies([]);
    if (!query) return;
    void (async () => {
      try {
        const result = await window.api.dictEtymology(query, { sourceLangs: [lang] });
        // A reply for the previous word must never land under the current one.
        if (attempt !== run.current) return;
        setEtymologies(result.etymologies);
      } catch {
        // The panel is absent when there is nothing to show, and a failed read is
        // one of those cases. There is no user action to retry and no claim being
        // withheld, so an error row here would be noise on every lookup made
        // against an un-migrated database.
        if (attempt === run.current) setEtymologies([]);
      }
    })();
  }, [query, lang]);

  if (etymologies.length === 0) return null;

  return (
    <details className="lexicon-etymology" open>
      <summary>{t('lexicon.etymology.title')}</summary>
      <p className="muted lexicon-etymology-note">{t('lexicon.etymology.note')}</p>
      <ul className="lexicon-etymology-list">
        {etymologies.map((etymology, index) => (
          <li key={`${etymology.dictId}-${index}`}>
            <p className="lexicon-etymology-text">{etymology.text}</p>
            <p className="lexicon-etymology-attribution">
              <span className="lexicon-etymology-source">{etymology.dictTitle}</span>
              {etymology.pos && (
                <span className="lexicon-etymology-pos">{etymology.pos}</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
