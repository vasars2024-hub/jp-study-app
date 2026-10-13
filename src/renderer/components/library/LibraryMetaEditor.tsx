/**
 * Edit a library item's details — title, authors, series and number, tags —
 * the way Calibre's "Edit metadata" does for the fields Gum uses: series
 * drives the shelf's series grouping and order, and all four feed the
 * shelf's search.
 *
 * The form is checked with the same normalizer main runs on save
 * (`shared/libraryMeta.ts`), so an error shows before the round trip; main
 * still re-checks whatever arrives.
 */
import { useId, useState } from 'react';
import type { LibraryItem } from '../../../shared/types';
import { libraryMetaFormValues, normalizeLibraryMetaPatch } from '../../../shared/libraryMeta';
import { Button, Dialog } from '../ui';

type T = (key: string, vars?: Record<string, string | number>) => string;

interface Props {
  item: LibraryItem;
  t: T;
  onClose: () => void;
  onSaved: (items: LibraryItem[], item: LibraryItem) => void;
}

export default function LibraryMetaEditor({ item, t, onClose, onSaved }: Props) {
  const [values, setValues] = useState(() => libraryMetaFormValues(item));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const id = useId();

  const set = (field: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [field]: e.target.value }));

  const save = async () => {
    const checked = normalizeLibraryMetaPatch(values);
    if (!checked.ok) {
      setError(t(checked.errorKey));
      return;
    }
    if (!window.api?.updateLibraryMeta) return;
    setSaving(true);
    setError('');
    try {
      const result = await window.api.updateLibraryMeta(item.id, checked.patch);
      if (result.ok) {
        onSaved(result.items, result.item);
        onClose();
      } else {
        setError(t(result.errorKey));
      }
    } catch {
      setError(t('libManage.meta.error.invalid'));
    } finally {
      setSaving(false);
    }
  };

  const field = (name: keyof typeof values, labelKey: string, hintKey?: string, inputMode?: 'decimal') => (
    <div className="lib-meta-field">
      <label htmlFor={`${id}-${name}`}>{t(labelKey)}</label>
      <input
        id={`${id}-${name}`}
        className="gram-search"
        value={values[name]}
        inputMode={inputMode}
        aria-describedby={hintKey ? `${id}-${name}-hint` : undefined}
        onChange={set(name)}
        onKeyDown={(e) => {
          // Enter confirms an IME conversion; it must not save yet.
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) void save();
        }}
      />
      {hintKey && (
        <span id={`${id}-${name}-hint`} className="muted lib-meta-hint">
          {t(hintKey)}
        </span>
      )}
    </div>
  );

  return (
    <Dialog
      open
      onClose={() => !saving && onClose()}
      dismissable={!saving}
      title={t('libManage.meta.dialogTitle')}
      className="lib-meta-editor"
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {field('title', 'libManage.meta.field.title')}
      {field('author', 'libManage.meta.field.author', 'libManage.meta.authorHint')}
      <div className="lib-meta-row">
        {field('series', 'libManage.meta.field.series')}
        {field('seriesIndex', 'libManage.meta.field.seriesIndex', undefined, 'decimal')}
      </div>
      {field('tags', 'libManage.meta.field.tags', 'libManage.meta.tagsHint')}
      {error && (
        <div className="lib-import-err" role="alert">
          {error}
        </div>
      )}
    </Dialog>
  );
}
