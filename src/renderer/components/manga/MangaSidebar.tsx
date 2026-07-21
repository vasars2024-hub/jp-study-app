import { useMemo, useRef, useState } from 'react';
import type { MokuroBlock, MokuroPage } from '../../../shared/mokuroTypes';
import { blockContext } from '../../../shared/mokuroTypes';
import { useT } from '../../i18n';

interface Props {
  page: MokuroPage;
  showSfx: boolean;
  activeRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
  onReorder: (regionIds: string[]) => void;
}

function orientationIcon(vertical: boolean): string {
  return vertical ? '縦' : '横';
}

export default function MangaSidebar({ page, showSfx, activeRegionId, onSelectRegion, onReorder }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const dragIndex = useRef<number | null>(null);

  const rows = useMemo(
    () => page.blocks.filter((b) => showSfx || b.kind !== 'sfx'),
    [page.blocks, showSfx],
  );
  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const needle = query.trim().toLowerCase();
    return rows.filter((b) => blockContext(b).toLowerCase().includes(needle));
  }, [rows, query]);

  function copyAll() {
    const text = rows.map((b) => blockContext(b)).filter(Boolean).join('\n\n');
    void navigator.clipboard.writeText(text);
  }

  function exportTxt() {
    const text = rows.map((b) => blockContext(b)).filter(Boolean).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'page-text.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDrop(targetIndex: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from == null || from === targetIndex) return;
    const ids = rows.map((b) => b.regionId).filter((id): id is string => !!id);
    const [moved] = ids.splice(from, 1);
    ids.splice(targetIndex, 0, moved);
    onReorder(ids);
  }

  return (
    <div className="manga-sidebar">
      <div className="manga-sidebar-tools">
        <input
          className="manga-sidebar-search"
          type="search"
          placeholder={t('manga.sidebar.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn small" onClick={copyAll} title={t('manga.sidebar.copyAll')}>
          {t('manga.sidebar.copy')}
        </button>
        <button className="btn small" onClick={exportTxt} title={t('manga.sidebar.exportTxt')}>
          {t('manga.sidebar.export')}
        </button>
      </div>
      <ul className="manga-sidebar-list">
        {filtered.length === 0 && <li className="muted manga-sidebar-empty">{t('manga.sidebar.empty')}</li>}
        {filtered.map((block: MokuroBlock, i) => {
          const text = blockContext(block) || '—';
          const id = block.regionId ?? `row-${i}`;
          const naturalIndex = rows.indexOf(block);
          return (
            <li
              key={id}
              className={`manga-sidebar-row${activeRegionId === id ? ' active' : ''}${block.kind === 'ignore' ? ' ignored' : ''}`}
              draggable
              onClick={() => onSelectRegion(id)}
              onDragStart={() => {
                dragIndex.current = naturalIndex;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(naturalIndex)}
            >
              <span className="manga-sidebar-handle" aria-hidden="true">
                ⠿
              </span>
              <span className="manga-sidebar-badges">
                <span className="manga-sidebar-badge" title={t('manga.regionEditor.confidence')}>
                  {Math.round((block.confidence ?? 0) * 100)}%
                </span>
                <span className="manga-sidebar-badge">{orientationIcon(block.vertical)}</span>
                {block.kind && block.kind !== 'text' && (
                  <span className="manga-sidebar-badge manga-sidebar-badge-kind">
                    {t(`manga.regionEditor.kind.${block.kind}`)}
                  </span>
                )}
              </span>
              <span className="manga-sidebar-text" lang="ja">
                {text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
