// Inline sparkline. Decorative by default — every sparkline in this app sits
// next to the same figure in text, so it carries no information on its own and
// is hidden from assistive tech unless a label is supplied.

import { sparklineAreaPath, sparklinePath } from './data/charts';

export default function Sparkline({
  values,
  width = 96,
  height = 24,
  label,
  className = '',
}: {
  values: number[];
  width?: number;
  height?: number;
  label?: string;
  className?: string;
}) {
  if (!values.length) return null;
  const line = sparklinePath(values, { width, height, padding: 2 });
  const area = sparklineAreaPath(values, { width, height, padding: 2 });

  return (
    <svg
      className={`scr-spark ${className}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path className="scr-spark-area" d={area} />
      <path className="scr-spark-line" d={line} />
    </svg>
  );
}
