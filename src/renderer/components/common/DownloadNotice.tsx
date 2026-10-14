// The one-time notice shown before a feature first downloads something from
// other people: torrents (the Scraper's index search and qBittorrent sends) and
// YouTube downloads.
//
// Shared so the two cannot drift apart in tone or in how they remember the
// answer. It is a notice, not a gate the user has to argue with: it says what
// is true (who can see your IP, whose rules apply), once, and "Not now" simply
// leaves the action undone. The acknowledgement is per kind and permanent; it
// is stored through the guarded writer so a full store is reported, not
// silently forgotten (which would show the notice again on every use).
//
// Public API, for the Scraper today and the YouTube downloader next (W5-A):
//
//   const notice = useDownloadNoticeGate('youtube');
//   ...
//   <button onClick={() => notice.gate(startDownload)}>
//   {notice.element}
//
// `gate(action)` runs `action` at once when the notice was already
// acknowledged, and otherwise shows the notice and runs it after "I understand".
// `isDownloadNoticeAcknowledged(kind)` answers without rendering anything.
//
// Strings are their own lazy pack (shared/i18n/downloadNotice): English is
// bundled as the fallback, the other three load on first show.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog } from '../ui';
import { useT } from '../../i18n';
import { translate, type Catalog, type UiLang } from '../../../shared/i18n/core';
import { DOWNLOAD_NOTICE_EN } from '../../../shared/i18n/downloadNotice/en';
import { writeLocalStorageJson } from '../../localStorageWrite';

export type DownloadNoticeKind = 'torrent' | 'youtube';

/** The kinds in display order; every one has a title and its own lines. */
export const DOWNLOAD_NOTICE_KINDS: readonly DownloadNoticeKind[] = ['torrent', 'youtube'];

export const DOWNLOAD_NOTICE_STORAGE_KEY = 'gum-download-notice-v1';

type AckRecord = Partial<Record<DownloadNoticeKind, string>>;

function readAcks(): AckRecord {
  try {
    const raw = localStorage.getItem(DOWNLOAD_NOTICE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: AckRecord = {};
    for (const kind of DOWNLOAD_NOTICE_KINDS) {
      const at = (parsed as Record<string, unknown>)[kind];
      if (typeof at === 'string' && at) out[kind] = at;
    }
    return out;
  } catch {
    return {};
  }
}

/** Whether the notice for `kind` was acknowledged on this install. */
export function isDownloadNoticeAcknowledged(kind: DownloadNoticeKind): boolean {
  return Boolean(readAcks()[kind]);
}

/**
 * Record that the notice for `kind` was read and accepted. Returns false when
 * the store refused the write; the guarded writer has already told the user.
 */
export function acknowledgeDownloadNotice(kind: DownloadNoticeKind, now: Date = new Date()): boolean {
  return writeLocalStorageJson(DOWNLOAD_NOTICE_STORAGE_KEY, { ...readAcks(), [kind]: now.toISOString() });
}

// ---------------------------------------------------------------- strings ---

const packs = new Map<UiLang, Catalog>([['en', DOWNLOAD_NOTICE_EN]]);

function importPack(lang: UiLang): Promise<Catalog> {
  // Literal paths, so the bundler emits one chunk per language.
  switch (lang) {
    case 'ja':
      return import('../../../shared/i18n/downloadNotice/ja').then((m) => m.DOWNLOAD_NOTICE_JA);
    case 'zh':
      return import('../../../shared/i18n/downloadNotice/zh').then((m) => m.DOWNLOAD_NOTICE_ZH);
    case 'ru':
      return import('../../../shared/i18n/downloadNotice/ru').then((m) => m.DOWNLOAD_NOTICE_RU);
    default:
      return Promise.resolve(DOWNLOAD_NOTICE_EN);
  }
}

/** Load the notice's strings for `lang`. Never rejects: a failed chunk leaves English. */
export function loadDownloadNoticeStrings(lang: UiLang): Promise<void> {
  if (packs.has(lang)) return Promise.resolve();
  return importPack(lang).then(
    (pack) => {
      packs.set(lang, pack);
    },
    () => undefined,
  );
}

/** One of the notice's strings in `lang`, English until that language has loaded. */
export function downloadNoticeText(key: string, lang: UiLang): string {
  return translate(key, undefined, { lang, catalog: packs.get(lang) ?? DOWNLOAD_NOTICE_EN, fallback: DOWNLOAD_NOTICE_EN });
}

/** The body lines of each kind, in reading order. */
const LINES: Record<DownloadNoticeKind, readonly string[]> = {
  torrent: ['downloadNotice.torrent.ip', 'downloadNotice.torrent.legal', 'downloadNotice.torrent.scope'],
  youtube: ['downloadNotice.youtube.terms', 'downloadNotice.youtube.copyright'],
};

const TITLE: Record<DownloadNoticeKind, string> = {
  torrent: 'downloadNotice.torrent.title',
  youtube: 'downloadNotice.youtube.title',
};

// -------------------------------------------------------------- component ---

export default function DownloadNotice({
  kind,
  open,
  onAcknowledge,
  onCancel,
}: {
  kind: DownloadNoticeKind;
  open: boolean;
  /** Called after the acknowledgement is stored. */
  onAcknowledge: () => void;
  onCancel: () => void;
}) {
  const { lang } = useT();
  const [, setLoaded] = useState(0);
  const acknowledgeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || packs.has(lang)) return undefined;
    let alive = true;
    void loadDownloadNoticeStrings(lang).then(() => {
      if (alive) setLoaded((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [open, lang]);

  // The dialog focuses its panel; the one thing to do here is the primary
  // button, so it takes focus once the panel has it.
  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => acknowledgeRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const text = (key: string) => downloadNoticeText(key, lang);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={text(TITLE[kind])}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {text('downloadNotice.cancel')}
          </Button>
          <Button
            ref={acknowledgeRef}
            variant="primary"
            data-download-notice-ack={kind}
            onClick={() => {
              acknowledgeDownloadNotice(kind);
              onAcknowledge();
            }}
          >
            {text('downloadNotice.acknowledge')}
          </Button>
        </>
      }
    >
      <div data-download-notice={kind}>
        {LINES[kind].map((key) => (
          <p key={key}>{text(key)}</p>
        ))}
        <p><small>{text('downloadNotice.once')}</small></p>
      </div>
    </Dialog>
  );
}

/**
 * The notice as a gate in front of an action. See the file header for usage.
 * `element` must be rendered for the notice to appear; it is null while closed.
 */
export function useDownloadNoticeGate(kind: DownloadNoticeKind): {
  gate: (action: () => void) => void;
  element: ReactNode;
  /** True while the notice is on screen, waiting for an answer. */
  pending: boolean;
} {
  const [open, setOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

  const gate = useCallback((action: () => void) => {
    if (isDownloadNoticeAcknowledged(kind)) {
      action();
      return;
    }
    pendingAction.current = action;
    setOpen(true);
  }, [kind]);

  const acknowledge = useCallback(() => {
    const action = pendingAction.current;
    pendingAction.current = null;
    setOpen(false);
    action?.();
  }, []);

  const cancel = useCallback(() => {
    pendingAction.current = null;
    setOpen(false);
  }, []);

  const element = open
    ? <DownloadNotice kind={kind} open onAcknowledge={acknowledge} onCancel={cancel} />
    : null;
  return { gate, element, pending: open };
}
