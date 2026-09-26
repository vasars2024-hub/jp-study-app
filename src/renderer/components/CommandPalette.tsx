// Global command palette / search overlay (the `nav.palette` / `nav.search`
// commands — their chords are user-rebindable, so none is named here).
//
// Searches commands, app sections, widgets, settings, and (in search mode)
// saved words, deck flashcards and grammar points. Opens via the 'palette:open'
// CustomEvent fired by the shortcut manager; mounted once in App.tsx so it
// works on the desktop, in pop-outs and inside the reader.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon, { type IconName } from './Icons';
import { useModalKeyboard } from './ui/useModalKeyboard';
import {
  COMMAND_CATALOG,
  commandIsLive,
  effectiveKeys,
  formatKeysDisplay,
  runCommand,
} from '../keyboardShortcuts';
import { WIDGETS } from '../widgets/registry';
import {
  mediaWorkspaceHostIsMounted,
  readContinueWatching,
} from '../continueWatchingStore';
import {
  continueWatchingResumeSec,
  formatContinueWatchingPosition,
} from '../../shared/seanimeContinueWatching';
import { MEDIA_WORKSPACE_OPEN_EVENT } from '../../shared/mediaWorkspace';
import { loadSaved } from '../savedWords';
import { loadDeck } from '../flashcardDeck';
import { loadSettingsAdvanced } from '../settingsAdvanced';
import { loadThemeId } from '../theme/engine';
import { hasDiscoveredAero } from '../aeroDiscovery';
import { hasDiscoveredWired } from '../wiredDiscovery';
import { useT } from '../i18n';
import { commandCategory, commandLabel } from '../commandI18n';
import { scoreLabelledItem } from '../fuzzySearch';

type PaletteMode = 'commands' | 'search' | 'toolbox';

interface Item {
  key: string;
  label: string;
  sub?: string;
  group: string;
  glyph: IconName;
  keys?: string;
  /**
   * Extra match text that is scored but never shown. Settings entries carry
   * English keyword lists so a JA/ZH/RU user can still find a setting by its
   * English feature name — the same reason `SettingsRegistryEntry.keywords`
   * exists — and printing them in the row would be noise.
   */
  terms?: string;
  /**
   * Offered only once something is typed. Settings rows ride along in commands
   * mode so a keyboard user who opens the palette and types "backup" or
   * "subtitle style" finds the setting (round-2 J9), but the EMPTY list stays
   * the command catalog it is for — 160 settings cards would bury it.
   */
  typedOnly?: boolean;
  run: () => void;
}

/** A grammar entry before its group label is applied at merge time — see the
 * `items` memo below. Kept apart from `Item` so a language switch retranslates
 * the group even though grammar data (loaded once, lazily) never reloads. */
type UngroupedItem = Omit<Item, 'group'>;

/**
 * One settings card the palette can route to, kept as catalog KEYS rather than
 * as a built `Item`. The registry table is imported once and never re-imported,
 * but its titles are chrome and must retranslate on a language switch, so the
 * t() calls happen in the `items` memo (which depends on `lang`) instead of
 * here. `terms` is the entry's English keyword list, matched but not shown.
 */
interface SettingsRow {
  id: string;
  titleKey: string;
  descKey?: string;
  pageId: string;
  pageLabelKey: string;
  terms: string;
}

/** Section id → glyph and i18n key. Built once; labels resolve through t() at
 * render/merge time so a language switch relabels without reloading data.
 * `terms` / `termsKey` are matched but never shown — see `Item.terms`. */
const SECTIONS: { id: string; labelKey: string; glyph: IconName; terms?: string; termsKey?: string }[] = [
  // One "Watch" entry, as in Start. `video` is no longer listed: it opened the same
  // Media Center on another tab, so "Media" and "Video" were two rows for one app.
  // The old names stay findable through the terms: English always, plus the UI
  // language's own words from the catalog. 動画 is in the fixed list too — this
  // is a Japanese study app, so a learner may type it whatever the UI language.
  {
    id: 'player',
    labelKey: 'palette.section.watch',
    glyph: 'video',
    terms: 'watch video media player 動画',
    termsKey: 'palette.section.watchTerms',
  },
  { id: 'youtube', labelKey: 'palette.section.youtube', glyph: 'player' },
  { id: 'music', labelKey: 'palette.section.music', glyph: 'music' },
  // The visualizer had a window but no way in except through the Music widget.
  { id: 'visualizer', labelKey: 'palette.section.visualizer', glyph: 'chart-bar' },
  { id: 'dictionary', labelKey: 'palette.section.dictionary', glyph: 'dictionary' },
  { id: 'library', labelKey: 'palette.section.library', glyph: 'library' },
  { id: 'novels', labelKey: 'palette.section.novels', glyph: 'novels' },
  { id: 'reading', labelKey: 'palette.section.reading', glyph: 'search' },
  { id: 'translate', labelKey: 'palette.section.translate', glyph: 'translate' },
  { id: 'grammar', labelKey: 'palette.section.grammar', glyph: 'grammar' },
  { id: 'anki', labelKey: 'palette.section.anki', glyph: 'anki' },
  { id: 'flashcards', labelKey: 'palette.section.flashcards', glyph: 'flashcards' },
  { id: 'games', labelKey: 'palette.section.games', glyph: 'dice' },
  { id: 'stats', labelKey: 'palette.section.stats', glyph: 'stats' },
  { id: 'calendar', labelKey: 'palette.section.calendar', glyph: 'calendar' },
  { id: 'resources', labelKey: 'palette.section.resources', glyph: 'resources' },
  { id: 'settings', labelKey: 'palette.section.settings', glyph: 'settings' },
  { id: 'immersion', labelKey: 'palette.section.immersion', glyph: 'globe' },
  { id: 'scraper', labelKey: 'palette.section.scraper', glyph: 'sparkle' },
  { id: 'city', labelKey: 'palette.section.city', glyph: 'city' },
  { id: 'files', labelKey: 'palette.section.files', glyph: 'folder' },
  { id: 'visualnovels', labelKey: 'palette.section.visualnovels', glyph: 'visual-novel', termsKey: 'vnApp.paletteTerms' },
];

function openSection(id: string): void {
  window.dispatchEvent(new CustomEvent('os:open', { detail: id }));
}

/**
 * Open Settings *at* a card rather than at the front of the app. `SettingsApp`
 * already listens for `settings:navigate` (the companion menu, the extension
 * bridge and Media Center all route this way); the short delay is what those
 * callers use too, so the listener exists by the time the event fires.
 *
 * A `page-*` entry IS the page, so it carries no highlight target — the same
 * distinction `SettingsSearch.pick` makes.
 */
function openSettingsAt(page: string, settingId?: string): void {
  openSection('settings');
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page, settingId } }));
  }, 80);
}

export default function CommandPalette() {
  // `t`'s identity never changes across renders (see renderer/i18n.ts), so a
  // memo that wants to retranslate on a language switch must depend on `lang`,
  // not `t` — `t` alone would let the memo go stale until something else
  // invalidates it.
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>('commands');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [grammarItems, setGrammarItems] = useState<UngroupedItem[]>([]);
  const [settingsRows, setSettingsRows] = useState<SettingsRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Open/close via the shortcut manager's events.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      const m = (detail === 'search' || detail === 'toolbox' ? detail : 'commands') as PaletteMode;
      setMode(m);
      setQuery('');
      setSel(0);
      setOpen(true);
    };
    window.addEventListener('palette:open', onOpen);
    return () => window.removeEventListener('palette:open', onOpen);
  }, []);

  /*
   * `.palette-backdrop` is `position: fixed`, `inset: 0`, `rgba(0, 0, 0, 0.4)`
   * at z 20000 with `pointer-events: auto` — modal to the mouse. Until
   * 2026-09-08 it was not modal to the keyboard (row D412): measured live on the
   * user's own desk, ONE Shift+Tab out of the input landed on the taskbar's
   * "Show desktop (minimize all)", and from there Escape stopped closing the
   * palette, because Escape lived on the input's own onKeyDown. A keyboard user
   * who tabbed once was left with a scrim they could not dismiss and Enter over
   * a control that minimises every window.
   *
   * The hook also owns the initial focus now, which is why the old
   * `inputRef.current?.focus()` effect is gone rather than duplicated. It sits
   * here, above `close`, so an inline arrow rather than that callback — the
   * hook holds `onEscape` in a ref precisely so call sites can pass one.
   */
  useModalKeyboard({
    panelRef,
    onEscape: () => close(),
    enabled: open,
    initialFocusRef: inputRef,
  });

  useLayoutEffect(() => {
    if (!open) return undefined;
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body
      ? active
      : null;

    return () => {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open]);

  // Grammar is a large data module — pull it in only when search mode opens.
  useEffect(() => {
    if (!open || mode !== 'search' || grammarItems.length) return;
    let dead = false;
    import('../data/grammar')
      .then(({ GRAMMAR }) => {
        if (dead) return;
        setGrammarItems(
          GRAMMAR.map((g) => ({
            key: `gr-${g.id}`,
            label: g.title,
            sub: `${g.level} · ${g.meaning}`,
            glyph: 'grammar' as IconName,
            run: () => openSection('grammar'),
          })),
        );
      })
      .catch(() => {
        /* grammar data failed to load — search just omits that group */
      });
    return () => {
      dead = true;
    };
  }, [open, mode, grammarItems.length]);

  // Settings cards (search mode, and commands mode once typed — see
  // `Item.typedOnly`). Same lazy treatment as grammar and for the same reason —
  // `settingsRegistry` is a 1,700-line data table and the palette is mounted on
  // every surface, so pulling it in eagerly would put it on the boot path.
  //
  // The visibility gates are read here, at open time, from the same sources
  // `SettingsSearch` subscribes to. The palette is transient (open, type, pick,
  // gone), so a subscription would only cover a theme change made while it is
  // open; a stale read is re-taken the next time it opens.
  useEffect(() => {
    if (!open || mode === 'toolbox' || settingsRows.length) return undefined;
    let dead = false;
    const visibility = {
      advanced:
        typeof document !== 'undefined'
        && document.documentElement.classList.contains('settings-advanced')
          ? true
          : loadSettingsAdvanced(),
      themeId: loadThemeId(),
      discovered: { aero: hasDiscoveredAero(), wired: hasDiscoveredWired() },
    };
    import('./settings/settingsRegistry')
      .then(({ SETTINGS_REGISTRY, SETTINGS_NAV, settingsEntryRenders }) => {
        if (dead) return;
        const rows: SettingsRow[] = [];
        for (const e of SETTINGS_REGISTRY) {
          if (!settingsEntryRenders(e, visibility)) continue;
          // A card that MOVED to the Files app (gate 8 — backup, factory reset,
          // storage usage) has no Settings page any more, and was dropped here
          // for it: "backup" found no settings row at all. Its historical
          // `pageId` still routes — `SettingsApp.navigate` forwards it to the
          // Files app with the card id — so only the label needs its new home.
          const page = SETTINGS_NAV.find((p) => p.id === e.pageId);
          const pageLabelKey = e.movedTo === 'files' ? 'palette.section.files' : page?.labelKey;
          if (!pageLabelKey) continue;
          rows.push({
            id: e.id,
            titleKey: e.titleKey,
            descKey: e.descKey,
            pageId: e.pageId,
            pageLabelKey,
            terms: e.keywords.join(' '),
          });
        }
        setSettingsRows(rows);
      })
      .catch(() => {
        /* registry failed to load — search just omits that group */
      });
    return () => {
      dead = true;
    };
  }, [open, mode, settingsRows.length]);

  // Blur first: unmounting with the search box focused leaves that detached
  // input as React's tracked active element, and through its fiber the closed
  // palette's state — every flashcard row included — until focus moves.
  const close = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && panelRef.current?.contains(active)) active.blur();
    setOpen(false);
  }, []);

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const out: Item[] = [];

    // Command labels resolve via commands.{id} keys; categories via commands.category.*.
    for (const c of COMMAND_CATALOG) {
      if (mode === 'toolbox' && c.category !== 'Toolbox') continue;
      const category = commandCategory(c.category, t);
      out.push({
        key: `cmd-${c.id}`,
        label: commandLabel(c.id, c.label, t),
        sub: commandIsLive(c.id) ? category : t('palette.needsView', { category }),
        group: t('palette.group.commands'),
        glyph: 'command',
        keys: formatKeysDisplay(effectiveKeys(c.id)) || undefined,
        run: () => void runCommand(c.id),
      });
    }
    if (mode !== 'toolbox') {
      for (const s of SECTIONS) {
        out.push({
          key: `sec-${s.id}`,
          label: t(s.labelKey),
          sub: t('palette.openApp'),
          group: t('palette.group.pages'),
          glyph: s.glyph,
          ...(s.terms || s.termsKey
            ? { terms: `${s.terms ?? ''} ${s.termsKey ? t(s.termsKey) : ''}` }
            : {}),
          run: () => openSection(s.id),
        });
      }
      for (const w of WIDGETS) {
        out.push({
          key: `wgt-${w.type}`,
          label: t(w.titleKey),
          sub: t('palette.addWidget', { category: t(`widgets.category.${w.category}`) }),
          group: t('palette.group.widgets'),
          glyph: 'app',
          run: () => window.dispatchEvent(new CustomEvent('os:add-widget', { detail: w.type })),
        });
      }
    }
    if (mode === 'search') {
      // Phase 6 slice 7. Type part of a title, press Enter, and the file reopens at the
      // second you stopped — the same handoff the Continue Watching widget makes, from a
      // surface that costs no screen space. Only offered while `MediaWorkspaceHost` is
      // actually mounted: with the sidecar flag off nothing listens for the event and this
      // would be a command that silently does nothing. Synchronous by necessity — the
      // palette builds its list in the tick it opens, so no `seanimeStatus()` await here.
      if (mediaWorkspaceHostIsMounted()) {
        const resumeGroup = t('palette.group.continueWatching');
        for (const entry of readContinueWatching().slice(0, 40)) {
          out.push({
            key: `cw-${entry.pathKey}`,
            // Study content: the media title, shown verbatim.
            label: entry.title,
            sub: t('palette.continueWatchingAt', {
              time: formatContinueWatchingPosition(entry.positionSec),
            }),
            group: resumeGroup,
            glyph: 'player',
            run: () => window.dispatchEvent(new CustomEvent(MEDIA_WORKSPACE_OPEN_EVENT, {
              detail: {
                localFilePath: entry.localFilePath,
                startAtSec: continueWatchingResumeSec(entry),
              },
            })),
          });
        }
      }
      for (const w of loadSaved().slice(0, 400)) {
        out.push({
          key: `sw-${w.word}`,
          label: w.word,
          sub: `${w.reading ? `${w.reading} · ` : ''}${w.meaning}`.slice(0, 80),
          group: t('palette.group.savedWords'),
          glyph: 'dictionary',
          run: () => openSection('dictionary'),
        });
      }
      // Every card, not the first 400: a word mined last year is as findable as
      // one mined today. `loadDeck` is the cached parse now, and the labels are
      // resolved once per book rather than once per card.
      const flashGroup = t('palette.group.flashcards');
      const plainCard = t('palette.flashcard');
      const bookSubs = new Map<string, string>();
      const openFlashcards = (): void => openSection('flashcards');
      for (const c of loadDeck()) {
        let sub = plainCard;
        if (c.bookTitle) {
          sub = bookSubs.get(c.bookTitle) ?? t('palette.flashcardBook', { book: c.bookTitle });
          bookSubs.set(c.bookTitle, sub);
        }
        out.push({
          key: `fc-${c.id}`,
          label: c.word,
          sub,
          group: flashGroup,
          glyph: 'flashcards',
          run: openFlashcards,
        });
      }
      const grammarGroup = t('palette.group.grammar');
      out.push(...grammarItems.map((gi) => ({ ...gi, group: grammarGroup })));
    }
    if (mode !== 'toolbox') {
      // L10 bullet 3. A secondary or expert action that L8 moved behind a
      // disclosure is reachable from Settings' own search box and, before this,
      // from nowhere else — so the one surface a keyboard user reaches first
      // could not offer it. Each row lands on the card, not on the front of
      // Settings; the gates above keep out entries whose card does not render,
      // which is the misroute the registry exists to prevent.
      //
      // Round-2 J9: commands mode offers them too, once something is typed. The
      // palette's default chord opens commands mode, and "the palette finds no
      // settings" was that mode's answer to "backup" and "subtitle style".
      const settingsGroup = t('palette.group.settings');
      for (const s of settingsRows) {
        out.push({
          key: `set-${s.id}`,
          label: t(s.titleKey),
          sub: t('palette.settingIn', { page: t(s.pageLabelKey) }),
          group: settingsGroup,
          glyph: 'settings',
          terms: `${s.terms} ${s.descKey ? t(s.descKey) : ''}`,
          typedOnly: mode === 'commands',
          run: () => openSettingsAt(s.pageId, s.id.startsWith('page-') ? undefined : s.id),
        });
      }
    }
    return out;
    // `t` is intentionally left out of the deps: its identity is stable (see
    // the comment above), `lang` is what actually needs to trigger a redo.
  }, [open, mode, grammarItems, settingsRows, lang]);

  const results = useMemo(() => {
    const q = query.trim();
    const scored: { item: Item; score: number }[] = [];
    for (const item of items) {
      if (!q && item.typedOnly) continue;
      const s = q ? scoreLabelledItem(q, item) : 0;
      if (s != null) scored.push({ item, score: s });
    }
    // Stable: equal scores keep catalog order (commands, pages, widgets, …).
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 40).map((s) => s.item);
  }, [items, query]);

  useEffect(() => {
    setSel(0);
  }, [query]);

  const pick = useCallback(
    (item: Item) => {
      close();
      // Run after the overlay unmounts so focus lands where the action expects.
      window.setTimeout(() => item.run(), 0);
    },
    [close],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[sel];
      if (item) pick(item);
    }
  };

  // Keep the selected row visible while arrowing through the list.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  const placeholder = mode === 'search'
    ? t('palette.searchPlaceholder')
    : mode === 'toolbox'
      ? t('palette.toolboxPlaceholder')
      : t('palette.commandPlaceholder');

  return (
    <>
      <div className="palette-backdrop" onMouseDown={close} />
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={panelRef}
        aria-label={t('palette.ariaLabel')}
      >
        <div className="palette-head">
          <Icon name={mode === 'search' ? 'search' : 'command'} size={16} />
          {/* K10: an ARIA 1.2 combobox. Focus never leaves the input, so the
              highlighted row is announced through `aria-activedescendant`
              rather than by moving focus into the list. */}
          <input
            ref={inputRef}
            className="palette-input"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[sel] ? `${listId}-opt-${sel}` : undefined}
            aria-label={placeholder}
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="palette-hint muted">{t('palette.escHint')}</span>
        </div>
        <ul ref={listRef} id={listId} className="palette-list" role="listbox" aria-label={placeholder}>
          {/* An empty state has to say what was searched and how to get out of it. "No matches."
              said neither, and at 11 characters it did not even clear the honest-states message
              bar — the palette is the entry point a keyboard user reaches, so it is the one
              surface where a dead end with no way back is worst. The query is echoed so a typo
              is visible, and Esc is named because the backdrop click is the only other exit. */}
          {results.length === 0 && (
            <li className="palette-empty muted" role="presentation">
              {query.trim()
                ? t('palette.noMatchesFor', { query: query.trim() })
                : t('palette.noMatches')}
            </li>
          )}
          {/* The row IS the option: a <button> inside an option would be a
              second, separately focusable control that the listbox pattern
              forbids. `mousedown` is prevented so a click never pulls focus
              out of the input. */}
          {results.map((r, i) => (
            <li
              key={r.key}
              id={`${listId}-opt-${i}`}
              data-idx={i}
              role="option"
              aria-selected={i === sel}
              className={`palette-row ${i === sel ? 'active' : ''}`}
              onMouseEnter={() => setSel(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
            >
              <span className="palette-ic" aria-hidden="true">
                <Icon name={r.glyph} size={15} />
              </span>
              <span className="palette-label">{r.label}</span>
              {r.sub && <span className="palette-sub muted">{r.sub}</span>}
              <span className="palette-right">
                {r.keys && <kbd className="palette-kbd">{r.keys}</kbd>}
                <span className="palette-group">{r.group}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
