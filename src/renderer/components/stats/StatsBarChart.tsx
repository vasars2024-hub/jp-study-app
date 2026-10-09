/**
 * One accessible bar chart for the Statistics insights: stacked columns drawn
 * with plain boxes (no chart library in the Statistics chunk), a spoken
 * summary on the plot, a legend that names every series in text, and the
 * exact numbers in a real table behind a disclosure — so a screen-reader user,
 * a keyboard user and anyone who wants the figure rather than the shape all
 * get the same data the bars show.
 *
 * Its own class names (`stats2-*`) on purpose: the 14-day chart's
 * `stats-bar-*` classes are what other tests count, and a second chart must
 * not change their answer.
 */
import { useId } from 'react';
import { useT } from '../../i18n';

export interface BarSeries {
  key: string;
  label: string;
}

export interface BarRow {
  key: string;
  /** Short axis label (may be empty for most columns). */
  axis: string;
  /** Full label for the table and the column tooltip. */
  label: string;
  /** One value per series, in series order. */
  values: number[];
}

export default function StatsBarChart({
  title,
  summary,
  series,
  rows,
  format,
  max,
  className = '',
}: {
  /** A fixed top of scale (100 for a percentage), instead of the tallest column. */
  max?: number;
  title: string;
  summary: string;
  series: BarSeries[];
  rows: BarRow[];
  /** How a value is written in the tooltip and the table. */
  format: (value: number) => string;
  className?: string;
}) {
  const { t } = useT();
  const titleId = useId();
  const peak = max ?? Math.max(1e-9, ...rows.map((row) => row.values.reduce((sum, v) => sum + Math.max(0, v), 0)));
  return (
    <figure className={`stats2-figure ${className}`.trim()} aria-labelledby={titleId}>
      <figcaption id={titleId} className="stats2-title">{title}</figcaption>
      <div className="stats2-chart" role="img" aria-label={summary}>
        {rows.map((row) => {
          const tip = `${row.label}: ${series.map((s, i) => `${s.label} ${format(row.values[i] ?? 0)}`).join(', ')}`;
          return (
            <div key={row.key} className="stats2-col" title={tip} aria-hidden="true">
              <div className="stats2-track">
                {row.values.map((value, i) => (value > 0 ? (
                  <div
                    key={series[i]?.key ?? i}
                    className={`stats2-seg stats2-seg-${i}`}
                    style={{ height: `${(value / peak) * 100}%` }}
                  />
                ) : null))}
              </div>
              <span className="stats2-axis">{row.axis}</span>
            </div>
          );
        })}
      </div>
      {series.length > 1 && (
        <div className="stats2-legend">
          {series.map((s, i) => (
            <span key={s.key} className="stats2-legend-item">
              <i className={`stats2-swatch stats2-seg-${i}`} aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <details className="stats2-data">
        <summary>{t('stats2.table.show')}</summary>
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">{t('stats2.table.when')}</th>
              {series.map((s) => <th key={s.key} scope="col">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                {row.values.map((value, i) => <td key={series[i]?.key ?? i}>{format(value)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
