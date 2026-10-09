/**
 * dialogService — promise-based replacement for native confirm(). Phase 4 · M2.
 * -----------------------------------------------------------------------------
 * `confirmDialog(opts)` renders an accessible ui/Dialog (focus trap, Escape,
 * labelled) into its own detached React root on document.body and resolves
 * true/false. Self-mounting means no <DialogHost> needs wiring into App.tsx —
 * it works identically in the desktop shell, pop-outs, reader takeover, focus
 * and mini shells.
 *
 * Conventions (APPLICATION_CHROME_AND_DIALOGS.md): Escape/backdrop = cancel,
 * Enter = default action, the default button is pre-focused — Cancel when the
 * action is destructive (`danger`), Confirm otherwise.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { t } from '../../i18n';

export interface ConfirmOptions {
  message: ReactNode;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive action: red confirm button, Cancel gets initial focus. */
  danger?: boolean;
}

function ConfirmDialog({ opts, onDone }: { opts: ConfirmOptions; onDone: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Runs after Dialog's own panel-focus effect (child effects fire first), so
  // the default button wins.
  useEffect(() => {
    (opts.danger ? cancelRef : confirmRef).current?.focus();
  }, [opts.danger]);

  // Native button activation honors the focused choice. A window-level Enter
  // handler confirmed even when Cancel held focus, defeating the danger default.

  return (
    <Dialog
      open
      onClose={() => onDone(false)}
      title={opts.title ?? t('common.confirm')}
      footer={
        <>
          <Button ref={cancelRef} onClick={() => onDone(false)}>
            {opts.cancelLabel ?? t('common.cancel')}
          </Button>
          <Button ref={confirmRef} variant={opts.danger ? 'danger' : 'primary'} onClick={() => onDone(true)}>
            {opts.confirmLabel ?? t('common.ok')}
          </Button>
        </>
      }
    >
      <div style={{ whiteSpace: 'pre-line' }}>{opts.message}</div>
    </Dialog>
  );
}

function AlertDialog({ opts, onDone }: { opts: AlertOptions; onDone: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      onDone();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onDone]);
  return (
    <Dialog
      open
      onClose={onDone}
      title={opts.title ?? t('common.notice')}
      footer={
        <Button ref={okRef} variant="primary" onClick={onDone}>
          {opts.okLabel ?? t('common.ok')}
        </Button>
      }
    >
      <div style={{ whiteSpace: 'pre-line' }}>{opts.message}</div>
    </Dialog>
  );
}

export interface AlertOptions {
  message: ReactNode;
  title?: string;
  okLabel?: string;
}

export interface PromptOptions {
  message: ReactNode;
  title?: string;
  defaultValue?: string;
  placeholder?: string;
  okLabel?: string;
  cancelLabel?: string;
}

function PromptDialog({ opts, onDone }: { opts: PromptOptions; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(opts.defaultValue ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  // a11y3: the field had no accessible name at all (axe `label`, critical) in
  // every prompt in the app. The question asked is its label; with no message,
  // the dialog title is.
  const messageId = useId();
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const submit = (): void => onDone(value);
  return (
    <Dialog
      open
      onClose={() => onDone(null)}
      title={opts.title ?? t('common.enterValue')}
      footer={
        <>
          <Button onClick={() => onDone(null)}>{opts.cancelLabel ?? t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit}>
            {opts.okLabel ?? t('common.ok')}
          </Button>
        </>
      }
    >
      {opts.message != null && <div id={messageId} style={{ marginBottom: 8, whiteSpace: 'pre-line' }}>{opts.message}</div>}
      <input
        ref={inputRef}
        className="ui-input"
        aria-labelledby={opts.message != null ? messageId : undefined}
        aria-label={opts.message != null ? undefined : opts.title ?? t('common.enterValue')}
        value={value}
        placeholder={opts.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Enter confirms the IME candidate before it submits the prompt.
          if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            submit();
          }
        }}
      />
    </Dialog>
  );
}

/** Ask the user to confirm an action. Drop-in for `if (confirm(...))`. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    // Semantic sound event (Phase 4 · M4) — routed by shellSounds → soundEngine.
    window.dispatchEvent(new CustomEvent('shell:dialogOpen'));
    const root = createRoot(host);
    let settled = false;
    const done = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      window.dispatchEvent(new CustomEvent('shell:dialogResolve', { detail: { ok } }));
      resolve(ok);
      // Unmount outside the event/render cycle that triggered us.
      window.setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    root.render(<ConfirmDialog opts={opts} onDone={done} />);
  });
}

/** Show an informational message. Drop-in for `alert(...)`. */
export function alertDialog(opts: AlertOptions): Promise<void> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    // Semantic sound event (Phase 4 · M4) — routed by shellSounds → soundEngine.
    window.dispatchEvent(new CustomEvent('shell:dialogOpen'));
    const root = createRoot(host);
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      window.dispatchEvent(new CustomEvent('shell:dialogResolve', { detail: { ok: true } }));
      resolve();
      window.setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    root.render(<AlertDialog opts={opts} onDone={done} />);
  });
}

/** Ask the user for a line of text. Drop-in for `prompt(...)` (null = cancel). */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    // Semantic sound event (Phase 4 · M4) — routed by shellSounds → soundEngine.
    window.dispatchEvent(new CustomEvent('shell:dialogOpen'));
    const root = createRoot(host);
    let settled = false;
    const done = (value: string | null): void => {
      if (settled) return;
      settled = true;
      window.dispatchEvent(new CustomEvent('shell:dialogResolve', { detail: { ok: value !== null } }));
      resolve(value);
      window.setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    root.render(<PromptDialog opts={opts} onDone={done} />);
  });
}
