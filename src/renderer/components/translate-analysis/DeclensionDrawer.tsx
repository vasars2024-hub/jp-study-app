import CollapsibleSection from '../CollapsibleSection';
import {
  RUSSIAN_CASES,
  type DeclensionItem,
} from '../../../shared/translateAnalysisCore';
import { useT } from '../../i18n';

function hasTable(item: DeclensionItem): boolean {
  return Boolean(item.singular || item.plural);
}

// The "Grammar Drawer": CollapsibleSection wrapping one case table per
// declinable word, plus aspect/tense/agreement lines for verbs.
export default function DeclensionDrawer({ items }: { items: DeclensionItem[] }) {
  const { t } = useT();
  const gram = (value: string) => t(`translate.analysis.gram.${value}`);
  return (
    <CollapsibleSection
      className="tr-analysis-section declension-section"
      title={t('translate.analysis.declensionTitle')}
      summary={t('translate.analysis.words', { count: items.length })}
    >
      {items.map((item, i) => (
        <div key={i} className="declension-item">
          <div className="declension-head">
            <strong className="declension-word" lang="ru">
              {item.word}
            </strong>
            <span className="muted">
              {item.dictionaryForm !== item.word ? `→ ${item.dictionaryForm} · ` : ''}
              {gram(item.pos)}
              {item.gender ? ` · ${gram(item.gender)}` : ''}
              {item.caseUsed ? ` · ${t('translate.analysis.usedIn', { case: t(`translate.analysis.case.${item.caseUsed}`) })}` : ''}
            </span>
          </div>
          {item.pos === 'verb' && (item.verbAspect || item.verbTense || item.verbAgreement) && (
            <p className="declension-verb muted">
              {[
                item.verbAspect ? gram(item.verbAspect) : '',
                item.verbTense ? gram(item.verbTense) : '',
                item.verbAgreement ? t('translate.analysis.agreement', { value: item.verbAgreement }) : '',
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
                  {item.singular && <th>{t('translate.analysis.singular')}</th>}
                  {item.plural && <th>{t('translate.analysis.plural')}</th>}
                </tr>
              </thead>
              <tbody>
                {RUSSIAN_CASES.map((c) => (
                  <tr key={c} className={item.caseUsed === c ? 'declension-case-used' : ''}>
                    <th>{t(`translate.analysis.case.${c}`)}</th>
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
