import CollapsibleSection from '../CollapsibleSection';
import {
  RUSSIAN_CASES,
  type DeclensionItem,
  type RussianCase,
} from '../../../shared/translateAnalysisCore';

const CASE_LABELS: Record<RussianCase, string> = {
  nominative: 'Nom.',
  genitive: 'Gen.',
  dative: 'Dat.',
  accusative: 'Acc.',
  instrumental: 'Ins.',
  prepositional: 'Prep.',
};

function hasTable(item: DeclensionItem): boolean {
  return Boolean(item.singular || item.plural);
}

// The "Grammar Drawer": CollapsibleSection wrapping one case table per
// declinable word, plus aspect/tense/agreement lines for verbs.
export default function DeclensionDrawer({ items }: { items: DeclensionItem[] }) {
  return (
    <CollapsibleSection
      className="tr-analysis-section declension-section"
      title="Grammar drawer — Russian declension"
      summary={`${items.length} ${items.length === 1 ? 'word' : 'words'}`}
    >
      {items.map((item, i) => (
        <div key={i} className="declension-item">
          <div className="declension-head">
            <strong className="declension-word" lang="ru">
              {item.word}
            </strong>
            <span className="muted">
              {item.dictionaryForm !== item.word ? `→ ${item.dictionaryForm} · ` : ''}
              {item.pos}
              {item.gender ? ` · ${item.gender}` : ''}
              {item.caseUsed ? ` · used in ${item.caseUsed}` : ''}
            </span>
          </div>
          {item.pos === 'verb' && (item.verbAspect || item.verbTense || item.verbAgreement) && (
            <p className="declension-verb muted">
              {[
                item.verbAspect,
                item.verbTense,
                item.verbAgreement ? `agreement: ${item.verbAgreement}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {hasTable(item) && (
            <table className="declension-table" lang="ru">
              <thead>
                <tr>
                  <th />
                  {item.singular && <th>Singular</th>}
                  {item.plural && <th>Plural</th>}
                </tr>
              </thead>
              <tbody>
                {RUSSIAN_CASES.map((c) => (
                  <tr key={c} className={item.caseUsed === c ? 'declension-case-used' : ''}>
                    <th>{CASE_LABELS[c]}</th>
                    {item.singular && <td>{item.singular[c] ?? '—'}</td>}
                    {item.plural && <td>{item.plural[c] ?? '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </CollapsibleSection>
  );
}
