import { useEffect, useMemo, useState } from 'react';
import { GRAMMAR, type NormalizedGrammarPoint } from '../../data/grammar';
import {
  countMatching,
  dedupeGrammarByTitle,
  filterGrammarPoints,
  loadPracticeFilters,
  savePracticeFilters,
  type PracticeFilters,
} from '../../data/grammar/practiceFilters';
import { addDeckCards, createDeckFolder } from '../../flashcardDeck';
import { useT } from '../../i18n';
import VirtualList from '../VirtualList';
import GrammarFilterPanel from './GrammarFilterPanel';
import GrammarTestModal from './GrammarTestModal';

const FOLDER = 'Grammar';

export default function GrammarPracticePanel({
  initialFilters,
}: {
  initialFilters?: Partial<PracticeFilters>;
}) {
  const { t } = useT();
  const [filters, setFilters] = useState<PracticeFilters>(() => ({
    ...loadPracticeFilters(),
    ...initialFilters,
  }));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState('');
  const [testOpen, setTestOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    savePracticeFilters(filters);
  }, [filters]);

  const corpus = useMemo(() => dedupeGrammarByTitle(GRAMMAR), []);
  const filtered = useMemo(() => filterGrammarPoints(corpus, filters), [corpus, filters]);

  /*
   * Selection is resolved against the whole corpus, not the visible list.
   * Reading it from `filtered` meant narrowing a filter silently dropped items
   * from the set the action buttons would act on, while the count kept
   * claiming them.
   */
  const selectedPoints: NormalizedGrammarPoint[] = useMemo(
    () => corpus.filter((p) => selected.has(p.id)),
    [corpus, selected],
  );
  const hiddenSelected = useMemo(() => {
    const visible = new Set(filtered.map((p) => p.id));
    return selectedPoints.filter((p) => !visible.has(p.id)).length;
  }, [filtered, selectedPoints]);

  const totalMatching = useMemo(() => countMatching(corpus, filters), [corpus, filters]);

  function togglePoint(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of filtered) next.add(p.id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function addToDeck() {
    if (!selectedPoints.length) return;
    createDeckFolder(FOLDER);
    addDeckCards(
      selectedPoints.map((p) => ({
        word: p.title,
        reading: '',
        meaning: p.meaning,
        sentence: p.examples[0]?.jp,
        front: p.title,
        back: `${p.meaning}${p.structure ? `\n${p.structure}` : ''}`,
        source: 'import' as const,
        folder: FOLDER,
      })),
    );
    setStatus(t('grammar.practice.status.addedToDeck', { count: selectedPoints.length }));
  }

  async function exportAnki() {
    if (!selectedPoints.length || busy) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const p of selectedPoints) {
        try {
          const res = await window.api.ankiMineNote({
            route: { source: 'other', cardKind: 'word', language: p.lang === 'zh' ? 'zh' : 'ja' },
            term: p.title,
            meaning: p.meaning,
            sentence: p.examples[0]?.jp,
            translation: p.structure,
          });
          if (res.ok || res.error === 'duplicate') ok += 1;
          else fail += 1;
        } catch {
          fail += 1;
        }
      }
      setStatus(t('grammar.practice.status.ankiExport', { ok, fail }));
    } finally {
      setBusy(false);
    }
  }

  /* Disabled controls say why, rather than just going grey. */
  const noSelection = selectedPoints.length === 0;
  const selectionHint = noSelection ? t('grammar.practice.status.noneSelected') : undefined;

  return (
    <div className="gx-practice">
      <div className="gx-practice-toolbar">
        <button
          type="button"
          className="btn"
          onClick={() => setTestOpen(true)}
          disabled={filtered.length === 0}
          title={filtered.length === 0 ? t('grammar.practice.empty') : undefined}
        >
          {t('grammar.practice.startTest')}
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={addToDeck}
          disabled={noSelection}
          title={selectionHint}
        >
          {t('grammar.practice.addToDeck')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void exportAnki()}
          disabled={noSelection || busy}
          title={selectionHint}
        >
          {busy ? t('grammar.practice.exporting') : t('grammar.practice.exportAnki')}
        </button>
        <span className="muted gx-practice-status" role="status">
          {status}
        </span>
      </div>

      <div className="gx-practice-layout">
        <GrammarFilterPanel corpus={corpus} filters={filters} onChange={setFilters} />

        <section className="gx-practice-list" aria-label={t('grammar.practice.results')}>
          <div className="gx-practice-list-head">
            <span>
              {t('grammar.practice.visibleCount', { count: totalMatching })} ·{' '}
              {t('grammar.practice.selectedCount', { count: selectedPoints.length })}
              {hiddenSelected > 0 && (
                <>
                  {' · '}
                  <span className="gx-practice-hidden-note">
                    {t('grammar.practice.hiddenSelected', { count: hiddenSelected })}
                  </span>
                </>
              )}
            </span>
            <div className="gx-practice-list-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={selectAllVisible}
                disabled={filtered.length === 0}
              >
                {t('grammar.practice.selectAll')}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={clearSelection}
                disabled={noSelection}
              >
                {t('grammar.practice.clear')}
              </button>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="gx-practice-empty">
              <p>{t('grammar.practice.empty')}</p>
              <p className="muted">{t('grammar.practice.empty.hint')}</p>
            </div>
          ) : (
            <VirtualList
              items={filtered}
              itemHeight={52}
              overscan={8}
              className="gx-practice-virtual"
              getKey={(p) => p.id}
              renderItem={(p) => (
                <label className="gx-practice-row">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => togglePoint(p.id)}
                  />
                  <span className="gx-practice-row-title">{p.title}</span>
                  <span className="gx-practice-row-meta">
                    {p.level} · {p.meaning}
                  </span>
                  {/* Records with no examples can't carry a usable card; say so
                      here rather than letting export produce a blank back. */}
                  {p.provenance.verification === 'missing' && (
                    <span className="gx-practice-row-flag" title={t('grammar.flag.incomplete.desc')}>
                      {t('grammar.flag.incomplete')}
                    </span>
                  )}
                </label>
              )}
            />
          )}
        </section>
      </div>

      {testOpen && (
        <GrammarTestModal
          pool={selectedPoints.length > 0 ? selectedPoints : filtered}
          initialFilters={filters}
          onClose={() => setTestOpen(false)}
        />
      )}
    </div>
  );
}
