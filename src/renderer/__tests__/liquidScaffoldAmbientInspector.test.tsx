// @vitest-environment node
/**
 * The Files details pane at medium width: a 320px "nothing selected" summary took
 * the width the file list needed, so its columns were cut. `ambientInspector` is
 * shown only when the scaffold is wide; a real selection's `inspector` shows at
 * every width.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LiquidAppScaffold } from '../components/liquid/LiquidAppScaffold';

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    createElement(LiquidAppScaffold, { rail: createElement('span', null, 'rail'), ...props }, 'canvas'),
  );
}

describe('LiquidAppScaffold — ambient inspector', () => {
  it('shows the summary only when wide', () => {
    const summary = createElement('p', { className: 'summary' }, 'summary');
    expect(render({ widthClass: 'wide', ambientInspector: summary })).toContain('class="summary"');
    const medium = render({ widthClass: 'medium', ambientInspector: summary });
    expect(medium).not.toContain('class="summary"');
    expect(medium).not.toContain('data-has-inspector');
  });

  it('a selection inspector wins and shows at medium width', () => {
    const html = render({
      widthClass: 'medium',
      inspector: createElement('p', { className: 'details' }, 'details'),
      ambientInspector: createElement('p', { className: 'summary' }, 'summary'),
    });
    expect(html).toContain('class="details"');
    expect(html).not.toContain('class="summary"');
    expect(html).toContain('data-has-inspector="true"');
    // Medium collapses the rail to icons.
    expect(html).toContain('data-rail-collapsed="true"');
  });
});
