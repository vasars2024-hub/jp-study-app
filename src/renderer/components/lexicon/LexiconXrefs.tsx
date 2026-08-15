import { useEffect, useRef, useState } from 'react';
import {
  LEXICON_XREF_KINDS,
  type LexiconXref,
  type LexiconXrefKind,
} from '../../../shared/lexiconXrefs';
import { useT } from '../../i18n';
import './lexiconXrefs.css';

interface Props {
  /** The headword the lookup resolved, not the raw query string. */
  query: string;
  /** Source language of the lookup, so a Han word is not probed in both. */
  lang: string;
}

/**
 * Translation keys for the four stored kinds, as a module-level registry.
 *
 * Keys, not translated strings: this map is built once at module scope, so
 * resolving it here would freeze the labels at the language loaded on first
 * import and they would never follow a language change.
 */
const XREF_KIND_KEYS: Record<LexiconXrefKind, string> = {
  syn: 'lexicon.xrefs.kind.syn',
  ant: 'lexicon.xrefs.kind.ant',
  see: 'lexicon.xrefs.kind.see',
  cf: 'lexicon.xrefs.kind.cf',
};

/**
 * The words the installed dictionaries point at from this word's senses.
 *
 * Runs unasked, on the same terms as the etymology panel above it — an indexed
 * headword probe and an indexed join, with no scan for a button to protect — and
 * renders nothing at all when there is nothing to show. That is no longer most
 * words on a default install: bundled JMdict's own `<xref>`s are lifted out of
 * the gloss list at import and by schema step 11, so the panel is populated
 * before a user imports anything.
 *
 * ## Why the targets are not links
 *
 * They are marked available or not, and neither is clickable. No panel in this
 * column has word-click navigation, so a link here would either need a callback
 * that does not exist or would be a control that goes nowhere — and a dead
 * control is a worse answer than an honest label. What the marker does carry is
 * real: a cross reference is free text, and `resolved` is the difference between
 * a word this install can actually look up and one only Wiktionary has.
 */
export default function LexiconXrefs({ query, lang }: Props) {
  const { t } = useT();
  const [xrefs, setXrefs] = useState<LexiconXref[]>([]);
  const run = useRef(0);

  useEffect(() => {
    const attempt = ++run.current;
    setXrefs([]);
    if (!query) return;
    void (async () => {
      try {
        const result = await window.api.dictXrefs(query, { sourceLangs: [lang] });
        // A reply for the previous word must never land under the current one.
        if (attempt !== run.current) return;
        setXrefs(result.xrefs);
      } catch {
        // Absent rather than errored, for the reason the etymology panel records:
        // there is no user action to retry and no claim being withheld, so an
        // error row would be noise on every lookup against an un-migrated database.
        if (attempt === run.current) setXrefs([]);
      }
    })();
  }, [query, lang]);

  if (xrefs.length === 0) return null;

  // Grouped in the schema's own kind order rather than in row order, so the
  // headings do not reshuffle between two words that happen to list their
  // relations in a different sequence.
  const groups = LEXICON_XREF_KINDS
    .map((kind) => ({ kind, rows: xrefs.filter((row) => row.kind === kind) }))
    .filter((group) => group.rows.length > 0);

  // Every row of a group comes from the same headword probe, so the attribution
  // is one line for the panel rather than one per word.
  const sources = [...new Set(xrefs.map((row) => row.dictTitle))];

  return (
    <details className="lexicon-xrefs" open>
      <summary>{t('lexicon.xrefs.title')}</summary>
      <p className="muted lexicon-xrefs-note">{t('lexicon.xrefs.note')}</p>
      {groups.map((group) => (
        <div className="lexicon-xrefs-group" key={group.kind}>
          <h4 className="lexicon-xrefs-kind">{t(XREF_KIND_KEYS[group.kind])}</h4>
          <ul className="lexicon-xrefs-list">
            {group.rows.map((row) => (
              <li
                className={row.resolved ? 'lexicon-xrefs-word' : 'lexicon-xrefs-word is-absent'}
                key={`${row.kind}-${row.text}`}
                lang={row.lang}
              >
                <span className="lexicon-xrefs-text">{row.text}</span>
                {!row.resolved && (
                  <span className="lexicon-xrefs-absent-note">
                    {t('lexicon.xrefs.notInstalled')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="muted lexicon-xrefs-source">{sources.join(' · ')}</p>
    </details>
  );
}
