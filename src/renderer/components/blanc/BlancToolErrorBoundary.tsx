/**
 * A crash guard around ONE Blanc tool.
 *
 * Why this exists, measured rather than imagined. Blanc's tool detail mounted
 * every panel bare inside `.blanc-embedded-view`, under nothing but the shell's
 * top-level `AppErrorBoundary` in `blancMain.tsx`. So a render throw in any one
 * of the 44 tools replaced the ENTIRE Blanc window with "Something went wrong."
 * — the rail, the tabs, the other 43 tools and whatever the user had open, all
 * gone, recoverable only by a full reload. Observed live on 2026-09-06: a
 * provider-health reply of the wrong shape took the whole shell down, and the
 * only account the surface could give was the top-level crash screen, which
 * does not say WHICH tool failed. Two earlier turns recorded the same blast
 * radius from the other side — a panel that threw made every later probe read
 * "tool ABSENT", because there was no tool detail left to look in.
 *
 * The contract:
 *
 * - **The failure is bounded to the tool.** Everything else in Blanc keeps
 *   working, which is both the point and the honest report: the shell says the
 *   rest of Blanc is unaffected because it is.
 * - **It names the tool.** "Something went wrong" over a blank window makes the
 *   user guess. A failure that cannot say what failed is barely better than a
 *   silent one.
 * - **Recovery is offered and is real.** "Try again" clears the error, which
 *   mounts the same tool fresh and recovers anything transient (a bridge reply
 *   that arrived malformed once). It is not a claim that the fault is fixed, so
 *   a tool that throws again lands right back here rather than pretending.
 * - **It reports to the same diagnostic log** `AppErrorBoundary` writes to, so
 *   a bounded crash is not a quieter crash.
 *
 * The caller passes `toolId` as a `key` as well, so switching tools mounts a
 * fresh boundary: without that, one crashed tool would leave every tool picked
 * after it showing the first one's failure.
 */

import React from 'react';
import { useT } from '../../i18n';
import { retryFailedLazyImports } from '../../retryableLazy';

interface Props {
  /** The tool this boundary guards. Used for the message and for the reset key. */
  toolId: string;
  /** The tool's human label, which is what the message actually shows. */
  label: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The fallback is a function component so it can subscribe to the UI language
 * with `useT()` — a class render calling the bare `t` would not re-render on a
 * language switch.
 */
function BlancToolCrashFallback({ label, onRetry }: { label: string; onRetry: () => void }) {
  const { t } = useT();
  return (
    <div className="blanc-tool-crash" role="alert">
      <p className="blanc-tool-crash-title">{t('blanc.errorBoundary.title', { label })}</p>
      <p className="blanc-tool-crash-body">{t('blanc.errorBoundary.body')}</p>
      <button type="button" className="blanc-tool-crash-retry" onClick={onRetry}>
        {t('common.tryAgain')}
      </button>
    </div>
  );
}

export class BlancToolErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    void window.api
      ?.logRendererError?.({
        subsystem: 'renderer',
        operation: 'blancToolErrorBoundary',
        // The tool id is in the payload deliberately: a bounded crash that
        // cannot be attributed to a tool in the log is a crash nobody can fix.
        detail: `tool=${this.props.toolId}\n${error.stack || error.message}\n${info.componentStack ?? ''}`,
      })
      .catch(() => {
        /* logging must never throw */
      });
  }

  private retry = (): void => {
    // A lazy chunk that failed to load is re-armed first, so "Try again" really
    // imports it again instead of re-throwing React.lazy's cached rejection.
    retryFailedLazyImports();
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    // No re-mount key on the children, and that is deliberate rather than an
    // omission: throwing already unmounted this subtree when the fallback took
    // its place, so clearing the error mounts it fresh anyway. A `key` bumped
    // per attempt was written here first, and the mutation control for it did
    // not fire — nothing observable changed — so it was removed instead of left
    // as a comment claiming a property no test could see.
    if (!this.state.error) return this.props.children;
    return <BlancToolCrashFallback label={this.props.label} onRetry={this.retry} />;
  }
}

export default BlancToolErrorBoundary;
