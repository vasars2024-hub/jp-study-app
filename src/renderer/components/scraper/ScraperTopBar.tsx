// Title bar: identity, rail toggle, shell search, and the primary actions.

import Icon from '../Icons';
import { Button, IconButton } from '../ui';
import { ContextualSurface } from '../liquid/LiquidSurface';
import ScraperSearch from './ScraperSearch';
import { useScraper } from './ScraperContext';
import { sx } from './strings';

export default function ScraperTopBar() {
  const ctl = useScraper();

  return (
    // Toolbar chrome, not work: identity, rail toggle, search and the primary
    // actions. `ContextualSurface` is inert until the window is in Liquid
    // presentation, so the conventional top bar paints exactly what it did.
    <ContextualSurface as="header" className="scr-topbar">
      <div className="scr-topbar-identity">
        <span className="scr-topbar-mark" aria-hidden>
          <Icon name="logo" size={18} />
        </span>
        <span className="scr-topbar-name">{sx('app.title')}</span>
      </div>

      <IconButton
        label={sx('app.toggleRail')}
        size="sm"
        className="scr-topbar-hamburger"
        aria-pressed={ctl.railCollapsed}
        onClick={ctl.toggleRail}
      >
        <Icon name="app" size={16} />
      </IconButton>

      <ScraperSearch />

      <div className="scr-topbar-actions">
        {/* `scr-topbar-nav` marks the three actions that are a second route to a
            page the left rail already lists. Below 460px of shell the bar has
            188px for 255px of controls, and these are the three that can go
            without taking a destination with them. */}
        <Button
          variant="primary"
          size="sm"
          className="scr-topbar-nav"
          leftIcon={<Icon name="sparkle" size={14} />}
          onClick={() => ctl.navigate('new-scrape')}
        >
          {sx('app.newScrape')}
        </Button>

        <Button
          size="sm"
          className="scr-topbar-nav"
          rightIcon={<Icon name="chevron" size={12} />}
          onClick={() => ctl.navigate('profiles')}
        >
          {sx('app.profiles')}
        </Button>

        <IconButton
          label={sx('app.history')}
          size="sm"
          className="scr-topbar-nav"
          onClick={() => ctl.navigate('history')}
        >
          <Icon name="calendar" size={16} />
        </IconButton>

        <IconButton
          label={sx('app.settings')}
          size="sm"
          aria-pressed={ctl.drawerOpen}
          onClick={() => (ctl.drawerOpen ? ctl.closeDrawer() : ctl.openDrawer())}
        >
          <Icon name="settings" size={16} />
        </IconButton>

        <IconButton
          label={ctl.advancedMode ? sx('app.advancedOn') : sx('app.advancedOff')}
          size="sm"
          aria-pressed={ctl.advancedMode}
          className={ctl.advancedMode ? 'is-on' : ''}
          onClick={() => ctl.setAdvancedMode(!ctl.advancedMode)}
        >
          <Icon name="wrench" size={16} />
        </IconButton>

        <IconButton
          label={ctl.compact ? sx('app.compactOff') : sx('app.compactOn')}
          size="sm"
          onClick={() => ctl.setCompact(!ctl.compact)}
        >
          <Icon name="window" size={16} />
        </IconButton>
      </div>
    </ContextualSurface>
  );
}
