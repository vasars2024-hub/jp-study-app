/**
 * "Import your own": one dialog for every list the learner can bring.
 *
 * Game word lists, Mirror Writing texts, resources and example sentences all
 * import the same way: pick a CSV / TSV / JSON file or paste its text, see
 * what will be added (and how many rows were skipped, and why), then commit.
 * The template is shown up front and can be copied or saved, so the right
 * columns are never a guess.
 *
 * Nothing is written until Import is pressed; the parse runs on every edit so
 * the preview is always the thing that will be committed.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Button, Dialog } from './ui';
import { useT } from '../i18n';

export interface ImportPreviewColumn<T> {
  label: string;
  value: (row: T) => ReactNode;
  /** `lang` for cells in the study language. */
  lang?: (row: T) => string | undefined;
}

export interface ContentImportDialogProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One line on what the list is for and where it shows up. */
  description: string;
  /** A small working example in each format. */
  templates: { csv: string; json: string };
  /** File name stem for the saved template. */
  templateName: string;
  parse: (text: string, fileName: string) => { rows: T[]; skipped: number };
  columns: ImportPreviewColumn<T>[];
  /** Write the rows; returns the status line shown after the dialog closes. */
  onCommit: (rows: T[]) => string;
  /** Optional extra fields (e.g. a list name) rendered above the preview. */
  extra?: ReactNode;
  /** Blocks Import with a reason, e.g. a list name is required. */
  commitBlockedReason?: string;
}

const PREVIEW_ROWS = 12;

function saveTemplate(name: string, text: string, ext: 'csv' | 'json'): void {
  const blob = new Blob([text], { type: ext === 'csv' ? 'text/csv' : 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.${ext}`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ContentImportDialog<T>({
  open,
  onClose,
  title,
  description,
  templates,
  templateName,
  parse,
  columns,
  onCommit,
  extra,
  commitBlockedReason,
}: ContentImportDialogProps<T>) {
  const { t } = useT();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');

  const result = useMemo(() => (text.trim() ? parse(text, fileName) : { rows: [] as T[], skipped: 0 }), [parse, text, fileName]);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  };

  const close = () => {
    setText('');
    setFileName('');
    onClose();
  };

  const commit = () => {
    if (!result.rows.length || commitBlockedReason) return;
    const message = onCommit(result.rows);
    window.dispatchEvent(new CustomEvent('os:toast', { detail: { message, kind: 'ok' } }));
    close();
  };

  const template = templates[format];
  const noRows = result.rows.length === 0;

  // Nothing is mounted while closed: hosts keep one of these per list, and a
  // closed dialog has no reason to exist in the tree.
  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      className="content-import"
      footer={
        <>
          <Button onClick={close}>{t('contentImport.cancel')}</Button>
          <Button
            variant="primary"
            disabled={noRows || !!commitBlockedReason}
            title={noRows ? t('contentImport.nothingYet') : commitBlockedReason}
            onClick={commit}
          >
            {t('contentImport.commit', { count: result.rows.length })}
          </Button>
        </>
      }
    >
      <p className="content-import-desc muted">{description}</p>

      <section className="content-import-template" aria-label={t('contentImport.template')}>
        <div className="content-import-template-head">
          <span>{t('contentImport.template')}</span>
          <div className="content-import-seg" role="group" aria-label={t('contentImport.format')}>
            {(['csv', 'json'] as const).map((f) => (
              <Button key={f} size="sm" variant={format === f ? 'primary' : 'ghost'} aria-pressed={format === f} onClick={() => setFormat(f)}>
                {f.toUpperCase()}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(template)}>
            {t('contentImport.copyTemplate')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => saveTemplate(templateName, template, format)}>
            {t('contentImport.saveTemplate')}
          </Button>
        </div>
        <pre className="content-import-sample">{template}</pre>
        <p className="muted content-import-note">{t('contentImport.formats')}</p>
      </section>

      {extra}

      <div className="content-import-source">
        <label className="ui-btn ui-focusable ui-btn--sm content-import-file">
          {t('contentImport.chooseFile')}
          <input
            type="file"
            accept=".csv,.tsv,.txt,.json,text/csv,text/tab-separated-values,application/json"
            onChange={(e) => {
              void readFile(e.currentTarget.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {fileName && <span className="muted">{fileName}</span>}
      </div>
      <textarea
        className="content-import-paste"
        rows={5}
        value={text}
        placeholder={t('contentImport.pastePlaceholder')}
        aria-label={t('contentImport.paste')}
        onChange={(e) => {
          setText(e.target.value);
          setFileName('');
        }}
      />

      <section className="content-import-preview" aria-live="polite">
        <p className="muted">
          {text.trim()
            ? t('contentImport.previewCount', { count: result.rows.length, skipped: result.skipped })
            : t('contentImport.nothingYet')}
        </p>
        {result.rows.length > 0 && (
          <table className="content-import-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label} scope="col">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.label} lang={c.lang?.(row)}>
                      {c.value(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {result.rows.length > PREVIEW_ROWS && (
          <p className="muted">{t('contentImport.previewMore', { count: result.rows.length - PREVIEW_ROWS })}</p>
        )}
      </section>
    </Dialog>
  );
}
