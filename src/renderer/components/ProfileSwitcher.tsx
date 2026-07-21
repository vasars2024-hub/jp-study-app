import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { confirmDialog } from './ui';
import { PROFILE_GROUPS, type ProfileId } from '../../shared/profiles';
import {
  createProfile,
  DEFAULT_PROFILE_ID,
  deleteProfile,
  getActiveProfile,
  getActiveProfileId,
  getProfiles,
  isSeedProfile,
  onProfileChanged,
  switchProfile,
} from '../profileState';
import { useT } from '../i18n';

const PROFILE_GROUP_KEYS = {
  jaEn: 'settings.study.profile.group.jaEn',
  enJa: 'settings.study.profile.group.enJa',
  russian: 'settings.study.profile.group.russian',
  chinese: 'settings.study.profile.group.chinese',
  specialty: 'settings.study.profile.group.specialty',
} as const;

function formatProfileDescription(description: string | undefined): string {
  if (!description) return '';
  return ` — ${description.slice(0, 48)}${description.length > 48 ? '…' : ''}`;
}

function CreateProfileModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (msg: { kind: 'ok' | 'err'; text: string }) => void;
}) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createProfile(name);
    setBusy(false);
    if (res.ok) {
      onCreated({ kind: 'ok', text: t('settings.study.profile.created') });
      onClose();
      return;
    }
    onCreated({
      kind: 'err',
      text: res.error ?? t('settings.study.profile.createFailed'),
    });
  }

  return (
    <div className="nov-modal-backdrop" onClick={onClose}>
      <div className="set-modal" onClick={(e) => e.stopPropagation()}>
        <button className="nov-modal-x" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
        <div className="set-modal-body">
          <h3 className="set-modal-title">{t('settings.study.profile.createTitle')}</h3>
          <p className="set-row-desc muted">{t('settings.study.profile.createDesc')}</p>
          <form onSubmit={submit}>
            <div className="field-row">
              <label htmlFor="profile-name">{t('settings.study.profile.nameLabel')}</label>
              <input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('settings.study.profile.namePlaceholder')}
                autoFocus
              />
            </div>
            <div className="set-profile-actions">
              <button type="button" className="btn" onClick={onClose} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
                {busy
                  ? t('settings.study.profile.creating')
                  : t('settings.study.profile.createSubmit')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export type ProfileSwitcherProps = {
  className?: string;
  showHeading?: boolean;
  compact?: boolean;
};

export function ProfileSwitcher({ className, showHeading, compact }: ProfileSwitcherProps) {
  const { t } = useT();
  const [profiles, setProfiles] = useState(getProfiles);
  const [activeId, setActiveId] = useState<ProfileId>(getActiveProfileId);
  const [switching, setSwitching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const active = profiles.find((p) => p.id === activeId) ?? getActiveProfile();
  const isDefault = activeId === DEFAULT_PROFILE_ID;
  const isSeed = isSeedProfile(activeId);

  useEffect(
    () =>
      onProfileChanged((snap) => {
        setProfiles(snap.profiles);
        setActiveId(snap.activeProfileId);
      }),
    [],
  );

  async function onSelect(id: ProfileId) {
    if (id === activeId || switching) return;
    setSwitching(true);
    setMsg(null);
    const res = await switchProfile(id);
    setSwitching(false);
    if (!res.ok) {
      setMsg({
        kind: 'err',
        text: res.error ?? t('settings.study.profile.switchFailed'),
      });
    }
  }

  async function onDelete() {
    if (isDefault || deleting) return;
    const question = isSeed
      ? t('settings.study.profile.resetConfirmMsg', { label: active.label })
      : t('settings.study.profile.deleteConfirmMsg', { label: active.label });
    const ok = await confirmDialog({
      title: isSeed
        ? t('settings.study.profile.resetConfirmTitle')
        : t('settings.study.profile.deleteConfirmTitle'),
      message: question,
      confirmLabel: isSeed ? t('common.reset') : t('settings.study.profile.deleteConfirm'),
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    setMsg(null);
    const res = await deleteProfile(activeId);
    setDeleting(false);
    if (res.ok) {
      setMsg({
        kind: 'ok',
        text: isSeed
          ? t('settings.study.profile.resetOk')
          : t('settings.study.profile.deletedOk'),
      });
    } else {
      setMsg({
        kind: 'err',
        text: res.error ?? t('settings.study.profile.removeFailed'),
      });
    }
  }

  const profileSelect = (
    <select
      className={compact ? undefined : 'set-select'}
      value={activeId}
      disabled={switching}
      onChange={(e) => void onSelect(e.target.value as ProfileId)}
      aria-label={t('search.profile')}
    >
      {PROFILE_GROUPS.map((group) => {
        const items = group.ids
          .map((id) => profiles.find((p) => p.id === id))
          .filter((p): p is NonNullable<typeof p> => Boolean(p));
        if (items.length === 0) return null;
        return (
          <optgroup key={group.id} label={t(PROFILE_GROUP_KEYS[group.id])}>
            {items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {formatProfileDescription(p.description)}
              </option>
            ))}
          </optgroup>
        );
      })}
      {profiles.some((p) => !PROFILE_GROUPS.some((g) => g.ids.includes(p.id))) && (
        <optgroup label={t('settings.study.profile.group.custom')}>
          {profiles
            .filter((p) => !PROFILE_GROUPS.some((g) => g.ids.includes(p.id)))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {formatProfileDescription(p.description)}
              </option>
            ))}
        </optgroup>
      )}
    </select>
  );

  const actionButtons = (
    <>
      <button className={compact ? undefined : 'btn'} onClick={() => setShowCreate(true)}>
        {t('settings.study.profile.create')}
      </button>
      <button
        className={compact ? undefined : 'btn'}
        onClick={() => void onDelete()}
        disabled={isDefault || deleting}
        title={
          isDefault
            ? t('settings.study.profile.cannotDeleteDefault')
            : isSeed
              ? t('settings.study.profile.resetTooltip')
              : t('settings.study.profile.deleteTooltip')
        }
      >
        {deleting
          ? isSeed
            ? t('settings.study.profile.resetting')
            : t('settings.study.profile.deleting')
          : isSeed
            ? t('settings.study.profile.resetDefaults')
            : t('settings.study.profile.delete')}
      </button>
    </>
  );

  const feedback = msg ? <div className={`form-msg ${msg.kind}`}>{msg.text}</div> : null;

  const createModal =
    showCreate ? (
      <CreateProfileModal onClose={() => setShowCreate(false)} onCreated={setMsg} />
    ) : null;

  const rootClass = [compact ? undefined : 'set-section', className].filter(Boolean).join(' ');

  let body: ReactNode;

  if (compact) {
    body = (
      <>
        {showHeading ? <h2>{t('search.profile')}</h2> : null}
        <div className="blanc-form-grid">
          <label>
            {t('settings.study.profile.active')}
            <span className="set-profile-badge" aria-live="polite">
              <span className="status-dot ok" />
              {active.label}
            </span>
            <span className="blanc-note muted">
              {active.description ?? t('settings.study.profile.defaultDesc')}
            </span>
          </label>
          <label>
            {t('settings.study.profile.switch')}
            {profileSelect}
          </label>
        </div>
        <div className="blanc-row-actions">{actionButtons}</div>
        {feedback}
        {createModal}
      </>
    );
  } else {
    body = (
      <>
        {showHeading ? <h2>{t('search.profile')}</h2> : null}

        <div className="set-row">
          <div className="set-row-text">
            <div className="set-row-title">{t('settings.study.profile.active')}</div>
            <div className="set-row-desc muted">
              {active.description ?? t('settings.study.profile.defaultDesc')}
            </div>
          </div>
          <span className="set-profile-badge" aria-live="polite">
            <span className="status-dot ok" />
            {active.label}
          </span>
        </div>

        <div className="set-row set-profile-picker">
          <div className="set-row-text">
            <div className="set-row-title">{t('settings.study.profile.switch')}</div>
          </div>
          {profileSelect}
        </div>

        <div className="set-profile-actions">{actionButtons}</div>
        {feedback}
        {createModal}
      </>
    );
  }

  if (compact) {
    return rootClass ? <div className={rootClass}>{body}</div> : <>{body}</>;
  }

  return <section className={rootClass}>{body}</section>;
}
