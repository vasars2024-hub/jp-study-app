import Icon, { type IconName } from '../Icons';
import type { Bundle } from '../../../shared/resourcesCatalog';
import { useT } from '../../i18n';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Full sub-screen for one bundle: checklist (ticks persisted by the parent via
// localStorage) plus the resource links. Rendered in place of the bundle grid;
// the same component is used in both the standard and Aero shells.

export default function BundleDetail({
  bundle,
  checkedIds,
  onToggle,
  onBack,
  onOpenLink,
  onOpenSetupLink,
}: {
  bundle: Bundle;
  checkedIds: string[];
  onToggle: (itemId: string) => void;
  onBack: () => void;
  onOpenLink: (url: string) => void;
  onOpenSetupLink: (link: NonNullable<Bundle['downloads']>[number]) => void;
}) {
  const { t } = useT();
  const checked = new Set(checkedIds);
  const checklist = bundle.checklist ?? [];
  // `downloads` is the remote-catalog schema field. On this surface these are
  // setup links: the app saves the URL to My tools and opens it externally.
  const setupLinks = bundle.downloads ?? [];
  const done = checklist.filter((c) => checked.has(c.id)).length;

  return (
    <div className="bundle-detail" style={{ ['--bundle-accent' as string]: bundle.color }}>
      <div className="bundle-detail-head">
        <button className="bundle-back" onClick={onBack}>
          <Icon name="chevron" size={14} />
          {t('common.back')}
        </button>
        <div className="bundle-detail-title">
          <span className="bundle-detail-icon" aria-hidden="true">
            <Icon name={bundle.icon as IconName} size={22} />
          </span>
          <div>
            <h2>
              {bundle.gem}
              {bundle.creature ? <em> · {bundle.creature}</em> : null} — {bundle.title}
            </h2>
            <p className="muted">{bundle.blurb}</p>
          </div>
        </div>
      </div>

      {checklist.length > 0 ? (
        <section className="bundle-checklist">
          <div className="bundle-section-head">
            <h3>{t('bundleDetail.beginnerChecklist')}</h3>
            <span className="muted">
              {t('bundleDetail.checklistProgress', { done, total: checklist.length })}
            </span>
          </div>
          <ul>
            {checklist.map((item) => {
              const isChecked = checked.has(item.id);
              return (
                <li key={item.id} className={isChecked ? 'checked' : ''}>
                  <label>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggle(item.id)}
                    />
                    <span className="bundle-check-box" aria-hidden="true">
                      {isChecked ? <Icon name="check" size={12} /> : null}
                    </span>
                    <span className="bundle-check-text">{item.text}</span>
                  </label>
                  {item.url ? (
                    <button
                      className="bundle-check-link"
                      onClick={() => onOpenLink(item.url as string)}
                      title={item.url}
                    >
                      {t('common.open')} <Icon name="external" size={11} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {setupLinks.length > 0 ? (
        <section className="bundle-downloads">
          <div className="bundle-section-head">
            <h3>{t('bundleDetail.setupLinks')}</h3>
            <span className="muted">
              {t('bundleDetail.linkCount', { count: setupLinks.length })}
            </span>
          </div>
          <p className="bundle-setup-explanation muted">
            {t('bundleDetail.setupExplanation')}
          </p>
          <div className="bundle-download-list">
            {setupLinks.map((link) => (
              <button
                key={link.id}
                className="bundle-download-card"
                onClick={() => onOpenSetupLink(link)}
                title={link.url}
              >
                <span className="bundle-download-icon" aria-hidden="true">
                  <Icon name="external" size={15} />
                </span>
                <span>
                  <span className="bundle-download-name">{link.name}</span>
                  <span className="bundle-download-desc">{link.description}</span>
                  <span className="bundle-download-host">
                    {t('bundleDetail.saveAndOpen')} · {hostOf(link.url)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="bundle-detail-links">
        <div className="bundle-section-head">
          <h3>{t('bundleDetail.resourceLinks')}</h3>
          <span className="muted">
            {t('bundleDetail.linkCount', { count: bundle.items.length })}
          </span>
        </div>
        <div className="res-grid">
          {bundle.items.map((r) => (
            <button key={r.url} className="res-card" onClick={() => onOpenLink(r.url)}>
              <span className="res-card-top">
                <span className="res-name">{r.name}</span>
                <span className={`res-cost cost-${r.cost.toLowerCase()}`}>{r.cost}</span>
              </span>
              <span className="res-desc">{r.description}</span>
              <span className="res-host">
                {hostOf(r.url)}
                <span className="res-open" aria-hidden="true">
                  <Icon name="external" size={11} />
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
