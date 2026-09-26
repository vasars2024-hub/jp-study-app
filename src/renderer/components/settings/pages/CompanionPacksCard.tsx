/**
 * Settings › Companions › Characters — who each companion is, and the sprite
 * packs to choose from: Gum's own characters, the owner's private packs, and
 * packs the user imported (Shimeji-style .zip / folder, or named frames).
 */
import { useEffect, useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { Button, confirmDialog, promptDialog, Select, Tile, TileList } from '../../ui';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import { COMPANION_DEFS, localizedCompanionDef, type CompanionTypeId } from '../../../environment/companionCatalog';
import {
  useCompanionPacks,
  type CompanionPackInfo,
  type ShimejiPackId,
} from '../../../environment/shimejiPacks';
import {
  clearPackFromChoices,
  resolveCompanionPack,
  setPackChoice,
  usePackChoices,
} from '../../../environment/companionPackChoice';
import { importSpritePack } from '../../../environment/companionPackImport';
import { hasDiscoveredAero, onAeroDiscoveryChanged } from '../../../aeroDiscovery';
import { hasDiscoveredWired, onWiredDiscoveryChanged } from '../../../wiredDiscovery';
import './CompanionPacksCard.css';

/** A pack's walk cycle while selected or hovered, its standing frame otherwise. */
function PackPreview({ pack, active }: { pack: CompanionPackInfo; active: boolean }) {
  const frames = active ? pack.frames.walk : pack.frames.stand;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setTick(0);
    if (!active || frames.length <= 1 || document.documentElement.classList.contains('reduce-motion')) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 180);
    return () => window.clearInterval(id);
  }, [active, frames]);
  const src = frames[tick % Math.max(1, frames.length)] ?? pack.frames.stand[0];
  return <img className="companion-pack-preview" src={src} alt="" draggable={false} />;
}

export default function CompanionPacksCard() {
  const { t, lang } = useT();
  const { focusSettingId } = useSettings();
  const packs = useCompanionPacks();
  const choices = usePackChoices();
  const [aero, setAero] = useState(hasDiscoveredAero);
  const [wired, setWired] = useState(hasDiscoveredWired);
  useEffect(() => onAeroDiscoveryChanged(setAero), []);
  useEffect(() => onWiredDiscoveryChanged(setWired), []);
  const [selectedId, setSelectedId] = useState<ShimejiPackId | null>(null);
  const [hoverId, setHoverId] = useState<ShimejiPackId | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const defs = useMemo(() => COMPANION_DEFS().map((d) => localizedCompanionDef(d, t)), [aero, wired, lang]);
  const packName = (p: CompanionPackInfo | undefined | null): string => {
    if (!p) return '';
    return p.kind === 'builtin' ? t(`companion.pack.${p.id}.name`) : p.name;
  };
  const kindLabel = (p: CompanionPackInfo): string =>
    p.kind === 'builtin'
      ? t(`companion.pack.${p.id}.desc`)
      : p.kind === 'private'
        ? t('settings.companions.packs.kind.private')
        : t('settings.companions.packs.kind.user');
  const selected = packs.find((p) => p.id === selectedId) ?? null;

  const runImport = async (kind: 'file' | 'folder') => {
    setBusy(true);
    const res = await importSpritePack(kind);
    setBusy(false);
    if (!res) return;
    setStatus({ ok: res.ok, message: res.message });
    if (res.packIds[0]) setSelectedId(res.packIds[0]);
  };

  const rename = async (p: CompanionPackInfo) => {
    const next = await promptDialog({
      title: t('settings.companions.packs.renameTitle'),
      message: p.name,
      defaultValue: p.name,
      okLabel: t('settings.companions.packs.rename'),
    });
    if (next && next.trim() && next.trim() !== p.name) await window.api?.companionPacksRename?.(p.id, next.trim());
  };

  const remove = async (p: CompanionPackInfo) => {
    const ok = await confirmDialog({
      message: t('settings.companions.packs.deleteConfirm', { name: p.name }),
      confirmLabel: t('settings.companions.packs.delete'),
      danger: true,
    });
    if (!ok) return;
    if (await window.api?.companionPacksRemove?.(p.id)) {
      clearPackFromChoices(p.id);
      setSelectedId(null);
    }
  };

  return (
    <SettingsCard
      id="companion-packs"
      title={t('settings.companions.packs.title')}
      description={t('settings.companions.packs.desc')}
      highlight={focusSettingId === 'companion-packs'}
    >
      <div className="companion-pack-wear">
        {defs.map((d) => {
          const worn = resolveCompanionPack(d.id, d.spritePack, choices);
          const fallback = resolveCompanionPack(d.id, d.spritePack, {});
          return (
            <label key={d.id} className="companion-pack-wear-row">
              <span className="companion-pack-wear-name">{d.label}</span>
              <Select
                value={choices[d.id] && worn === choices[d.id] ? worn : ''}
                onChange={(e) => setPackChoice(d.id as CompanionTypeId, e.target.value || null)}
              >
                <option value="">
                  {t('settings.companions.packs.default', { name: packName(packs.find((p) => p.id === fallback)) })}
                </option>
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {packName(p)}
                  </option>
                ))}
              </Select>
            </label>
          );
        })}
      </div>

      <TileList className="companion-pack-gallery" aria-label={t('settings.companions.packs.gallery')}>
        {packs.map((p) => (
          <li key={p.id}>
            <Tile
              icon={<PackPreview pack={p} active={p.id === selectedId || p.id === hoverId} />}
              title={packName(p)}
              description={kindLabel(p)}
              selected={p.id === selectedId}
              onClick={() => setSelectedId((id) => (id === p.id ? null : p.id))}
              onMouseEnter={() => setHoverId(p.id)}
              onMouseLeave={() => setHoverId((id) => (id === p.id ? null : id))}
            />
          </li>
        ))}
      </TileList>

      {selected?.kind === 'user' && (
        <div className="companion-pack-actions">
          <Button size="sm" variant="ghost" onClick={() => void rename(selected)}>
            {t('settings.companions.packs.rename')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void remove(selected)}>
            {t('settings.companions.packs.delete')}
          </Button>
        </div>
      )}

      <div className="companion-pack-import">
        <Button variant="primary" disabled={busy} onClick={() => void runImport('file')}>
          {t('settings.companions.packs.import')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void runImport('folder')}>
          {t('settings.companions.packs.importFolder')}
        </Button>
      </div>
      {status && (
        <p className={`companion-pack-status${status.ok ? '' : ' is-error'}`} role="status">
          {status.message}
        </p>
      )}
    </SettingsCard>
  );
}
