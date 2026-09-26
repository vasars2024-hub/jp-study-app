/**
 * "Add a resource" and "Import a list" for the Resources directory. Both save
 * on this machine (see `ownResources.ts`); the entries appear as "Your
 * resources" at the top of the directory in every study language.
 */
import { useState, type FormEvent } from 'react';
import Icon from '../Icons';
import ContentImportDialog from '../ContentImportDialog';
import { Button, Dialog, Input, Select, showToast } from '../ui';
import { useT } from '../../i18n';
import { useStudyLanguage } from '../../useStudyLanguage';
import type { Cost } from '../../data/resources';
import type { StudyLang } from '../../../shared/levelScale';
import {
  RESOURCE_TEMPLATE_CSV,
  RESOURCE_TEMPLATE_JSON,
  addOwnResources,
  normalizeResourceUrl,
  parseResourceImport,
  type OwnResourceInput,
} from '../../ownResources';
import { costLabel, hostOf } from './ResourcesContent';

const COSTS: readonly Cost[] = ['Free', 'Freemium', 'Paid'];
const LANGS: readonly StudyLang[] = ['ja', 'zh', 'ru'];

function AddResourceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const { lang: studyLang } = useStudyLanguage();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState<Cost>('Free');
  const [langs, setLangs] = useState<StudyLang[]>([studyLang]);
  const [group, setGroup] = useState('');
  const [tried, setTried] = useState(false);

  const cleanUrl = normalizeResourceUrl(url);
  const urlError = tried && !cleanUrl ? t('resources.own.urlInvalid') : undefined;
  const nameError = tried && !name.trim() ? t('resources.own.nameRequired') : undefined;

  const reset = () => {
    setName('');
    setUrl('');
    setDescription('');
    setCost('Free');
    setLangs([studyLang]);
    setGroup('');
    setTried(false);
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setTried(true);
    if (!cleanUrl || !name.trim()) return;
    addOwnResources([{ name, url: cleanUrl, description, cost, lang: langs, group }]);
    showToast({ message: t('resources.own.added', { name: name.trim() }), kind: 'success' });
    reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('resources.own.addTitle')}
      className="own-resource-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => submit()}>
            {t('resources.own.save')}
          </Button>
        </>
      }
    >
      <form className="own-resource-form" onSubmit={submit}>
        <p className="muted own-resource-intro">{t('resources.own.addIntro')}</p>
        <Input
          label={t('resources.own.url')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => {
            if (!name.trim() && cleanUrl) setName(hostOf(cleanUrl));
          }}
          placeholder="https://"
          inputMode="url"
          autoFocus
          hint={urlError}
          aria-invalid={urlError ? true : undefined}
        />
        <Input
          label={t('resources.own.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          hint={nameError}
          aria-invalid={nameError ? true : undefined}
        />
        <Input
          label={t('resources.own.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('resources.own.descriptionPlaceholder')}
        />
        <div className="own-resource-row">
          <label className="ui-field">
            <span className="ui-field__label">{t('resources.aero.col.cost')}</span>
            <Select value={cost} onChange={(e) => setCost(e.target.value as Cost)}>
              {COSTS.map((c) => (
                <option key={c} value={c}>
                  {costLabel(t, c)}
                </option>
              ))}
            </Select>
          </label>
          <Input
            label={t('resources.own.group')}
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder={t('resources.own.groupPlaceholder')}
          />
        </div>
        <div className="ui-field">
          <span className="ui-field__label">{t('resources.own.langs')}</span>
          <div className="own-resource-langs" role="group" aria-label={t('resources.own.langs')}>
            {LANGS.map((l) => {
              const on = langs.includes(l);
              return (
                <button
                  key={l}
                  type="button"
                  className={`gram-level-btn${on ? ' active' : ''}`}
                  aria-pressed={on}
                  onClick={() => setLangs((cur) => (on ? cur.filter((x) => x !== l) : [...cur, l]))}
                >
                  {t(`resources.own.lang.${l}`)}
                </button>
              );
            })}
          </div>
          <span className="ui-field__hint">{t('resources.own.langsHint')}</span>
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export default function OwnResourceControls({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant={compact ? 'ghost' : 'default'} onClick={() => setAddOpen(true)} leftIcon={<Icon name="plus" size={12} />}>
        {t('resources.own.add')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)} leftIcon={<Icon name="file-text" size={12} />}>
        {t('resources.own.import')}
      </Button>
      <AddResourceDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ContentImportDialog<OwnResourceInput>
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('resources.own.importTitle')}
        description={t('resources.own.importDesc')}
        templates={{ csv: RESOURCE_TEMPLATE_CSV, json: RESOURCE_TEMPLATE_JSON }}
        templateName="resources"
        parse={parseResourceImport}
        columns={[
          { label: t('resources.own.name'), value: (r) => r.name },
          { label: t('resources.aero.col.host'), value: (r) => hostOf(r.url) },
          { label: t('resources.aero.col.cost'), value: (r) => costLabel(t, r.cost) },
          { label: t('resources.own.langs'), value: (r) => r.lang.map((l) => t(`resources.own.lang.${l}`)).join(' · ') },
          { label: t('resources.aero.col.description'), value: (r) => r.description },
        ]}
        onCommit={(rows) => {
          const added = addOwnResources(rows);
          return t('resources.own.imported', { count: rows.length, added });
        }}
      />
    </>
  );
}
