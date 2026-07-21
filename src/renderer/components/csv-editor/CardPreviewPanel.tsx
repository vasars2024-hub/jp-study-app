import type { CsvTable } from '../../../shared/csvEditor';
import type { DeckColumnMapping } from '../../../shared/deckImport';
import { useT } from '../../i18n';

type Props = {
  table: CsvTable;
  mapping: DeckColumnMapping;
  rowIndex: number | null;
  onClose: () => void;
};

function pickField(row: string[], mapping: DeckColumnMapping, field: string): string {
  for (const [col, key] of Object.entries(mapping)) {
    if (key === field) return row[Number(col)] ?? '';
  }
  return '';
}

function buildFront(row: string[], mapping: DeckColumnMapping): string {
  const front = pickField(row, mapping, 'front');
  if (front) return front;
  const word = pickField(row, mapping, 'word');
  const reading = pickField(row, mapping, 'reading');
  if (word && reading && reading !== word) return `${word}\n${reading}`;
  return word || reading;
}

function buildBack(row: string[], mapping: DeckColumnMapping): string {
  const back = pickField(row, mapping, 'back');
  if (back) return back;
  const meaning = pickField(row, mapping, 'meaning');
  const sentence = pickField(row, mapping, 'sentence');
  if (meaning && sentence) return `${meaning}\n\n${sentence}`;
  return meaning || sentence;
}

export default function CardPreviewPanel({ table, mapping, rowIndex, onClose }: Props) {
  const { t } = useT();
  const row = rowIndex !== null ? table.rows[rowIndex] : null;
  const front = row ? buildFront(row, mapping) : '';
  const back = row ? buildBack(row, mapping) : '';
  const empty = t('csv.preview.emptyValue');

  return (
    <aside className="csv-editor-preview">
      <div className="csv-editor-preview-head">
        <span className="csv-editor-preview-label">{t('csv.preview.title')}</span>
        <button
          type="button"
          className="btn small subtle"
          onClick={onClose}
          aria-label={t('csv.preview.closeAria')}
        >
          {t('common.close')}
        </button>
      </div>
      {rowIndex === null ? (
        <p className="muted csv-editor-preview-empty">{t('csv.preview.empty')}</p>
      ) : (
        <>
          <p className="muted csv-editor-preview-meta">{t('csv.preview.row', { n: rowIndex + 1 })}</p>
          <div className="csv-editor-flashcard">
            <div className="csv-editor-flashcard-side front">
              <span className="csv-editor-flashcard-tag">{t('csv.preview.front')}</span>
              <div className="csv-editor-flashcard-text" lang="ja">
                {front || empty}
              </div>
            </div>
            <div className="csv-editor-flashcard-side back">
              <span className="csv-editor-flashcard-tag">{t('csv.preview.back')}</span>
              <div className="csv-editor-flashcard-text">{back || empty}</div>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
