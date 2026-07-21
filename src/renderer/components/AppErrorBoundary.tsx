// Top-level crash guard (PHASE_6_5_AUDIT.md Phase 8 gap — previously a render
// error anywhere in the tree white-screened the whole app with no recovery
// path and no record of what happened). Wraps <App /> in main.tsx.

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    void window.api
      ?.logRendererError?.({
        subsystem: 'renderer',
        operation: 'reactErrorBoundary',
        detail: `${error.stack || error.message}\n${info.componentStack ?? ''}`,
      })
      .catch(() => {
        /* logging must never throw */
      });
  }

  private reload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: '#1b1b21',
          color: '#e8e8ef',
          fontFamily: 'system-ui, sans-serif',
          padding: 24,
          textAlign: 'center',
          zIndex: 999999,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong.</div>
        <div style={{ fontSize: 13, opacity: 0.75, maxWidth: 480 }}>
          The window ran into an unexpected error. Your saved data is untouched — this
          only affects the current view. The error was written to the diagnostic log.
        </div>
        <button
          type="button"
          onClick={this.reload}
          style={{
            marginTop: 8,
            padding: '8px 20px',
            borderRadius: 6,
            border: '1px solid #444',
            background: '#2a2a33',
            color: '#e8e8ef',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
