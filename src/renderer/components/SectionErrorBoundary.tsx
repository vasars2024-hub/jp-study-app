/**
 * One error boundary per app section (audit robust #5). Sections were only
 * wrapped in <Suspense>, so a render error in any one app reached the
 * top-level `AppErrorBoundary` and replaced the WHOLE desktop with "Something
 * went wrong". Now the failing app shows what happened, offers "Reload this
 * app" (remounts just this section) and the details, and every other window
 * keeps working. Errors go to the same diagnostic log.
 */
import React from 'react';
import { t } from '../i18n';

interface Props {
  section: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string;
  attempt: number;
  showDetails: boolean;
}

export class SectionErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: '', attempt: 0, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? '' });
    void window.api
      ?.logRendererError?.({
        subsystem: `section:${this.props.section}`.slice(0, 64),
        operation: 'reactErrorBoundary',
        detail: `${error.stack || error.message}\n${info.componentStack ?? ''}`,
      })
      ?.catch(() => {
        /* logging must never throw */
      });
  }

  private details(): string {
    const { error, componentStack } = this.state;
    return `${this.props.section}\n${error?.stack || error?.message || ''}\n${componentStack}`.trim();
  }

  private reload = (): void => {
    this.setState((s) => ({ error: null, componentStack: '', attempt: s.attempt + 1, showDetails: false }));
  };

  private copy = (): void => {
    void navigator.clipboard?.writeText(this.details()).catch(() => undefined);
  };

  render(): React.ReactNode {
    const { error, attempt, showDetails } = this.state;
    if (!error) return <React.Fragment key={attempt}>{this.props.children}</React.Fragment>;
    return (
      <div className="app-section-error" role="alert" style={{ padding: '28px 28px', maxWidth: 620 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 17 }}>{t('section.error.title')}</h2>
        <p className="muted" style={{ margin: '0 0 14px', lineHeight: 1.55 }}>
          {t('section.error.body')}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn primary" onClick={this.reload}>
            {t('section.error.reload')}
          </button>
          <button type="button" className="btn" onClick={() => this.setState({ showDetails: !showDetails })} aria-expanded={showDetails}>
            {t('section.error.details')}
          </button>
          <button type="button" className="btn" onClick={this.copy}>
            {t('section.error.copy')}
          </button>
        </div>
        {showDetails ? (
          <pre
            className="muted"
            style={{ marginTop: 14, maxHeight: 240, overflow: 'auto', fontSize: 11.5, whiteSpace: 'pre-wrap', userSelect: 'text' }}
          >
            {this.details()}
          </pre>
        ) : null}
      </div>
    );
  }
}

export default SectionErrorBoundary;
