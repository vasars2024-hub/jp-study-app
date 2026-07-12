import { useState } from 'react';
import { DEFAULT_CARD_CSS } from '../../shared/kinomotoCard';
import type { StudyProfile } from '../../shared/profiles';
import { updateProfile } from '../profileState';
import CollapsibleSection from './CollapsibleSection';

type Msg = { kind: 'ok' | 'err'; text: string };

export default function NoteCssEditor({
  profile,
  onCssChange,
  onMessage,
}: {
  profile: StudyProfile;
  onCssChange?: (css: string) => void;
  onMessage?: (m: Msg) => void;
}) {
  const [css, setCss] = useState(profile.noteCss ?? DEFAULT_CARD_CSS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function edit(next: string) {
    setCss(next);
    setDirty(true);
    onCssChange?.(next);
  }

  async function save() {
    setSaving(true);
    const res = await updateProfile(profile.id, { noteCss: css });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      onMessage?.({ kind: 'ok', text: 'Card styling saved.' });
    } else {
      onMessage?.({ kind: 'err', text: res.error ?? 'Could not save card styling.' });
    }
  }

  function resetDefault() {
    edit(DEFAULT_CARD_CSS);
  }

  return (
    <CollapsibleSection
      title="Card styling (CSS)"
      summary="Customize how mined cards look in Anki"
      className="note-css-section"
    >
      <p className="muted collapse-lead">
        This CSS is applied to the note type when the app creates it, and used in the live preview.
        Anki card templates reference classes like <code>.jsa-face</code> and <code>.jsa-term</code>.
      </p>
      <textarea
        className="note-css-editor"
        value={css}
        spellCheck={false}
        rows={14}
        onChange={(e) => edit(e.target.value)}
      />
      <div className="fm-actions">
        <button className="btn primary" type="button" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : dirty ? 'Save styling' : 'Saved'}
        </button>
        <button className="btn" type="button" onClick={resetDefault} disabled={saving}>
          Reset to default
        </button>
      </div>
    </CollapsibleSection>
  );
}
