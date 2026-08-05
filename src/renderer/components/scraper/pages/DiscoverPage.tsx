// Discover — the catalogue console that used to be the whole Scraper app.
//
// This is the one surface here with a real backend (discovery:search|browse|
// detail against MyAnimeList/AniList). It is deliberately reused verbatim from
// components/discover/DiscoverContent.tsx rather than reimplemented: that file
// is also rendered by Blanc, so forking it would split a working feature in two.
//
// Its future role is a funnel — pick something worth studying here, then hand
// the title to New Scrape to actually find and fetch episodes. The action rail
// below is that seam; today it prefills the target URL and navigates.

import { useState } from 'react';
import {
  DiscoveryControls,
  DiscoveryInspector,
  DiscoveryResults,
  DiscoveryTabs,
  useDiscovery,
} from '../../discover/DiscoverContent';
import { Button } from '../../ui';
import Icon from '../../Icons';
import StatusDot from '../StatusDot';
import { useScraper } from '../ScraperContext';
import { sx, sxn, sxs } from '../strings';
import { scraperArtwork } from '../artwork';
import { discoveryCandidateId } from '../../../../shared/mediaDiscovery';
import AiringSchedulePanel from './AiringSchedulePanel';

/** How many shortlisted titles the shelf shows before the count pill takes over. */
const SHELF_LIMIT = 3;

export default function DiscoverPage() {
  const ctl = useScraper();
  const state = useDiscovery();
  const selected = state.selected;
  const [notice, setNotice] = useState('');
  const selectedIsPlanned = selected
    ? state.shortlistIds.has(discoveryCandidateId(selected.candidate))
    : false;

  const queue = (mode: 'plan' | 'sources' | 'scrape') => {
    if (!selected) return;
    if (mode === 'plan') {
      state.toggleShortlist(selected.candidate);
      state.setTab('shortlist');
      setNotice(sxs(
        selectedIsPlanned ? 'discover.removed' : 'discover.added',
        selected.candidate.title,
      ));
      return;
    }
    // No provider resolution exists yet, so the seam is honest about it: the
    // title goes into the New Scrape field as a search term rather than
    // pretending we know which site hosts it.
    ctl.setTargetUrl(selected.candidate.title);
    setNotice('');
    ctl.navigate('new-scrape');
  };

  return (
    <div className="scr-page scr-page--discover">
      <header className="scr-page-head">
        <div>
          <h1 className="scr-page-title">
            {sx('page.discover.title')}
            <StatusDot id="page.discover" className="scr-page-dot" />
          </h1>
          <p className="scr-page-sub">
            {sx(state.mediaType === 'manga'
              ? 'page.discover.subtitle.manga'
              : 'page.discover.subtitle.anime')}
          </p>
        </div>
        <div className="scr-page-actions">
          <Button
            size="sm"
            disabled={!selected}
            leftIcon={<Icon name="bookmark" size={14} />}
            onClick={() => queue('plan')}
          >
            {sx(selectedIsPlanned ? 'discover.removeFromPlan' : 'discover.planToWatch')}
          </Button>
          <Button
            size="sm"
            disabled={!selected}
            leftIcon={<Icon name="globe" size={14} />}
            onClick={() => queue('sources')}
          >
            {sx('discover.findSources')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!selected}
            leftIcon={<Icon name="sparkle" size={14} />}
            onClick={() => queue('scrape')}
          >
            {sx('discover.queueScrape')}
          </Button>
        </div>
      </header>
      {notice && <p className="scr-action-notice" role="status">{notice}</p>}

      {/* Audit C1-3. Sits above the shortlist because it answers a different,
          time-sensitive question — "what aired, and can I get it yet?" —
          whereas the shelf below is what the user already chose to follow. */}
      <AiringSchedulePanel />

      <section className="scr-discover-featured" aria-labelledby="scr-discover-featured-title">
        <div className="scr-dashboard-block-head">
          <div>
            <h2 id="scr-discover-featured-title">{sx('discover.shelf.title')}</h2>
            <p>{sx('discover.shelf.sub')}</p>
          </div>
          {state.shortlist.length > 0 && (
            <div className="scr-discover-featured-meta">
              <button
                type="button"
                className="scr-pill scr-pill--outline scr-discover-plan-count"
                onClick={() => state.setTab('shortlist')}
              >
                {sxn('discover.shelf.viewAll', state.shortlist.length)}
              </button>
            </div>
          )}
        </div>
        {state.shortlist.length === 0 ? (
          <p className="scr-discover-featured-empty">{sx('discover.shelf.empty')}</p>
        ) : (
          <div className="scr-discover-featured-grid">
            {state.shortlist.slice(0, SHELF_LIMIT).map((entry, index) => {
              const { candidate } = entry;
              const id = discoveryCandidateId(candidate);
              // The poster is the catalogue's when it published one. The
              // generated artwork behind it is decoration for a missing image,
              // never a stand-in for a fact.
              const artwork = candidate.posterUrl || scraperArtwork(index);
              const isManga = candidate.mediaType === 'manga';
              const units = isManga ? candidate.chapterCount : candidate.episodeCount;
              return (
                <article className="scr-discover-featured-card" key={id}>
                  <img src={artwork} alt="" />
                  <span className="scr-discover-featured-shade" />
                  <div className="scr-discover-featured-actions">
                    <button
                      type="button"
                      onClick={() => {
                        ctl.setTargetUrl(candidate.title);
                        ctl.navigate('new-scrape');
                      }}
                    >
                      <Icon name="sparkle" size={13} />
                      {sx('discover.shelf.scrape')}
                    </button>
                    <button
                      type="button"
                      className="is-planned"
                      onClick={() => {
                        state.toggleShortlist(candidate);
                        setNotice(sxs('discover.removed', candidate.title));
                      }}
                    >
                      <Icon name="bookmark" size={13} />
                      {sx('discover.shelf.remove')}
                    </button>
                  </div>
                  <span className="scr-discover-featured-copy">
                    <span className="scr-pill scr-pill--quiet">
                      {sx(isManga ? 'mediaType.manga' : 'mediaType.anime')}
                    </span>
                    <strong>{candidate.title}</strong>
                    {candidate.nativeTitle ? <small>{candidate.nativeTitle}</small> : null}
                    {/* Only stated when the catalogue published it — an unaired
                        or unlisted title genuinely has no count, and zero is a
                        claim rather than an absence. */}
                    {units ? (
                      <span>
                        {sxn(isManga ? 'discover.shelf.chapters' : 'discover.shelf.episodes', units)}
                      </span>
                    ) : null}
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="disc-view scr-discover-host">
        <DiscoveryControls state={state} />
        <DiscoveryTabs state={state} />
        <div className="disc-body">
          <div className="disc-main">
            <DiscoveryResults state={state} />
          </div>
          <DiscoveryInspector state={state} />
        </div>
      </div>
    </div>
  );
}
