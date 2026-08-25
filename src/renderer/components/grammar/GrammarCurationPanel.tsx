import { useCallback, useEffect, useMemo, useState } from 'react';
import { GRAMMAR, type NormalizedGrammarPoint } from '../../data/grammar';
import { dedupeGrammarByTitle } from '../../data/grammar/practiceFilters';
import {
  ISSUE_TYPES,
  applyCuration,
  clearVerdict,
  curationQueue,
  issueCounts,
  loadCuration,
  popHistory,
  pushHistory,
  saveCuration,
  setVerdict,
  type CurationState,
  type IssueType,
} from '../../grammarCuration';
import { useT } from '../../i18n';
import { Button } from '../ui';
import VirtualList from '../VirtualList';

const ISSUE_LABEL: Record<IssueType, string> = {
  'imported-unreviewed': 'grammar.curation.issue.imported',
  'no-examples': 'grammar.curation.issue.noExamples',
  'no-category': 'grammar.curation.issue.noCategory',
  reviewed: 'grammar.curation.issue.reviewed',
};

/**
 * Review queue for the grammar corpus.
 *
 * The point of this screen is the gap between "a machine matched it" and "a
 * person checked it": imported example sentences are good enough to study from
 * but are not evidence of anything until someone looks. Approving is the only
 * path to `verified` in the whole corpus.
 *
 * Everything shown is a decision aid — the pattern, its gloss, and the actual
 * sentences being judged — because the failure this replaces was people
 * accepting confident-looking rows without seeing the evidence.
 */
export default function GrammarCurationPanel() {
  const { t, lang } = useT();
  const [state, setState] = useState<CurationState>(() => loadCuration());
  const [history, setHistory] = useState<CurationState[]>([]);
  const [issue, setIssue] = useState<IssueType>('imported-unreviewed');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    saveCuration(state);
  }, [state]);

  const corpus = useMemo(() => dedupeGrammarByTitle(GRAMMAR), []);
  const counts = useMemo(() => issueCounts(corpus, state), [corpus, state]);
  const queue = useMemo(() => curationQueue(corpus, state, issue), [corpus, state, issue]);

  // Verification totals are read off the *curated* corpus so the header reflects
  // what the rest of the app now sees, not what shipped.
  const verifiedCount = useMemo(
    () => applyCuration(corpus, state).filter((p) => p.provenance.verification === 'verified').length,
    [corpus, state],
  );

  const commit = useCallback(
    (next: CurationState) => {
      setHistory((h) => pushHistory(h, state));
      setState(next);
      setSelected(new Set());
    },
    [state],
  );

  const rule = useCallback(
    (ids: string[], verdict: 'approved' | 'rejected') => {
      if (!ids.length) return;
      commit(setVerdict(state, ids, verdict));
    },
    [commit, state],
  );

  const undo = useCallback(() => {
    const { state: prev, history: rest } = popHistory(history);
    if (!prev) return;
    setState(prev);
    setHistory(rest);
    setSelected(new Set());
  }, [history]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedIds = useMemo(() => [...selected], [selected]);
  const canRule = issue === 'imported-unreviewed' && selectedIds.length > 0;

  const renderRow = useCallback(
    (p: NormalizedGrammarPoint) => {
      const entry = state[p.id];
      const checked = selected.has(p.id);
      return (
        <div className={`gram-cur-row ${checked ? 'selected' : ''}`} key={p.id}>
          <label className="gram-cur-head">
            {issue === 'imported-unreviewed' && (
              <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} />
            )}
            <span className="gram-cur-level">{p.level}</span>
            <span className="gram-cur-title" lang="ja">
              {p.title}
            </span>
            <span className="gram-cur-meaning">{p.meaning}</span>
            {entry && (
              <span className={`gram-cur-verdict ${entry.examples}`}>
                {t(
                  entry.examples === 'approved'
                    ? 'grammar.curation.approved'
                    : 'grammar.curation.rejected',
                )}
              </span>
            )}
          </label>

          {p.examples.length > 0 && (
            <ul className="gram-cur-examples">
              {p.examples.map((ex, i) => (
                <li key={i}>
                  <span lang="ja">{ex.jp}</span>
                  <span className="gram-cur-en">{ex.en}</span>
                </li>
              ))}
            </ul>
          )}

          {issue === 'reviewed' && (
            <Button size="sm" onClick={() => commit(clearVerdict(state, [p.id]))}>
              {t('grammar.curation.reopen')}
            </Button>
          )}
        </div>
      );
    },
    [commit, issue, selected, state, t, lang],
  );

  return (
    <div className="gram-cur">
      <div className="gram-cur-bar">
        {ISSUE_TYPES.map((it) => (
          <button
            key={it}
            className={`gram-cur-tab ${issue === it ? 'active' : ''}`}
            onClick={() => {
              setIssue(it);
              setSelected(new Set());
            }}
          >
            {t(ISSUE_LABEL[it])}
            <span className="gram-cur-count">{counts[it]}</span>
          </button>
        ))}
      </div>

      <p className="gram-cur-summary">
        {t('grammar.curation.verifiedSummary', { count: verifiedCount, total: corpus.length })}
      </p>

      <div className="gram-cur-actions">
        <Button
          size="sm"
          disabled={!canRule}
          onClick={() => rule(selectedIds, 'approved')}
        >
          {t('grammar.curation.approveSelected', { count: selectedIds.length })}
        </Button>
        <Button size="sm" disabled={!canRule} onClick={() => rule(selectedIds, 'rejected')}>
          {t('grammar.curation.rejectSelected', { count: selectedIds.length })}
        </Button>
        <Button
          size="sm"
          disabled={issue !== 'imported-unreviewed' || queue.length === 0}
          onClick={() => setSelected(new Set(queue.map((p) => p.id)))}
        >
          {t('grammar.curation.selectAll')}
        </Button>
        <Button size="sm" disabled={history.length === 0} onClick={undo}>
          {t('grammar.curation.undo')}
        </Button>
      </div>

      {queue.length === 0 ? (
        <p className="gram-cur-empty">{t('grammar.curation.empty')}</p>
      ) : (
        <VirtualList
          items={queue}
          itemHeight={132}
          getKey={(p) => p.id}
          renderItem={renderRow}
          listRole="list"
          itemRole="listitem"
        />
      )}
    </div>
  );
}
