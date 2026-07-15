// Level Meter UI (Plan 0.5). Two exports:
//   <LevelMeter/>          — the 7-segment meter, live from LevelService.
//   <LevelSettingsSection/> — the Settings > Study "Level" panel: per-level
//                             slots you fill by pasting words or uploading an
//                             Anki .apkg, plus the reached-threshold control.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getActiveStudyLang,
  getLevelReport,
  getLevelThreshold,
  onLevelChange,
  setLevelThreshold,
  type LevelReport,
} from '../levelService';
import { parseWords, upsertSlotList } from '../levelLists';
import { importApkgWords } from '../apkgImport';
import { slotsForLang, tierName, type LevelSlot, type StudyLang } from '../../shared/levelScale';

function useLevelReport(lang: StudyLang): LevelReport {
  const [report, setReport] = useState<LevelReport>(() => getLevelReport(lang));
  useEffect(() => {
    const refresh = (): void => setReport(getLevelReport(lang));
    refresh();
    return onLevelChange(refresh);
  }, [lang]);
  return report;
}

/** The 7-segment level meter for one language. */
export function LevelMeter({
  lang = getActiveStudyLang(),
  compact,
}: {
  lang?: StudyLang;
  compact?: boolean;
}) {
  const report = useLevelReport(lang);
  const segments = [1, 2, 3, 4, 5, 6, 7] as const;
  return (
    <div className={`level-meter${compact ? ' compact' : ''}`}>
      <div className="level-meter-head">
        <span className="level-meter-num">Level {report.level}</span>
        <span className="level-meter-name muted">{tierName(lang, report.level)}</span>
      </div>
      <div className="level-meter-track" role="img" aria-label={`Level ${report.level} of 7`}>
        {segments.map((s) => (
          <span
            key={s}
            className={`level-seg${s <= report.level ? ' on' : ''}${
              s === report.level ? ' cur' : ''
            }`}
          />
        ))}
      </div>
    </div>
  );
}

type SlotState = { busy: boolean; msg: string; pasting: boolean; paste: string };

function SlotRow({
  slot,
  lang,
  onChanged,
}: {
  slot: LevelSlot;
  lang: StudyLang;
  onChanged: () => void;
}) {
  const report = useLevelReport(lang);
  const cov = report.slots.find((c) => c.slot === slot.id);
  const pct = cov?.pct ?? 0;
  const kind = slot.id.startsWith('hsk') ? 'hsk' : 'jlpt';
  const [state, setState] = useState<SlotState>({
    busy: false,
    msg: '',
    pasting: false,
    paste: '',
  });

  const upload = async (): Promise<void> => {
    setState((s) => ({ ...s, busy: true, msg: 'Reading deck…' }));
    const res = await importApkgWords(undefined, (done, total) => {
      if (total > 100) setState((s) => ({ ...s, msg: `Processing ${done}/${total}…` }));
    });
    if (!res.ok) {
      const msg = res.error === 'cancelled' ? '' : (res.error ?? 'Import failed.');
      setState((s) => ({ ...s, busy: false, msg }));
      return;
    }
    upsertSlotList(slot.id, slot.label, kind, res.words ?? []);
    setState((s) => ({
      ...s,
      busy: false,
      msg: `${res.noteCount ?? 0} cards → ${res.words?.length ?? 0} words`,
    }));
    onChanged();
  };

  const savePaste = (): void => {
    const words = parseWords(state.paste);
    if (words.length === 0) {
      setState((s) => ({ ...s, pasting: false, paste: '' }));
      return;
    }
    upsertSlotList(slot.id, slot.label, kind, words);
    setState((s) => ({
      ...s,
      pasting: false,
      paste: '',
      msg: `${words.length} words`,
    }));
    onChanged();
  };

  return (
    <li className="level-slot">
      <div className="level-slot-main">
        <span className="level-slot-badge">{slot.short}</span>
        <div className="level-slot-bar">
          <div className="level-slot-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="level-slot-pct muted">
          {cov && cov.total > 0 ? `${cov.learned}/${cov.total} · ${Math.round(pct)}%` : 'empty'}
        </span>
        <div className="level-slot-actions">
          <button
            type="button"
            className="btn small"
            disabled={state.busy}
            onClick={() => setState((s) => ({ ...s, pasting: !s.pasting }))}
          >
            Paste words
          </button>
          <button type="button" className="btn small" disabled={state.busy} onClick={upload}>
            {state.busy ? 'Working…' : 'Upload .apkg'}
          </button>
        </div>
      </div>
      {state.msg && <p className="level-slot-msg muted">{state.msg}</p>}
      {state.pasting && (
        <div className="level-slot-paste">
          <textarea
            value={state.paste}
            placeholder="Paste the deck's words — one per line (tab/comma columns are fine)…"
            onChange={(e) => setState((s) => ({ ...s, paste: e.target.value }))}
          />
          <div className="level-slot-paste-actions">
            <button type="button" className="btn small primary" onClick={savePaste}>
              Save
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => setState((s) => ({ ...s, pasting: false, paste: '' }))}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Settings > Study "Level" panel. */
export function LevelSettingsSection() {
  const [lang, setLang] = useState<StudyLang>(() => getActiveStudyLang());
  const [threshold, setThreshold] = useState(() => Math.round(getLevelThreshold() * 100));
  const [nonce, setNonce] = useState(0);
  const slots = useMemo(() => slotsForLang(lang), [lang]);
  const bump = useRef(() => setNonce((n) => n + 1)).current;

  return (
    <div className="level-settings" data-nonce={nonce}>
      <div className="level-settings-top">
        <LevelMeter lang={lang} />
        <div className="level-lang-toggle" role="tablist" aria-label="Study language">
          <button
            type="button"
            role="tab"
            aria-selected={lang === 'ja'}
            className={`btn small${lang === 'ja' ? ' primary' : ''}`}
            onClick={() => setLang('ja')}
          >
            日本語
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lang === 'zh'}
            className={`btn small${lang === 'zh' ? ' primary' : ''}`}
            onClick={() => setLang('zh')}
          >
            中文
          </button>
        </div>
      </div>

      <ul className="level-slots">
        {slots.map((s) => (
          <SlotRow key={s.id} slot={s} lang={lang} onChanged={bump} />
        ))}
      </ul>

      <div className="level-threshold">
        <label htmlFor="level-threshold-range">
          Counts as reached at <strong>{threshold}%</strong> coverage
        </label>
        <input
          id="level-threshold-range"
          type="range"
          min={50}
          max={100}
          step={5}
          value={threshold}
          onChange={(e) => {
            const v = Number(e.target.value);
            setThreshold(v);
            setLevelThreshold(v / 100);
          }}
        />
      </div>
    </div>
  );
}
