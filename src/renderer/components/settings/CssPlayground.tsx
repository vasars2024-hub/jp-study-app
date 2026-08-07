/**
 * CssPlayground — v1.0 audit §2.3.
 * -----------------------------------------------------------------------------
 * "A Playground window for CSS with a live demonstration area to see changes before
 * applying." The Custom CSS card had an editor and an Apply button and nothing between
 * them: the only way to find out what a rule did was to do it to the whole app.
 *
 * So the draft here is genuinely a draft. It is held in component state, rendered into
 * an isolated `PreviewStage`, and reaches `localStorage` and the live document only when
 * Apply is pressed. Closing without applying leaves the app exactly as it was.
 *
 * The verdict line runs the **same** `reviewCustomCss` the Apply path runs, on every
 * keystroke, so a rule that will be refused says so while you are writing it rather than
 * after you commit it.
 */

import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { sanitizeUserCss } from '../../customCss';
import PreviewStage from './PreviewStage';

export interface CssPlaygroundProps {
  open: boolean;
  /** The CSS the editor starts from — normally whatever the sandbox holds now. */
  initialCss: string;
  onClose: () => void;
  /** Commit: the caller owns persistence, so the playground stays a pure editor. */
  onApply: (css: string) => void;
}

interface Snippet {
  labelKey: string;
  css: string;
}

/**
 * Starter rules. Every one targets something the stage actually shows, because a snippet
 * whose effect is invisible here teaches the opposite of what a playground is for. The
 * first is deliberately a design-token override: it is the case that used to silently do
 * nothing (§2.2), so it is the case worth demonstrating.
 */
const SNIPPETS: Snippet[] = [
  { labelKey: 'settings.playground.snippet.accent', css: ':root {\n  --accent: #7c5cff;\n  --accent-2: #b06cff;\n}\n' },
  { labelKey: 'settings.playground.snippet.corners', css: ':root {\n  --radius-md: 2px;\n  --radius-lg: 2px;\n  --control-radius: 2px;\n}\n' },
  { labelKey: 'settings.playground.snippet.titlebar', css: '.fwin-bar {\n  background: linear-gradient(90deg, #1b2735, #2b1b35);\n  letter-spacing: 0.08em;\n}\n' },
  { labelKey: 'settings.playground.snippet.taskbar', css: '.os-taskbar {\n  border-top: 2px solid var(--accent);\n}\n' },
  { labelKey: 'settings.playground.snippet.density', css: ':root {\n  --space-md: 20px;\n  --font-size-md: 15px;\n}\n' },
];

export default function CssPlayground({ open, initialCss, onClose, onApply }: CssPlaygroundProps) {
  const { t } = useT();
  const [draft, setDraft] = useState(initialCss);
  const [promoted, setPromoted] = useState(0);

  // Reopening starts from what the sandbox holds now, not from the last session's draft.
  useEffect(() => {
    if (open) setDraft(initialCss);
  }, [open, initialCss]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const review = useMemo(() => sanitizeUserCss(draft), [draft]);
  // A refused draft is still shown in the stage. Seeing the rule you cannot keep is the
  // fastest way to understand what the sanitizer objected to.
  const blocked = !review.ok;

  if (!open) return null;

  return (
    <div className="ui-overlay anim-fade" onMouseDown={onClose}>
      <div
        className="os-css-playground anim-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.playground.title')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="os-css-playground-head">
          <div>
            <h2 className="os-css-playground-title">{t('settings.playground.title')}</h2>
            <p className="muted os-css-playground-sub">{t('settings.playground.subtitle')}</p>
          </div>
          <button type="button" className="fwin-b fwin-close" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </header>

        <div className="os-css-playground-split">
          <div className="os-css-playground-editor">
            <div className="os-css-playground-snippets">
              {SNIPPETS.map((s) => (
                <button
                  key={s.labelKey}
                  type="button"
                  className="btn small"
                  onClick={() => setDraft((d) => (d.trim() ? `${d.replace(/\s*$/, '')}\n\n${s.css}` : s.css))}
                >
                  {t(s.labelKey)}
                </button>
              ))}
            </div>
            <textarea
              className="os-user-css os-css-playground-text"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={'.os-taskbar {\n  /* your rules */\n}'}
            />
            <p className={blocked ? 'os-css-playground-verdict is-blocked' : 'muted os-css-playground-verdict'}>
              {blocked
                ? review.error
                : promoted
                  // Deliberately NOT the Apply path's `…css.appliedPromoted`: nothing has
                  // been applied yet, and a draft that claims it has is the same silent
                  // lie §2.2 was about, pointed the other way.
                  ? t('settings.playground.promoted', { count: promoted })
                  : t('settings.playground.ok')}
            </p>
          </div>

          <div className="os-css-playground-preview">
            <span className="os-css-playground-label muted">{t('settings.playground.live')}</span>
            <PreviewStage css={draft} onPromoted={setPromoted} />
          </div>
        </div>

        <footer className="os-css-playground-foot">
          <span className="muted os-css-playground-hint">{t('settings.playground.hint')}</span>
          <div className="os-set-btns">
            <button type="button" className="btn small" onClick={() => setDraft('')}>
              {t('settings.playground.clearDraft')}
            </button>
            <button type="button" className="btn small" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn small primary"
              disabled={blocked}
              onClick={() => {
                onApply(draft);
                onClose();
              }}
            >
              {t('settings.playground.apply')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
