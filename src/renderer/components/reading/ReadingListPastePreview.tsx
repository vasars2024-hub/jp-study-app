/**
 * §2.5 — the mandatory paste preview.
 *
 * "Paste never writes straight to a list." This is the sheet that stands between
 * the two, and its job is to make the parser's judgement *inspectable* rather
 * than to look confident: every row shows the line it came from, every field is
 * editable, every row can be dropped and put back, and the lines the parser
 * threw away are disclosed rather than hidden.
 *
 * All the decisions live in `shared/readingListPreview.ts`. This file renders
 * them and owns exactly two things the model cannot: the draft's React state,
 * and the keyboard.
 *
 * Two deliberate details:
 *
 *   · **Ctrl+Z inside a text field is the browser's.** §2.5 asks for Ctrl+Z to
 *     restore the previous parse, but stealing it while the caret is in a title
 *     input would make it impossible to undo a typo — the one place a user
 *     expects it most. The sheet's undo binds everywhere else.
 *   · **The confirm is disabled AND says why.** A greyed button with no reason
 *     is the dishonest state this repo keeps finding; the blocker line names the
 *     cause ("nothing selected", "a title is empty") in the user's terms.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './readingListPreview.css';
import { Dialog } from '../ui/Dialog';
import { useT } from '../../i18n';
import {
  beginReadingListPreview,
  editPreviewRow,
  readingPreviewImport,
  resetPreviewToParse,
  revertPreviewRow,
  setPreviewRowIncluded,
  summarizeReadingPreview,
  undoPreviewEdits,
  type ReadingPreviewDraft,
  type ReadingPreviewImport,
  type ReadingPreviewRow,
} from '../../../shared/readingListPreview';

export interface ReadingListPastePreviewProps {
  open: boolean;
  /** Exactly what was pasted. Re-parsed whenever it changes. */
  rawText: string;
  /** The list the entries will land on, named in the confirm. */
  listName: string;
  onCancel: () => void;
  onConfirm: (payload: ReadingPreviewImport) => void;
  /** True while the caller's write is in flight; the sheet stays open and inert. */
  busy?: boolean;
  /**
   * The caller's own banner — a failed write, most often. Rendered inside the
   * sheet because the dialog is a fixed overlay and a sibling paints under it.
   */
  notice?: ReactNode;
}

const TRIAGE_KEYS: Record<string, string> = {
  'author-ambiguous': 'readingLists.preview.triage.authorAmbiguous',
  'very-short': 'readingLists.preview.triage.veryShort',
  'very-long': 'readingLists.preview.triage.veryLong',
};

export function ReadingListPastePreview({
  open,
  rawText,
  listName,
  onCancel,
  onConfirm,
  busy = false,
  notice,
}: ReadingListPastePreviewProps) {
  const { t } = useT();
  const [draft, setDraft] = useState<ReadingPreviewDraft>(() => beginReadingListPreview(rawText));
  const [showDropped, setShowDropped] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // A new paste is a new sheet. Keyed on the text itself so a reopened dialog
  // showing the same message keeps the edits the user already made.
  useEffect(() => {
    setDraft(beginReadingListPreview(rawText));
  }, [rawText]);

  const summary = useMemo(() => summarizeReadingPreview(draft), [draft]);

  const focusFirstTriage = useCallback(() => {
    const row = draft.rows.find((entry) => entry.included && entry.needsTriage);
    if (!row) return;
    bodyRef.current
      ?.querySelector<HTMLInputElement>(`input[data-rl-title="${row.lineIndex}"]`)
      ?.focus();
  }, [draft]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    const target = event.target as HTMLElement | null;
    // The caret's own undo wins inside a field. See the header.
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    event.preventDefault();
    setDraft((current) => undoPreviewEdits(current));
  }, []);

  const blocked = summary.blockers.length > 0;

  const footer = (
    <div className="rl-preview__foot" onKeyDown={onKeyDown}>
      <div className="rl-preview__count" role="status">
        {t('readingLists.preview.selectedCount', { count: summary.included, total: summary.parsed })}
      </div>
      <div className="rl-preview__actions">
        <button
          type="button"
          className="ui-btn"
          disabled={!draft.history.length || busy}
          onClick={() => setDraft((current) => undoPreviewEdits(current))}
        >
          {t('readingLists.preview.undo')}
        </button>
        <button
          type="button"
          className="ui-btn"
          disabled={busy}
          onClick={() => setDraft((current) => resetPreviewToParse(current))}
        >
          {t('common.reset')}
        </button>
        <button type="button" className="ui-btn" disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          disabled={blocked || busy}
          onClick={() => onConfirm(readingPreviewImport(draft))}
        >
          {t('readingLists.preview.confirm', { count: summary.included, list: listName })}
        </button>
      </div>
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      dismissable={false}
      className="rl-preview"
      title={t('readingLists.preview.title')}
      footer={footer}
    >
      <div ref={bodyRef} className="rl-preview__body" onKeyDown={onKeyDown}>
        <p className="rl-preview__lede">{t('readingLists.preview.lede', { list: listName })}</p>

        {notice}

        {summary.triage > 0 && (
          <div className="rl-preview__triage" role="note">
            <span>{t('readingLists.preview.triageCount', { count: summary.triage })}</span>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={focusFirstTriage}>
              {t('readingLists.preview.triageJump')}
            </button>
          </div>
        )}

        {blocked && (
          <div className="rl-preview__blocked" role="alert">
            {summary.blockers
              .map((code) =>
                code === 'nothing-selected'
                  ? t('readingLists.preview.blockedEmpty')
                  : t('readingLists.preview.blockedBlank', { count: summary.blankTitles }),
              )
              .join(' ')}
          </div>
        )}

        {draft.rows.length === 0 ? (
          <p className="rl-preview__empty">{t('readingLists.preview.noneFound')}</p>
        ) : (
          <ul className="rl-preview__rows">
            {draft.rows.map((row) => (
              <PreviewRow
                key={row.lineIndex}
                row={row}
                busy={busy}
                onToggle={(included) =>
                  setDraft((current) => setPreviewRowIncluded(current, row.lineIndex, included))
                }
                onEdit={(patch) =>
                  setDraft((current) => editPreviewRow(current, row.lineIndex, patch))
                }
                onRevert={() => setDraft((current) => revertPreviewRow(current, row.lineIndex))}
                t={t}
              />
            ))}
          </ul>
        )}

        {summary.droppedLines > 0 && (
          <div className="rl-preview__dropped">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              aria-expanded={showDropped}
              onClick={() => setShowDropped((value) => !value)}
            >
              {t('readingLists.preview.droppedCount', { count: summary.droppedLines })}
            </button>
            {showDropped && (
              <ul className="rl-preview__droppedList">
                {draft.parsed.dropped.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

interface PreviewRowProps {
  row: ReadingPreviewRow;
  busy: boolean;
  onToggle: (included: boolean) => void;
  onEdit: (patch: { title?: string; author?: string }) => void;
  onRevert: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function PreviewRow({ row, busy, onToggle, onEdit, onRevert, t }: PreviewRowProps) {
  const blank = row.included && !row.title.trim();
  const className = [
    'rl-preview__row',
    row.included ? '' : 'is-dropped',
    row.needsTriage ? 'is-triage' : '',
    blank ? 'is-blank' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={className}>
      <label className="rl-preview__include">
        <input
          type="checkbox"
          checked={row.included}
          disabled={busy}
          aria-label={t('readingLists.preview.includeRow', { title: row.title || row.rawLine })}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </label>
      <div className="rl-preview__fields">
        <input
          type="text"
          className="ui-input rl-preview__title"
          value={row.title}
          disabled={busy}
          data-rl-title={row.lineIndex}
          aria-label={t('readingLists.preview.titleField')}
          aria-invalid={blank || undefined}
          onChange={(event) => onEdit({ title: event.target.value })}
        />
        <input
          type="text"
          className="ui-input rl-preview__author"
          value={row.author ?? ''}
          disabled={busy}
          placeholder={t('readingLists.preview.authorPlaceholder')}
          aria-label={t('readingLists.preview.authorField')}
          onChange={(event) => onEdit({ author: event.target.value })}
        />
        <p className="rl-preview__raw" title={row.rawLine}>
          {t('readingLists.preview.fromLine', { line: row.rawLine })}
        </p>
        {row.needsTriage && (
          <p className="rl-preview__reason">{t(TRIAGE_KEYS[row.needsTriage] ?? TRIAGE_KEYS['very-short'])}</p>
        )}
      </div>
      {row.edited && (
        <button type="button" className="ui-btn ui-btn--ghost" disabled={busy} onClick={onRevert}>
          {t('readingLists.preview.revert')}
        </button>
      )}
    </li>
  );
}

export default ReadingListPastePreview;
