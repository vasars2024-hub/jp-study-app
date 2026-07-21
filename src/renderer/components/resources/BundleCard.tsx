import Icon, { type IconName } from '../Icons';
import type { Bundle } from '../../../shared/resourcesCatalog';

// A single gem/creature bundle tile. The gem colour drives an accent stripe and
// icon tint via the inline --bundle-accent CSS variable. No router: clicking
// asks the parent (ResourcesView) to open the bundle sub-screen.

export default function BundleCard({
  bundle,
  checkedCount,
  onOpen,
}: {
  bundle: Bundle;
  checkedCount: number;
  onOpen: (bundle: Bundle) => void;
}) {
  const total = bundle.checklist?.length ?? 0;
  const done = total > 0 && checkedCount >= total;
  return (
    <button
      className="bundle-card"
      style={{ ['--bundle-accent' as string]: bundle.color }}
      onClick={() => onOpen(bundle)}
      title={`${bundle.gem} — ${bundle.title}`}
    >
      <span className="bundle-card-stripe" aria-hidden="true" />
      <span className="bundle-card-top">
        <span className="bundle-card-icon" aria-hidden="true">
          <Icon name={bundle.icon as IconName} size={18} />
        </span>
        <span className="bundle-card-gem">
          {bundle.gem}
          {bundle.creature ? <em> · {bundle.creature}</em> : null}
        </span>
      </span>
      <span className="bundle-card-title">{bundle.title}</span>
      <span className="bundle-card-blurb">{bundle.blurb}</span>
      <span className="bundle-card-foot">
        <span>{bundle.items.length} links</span>
        {total > 0 ? (
          <span className={`bundle-card-checkmark ${done ? 'done' : ''}`}>
            {done ? <Icon name="check" size={12} /> : null}
            {checkedCount}/{total} checklist
          </span>
        ) : null}
      </span>
    </button>
  );
}
