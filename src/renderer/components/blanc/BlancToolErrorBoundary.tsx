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
    return (
      <div className="blanc-tool-crash" role="alert">
        <p className="blanc-tool-crash-title">{`${this.props.label} could not be displayed.`}</p>
        <p className="blanc-tool-crash-body">
          This tool ran into an unexpected error. The rest of Blanc is unaffected — the
          other tools, your tabs and anything you had open are still there. The error
          was written to the diagnostic log.
        </p>
        <button type="button" className="blanc-tool-crash-retry" onClick={this.retry}>
          Try again
        </button>
      </div>
    );
  }
}

export default BlancToolErrorBoundary;
