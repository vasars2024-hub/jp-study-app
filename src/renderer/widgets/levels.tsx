import { useEffect, useState } from 'react';
import {
  loadLevelLists,
  addLevelList,
  removeLevelList,
  listProgress,
  onLevelListsChanged,
  type LevelKind,
  type LevelList,
} from '../levelLists';
import { useT } from '../i18n';

// JLPT / HSK / custom vocabulary progress. Lists are user-provided (paste an
// Anki deck's words); progress = Familiar-or-better coverage from the knowledge
// store, which the Anki sync keeps up to date.
export function LevelProgressWidget() {
  const { t } = useT();
  const [lists, setLists] = useState<LevelList[]>(() => loadLevelLists());
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<LevelKind>('jlpt');
  const [paste, setPaste] = useState('');

  useEffect(() => onLevelListsChanged(() => setLists(loadLevelLists())), []);
  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener('word-knowledge-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('word-knowledge-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const save = () => {
    if (!paste.trim()) return;
    setLists(addLevelList(label, kind, paste));
    setLabel('');
    setPaste('');
    setAdding(false);
  };

  return (
    <div className="wgt wgt-levels" data-tick={tick}>
      {lists.length === 0 && !adding && (
        <div className="wgt-empty">{t('widgets.levels.emptyHint')}</div>
      )}

      <ul className="wgt-level-rows">
        {lists.map((l) => {
          const p = listProgress(l);
          return (
            <li key={l.id} className="wgt-level-row">
              <div className="wgt-level-top">
                <span className="wgt-level-label">{l.label}</span>
                <span className="wgt-level-count">{p.learned}/{p.total}</span>
                <button className="wgt-btn-icon sm" title={t('widgets.levels.removeList')} aria-label={t('widgets.levels.removeList')} onClick={() => setLists(removeLevelList(l.id))}>×</button>
              </div>
              <div className="wgt-progress"><div className="wgt-progress-fill" style={{ width: `${p.pct}%` }} /></div>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="wgt-level-form">
          <div className="wgt-row">
            <input
              className="wgt-level-name"
              placeholder={t('widgets.levels.labelPlaceholder')}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <select value={kind} onChange={(e) => setKind(e.target.value as LevelKind)}>
              <option value="jlpt">{t('widgets.levels.kind.jlpt')}</option>
              <option value="hsk">{t('widgets.levels.kind.hsk')}</option>
              <option value="custom">{t('widgets.levels.kind.custom')}</option>
            </select>
          </div>
          <textarea
            className="wgt-level-paste"
            placeholder={t('widgets.levels.pastePlaceholder')}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className="wgt-row">
            <button className="wgt-btn primary" onClick={save}>{t('widgets.levels.saveList')}</button>
            <button className="wgt-btn" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      ) : (
        <button className="wgt-btn wgt-level-add" onClick={() => setAdding(true)}>{t('widgets.levels.addList')}</button>
      )}
    </div>
  );
}
