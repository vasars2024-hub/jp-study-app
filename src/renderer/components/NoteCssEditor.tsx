import { useState } from 'react';
import { DEFAULT_CARD_CSS } from '../../shared/kinomotoCard';
import type { NoteStylingPushResult } from '../../shared/anki';
import type { StudyProfile } from '../../shared/profiles';
import type { TVars } from '../../shared/i18n/core';
import { updateProfile } from '../profileState';
import { useT } from '../i18n';
import CollapsibleSection from './CollapsibleSection';

type Msg = { kind: 'ok' | 'err'; text: string };
type TFunction = (key: string, vars?: TVars) => string;

/** What the save did in Anki, in the user's words. Exported for tests. */
export function noteStylingMessage(t: TFunction, res: NoteStylingPushResult): Msg {
  if (!res.ok) return { kind: 'err', text: t('noteCss.pushFailed', { error: res.error }) };
  if (res.status === 'updated') return { kind: 'ok', text: t('noteCss.pushUpdated', { model: res.modelName }) };
  if (res.status === 'queued') return { kind: 'ok', text: t('noteCss.pushQueued') };
  return { kind: 'ok', text: t('noteCss.pushNotCreated', { model: res.modelName }) };
}

export default function NoteCssEditor({
  profile,
  onCssChange,
  onMessage,
}: {
  profile: StudyProfile;
  onCssChange?: (css: string) => void;
  onMessage?: (m: Msg) => void;
}) {
  const { t } = useT();
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
    if (!res.ok) {
      setSaving(false);
      onMessage?.({ kind: 'err', text: res.error ?? t('noteCss.saveFailed') });
      return;
    }
    setDirty(false);
    // Saved to the profile; now the note type itself. `ensureModel` only uses
    // this CSS when it creates the model, so an existing one needs the push.
    let pushed: NoteStylingPushResult;
    try {
      pushed = await window.api.ankiPushNoteStyling(profile.id);
    } catch (err) {
      pushed = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    setSaving(false);
    onMessage?.(noteStylingMessage(t, pushed));
  }

  function resetDefault() {
    edit(DEFAULT_CARD_CSS);
  }

  return (
    <CollapsibleSection
      title={t('noteCss.title')}
      summary={t('noteCss.summary')}
      className="note-css-section"
    >
      <p className="muted collapse-lead">
        {t('noteCss.lead')} {t('noteCss.classesHint', { face: '.jsa-face', term: '.jsa-term' })}
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
          {saving ? t('noteCss.saving') : dirty ? t('noteCss.save') : t('noteCss.saved')}
        </button>
        <button className="btn" type="button" onClick={resetDefault} disabled={saving}>
          {t('noteCss.reset')}
        </button>
      </div>
    </CollapsibleSection>
  );
}
