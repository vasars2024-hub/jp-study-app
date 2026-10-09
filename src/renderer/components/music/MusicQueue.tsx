/**
 * The play queue as something the listener can arrange: the current track, then what
 * plays after it (`ps.upNext`, the leader's real play order), each upcoming row movable.
 *
 * Moving works three ways, all through `playerBus.moveUpNext`: drag a row, press the
 * row's Move up / Move down buttons, or Alt+ArrowUp / Alt+ArrowDown on a focused row.
 * Each move is announced politely with the row's new position, and focus stays with the
 * row that moved. The current track is never movable, and the bus keeps its place by id,
 * so a reorder never changes what is playing.
 *
 * "Save queue as playlist" names the playlist inline (Electron has no `prompt()`), the
 * way `MusicPlaylistBar` names one; an empty name takes a numbered default.
 */
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import Icon from '../Icons';
import type { MediaItem } from '../../../shared/types';
import { guessSongMeta } from '../../lyrics';
import * as player from '../../playerBus';
import { createPlaylist, PLAYLIST_NAME_MAX } from '../../musicPlaylists';
import { queueKeyboardMove } from '../../../shared/musicQueue';
import { useT } from '../../i18n';
import { fmt, type MusicState } from './MusicContent';
import './musicQueue.css';

export interface MusicQueuePanelProps {
  state: MusicState;
  /** How many rows to show, the current track included. */
  limit?: number;
  /** Class for each row's main button, so a host can draw them as its own rows. */
  rowClassName?: string;
}

interface QueueRow {
  item: MediaItem;
  /** Index into `ps.upNext`, or null for a row that cannot move (the current track). */
  upIndex: number | null;
}

type FocusPart = 'row' | 'up' | 'down';

export function MusicQueuePanel({ state, limit = 20, rowClassName = 'music-queue-track' }: MusicQueuePanelProps) {
  const { t } = useT();
  const { ps } = state;
  const [announcement, setAnnouncement] = useState('');
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const focusAfter = useRef<{ id: string; part: FocusPart } | null>(null);

  const pool = ps.queue.length > 0 ? ps.queue : state.baseSongs;
  const byId = new Map(pool.map((item) => [item.id, item]));
  if (ps.current) byId.set(ps.current.id, ps.current);
  const currentIndex = ps.current ? pool.findIndex((item) => item.id === ps.current?.id) : -1;

  let rows: QueueRow[];
  if (ps.upNext.length > 0) {
    const upcoming = ps.upNext.flatMap((id, upIndex) => {
      const item = byId.get(id);
      return item ? [{ item, upIndex }] : [];
    });
    rows = ps.current ? [{ item: ps.current, upIndex: null }, ...upcoming] : upcoming;
  } else {
    // Nothing published yet (a follower that has not heard from the leader): show the
    // queue's own order, read-only.
    rows = (ps.current && currentIndex >= 0 ? pool.slice(currentIndex) : pool).map((item) => ({ item, upIndex: null }));
  }
  rows = rows.slice(0, limit);
  const upTotal = ps.upNext.length;

  const titleOf = (item: MediaItem): string => (state.metaMap.get(item.id) ?? guessSongMeta(item)).title || item.fileName;
  const artistOf = (item: MediaItem): string =>
    (state.metaMap.get(item.id) ?? guessSongMeta(item)).artist || item.artist || t('mediaCenter.music.unknownArtist');

  // Focus follows the moved row once the bus has re-rendered the list.
  useEffect(() => {
    const want = focusAfter.current;
    const list = listRef.current;
    if (!want || !list) return;
    const row = Array.from(list.querySelectorAll<HTMLElement>('[data-queue-id]')).find(
      (el) => el.dataset.queueId === want.id,
    );
    if (!row) return;
    focusAfter.current = null;
    const preferred = want.part === 'row' ? null : row.querySelector<HTMLButtonElement>(`[data-queue-move="${want.part}"]`);
    const target = preferred && !preferred.disabled ? preferred : row.querySelector<HTMLButtonElement>('[data-queue-play]');
    target?.focus();
  });

  const move = (from: number, to: number, part: FocusPart): void => {
    if (from === to || from < 0 || from >= upTotal || to < 0 || to >= upTotal) return;
    const id = ps.upNext[from];
    const item = byId.get(id);
    player.moveUpNext(from, to);
    focusAfter.current = { id, part };
    setAnnouncement(t('fu1.queue.moved', {
      title: item ? titleOf(item) : id,
      position: to + 1,
      total: upTotal,
    }));
  };

  const step = (from: number, delta: -1 | 1, part: FocusPart): void => {
    const to = queueKeyboardMove(from, delta, upTotal);
    if (to != null) move(from, to, part);
  };

  const onRowKey = (upIndex: number | null) => (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (upIndex == null || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    step(upIndex, e.key === 'ArrowUp' ? -1 : 1, 'row');
  };

  const onDragStart = (upIndex: number) => (e: DragEvent<HTMLLIElement>): void => {
    setDragFrom(upIndex);
    try {
      e.dataTransfer?.setData('text/plain', String(upIndex));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    } catch {
      // Some hosts refuse drag data; the index is held in state anyway.
    }
  };
  const onDragOver = (upIndex: number) => (e: DragEvent<HTMLLIElement>): void => {
    if (dragFrom == null) return;
    e.preventDefault();
    if (dropAt !== upIndex) setDropAt(upIndex);
  };
  const endDrag = (): void => {
    setDragFrom(null);
    setDropAt(null);
  };
  const onDrop = (upIndex: number) => (e: DragEvent<HTMLLIElement>): void => {
    e.preventDefault();
    const from = dragFrom;
    endDrag();
    if (from != null) move(from, upIndex, 'row');
  };

  const saveQueue = (): void => {
    const ids = player.getQueueIds();
    if (ids.length === 0) {
      setAnnouncement(t('fu1.queue.nothingToSave'));
      setNaming(false);
      return;
    }
    const created = createPlaylist(name, t('fu1.queue.defaultName', { n: state.playlists.length + 1 }), ids);
    setNaming(false);
    setName('');
    setAnnouncement(t('fu1.queue.saved', { name: created.name, count: created.trackIds.length }));
  };

  return (
    <div className="music-queue">
      {rows.length > 0 ? (
        <ol className="music-queue-list" ref={listRef} aria-label={t('fu1.queue.listLabel')}>
          {rows.map(({ item, upIndex }) => {
            const active = ps.current?.id === item.id;
            const title = titleOf(item);
            const movable = upIndex != null;
            const classes = [
              'music-queue-item',
              active ? 'is-current' : '',
              movable && dragFrom === upIndex ? 'is-dragging' : '',
              movable && dropAt === upIndex && dragFrom !== upIndex ? 'is-drop-target' : '',
            ].filter(Boolean).join(' ');
            return (
              <li
                key={item.id}
                className={classes}
                data-queue-id={item.id}
                draggable={movable}
                onDragStart={movable ? onDragStart(upIndex) : undefined}
                onDragOver={movable ? onDragOver(upIndex) : undefined}
                onDrop={movable ? onDrop(upIndex) : undefined}
                onDragEnd={movable ? endDrag : undefined}
              >
                <button
                  type="button"
                  className={`${rowClassName}${active ? ' is-active' : ''}`}
                  data-queue-play=""
                  aria-current={active ? 'true' : undefined}
                  aria-keyshortcuts={movable ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
                  onClick={() => void state.play(item)}
                  onKeyDown={onRowKey(upIndex)}
                >
                  <span className="music-queue-index">
                    {upIndex != null
                      ? String(upIndex + 1).padStart(2, '0')
                      : <Icon name={active && ps.playing ? 'volume' : 'music'} size={11} />}
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <small>{artistOf(item)}</small>
                  </div>
                  <span>{item.durationSec ? fmt(item.durationSec) : '—'}</span>
                </button>
                {movable ? (
                  <span className="music-queue-moves lq-hit-scope">
                    <button
                      type="button"
                      className="music-queue-move-btn"
                      data-queue-move="up"
                      aria-label={t('fu1.queue.moveUp', { title })}
                      title={t('fu1.queue.moveUp', { title })}
                      disabled={upIndex === 0}
                      onClick={() => step(upIndex, -1, 'up')}
                    >
                      <Icon name="chevron" size={12} style={{ transform: 'rotate(-90deg)' }} />
                    </button>
                    <button
                      type="button"
                      className="music-queue-move-btn"
                      data-queue-move="down"
                      aria-label={t('fu1.queue.moveDown', { title })}
                      title={t('fu1.queue.moveDown', { title })}
                      disabled={upIndex >= upTotal - 1}
                      onClick={() => step(upIndex, 1, 'down')}
                    >
                      <Icon name="chevron" size={12} style={{ transform: 'rotate(90deg)' }} />
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mc-aside-empty music-queue-empty">
          <Icon name="music" size={22} />
          <p>{t('mediaCenter.music.queueEmpty')}</p>
        </div>
      )}
      {upTotal > 1 ? <p className="music-queue-hint muted">{t('fu1.queue.reorderHint')}</p> : null}
      <div className="music-queue-actions">
        {naming ? (
          <form
            className="music-queue-name"
            onSubmit={(e) => {
              e.preventDefault();
              saveQueue();
            }}
          >
            <input
              autoFocus
              value={name}
              maxLength={PLAYLIST_NAME_MAX}
              aria-label={t('musicUi.playlists.nameLabel')}
              placeholder={t('fu1.queue.defaultName', { n: state.playlists.length + 1 })}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setNaming(false);
                }
              }}
            />
            <button type="submit" className="btn small primary">
              {t('musicUi.playlists.save')}
            </button>
            <button type="button" className="btn small" onClick={() => setNaming(false)}>
              {t('musicUi.playlists.cancel')}
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="btn small"
            disabled={rows.length === 0}
            onClick={() => {
              setName('');
              setNaming(true);
            }}
          >
            <Icon name="plus" size={12} /> {t('fu1.queue.saveAsPlaylist')}
          </button>
        )}
        {state.queueArranged && !naming ? (
          <button type="button" className="btn small" onClick={state.restoreListOrder}>
            {t('fu1.queue.useListOrder')}
          </button>
        ) : null}
      </div>
      <p className="music-queue-note muted" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
