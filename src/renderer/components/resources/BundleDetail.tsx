import Icon, { type IconName } from '../Icons';
import type { Bundle } from '../../../shared/resourcesCatalog';

const DIRECT_DOWNLOAD_EXTENSIONS = [
  '.apkg',
  '.crx',
  '.dmg',
  '.exe',
  '.tar.gz',
  '.whl',
  '.xpi',
  '.zip',
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function isDirectDownload(url: string): boolean {
  const lower = url.toLowerCase();
  return DIRECT_DOWNLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext));
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
  onDownload,
}: {
  bundle: Bundle;
  checkedIds: string[];
  onToggle: (itemId: string) => void;
  onBack: () => void;
  onOpenLink: (url: string) => void;
  onDownload: (download: NonNullable<Bundle['downloads']>[number]) => void;
}) {
  const checked = new Set(checkedIds);
  const checklist = bundle.checklist ?? [];
  const downloads = bundle.downloads ?? [];
  const done = checklist.filter((c) => checked.has(c.id)).length;

  return (
    <div className="bundle-detail" style={{ ['--bundle-accent' as string]: bundle.color }}>
      <div className="bundle-detail-head">
        <button className="bundle-back" onClick={onBack}>
          <Icon name="chevron" size={14} />
          Back
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
            <h3>Beginner checklist</h3>
            <span className="muted">
              {done}/{checklist.length} done
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
                      Open <Icon name="external" size={11} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {downloads.length > 0 ? (
        <section className="bundle-downloads">
          <div className="bundle-section-head">
            <h3>One-click setup</h3>
            <span className="muted">{downloads.length} downloads</span>
          </div>
          <div className="bundle-download-list">
            {downloads.map((download) => (
              <button
                key={download.id}
                className={`bundle-download-card ${isDirectDownload(download.url) ? 'direct' : ''}`}
                onClick={() => onDownload(download)}
                title={download.url}
              >
                <span className="bundle-download-icon" aria-hidden="true">
                  <Icon name="download" size={15} />
                </span>
                <span>
                  <span className="bundle-download-name">{download.name}</span>
                  <span className="bundle-download-desc">{download.description}</span>
                  <span className="bundle-download-host">
                    {isDirectDownload(download.url) ? 'direct download' : download.kind} · {hostOf(download.url)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="bundle-detail-links">
        <div className="bundle-section-head">
          <h3>Resources</h3>
          <span className="muted">{bundle.items.length} links</span>
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
