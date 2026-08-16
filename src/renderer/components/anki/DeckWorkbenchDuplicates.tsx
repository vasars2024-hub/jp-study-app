/**
 * Smart recipe 9's consumer surface: the duplicate scan, in the Browser.
 *
 * `shared/ankiDuplicates.ts` proposes and never deletes, and this surface keeps
 * that promise literally — every outcome it offers is a **selection**, which the
 * existing Clear button reverses and which the tray's own reversible actions
 * then consume. There is no delete button here and there is no tray kind for
 * one.
 *
 * It scans the rows the Browser is currently showing, not the whole draft. The
 * Browser can only hand downstream the notes it has in memory, so a finding
 * outside the active filter could be counted and then not selected — and a
 * count in a button is a promise about what the click will do. Scoping to the
 * filter also composes: `Expression:script:latin` then a duplicate scan is a
 * real audit query.
 */
import { useCallback, useMemo, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import {
  NEAR_MAX_COMPARISONS,
  duplicateNoteIds,
  findDuplicateNotes,
  type DuplicateMatchMode,
  type DuplicateScanResult,
} from '../../../shared/ankiDuplicates';
import { useT } from '../../i18n';

const MODES: readonly DuplicateMatchMode[] = ['exact', 'normalized', 'near'];

/** Every note in a group, the proposed keeper included. */
function groupedNoteIds(result: DuplicateScanResult): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of result.groups) {
    for (const id of [group.canonicalNoteId, ...group.duplicateNoteIds]) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export default function DeckWorkbenchDuplicates({
  draft,
  scopeNoteIds,
  fieldNames,
  onSelect,
}: {
  draft: AnkiDraft;
  /** The rows the Browser is showing — the scan's universe. */
  scopeNoteIds: readonly string[];
  fieldNames: readonly string[];
  onSelect: (noteIds: string[]) => void;
}): JSX.Element {
  const { t } = useT();
  const [field, setField] = useState(() => fieldNames[0] ?? '');
  const [mode, setMode] = useState<DuplicateMatchMode>('normalized');
  /** Text, not a number: `near` has no default, and `0` is not "unset". */
  const [threshold, setThreshold] = useState('');
  const [result, setResult] = useState<DuplicateScanResult | null>(null);
  /** The scope the shown result was measured against, so a later filter change
      cannot make an old count read as current. */
  const [scannedCount, setScannedCount] = useState(0);

  const parsedThreshold = useMemo(() => {
    const n = Number(threshold);
    return threshold.trim() !== '' && Number.isFinite(n) && n > 0 && n <= 1 ? n : null;
  }, [threshold]);
  const thresholdMissing = mode === 'near' && parsedThreshold === null;

  const scan = useCallback(() => {
    if (!field || thresholdMissing) return;
    setResult(
      findDuplicateNotes({
        notes: draft.notes,
        noteTypes: draft.noteTypes,
        fieldName: field,
        mode,
        ...(parsedThreshold !== null ? { threshold: parsedThreshold } : {}),
        noteIds: scopeNoteIds,
      }),
    );
    setScannedCount(scopeNoteIds.length);
  }, [draft, field, mode, parsedThreshold, scopeNoteIds, thresholdMissing]);

  const duplicates = result ? duplicateNoteIds(result) : [];
  const grouped = result ? groupedNoteIds(result) : [];
  const tiedGroups = result ? result.groups.filter((g) => g.tied).length : 0;

  return (
    <div className="wb-browser-dupes" role="group" aria-label={t('ankiWorkbench.browser.dupes.title')}>
      <div className="wb-browser-dupes-controls">
        <label>
          <span className="muted">{t('ankiWorkbench.browser.dupes.field')}</span>
          <select value={field} onChange={(e) => setField(e.target.value)}>
            {/* Field names are the deck's own text and are never translated. */}
            {fieldNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">{t('ankiWorkbench.browser.dupes.mode')}</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as DuplicateMatchMode)}>
            {MODES.map((value) => (
              <option key={value} value={value}>
                {t(`ankiWorkbench.browser.dupes.mode.${value}`)}
              </option>
            ))}
          </select>
        </label>
        {mode === 'near' && (
          <label>
            <span className="muted">{t('ankiWorkbench.browser.dupes.threshold')}</span>
            <input
              type="text"
              inputMode="decimal"
              className="wb-browser-dupes-threshold"
              value={threshold}
              placeholder="0.85"
              aria-invalid={thresholdMissing ? true : undefined}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
        )}
        <button type="button" className="btn" disabled={!field || thresholdMissing} onClick={scan}>
          {t('ankiWorkbench.browser.dupes.scan')}
        </button>
        <span className="muted">{t('ankiWorkbench.browser.dupes.scope', { count: scopeNoteIds.length })}</span>
      </div>

      {/* A threshold nobody entered is a missing answer, not 0.8 — the module
          refuses the same way, and the button stays disabled rather than
          returning an empty scan that reads as "no duplicates". */}
      {thresholdMissing && <p className="muted">{t('ankiWorkbench.browser.dupes.noThreshold')}</p>}

      {result && (
        <div className="wb-browser-dupes-result">
          {result.capped ? (
            <p className="wb-browser-query-error" role="alert">
              {t('ankiWorkbench.browser.dupes.capped', { limit: NEAR_MAX_COMPARISONS })}
            </p>
          ) : result.groups.length === 0 ? (
            <p className="muted">{t('ankiWorkbench.browser.dupes.none', { count: scannedCount })}</p>
          ) : (
            <>
              <p>
                {t('ankiWorkbench.browser.dupes.result', {
                  groups: result.groups.length,
                  duplicates: duplicates.length,
                })}
              </p>
              <div className="wb-browser-dupes-actions">
                <button type="button" className="btn primary" onClick={() => onSelect(duplicates)}>
                  {t('ankiWorkbench.browser.dupes.selectDupes', { count: duplicates.length })}
                </button>
                <button type="button" className="btn" onClick={() => onSelect(grouped)}>
                  {t('ankiWorkbench.browser.dupes.selectAll', { count: grouped.length })}
                </button>
              </div>
              <p className="muted">{t('ankiWorkbench.browser.dupes.neverDeletes')}</p>
            </>
          )}
          {/* The three side counts are stated whether or not any group was
              found: a scan that skipped 900 notes for a missing field and says
              only "no duplicates" has answered a question nobody asked. */}
          <ul className="muted wb-browser-dupes-notes">
            {tiedGroups > 0 && <li>{t('ankiWorkbench.browser.dupes.tied', { count: tiedGroups })}</li>}
            {result.fieldAbsentNoteIds.length > 0 && (
              <li>{t('ankiWorkbench.browser.dupes.fieldAbsent', { count: result.fieldAbsentNoteIds.length })}</li>
            )}
            {result.emptyNoteIds.length > 0 && (
              <li>{t('ankiWorkbench.browser.dupes.empty', { count: result.emptyNoteIds.length })}</li>
            )}
            {result.comparisons > 0 && (
              <li>{t('ankiWorkbench.browser.dupes.comparisons', { count: result.comparisons })}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
