# Japanese Study OS — Master Build Roadmap

*A single, ordered consolidation of every design prompt for growing the anime
scraper into a full offline-first **Japanese immersion operating system**.*

---

## Vision

The system starts as an anime episode scraper and grows, layer by layer, into a
local media ecosystem for Japanese learning:

```
Scraper  →  Sources/Servers  →  Media Hub  →  Japanese Study OS modules
                                                   ↑
                                        Local AI layer + QA
```

Every piece of media — anime, drama, movies, YouTube, visual novels — becomes a
potential learning resource that feeds one shared vocabulary / kanji / grammar /
flashcard database.

## How to use this document

- It is organized **bottom-up by dependency**, which also roughly matches the order
  the ideas were designed in. Earlier parts are the foundation; later parts assume
  they exist.
- **Each numbered section is a self-contained build prompt.** You can hand any single
  section to a coding assistant on its own.
- Where two ideas once contradicted each other, this document keeps the **final,
  reconciled decision** and notes it inline. See the [Appendix](#appendix--how-the-original-prompts-were-merged)
  for exactly what was merged or de-duplicated.

## Guiding principles (apply to every section)

- **Offline-first.** Core features — library, flashcards, dictionary, progress,
  notes, search over known content — must work with no internet. Online features
  (metadata refresh, new-release checks, sync) are optional enhancements. The app is
  *"a local database that synchronizes with sources,"* not *"a scraper that has a
  database."*
- **AI is optional and on-demand.** No heavy model is permanently loaded; the app is
  fully usable with AI disabled. (See §19.)
- **Respect site access & terms of use.** Build legitimate networking, reliability,
  and per-site customization — **not** features whose purpose is to defeat a site's
  security (Cloudflare/CAPTCHA *bypass*). Those protections are treated only as
  *detection/health* signals (see §3), never as things to evade.
- **External playback.** The app has **no built-in general-purpose video player**; it
  hands finished media off to VLC/mpv/IINA (see §9). The one in-app player is the
  *Japanese-learning study player* (see §16), a study tool, not a playback engine.
- **Plugin architecture everywhere.** New sites, providers, servers, exporters, AI
  skills, and themes are plugins, so the core stays lightweight and new connectors are
  added without touching it.
- **Strongly typed, modular, migratable.** Full TypeScript typing, sensible defaults,
  input validation, versioned migrations, unit tests, and per-website overrides
  throughout.

---

## Table of contents

**Part I — Scraper Core & Configuration**
1. [Advanced Settings](#1--advanced-settings)
2. [Connection Profiles](#2--connection-profiles)

**Part II — Sites, Sources & Servers**
3. [Verified Sites Manager](#3--verified-sites-manager)
4. [Community Site Sources](#4--community-site-sources)
5. [Video Server Profiles](#5--video-server-profiles)
6. [Unified Multi-Source Search](#6--unified-multi-source-search)

**Part III — Media Ecosystem (beyond anime)**
7. [Global Media Provider System](#7--global-media-provider-system)
8. [Subtitle Provider & Management System](#8--subtitle-provider--management-system)
9. [External Player Integration & Playback Handoff](#9--external-player-integration--playback-handoff)
10. [Media Hub](#10--media-hub)
11. [Anime Dashboard & Tracking Hub](#11--anime-dashboard--tracking-hub)
12. [YouTube Content Manager](#12--youtube-content-manager)

**Part IV — Japanese Study OS Integration**
13. [Media Module Integration into Japanese Study OS](#13--media-module-integration-into-japanese-study-os)
14. [Japanese Content Intelligence & Study Extraction](#14--japanese-content-intelligence--study-extraction)
15. [Visual Novel Immersion Platform](#15--visual-novel-immersion-platform)
16. [Japanese-Learning Video Player](#16--japanese-learning-video-player)

**Part V — Local AI Layer**
17. [Local AI Agent Engine](#17--local-ai-agent-engine)
18. [AI Advanced Configuration & Control](#18--ai-advanced-configuration--control)
19. [Local Model Stack & Resource Strategy](#19--local-model-stack--resource-strategy)
20. [AI-Powered UI Customization](#20--ai-powered-ui-customization)

**Part VI — Consolidation, Quality & Release**
21. [Architecture Streamline & Optimization Audit](#21--architecture-streamline--optimization-audit)
22. [Autonomous QA & Visual Testing Agent](#22--autonomous-qa--visual-testing-agent)

[Appendix — How the original prompts were merged](#appendix--how-the-original-prompts-were-merged)

---

# Part I — Scraper Core & Configuration

## 1 — Advanced Settings

Create an **Advanced Settings** panel for the anime episode scraper. The goal is to
give power users complete control over the scraping process while remaining
beginner-friendly.

Implement the following features.

### Network

- Custom User-Agent
- Custom request headers
- Cookie editor
- HTTP/HTTPS proxy support
- Proxy rotation
- Retry attempts
- Retry delay
- Request timeout
- Concurrent requests limit
- Random delay between requests
- Follow redirects toggle
- SSL verification toggle

### Browser Automation

- Headless mode
- Visible browser mode
- Browser selection (Chromium, Firefox)
- Custom viewport
- JavaScript wait timeout
- Wait until network idle
- Scroll page before scraping
- Scroll speed
- Number of scroll passes
- Execute custom JavaScript before extraction

### Request Pacing & Session

> *Reframed from the original "Anti-Bot" list. Features whose purpose is to **evade**
> a site's protections are intentionally excluded (see the guiding principle on
> respecting site access). What remains are legitimate reliability/pacing controls.
> Cloudflare/CAPTCHA appear only as **detection** signals in §3, never as bypass
> features.*

- Configurable request timing / random request timing **within user-set limits**
- Consistent, configurable browser fingerprint (for site compatibility, not spoofing)
- Session persistence (reuse an authenticated session the user established)

### Extraction

- CSS selector overrides
- XPath overrides
- Regex extraction support
- Attribute selection
- Multiple fallback selectors
- Ignore hidden elements
- Clean extracted text
- Decode HTML entities
- Remove duplicate episodes
- Normalize episode numbering
- Auto detect season numbers
- Auto detect specials, OVAs and movies

### Episode Processing

- Sort episodes naturally
- Detect missing episode numbers
- Merge duplicate sources
- Keep highest quality stream
- Prefer subbed
- Prefer dubbed
- Prefer raw
- Language priority list
- Resolution priority
- Ignore filler toggle
- Ignore recap episodes
- Rename episodes automatically

### Images

- Download thumbnails
- Compress thumbnails
- Resize thumbnails
- Convert image format
- Generate missing thumbnails
- Cache images locally

### Metadata

- Fetch synopsis
- Fetch genres
- Fetch studio
- Fetch air dates
- Fetch MAL ID
- Fetch AniList ID
- Fetch TMDB ID
- Fetch IMDb ID
- Fetch rating
- Fetch duration
- Fetch opening/ending information

### Performance

- Memory limit
- CPU limit
- Disk cache
- Cache expiration
- Parallel scraping workers
- Incremental scraping
- Resume interrupted scrape
- Skip already processed pages

### Logging

- Debug mode
- Verbose logs
- Network logs
- DOM snapshot on failure
- Save HTML on errors
- Save screenshots
- Export logs
- Error statistics

### Validation

- Detect broken episode links
- Verify video URLs
- Detect duplicate URLs
- Validate thumbnails
- Validate metadata completeness
- Report missing episodes

### Export

- JSON
- CSV
- SQLite
- MySQL
- PostgreSQL
- XML
- YAML
- Auto-save interval
- Pretty print JSON
- Compress export

### Scheduler

- Scheduled scraping
- Watch website for updates
- Auto scrape every X hours
- Notify when new episodes appear
- Discord webhook
- Telegram notifications
- Email notifications

### Profiles

- Save settings profiles
- Import/export profiles
- Per-site configuration
- Default profile
- Reset profile

### Developer

- Live DOM inspector
- Selector tester
- XPath tester
- Regex tester
- Network inspector
- Request replay
- Response viewer
- Console output
- Performance profiler

### UI

- Search settings
- Categories
- Tooltips
- Presets (Fast, Balanced, Thorough)
- Dark mode support
- Collapsible sections
- Import/export settings JSON

### Architecture

The settings system must:

- be modular
- support future plugins
- automatically persist settings
- validate all user input
- include sensible defaults
- support versioned migrations
- be fully typed
- allow per-website overrides
- expose a settings API for plugins

### Anime-specific advanced features

- Automatic next-episode detection.
- Detection of multiple streaming mirrors with health checks.
- Preferred provider ranking.
- Automatic skip of intros/outros if timestamps are available.
- Multi-language title matching (English, Romaji, Japanese).
- Fuzzy matching to avoid duplicate series.
- Detection of split-cour seasons.
- Automatic update mode that only scrapes newly released episodes.
- Per-site scraping rules that can be updated independently without changing the core application.
- Plugin support so new anime websites can be added as separate modules rather than modifying the main scraper.

---

## 2 — Connection Profiles

Create a production-quality **Connection Profiles** system for the anime metadata and
episode scraper. The goal is to provide powerful per-site networking, browser,
caching, and performance settings **while respecting each site's access requirements.**

### Connection Profiles

Support unlimited named profiles. Each profile contains:

- Profile name
- Description
- Icon
- Tags
- Default/Custom
- Import/Export
- Clone profile
- Version history
- Rollback

### Network

- Connection timeout
- Read timeout
- Retry attempts
- Retry backoff strategy
- Concurrent requests
- Request throttling
- Randomized request intervals (within configured limits)
- Maximum redirects
- DNS cache
- HTTP/2 support
- Compression (gzip/br)
- Keep-alive
- Preferred protocol
- Bandwidth limits

### Browser

- Browser engine selection
- Headless or visible mode
- Window size
- Device presets
- JavaScript enabled/disabled
- Wait conditions
- Custom page load timeout
- Automatic scrolling
- Screenshot on failure

### Headers

- Custom User-Agent
- Accept headers
- Language headers
- Referer
- Origin
- Per-site custom headers
- Header templates

### Authentication

- Secure credential storage
- Session management
- Cookie import/export
- Login status
- Session expiration detection
- Manual login workflow
- Multiple saved accounts

### Site Overrides

Every website may override:

- Timeouts
- Concurrency
- Browser settings
- Parsing rules
- Selectors
- Headers
- Cookies
- Authentication
- Request pacing

### Cache

- HTML cache
- Metadata cache
- Thumbnail cache
- Cache lifetime
- Cache cleanup
- Offline mode

### Monitoring

- Response time
- Success rate
- Failure rate
- Last successful scrape
- Error categories
- Request history
- Profile performance statistics

### Logging

- Network log
- Browser log
- Parsing log
- Error log
- Export logs
- Debug mode
- Performance timeline

### Safety

- Respect robots.txt (optional)
- Configurable crawl delays
- Maximum requests per minute
- Automatic pause after repeated failures
- Domain-specific rate limits

### Built-in preset profiles

- Fast
- Balanced
- Conservative
- Metadata Only
- Browser Assisted
- Low Bandwidth

Allow users to create unlimited custom profiles.

### UI

- Search settings
- Advanced/Basic mode
- Live validation
- Tooltips
- Profile comparison
- One-click profile switching
- Import/export JSON

### Architecture

- Strongly typed
- Modular
- Future plugin support
- Automatic migrations
- Validation
- Unit tests

### Additional advanced ideas

- Per-site scraping rules and selector versioning.
- A visual selector editor with live preview.
- Automatic detection when a site's layout changes.
- A scrape simulator that shows what data would be extracted without saving it.
- Rule inheritance (e.g., one profile inherits from another and overrides only a few settings).
- Scheduled health checks for configured sites.
- A diagnostics page that summarizes connection quality, parsing success, and cache efficiency.
- Batch scraping queues with pause/resume and priority controls.
- Automatic export/import of all scraper profiles and site configurations.
- A plugin SDK so new site connectors can be added without modifying the core application.

---

# Part II — Sites, Sources & Servers

## 3 — Verified Sites Manager

Create a production-quality **Verified Sites** manager. The goal is to maintain a
curated list of websites that are known to work correctly with the scraper and provide
a health status for each one.

### Site Database

Each verified site should contain:

- Unique ID
- Site name
- Base URL
- Display icon/favicon
- Description
- Supported language(s)
- Country
- Site category
- Supported content (Anime, Movies, TV, OVAs, Specials)
- Current scraper version
- Last verified date
- Last successful scrape
- Average scrape time
- Success rate (%)
- Reliability score (0-100)
- Active/Inactive status
- Notes

### Compatibility

Display support for:

- Episode list extraction
- Metadata extraction
- Thumbnail extraction
- Synopsis extraction
- Genres
- Ratings
- Stream links
- Multiple seasons
- Search support
- Pagination support
- Infinite scroll support
- JavaScript rendering required
- Login required
- Cloudflare protection *(detection only — surfaced so the user knows a site needs a
  browser session or a manual login; never an evasion feature)*
- CAPTCHA detection *(detection only)*

### Health Monitoring

Automatically:

- Test each site periodically
- Record failures
- Record response times
- Detect HTML/layout changes
- Detect selector failures
- Detect DNS failures
- Detect SSL issues
- Detect redirects
- Detect anti-bot protection *(so it can be reported/handled respectfully, e.g. by
  pausing or requiring a manual login — not bypassed)*

Calculate an overall health score.

### Verification

Each site can be:

- Verified
- Experimental
- Community Tested
- Broken
- Deprecated

Show badges with different colors.

### Filtering

Allow filtering by:

- Working only
- Fastest
- Highest success rate
- Country
- Language
- Features
- JavaScript required
- Login required
- Cloudflare protected

### Search

Support searching by:

- Name
- URL
- Language
- Tags

### Site Profiles

Each site should store:

- CSS selectors
- XPath selectors
- Regex rules
- Episode URL patterns
- Pagination strategy
- Anti-bot strategy *(how to respectfully cope — delays, manual login prompts — not
  circumvention)*
- Delay recommendations
- Retry recommendations
- Custom headers
- Cookies (optional)
- JavaScript execution scripts

### Automatic Updates

Support:

- Import/export verified site database
- Versioning
- Automatic profile updates
- Rollback to previous versions
- Backup before updates

### Statistics Dashboard

Show:

- Total verified sites
- Currently working sites
- Broken sites
- Average health score
- Average scrape speed
- Last verification time
- Most reliable sites

### UI

Display sites as cards showing:

- Logo
- Name
- Status badge
- Reliability score
- Last verified
- Features
- Health indicator

Clicking a card opens full technical details.

### Architecture

- Strongly typed models
- Modular design
- Local JSON database
- Future API support
- Validation
- Unit tests
- Clean UI components

---

## 4 — Community Site Sources

Support optional integration with external community-maintained directories such as
FMHY.

Requirements:

- Do not hardcode community site lists into the application.
- Allow importing site information from supported external sources.
- Treat imported sites as "Unverified" by default.
- Automatically run compatibility tests before marking a site as Verified.
- Store imported sites separately from the built-in verified database.
- Display the source of each site (Built-in, FMHY, User Imported, Community).
- Allow users to promote imported sites to Verified after successful testing.
- Detect duplicate sites.
- Support manual refresh of imported site lists.
- Cache imported lists locally.

---

## 5 — Video Server Profiles

Create a production-quality **Video Server Profiles** system. The goal is to support
websites that provide multiple video servers per episode. Each server may use a
different embedded player, extraction method, metadata format, and capabilities.

### Server Database

Each server profile contains:

- Server ID
- Server name
- Display icon
- Description
- Provider
- Supported websites
- Current profile version
- Last verified
- Reliability score
- Average response time
- Active/Deprecated status
- Notes

### Supported Capabilities

Display for every server:

- Stream discovery
- Multiple qualities
- Subtitle support
- Multiple audio tracks
- Episode switching
- Mirror support
- Resume playback
- Download capability (where authorized)
- Thumbnail extraction
- Chapter support

### Website Compatibility

Every supported website should display its supported servers. For each server show:

- Reliability score
- Last verified
- Preferred by default
- Detection success rate
- Average extraction time

### Server Profiles

Each server profile stores:

- Detection rules
- DOM selectors
- API endpoints (if applicable)
- Metadata extraction rules
- Stream discovery rules
- Subtitle discovery rules
- Audio track discovery
- Quality discovery
- Fallback extraction strategy
- Timeout settings
- Retry settings
- Custom headers
- Cookies (optional)
- JavaScript requirements

### Server Selection

Allow users to configure a preferred server order (e.g. 1. Server A, 2. Server C,
3. Server B). Automatically switch to the next server if one fails. Support per-website
preferred server lists.

### Automatic Detection

Automatically detect:

- Available servers
- Default server
- Offline servers
- Broken servers
- Duplicate servers
- Supported qualities
- Subtitle availability
- Audio languages

### Health Monitoring

Continuously track:

- Success rate
- Failure rate
- Response time
- Extraction success
- Metadata completeness
- Stream availability
- Profile compatibility

Automatically mark unstable servers.

### Diagnostics

Provide a diagnostics page showing:

- Detected website
- Available servers
- Current selected server
- Detected player technology
- Available qualities
- Available subtitle languages
- Available audio languages
- Server health
- Extraction logs
- Performance timeline

### Plugin Architecture

Each server is an independent plugin. Plugins implement:

- Detection
- Metadata extraction
- Stream discovery
- Subtitle discovery
- Quality discovery
- Validation
- Diagnostics

### UI

Every anime page should show available servers with a reliability percentage, e.g.:

```
Available Servers
✓ Server A (98%)
✓ Server B (92%)
✓ Server C (Experimental)
```

Clicking a server displays:

- Supported qualities
- Subtitle availability
- Audio languages
- Reliability
- Last verification
- Detection method
- Compatibility notes

Support drag-and-drop ordering of preferred servers.

Generate production-quality code with modular architecture, automatic profile updates,
versioned server definitions, validation, unit tests, and full TypeScript typing.

---

## 6 — Unified Multi-Source Search

Create a single search bar that searches across all enabled sources (Tachiyomi-style).

### Purpose

Allow users to search once and receive results from multiple databases/connectors.

Example — user searches `Frieren`, the system searches Source A, Source B, Source C,
metadata providers, and the local library, then combines the results.

### Features

- One universal search bar
- Parallel searching
- Real-time results
- Search suggestions
- Fuzzy matching
- Alternative title matching
- Japanese title matching
- Romaji matching
- Author/studio matching

Results should display:

- Title
- Cover
- Source
- Language
- Availability
- Metadata quality
- Episode count
- Tracking status

### Source Search Profiles

Each connector supports:

- Search endpoint
- Search method
- Search selectors
- API configuration
- Result parser
- Metadata mapping

Allow:

- Enable/disable sources
- Change search priority
- Source groups
- Custom source ordering

### Search Management

- Search history
- Recent searches
- Favorite searches
- Search filters
- Advanced search

Filters: Genre, Year, Season, Status, Language, Source, Type.

### Smart Result Merging

Combine duplicate results. Example — Source A: `Attack on Titan`, Source B: `進撃の巨人`,
Source C: `Shingeki no Kyojin` merge into one anime entry using the **Anime/Media
Identity Engine** (see §7). Display all the sources that carry it:

```
Available sources:
✓ Source A
✓ Source B
✓ Source C
```

---

# Part III — Media Ecosystem (beyond anime)

## 7 — Global Media Provider System

Expand the application beyond anime into a general media localization layer. The
important design idea is **not** to hardcode "anime sites" but to create content
providers + metadata providers that can support anime, J-drama, C-drama, movies, TV,
etc.

### Supported content types

- Anime
- Japanese drama (J-drama)
- Chinese drama (C-drama)
- Korean drama
- Movies
- TV series
- Documentaries
- Specials
- OVAs
- Web series

Create a **universal media model** so all content types share the same architecture.

### Media Identity Engine

Create a universal identification system. Match:

- Title
- Original title
- Japanese title
- Chinese title
- Korean title
- Romaji title
- Alternative titles
- Year
- Studio
- Actors
- Director
- Episode count

Support IDs: TMDB ID, IMDb ID, AniList ID, MAL ID, TVDB ID, Custom provider IDs.

Prevent duplicates across sources.

### Content Providers

Create modular provider plugins. Each provider stores:

- Provider name
- URL
- Content types supported
- Languages
- Search capability
- Metadata capability
- Episode capability
- Availability status
- Reliability score

Support movie providers, drama providers, anime providers, and user-added providers.

### Media Browser

Expand the integrated browser (see §11) to allow browsing anime sources, movie
sources, drama sources, and subtitle sources. Supported pages can expose:

- "Add to Library"
- "Track"
- "Find Subtitles"
- "Match Metadata"

### Tracking System Expansion

Track:

- **Anime:** episodes, seasons
- **Drama:** episodes, completed status
- **Movies:** watched status

Store: progress, release schedule, preferred language, subtitle preference.

### Drama-specific & movie-specific metadata

- **Drama:** actors, episodes per week, broadcast network, original air schedule, country.
- **Movie:** runtime, directors, cast, release regions, age ratings.

### Global Search

The universal search bar (see §6) should search across anime, movies, J-drama,
C-drama, TV series, subtitle databases, and the local library. Example — search
`First Love` returns matching anime, J-drama, and movies plus available subtitles.

---

## 8 — Subtitle Provider & Management System

Create a dedicated subtitle management system that works across all content types.

### Subtitle Providers

Subtitle providers contain:

- Provider name
- Supported languages
- Search method
- Matching rules
- Format support
- Reliability score

Support subtitle formats: SRT, ASS, SSA, VTT, Embedded subtitles.

Subtitle matching — automatically match subtitles by: Title, Episode number, Season,
Release year, Release group, Duration, Language.

### Subtitle Management

> *Scope note (per the external-player decision in §9): this system does **not** play
> subtitles. It **manages, downloads, organizes, and provides** subtitle files to
> external playback applications.*

Allow users to:

- Search subtitles separately
- Select preferred languages
- Select subtitle priority
- Download subtitle files where permitted
- Replace subtitles
- Manage subtitle versions

Preferences:

- Primary subtitle language
- Secondary subtitle language
- Preferred style: Full subtitles / Signs and songs / Forced subtitles

### Language Support

Support Japanese, Chinese, Korean, English, Spanish, French, German, and custom
languages. Display available subtitles, e.g.:

```
Available subtitles:
English ✓
Japanese ✓
Chinese ✓
```

### Subtitle Quality System

Rate subtitle sources by: Accuracy, Sync quality, Translation quality, Completeness,
User rating. Display a subtitle quality score.

### Subtitle synchronization tools

- Shift subtitles +/− milliseconds
- Auto-detect offset
- Save subtitle adjustments per series

### Translation management

- Multiple subtitle versions
- Compare subtitles
- Preferred translator/group

---

## 9 — External Player Integration & Playback Handoff

> *This is the reconciled, final decision: the app is the brain/database; playback is
> delegated. It replaces the earlier "built-in media player" idea entirely. The only
> in-app player is the study-focused learning player in §16.*

The application does not contain a built-in video player. Instead, provide integration
with external playback applications.

### Requirements

- Open media in external players
- Send selected media information
- Send subtitle information
- Send metadata information
- Remember preferred external player

### Supported actions

- Open episode/movie
- Open with selected application
- Pass subtitle file
- Pass media metadata
- Resume playback position (if supported)

### Player Profiles

Store:

- Player name
- Application path
- Operating system compatibility
- Supported protocols
- Command arguments
- Subtitle support
- Resume support

Examples: VLC, mpv, IINA, Custom players.

### Playback Handoff

When opening media, send: Media location, Title, Episode number, Subtitle files, Audio
preference, Metadata.

Allow:

- Choose player manually
- Default player
- Per-content-type player
- Remember last used player

Rationale: this keeps the app specialized and avoids recreating years of work that
VLC/mpv/IINA already handle.

---

## 10 — Media Hub

Replace any unorganized "dump everything in one folder" media storage with a
professional **Media Hub** — one central system for all media that keeps different
content types separated and searchable, and turns every file into potential learning
material.

### Media Core

Create a universal media database. Supported content:

- Anime
- J-drama
- C-drama
- Movies
- TV shows
- Music
- Podcasts
- Audiobooks
- Japanese learning videos
- Personal recordings

### Media Categories

- Anime Library
- Drama Library
- Movie Library
- Music Library
- Learning Materials
- Personal Media
- Unsorted Inbox

### Media Ingestion System

When new files are added, automatically: Detect file type, Identify content, Extract
metadata, Match existing entries, Rename files, Move into correct folders. Support:
Manual import, Drag and drop, Folder watching, Automatic scanning.

### Media Identity Matching

Detect Title, Season, Episode, Year, Language, Resolution. Match against the existing
database and metadata providers. Prevent duplicates. (Shares the Media Identity Engine
from §7.)

### Media Database

Store:

- **General:** Title, Alternative titles, Cover, Description, Genre, Year
- **Video:** Resolution, Codec, Duration, Audio tracks, Subtitle tracks
- **Learning:** Japanese difficulty, JLPT level, Vocabulary count, Kanji count

### Smart Organization

Automatically organize, e.g.:

```
/Anime/
 └── Frieren/
     └── Season 1/
         └── Episode files

/Movies/
 └── Title (Year)

/Music/
 └── Artist/
     └── Album/
```

### Media Search

Search: Title, Artist, Actor, Vocabulary, Subtitle text, Genre, Language.

### Media Dashboard

Display: Recently added, Continue watching, Continue studying, Recently listened,
Favorites, Recommended, Unorganized files.

### Media Relationships

Allow connections:

- Anime → Vocabulary
- Drama → Sentences
- Song → Lyrics
- Movie → Study notes
- Episode → Flashcards

### Storage Management

- Duplicate detection
- Storage usage
- File cleanup
- Missing file detection
- Broken link detection
- Backup support

### Japanese Study OS Integration

Every media item can become learning material. Actions: Study this, Analyze Japanese,
Extract vocabulary, Create flashcards, Save sentences, Add notes.

### Final architecture

```
Japanese Study OS
       |
   Media Hub
       ├── Video Player (learning; §16)
       ├── Music Player
       ├── Subtitle System (§8)
       ├── Library Manager
       ├── Search Engine (§6)
       └── Learning Integration
```

---

## 11 — Anime Dashboard & Tracking Hub

Create a beautiful minimalistic macOS-style home screen where users can discover
upcoming anime, track releases, monitor sources, and manage their followed anime.

### Home Dashboard

Design: Minimalistic, Glassmorphism, Rounded cards, Smooth animations, Dark/light mode,
Native macOS feeling, Clean typography, Minimal clutter.

### Upcoming Anime Timeline

Display: Upcoming anime releases, Air date, Countdown timer, Season, Episode number,
Release status, Studio, Cover art, Genres.

Views: Today, This week, This month, Current season, Next season.

Sort by: Release date, Popularity, User priority, Recently added, Source availability.

### Smart Tracking System

When an anime is tracked, store: Anime title, Alternative titles, Japanese title,
Cover, MAL ID, AniList ID, Seasons, Episode progress, Last watched episode, Release
schedule, Preferred sources, Preferred servers, Preferred subtitles/audio.

Automatically: Detect new episodes, Update release status, Notify user, Show missing
episodes, Detect delays, Detect finished series.

### Source Monitoring

Display where information comes from, e.g. an upcoming episode tracked across Site A,
Site B, Site C. Show: Last checked, Site status, New episode detected, Scrape success
rate, Source reliability.

Allow users to customize: which sites are monitored, priority order, enable/disable
sources, custom source groups.

### Site Browser Feature

Create an integrated browser inside the application: Tab system, Back/forward buttons,
Address bar, Bookmarks, History, Reader mode, Developer inspector.

For supported websites, add a floating **"Track Anime"** action button. When clicked,
detect: Anime title, Cover image, Metadata, Season, Available episodes; then show a
confirmation to add it to the library, listing the sources it was found on.

### Smart Website Integration

Each website profile stores: URL, Website name, Supported features, Tracking support,
Metadata selectors, Search selectors, Anime detection rules, Episode detection rules.
The browser should automatically recognize supported websites.

### Library

Sections: Watching, Completed, Planned, Dropped, Favorites.

Each anime card shows: Cover, Progress, Next episode, Release countdown, Available
sources, Quality options.

### Notifications

Support: New episode alerts, Release reminders, Failed source alerts, Site availability
alerts. Methods: Desktop notifications, In-app notifications, Optional webhook support.

### Smart Recommendations

Based on: Watched anime, Tracked genres, Similar titles, Seasonal popularity. Display
"You may like" and "New releases similar to your library".

### Calendar View

An anime release calendar showing each day's episodes. Features: Filter by tracked
only, Filter by source, Export calendar, Reminder settings.

### Data Architecture

Create: Anime database, Source database, Tracking database, User preferences, Browser
profiles, Notification system. Support: Local database, Sync-ready architecture,
Import/export, Backup.

### Advanced Settings

Allow customization of: Dashboard layout, Displayed sources, Tracking interval,
Notification preferences, Default browser behavior, Preferred metadata provider,
Preferred source priority, Theme customization.

### Architecture

- Modular components
- Plugin support
- Strong TypeScript typing
- Clean separation between UI, database, scraper, and browser
- Unit tests
- Migration system

### Additional features

- **Source confidence score** → "this anime is confirmed on 4/5 tracked sites."
- **Smart duplicate detection** → avoids "Attack on Titan", "Shingeki no Kyojin", and
  the Japanese title being treated as separate anime.
- **Anime availability map** → a small panel showing which sites currently have the
  newest episode.
- **One-click tracking from any supported site** → the killer feature.
- **Watchlist sync adapters** → optional integration with services like AniList/MyAnimeList.

---

## 12 — YouTube Content Manager

Integrate a YouTube manager as a universal content acquisition system that can import
YouTube content, analyze it, organize it, and convert it into Japanese Study OS learning
material.

```
YouTube → Import → Metadata → Transcript → Subtitles → Vocabulary → Study Tools → Media Library
```

### YouTube Connector System

Store: Channel ID, Channel name, Channel icon, Playlist ID, Playlist name, Subscription
status, Last checked, Update frequency. Support: Individual videos, Playlists, Channels,
Shorts, Live streams, Educational content.

### Content Tracking

Allow users to track channels, playlists, and individual videos. Automatically detect:
New uploads, Updated videos, Removed videos, Playlist changes. Display: New content
available, Watched status, Study status, Processing status.

### Video Metadata System

Extract and store: Title, Description, Channel, Upload date, Duration, Thumbnail, Tags,
Categories, Chapters, Comments (optional), Language information. Connect with the
Universal Media Database and Learning Database.

### Transcription Pipeline

Support: Existing captions, Automatic transcription, Multiple languages. Store:
Transcript text, Timestamp data, Language, Confidence score, Speaker information (if
available). Formats: SRT, VTT, TXT, JSON.

### Japanese Learning Analysis

For Japanese videos, analyze transcripts and detect: Vocabulary, Kanji, Grammar points,
JLPT level, Difficult sentences, Common expressions. Click a sentence → Translation,
Word breakdown, Grammar explanation, Add flashcard, Save sentence.

### Subtitle System

Integrate with the global subtitle engine (§8). Support Japanese, English, Dual, and
Custom subtitles. Features: Subtitle synchronization, Subtitle editing, Subtitle export,
Sentence extraction.

### Playlist Organization

Create smart playlists — e.g. Japanese Listening Practice, Anime Analysis, News
Japanese, Beginner Japanese, Advanced Japanese. Features: Tags, Difficulty level,
Learning goals, Progress tracking.

### Download Management

Create a media download manager: Download queue, Progress tracking, Pause/resume,
Storage location selection, File organization, Metadata attachment. Store: Original
source, Download date, Quality information, Language information.

### Media Library Integration

Imported YouTube content should appear in the Media Hub. Categories: Learning Videos,
Podcasts, Lectures, Entertainment, Japanese Content. Connect: Video → Transcript →
Vocabulary → Flashcards.

### Smart Recommendations

Recommend content based on: Learning level, Watched videos, Saved vocabulary, Interests,
Study goals.

### AI Assistant Integration

AI features: Summarize videos, Explain difficult Japanese, Generate study notes, Create
vocabulary lists, Generate quizzes, Create listening exercises.

### Search

Universal search across: YouTube videos, Anime, Drama, Movies, Local media, Transcripts,
Saved sentences. Search by: Title, Transcript text, Vocabulary, Channel, Topic.

### Japanese Study OS Connection

Send data to: Flashcard system, Kanji system, Grammar system, Dictionary, AI tutor.
Track: Listening hours, Vocabulary learned, Sentences saved, Study sessions.

### Architecture

- Modular connector
- Shared Media Hub integration
- Shared database
- Plugin support
- Background processing
- Queue system
- Error handling
- Versioned metadata
- Offline cache

### Content Pipeline

Everything enters the same flow so modules don't duplicate the same functions:

```
YouTube · Anime · Drama · Movies · Music · Books
                    ↓
                Media Hub
                    ↓
              Metadata Engine
                    ↓
                AI Analysis
                    ↓
             Japanese Study OS
     (Vocabulary · Kanji · Grammar · Flashcards · Listening Practice)
```

---

# Part IV — Japanese Study OS Integration

## 13 — Media Module Integration into Japanese Study OS

Integrate the anime and media management application as a native application/module
inside Japanese Study OS, so it feels like a first-party component of the OS rather
than a separate application.

### App architecture

- Use the existing Japanese Study OS architecture
- Follow existing UI patterns
- Share global services
- Share authentication/user profiles
- Share settings
- Share database systems where appropriate
- Use the same design language

The app should appear alongside other Japanese Study OS applications.

### Shared OS Services

- **User Profile System** — user preferences, learning goals, language level, study history
- **Settings System** — theme, appearance, notifications, storage locations, privacy settings
- **Database System** — shared user database, shared vocabulary database, shared content
  database, shared progress tracking

### Japanese Learning Integration

For every piece of media store: Japanese title, English title, Difficulty level, JLPT
estimation, Vocabulary frequency, Kanji frequency, Grammar difficulty.

Allow users to: Save words from media, Create flashcards, Add sentences to sentence
mining, Save grammar examples, Add kanji entries.

### Media Discovery App

- **Dashboard** — Upcoming anime, Recently released episodes, Tracked media, Recommended
  content, Study recommendations
- **Universal Search** — Anime, J-drama, C-drama, Movies, Local library, Learning materials

### Content Library

A Japanese-learning-focused media library. Categories: Currently studying, Completed,
Planned, Vocabulary mining, Favorite learning content.

Cards display: Cover, Progress, Difficulty, JLPT level, Language availability, Subtitle
availability.

### Subtitle Learning System

Features: Japanese subtitle support, English subtitle support, Dual subtitles, Sentence
extraction, Word lookup, Kanji lookup, Grammar lookup.

Click a subtitle sentence → Show translation → Show vocabulary → Show kanji readings →
Add to flashcards.

### Study Mode Connection

Create actions: "Study This Episode", "Mine Vocabulary", "Create Flashcards", "Review
Sentences", "Analyze Japanese". Send extracted information to the Flashcard app, Kanji
app, Grammar app, and Dictionary app.

### AI Learning Assistant Connection

Allow AI features: Explain dialogue, Explain grammar, Simplify Japanese, Generate
example sentences, Identify JLPT level, Create study notes.

### Notification Integration

Use the Japanese Study OS notification system. Notify: New episodes, Study reminders,
Vocabulary reviews, Saved content reminders.

### Data Structure

Create shared models: Anime, Drama, Movie, Episode, Subtitle, Sentence, Vocabulary,
Kanji, Grammar Point, Study Session.

### UI Requirements

Follow Japanese Study OS design: same navigation, same components, same animations,
same themes, same settings system. The media module should feel like a built-in
Japanese Study OS application.

### Final goal

Create a complete Japanese immersion environment where users can discover Japanese
media, track shows, watch content, mine vocabulary, study sentences, learn kanji,
review grammar, and track progress.

---

## 14 — Japanese Content Intelligence & Study Extraction

Add a Japanese Content Intelligence layer: the app doesn't just find media, it analyzes
language difficulty and turns content into study material. This engine is **shared
across all media types** (anime, drama, movies, YouTube, visual novels) — see the
Unified Japanese Content Database below.

### Japanese Difficulty Analysis Engine

Analyze: Anime, J-drama, C-drama Japanese subtitles (if available), Movies, Visual
novels, YouTube Japanese content.

Display a **Japanese Difficulty Score**:

```
Beginner      N5-N4
Intermediate  N3
Advanced      N2
Native        N1+
```

### Jiten / Dictionary Integration

Use available dictionary data to analyze: Vocabulary frequency, Kanji frequency, JLPT
level, Commonness, Reading difficulty, Pitch accent (if available), Grammar complexity.

For every title generate a **Language Profile**:

- **Vocabulary** — Total unique words, Known words estimate, Unknown words estimate,
  JLPT distribution. Example:

  ```
  N5: 250 words
  N4: 430 words
  N3: 800 words
  N2: 500 words
  N1: 200 words
  Unknown: 300 words
  ```

- **Kanji** — Total kanji count, Unique kanji, JLPT distribution, Most frequent kanji
- **Grammar** — Common grammar points, JLPT grammar distribution

### Subtitle Analysis Pipeline

If dictionary data exists, analyze directly. If dictionary data is unavailable, use
subtitle mining:

```
Media → Japanese subtitles → Sentence extraction → Tokenization →
Word detection → Kanji detection → Grammar detection → Difficulty calculation
```

Support: Full series analysis, Single episode analysis, Selected episode analysis,
Custom time range analysis.

### Vocabulary Mining

Extract: Words, Kanji, Expressions, Idioms, Grammar patterns, Useful sentences.

For every item store: Japanese, Reading, Meaning, Frequency, Episode source, Timestamp,
Sentence context, Difficulty level.

### Anime Language Profile

Every anime/media entry receives a Language Profile Card, e.g.:

```
Attack on Titan
Japanese Difficulty: N2
Vocabulary: 3,400 unique words
Kanji: 950 unique kanji
Grammar: N3-N1
Best for: Intermediate learners
Recommended level: JLPT N2+
```

### User Study Profile Integration

Compare media difficulty with the user's level. Example — user is N3, anime is N1
difficulty → show *"This content contains approximately 35% unknown vocabulary."*
Recommend: Beginner friendly / Challenging / Native level.

### Anime Flashcard Deck System

Create downloadable study decks from media profiles. Users can select: Entire anime,
Season, Episode range, Specific episodes, Specific scenes. Generate: Vocabulary cards,
Kanji cards, Sentence cards, Grammar cards.

### Anki Integration

Use the existing Anki mapping system. Export: Japanese, Reading, Meaning, Audio, Image,
Sentence, Translation, Episode reference, Timestamp, Frequency, JLPT level.

Support: Existing note types, Existing card templates, User custom templates, Duplicate
detection.

### Personal Media Decks

Allow users to create "Learn Japanese from this anime" profiles. Example — *My Frieren
Deck*: 500 vocabulary cards, 200 sentences, 80 kanji, 30 grammar points. Allow: Export,
Share, Backup, Update when new episodes release.

### Unified Japanese Content Database

Anime, Drama, Movies, YouTube, and Visual Novels all share: Vocabulary database,
Sentence database, Kanji database, Grammar database, User progress, Anki integration.

**Shared Japanese Text Mining Engine.** Do not build two separate systems — anime
(subtitles → sentences → vocabulary) and visual novels (dialogue text → sentences →
vocabulary) use almost the exact same pipeline. The full visual-novel platform is
detailed in §15.

### Final goal

Transform the scraper into a Japanese immersion analysis engine:

```
Find content → Analyze Japanese difficulty → Create language profile →
Mine vocabulary/subtitles/text → Generate study decks → Sync with Anki →
Track learning progress
```

---

## 15 — Visual Novel Immersion Platform

Visual novels are one of the best sources of Japanese immersion. Create a complete
Visual Novel module inside Japanese Study OS — not just a "tracker" but a learning
platform where users discover, organize, play, track, analyze, and study Japanese from
visual novels. It reuses the shared Text Mining Engine from §14.

Supported content: Visual novels, Eroge (where appropriate), Otome games, Japanese ADV
games, Story-based games.

### Visual Novel Database

- **Basic Information** — Title, Japanese title, English title, Alternative titles,
  Developer, Publisher, Release date, Original platform, Available platforms, Genre,
  Tags, Cover art, Background images, Screenshots
- **Story Information** — Synopsis, Themes, Routes, Chapters, Endings, Character list,
  Estimated playtime
- **Language Information** — Japanese difficulty, JLPT estimate, Vocabulary count, Kanji
  count, Grammar difficulty, Reading difficulty, Dialogue style

### Visual Novel Sources

Provider integrations can provide: Metadata, Release information, Characters,
Screenshots, Tags, Reviews, Language information. Support: Official databases,
User-added databases, Local game detection.

### Local Visual Novel Library

Detect installed visual novels. Store: Installation location, Executable path, Game
engine, Version, Language, Last played, Playtime. Support: Add manually, Scan folders,
Import library, Remove entries, Update metadata.

### Game Engine Detection

Detect common VN engines: Ren'Py, KiriKiri, NScripter, Unity, RPG Maker, TyranoBuilder,
Custom engines. Store: Engine type, Text extraction capability, Compatibility status.

### Reading Tracker

Store: Current visual novel, Current route, Chapter, Scene, Completion percentage,
Playtime, Last played date. Status: Planned, Reading, Completed, Dropped, Replaying.

### Route and Ending Tracker

Track per character: Route started, Route completed, Ending achieved. Example:

```
Game: Steins;Gate
Routes:
✓ Kurisu Ending
✓ Mayuri Ending
○ Suzuha Ending
○ Faris Ending
```

### Text Extraction System

Extract: Dialogue, Narration, Choices, Character names, System text. Store: Original
Japanese text, Translation, Timestamp/scene reference, Character speaker, Context.

### Visual Novel Language Analyzer

Generate a **Japanese Difficulty Profile**:

- **Vocabulary** — Total unique words, Frequency ranking, JLPT distribution, Unknown
  vocabulary estimate
- **Kanji** — Unique kanji, Frequency, Readings, Difficulty
- **Grammar** — Common grammar patterns, JLPT level, Casual expressions, Formal expressions

### Character Speech Analysis

Store a character language profile, e.g. *Makise Kurisu* — formal, scientific
vocabulary, logical expressions, occasional casual speech. Detect: Sentence endings,
Pronouns used, Dialect, Politeness level, Personality markers.

### Reading Assist Mode

- Click a word → Reading, Meaning, Kanji breakdown, Grammar, Examples
- Click a sentence → Translation, Grammar analysis, Difficulty, Save sentence

### Vocabulary Mining

Mine: Entire VN, Current route, Current chapter, Selected scenes. Generate cards with
Front = Japanese word, Back = Meaning, Reading, Example sentence, Scene reference.

### Anki Integration

Vocabulary / Sentence / Kanji / Grammar cards. Include: Japanese text, Reading,
Translation, Screenshot, Audio (if available), Character name, Scene information,
Frequency, JLPT level.

### Visual Novel Study Decks

Create personal decks — e.g. *My Steins;Gate Study Deck* (1200 vocab, 300 sentences,
100 kanji, 50 grammar). Allow: Update decks as progress continues, Remove known words,
Prioritize repeated words.

### AI Visual Novel Assistant

Explain: Difficult dialogue, Character speech, Cultural references, Historical
references, Wordplay. Generate: Summaries, Vocabulary lists, Grammar explanations, Study
notes.

### Recommendation Engine

Recommend based on: User JLPT level, Known vocabulary, Completed VNs, Interests, Genre
preference (e.g. N3 → beginner-friendly slice-of-life VN; advanced → literary VN).

### Community Features

User reviews, Difficulty ratings, Language difficulty reports, Study deck sharing, Route
guides.

### Integration with Japanese Study OS

Connect with: Dictionary, Kanji app, Grammar app, Flashcards, AI tutor, Media Hub.
Shared data: Vocabulary learned, Sentences saved, Study time, Reading progress.

### Final goal

```
Discover VN → Add to Library → Track Routes → Read Japanese → Analyze Text →
Mine Vocabulary → Create Anki Decks → Improve Japanese Ability
```

The highest-priority technical feature is the **text extraction + reading overlay**: a
VN tracker is easy; a VN tracker that lets you click any sentence, save it, analyze
grammar, and build a personal deck is what makes it unique.

---

## 16 — Japanese-Learning Video Player

Upgrade the in-app video player into a production-quality media player **optimized for
Japanese immersion, study, and content analysis**. This is a core Japanese Study OS
module, **not** a separate application, and is distinct from general playback (which is
delegated to external players — see §9). This player exists specifically for study.

### Player Core & Stability

Audit and improve the existing player. Verify: Playback reliability, Format
compatibility, Memory usage, Performance, Crash handling, Error recovery, Hardware
acceleration, Loading speed.

- **Video formats:** MP4, MKV, WebM, MOV, AVI, HLS streams, other common formats
- **Audio:** Multiple audio tracks, Audio switching, Volume normalization
- **Playback:** Play/pause, Seek, Frame stepping, Playback speed, Fullscreen,
  Picture-in-picture, Resume playback, Keyboard shortcuts

### Japanese Learning Mode

A dedicated immersion mode with: Japanese subtitles, English subtitles, Dual subtitles,
No subtitle mode. Allow: Toggle subtitle layers independently, Compare translations,
Hide/show furigana, Highlight unknown words, Click words for definitions, Save sentences.

### Advanced Subtitle Engine

Support SRT, ASS, SSA, VTT. Features: Subtitle synchronization, Subtitle delay
adjustment, Subtitle styling, Font customization, Position adjustment, Subtitle search,
Subtitle import/export.

Click a subtitle line → Full sentence, Translation, Vocabulary breakdown, Kanji
readings, Grammar explanation, JLPT level. Actions: Save sentence, Create flashcard, Add
vocabulary, Add grammar note.

### Listening Training Features

- **Shadowing mode** — Repeat after audio, Recording comparison, Playback comparison
- **A-B repeat** — Select start point, Select end point, Loop section
- **Dictation mode** — Hide subtitles, Type what you hear, Compare answer
- **Speed training** — 0.5x, 0.75x, 1x, 1.25x, Custom speed

### Japanese Analysis Integration

Integrate with: Dictionary system, Kanji system, Grammar system, Flashcards, AI
assistant. When the user clicks a word, display: Reading, Meaning, Kanji information,
Pitch accent (if available), Example sentences, Grammar role.

### AI Study Features

Analyze dialogue: Explain meaning, Explain nuance, Explain grammar, Simplify Japanese,
Generate examples, Identify difficulty. Generate: Vocabulary lists, Flashcards, Study
notes, Quizzes.

### Watch + Study Tracking

Track **separately**:

- **Entertainment watching** — Episodes completed, Watch history, Resume position
- **Learning activity** — Listening time, Sentences saved, Vocabulary collected, Study
  sessions

### Media Hub Integration

Receive: Metadata, Cover, Description, Episode information, Subtitle information,
Learning level. Send: Watch progress, Saved vocabulary, Sentences, Study statistics.

### Library Features

Recently watched, Continue watching, Favorites, Study queue. Display episode
information, learning difficulty, subtitle availability, vocabulary count.

### Player Customization

- **Appearance** — Theme, Subtitle style, Font size, Layout
- **Playback** — Default speed, Default audio, Default subtitles, Auto pause after sentence
- **Learning** — Default study mode, Vocabulary saving behavior, Dictionary provider

### Performance

Hardware acceleration, Efficient buffering, Memory management, Background processing,
Cache management, Large file support.

### Integration Testing & Player Diagnostics Mode

Test compatibility with: Media Hub, Anime module, YouTube module, Subtitle manager,
Dictionary, Flashcards, Kanji system, AI assistant. Verify: Opening media works,
Subtitle loading works, Metadata transfer works, Vocabulary extraction works, Progress
sync works.

Because the player is the part of the OS users interact with most, add a **Player
Diagnostics Mode** before release: test every supported format, subtitle loading, audio
switching, large files, GPU acceleration — and generate a compatibility report.

### UI Design

Follow Japanese Study OS design (minimal, macOS-inspired, clean, keyboard-friendly,
customizable panels). Include: Video area, Subtitle area, Learning sidebar, Vocabulary
panel, Notes panel.

### Final goal

```
Discover content → Media Hub → Video Player → Subtitle interaction →
Vocabulary/Kanji/Grammar extraction → Flashcards and study progress
```

---

# Part V — Local AI Layer

## 17 — Local AI Agent Engine

Create a fully local **AI agent system** that acts as the intelligent assistant and
automation layer of Japanese Study OS. It is not just a chatbot — it is an offline local
agent that understands the state of the OS, can use approved tools, and performs actions
on the user's behalf. It must operate offline without mandatory cloud services.

> The important distinction: the **AI model** understands language and reasoning; the
> **agent framework** lets it use tools and perform tasks; the **local services**
> actually execute actions inside the OS.

### Offline requirements

- Run locally on the user's device
- No mandatory cloud dependency
- Work without internet after models/data are installed
- Local model support
- Configurable AI backend

### Local AI Architecture

Components:

1. Local Language Model
2. Agent Controller
3. Tool Execution System
4. Memory System
5. Context Manager
6. Permission System

Support: Local models, CPU inference, GPU acceleration, Configurable model size, Offline
operation.

### AI Agent Capabilities

The AI can: Understand user requests, Plan multi-step tasks, Execute actions, Check
results, Ask for confirmation when needed, Learn user preferences.

It can also: Search the personal anime library, Search the local metadata database,
Recommend anime, Explain anime information, Create watch orders, Detect duplicates,
Organize the library, Answer questions about tracked anime, Summarize stored metadata,
Help configure scraper settings.

Example — *"Find me an anime suitable for N3 and create a study deck."* →

1. Searches media database
2. Checks difficulty
3. Finds suitable anime
4. Analyzes vocabulary
5. Creates Anki deck
6. Adds to study plan

### Application Control System (tools)

The AI controls Japanese Study OS applications through tools:

- **Media Tool** — Search media, Add library items, Organize files, Analyze subtitles,
  Generate media profiles
- **Anime Tool** — Track anime, Check releases, Update metadata, Analyze difficulty
- **Visual Novel Tool** — Add VN, Track routes, Extract text, Generate vocabulary
- **Flashcard Tool** — Create decks, Add cards, Modify cards, Schedule reviews
- **Dictionary Tool** — Lookup words, Explain grammar, Analyze sentences
- **Calendar Tool** — Schedule study sessions, Create reminders
- **Settings Tool** — Change preferences, Configure modules

### Natural Language Commands

Support commands like: "Analyze this anime." / "Make me an N2 vocabulary deck from
episode 5." / "Find everything I don't know in this episode." / "Organize my media
folder." / "Create a weekly Japanese study plan." / "Show me all words I learned this
month." / "Find a visual novel appropriate for my level." / "Convert this transcript
into flashcards."

### Task Planning System

The AI breaks complex tasks into steps. Example — *"Prepare Attack on Titan for
studying."*:

1. Locate anime
2. Retrieve metadata
3. Analyze Japanese subtitles
4. Calculate difficulty
5. Extract vocabulary
6. Generate flashcards
7. Add to study library

Show task progress: step completed, current action, errors, results.

### Permission System

The AI must not have unlimited control. Levels:

- **Read only** — view Library, History, Settings
- **Limited actions** — Create decks, Add items, Analyze content
- **Full automation** — Organize files, Run workflows, Modify settings

Require confirmation for: Delete files, Major changes, External connections.

### AI Memory System

Remember: **User preferences** (favorite genres, learning goals, preferred difficulty,
study habits), **Learning memory** (known vocabulary, weak grammar, progress, mistakes),
**Application memory** (preferred sources, preferred settings, previous tasks). Allow:
View memory, Edit memory, Delete memory.

### Personal Japanese Tutor Mode

The AI can act as a Japanese tutor: Explain grammar, Correct writing, Create exercises,
Generate conversations, Test vocabulary, Create quizzes, Adapt difficulty.

### Automation Workflows

Allow scheduled AI tasks — e.g. every day: "Analyze today's anime releases," "Prepare
today's vocabulary review," "Find new Japanese content," "Update my study statistics."

### Local Knowledge Database

Store: Japanese grammar, Vocabulary, Kanji, Media information, User notes, Study history.
The AI can query this database offline.

### AI Search System

The AI understands meaning-based searches, e.g. *"I want a slice of life anime with
simple Japanese"* → searches by genre, difficulty, vocabulary profile, and user level.

### Offline Data Sources

Local anime database, Cached metadata, User watch history, Library files, Downloaded
images, Plugin information.

### AI Settings

Select local model, CPU/GPU acceleration, Memory limits, Context size, Enable/disable AI
features, Privacy mode. The application must remain fully functional without external AI
APIs.

### AI Debugging and Admin Mode

Show: Tool calls, Reasoning-steps summary, Errors, Performance, Memory usage.

### Safe architecture

Do not let the AI directly manipulate files/databases. The safe design is:

```
Local AI Model
      ↓
Agent Controller
      ↓
Approved Tools
      ↓
Japanese Study OS Modules
      ↓
Database / Files
```

That way the AI can be powerful while staying predictable and safe.

---

## 18 — AI Advanced Configuration & Control

Expand the Local AI Agent into a complete configurable operating layer — powerful while
remaining offline, private, transparent, customizable, safe, and user-controlled.

### AI Profile System

Multiple assistant profiles, e.g.:

- **Study Tutor** — grammar explanations, vocabulary learning, conversation practice, exercises
- **Media Assistant** — finding content, organizing library, creating media profiles, subtitle analysis
- **Research Assistant** — searching knowledge, summarizing, note organization
- **Automation Assistant** — background tasks, file organization, maintenance

Allow users to create custom profiles, change personalities, change priorities, assign
different models, and enable/disable tools.

### AI Model Management

A local model manager: Install local models, Remove models, Update models, Select
default model, Select task-specific models. Display: Model name, Size, Memory
requirement, Speed, Quality rating, Capabilities (Reasoning, Translation, Coding,
Japanese ability, Vision, Speech).

Automatic model selection — e.g. a small model for simple dictionary questions, a large
model for complex Japanese explanations.

### Resource Management

Control AI resource usage: CPU usage limit, GPU usage limit, RAM limit, Battery mode,
Performance mode, Background processing, Maximum concurrent tasks. Modes: Battery Saver,
Balanced, Maximum Intelligence.

### AI Permission System

Granular permissions:

- **Reading** — view Library, Watch history, Vocabulary database, Settings, Files
- **Writing** — Create flashcards, Edit notes, Modify playlists, Organize files, Change settings
- **Sensitive (require confirmation)** — Delete files, Move files, Install plugins,
  Change security settings

### AI Tool Management

A tool registry. Each tool: Name, Description, Required permissions, Available actions,
Usage history. Tools: Media Search, Library Manager, Subtitle Analyzer, Dictionary,
Flashcard Generator, Calendar, File Organizer, Database Query, Browser, Plugin Manager.
Allow: Enable/disable tools, Restrict tools, View tool activity.

### Automation Engine

An AI workflow system — "If this happens → do this." Examples: when a new anime episode
appears → analyze subtitles → update vocabulary profile → create review cards; when a
new YouTube Japanese video appears → download transcript → extract vocabulary → create
study material; every morning → generate study plan.

### Task Queue System

Background task management. Display: Active tasks, Queued tasks, Completed tasks, Failed
tasks. Example — analyzing *Attack on Titan Episode 12*: subtitle extraction 100%,
vocabulary analysis 65%, flashcard creation 20%. Allow: Pause, Resume, Cancel,
Prioritize.

### AI Memory Management

Types: Short-term (current conversation), Long-term (user preferences), Learning
(vocabulary knowledge), Application (settings and workflows). Allow: View, Search, Edit,
Delete, Export memory.

### User Personalization

The AI adapts based on: Japanese level, JLPT goal, Learning style, Preferred
explanations, Known vocabulary, Study schedule, Favorite media. Beginners get simple
grammar explanations; advanced users get nuance and native usage.

### AI Communication Settings

Customize: Response length; Explanation depth; Language (English / Japanese / Mixed);
Teaching style (Academic / Casual / Immersion only / Tutor style); Correction style
(Gentle / Detailed / Strict).

### AI Safety Controls

Confirmation system before deleting files, changing important settings, or running large
tasks. Provide: Undo system, Action history, Rollback, Audit logs.

### AI Dashboard

An AI control center displaying: Current model, Memory usage, Active tasks, Recent
actions, Automation rules, Permissions, Usage statistics.

### AI Logging System

Store: Commands, Actions, Results, Errors, Performance. Allow: View logs, Export logs,
Clear logs.

### AI Plugin System

AI skills/plugins — e.g. Japanese Tutor Skill, Anime Analysis Skill, Visual Novel Skill,
Translation Skill, Research Skill. Each skill has Tools, Permissions, Settings, Version.

### AI Offline-First Requirements

The system must: Work without internet, Store all data locally, Never require cloud AI,
Cache knowledge locally, Allow optional online enhancement.

---

## 19 — Local Model Stack & Resource Strategy

Don't make one giant model do everything. The AI system has many jobs (tutor,
translation/explanation, media analysis, subtitle processing, automation agent, coding
assistant, search/retrieval, planning), so use a **multi-model setup** controlled by one
agent layer — and load models **on demand** so the app stays light.

### Recommended offline model stack

- **Main AI Agent / General Assistant** — **Qwen3** (14B for normal laptops/desktops,
  32B for powerful PCs). Strong multilingual/Japanese ability, good reasoning, good
  tool-calling. Used for the assistant, planning, grammar explanations, conversations,
  controlling apps.
- **Japanese Tutor Specialist** — a Japanese fine-tuned model (Llama 3.1 Japanese or
  Qwen-based Japanese). Used for grammar/nuance explanations, conversation practice,
  correction. A specialized model can outperform a larger general model for teaching.
- **Coding / App Control Agent** — **DeepSeek-Coder-V2**. Used for plugin creation,
  debugging, code generation, architecture assistance. Keep separate from the tutor model.
- **Embedding Model** — **BGE-M3** or **multilingual-e5-large** (don't rely on the LLM
  for search). Powers semantic search over anime, subtitles, similar sentences,
  vocabulary recall. Vector database: **FAISS** or **Chroma**. This is what makes
  *"Find anime with simple emotional Japanese"* actually work.
- **Speech / Listening** — **Whisper large-v3** for Japanese audio: YouTube transcripts,
  anime audio analysis, listening exercises.

### Controller routing

```
AI Controller
     ├── Qwen3 32B     (Brain / reasoning)
     ├── DeepSeek      (Coding)
     ├── Whisper       (Audio)
     └── BGE-M3        (Search / embeddings) + Japanese Dictionary + Tools/Actions
```

The controller decides: need reasoning? → Qwen; need code? → DeepSeek; need audio? →
Whisper; need search? → embeddings/database.

### Hardware recommendations

- **Normal laptop (16–32GB RAM):** Qwen3 8B/14B, BGE-M3, Whisper small/medium — good
  experience.
- **Gaming PC / workstation (32–64GB RAM, RTX 4070/4080/4090):** Qwen3 32B, Whisper
  large-v3, larger embedding models — excellent.
- **High-end local server (64GB+ / multiple GPUs):** Qwen3 72B, DeepSeek models, multiple
  specialist agents.

### On-demand service layer (don't keep models resident)

Treat AI as an **on-demand service**, not a permanent engine. The mistake would be
loading five models at startup.

```
Japanese Study OS Core (lightweight, ~500MB–2GB: UI, DB, search index, library)
        ↓
    AI Manager
        ↓
Load a specific model only when needed → run task → unload after inactivity
```

- With no AI running, the app feels like a normal desktop application.
- When the user asks a question, load a small Japanese model, then unload after inactivity.
- For heavy jobs (e.g. "analyze all 24 episodes"), start a **background worker** that
  loads the needed models, processes, and unloads.
- **Do not bundle the model inside the Electron app.** Keep models in a separate models
  folder; the user chooses No AI / Small AI / Advanced AI.

### Three modes

- **Lite Mode** (normal laptops) — no local LLM; dictionary + search; optional cloud AI.
  Minimal RAM impact.
- **Standard Mode** (recommended, 16–32GB RAM) — Qwen3 8B/14B, local embeddings, Whisper
  optional.
- **Power Mode** (enthusiasts, 32GB+ RAM, good GPU) — Qwen3 32B+, large speech models,
  advanced analysis.

**The core Japanese Study OS must not depend on AI being active.** The AI is a powerful
tool you summon, not a permanent engine consuming resources.

---

## 20 — AI-Powered UI Customization

Allow the local AI assistant to help users customize the interface — but through a
**controlled** system, never by directly editing source files.

### Safe CSS and UI Editor

Users can request: "Make the sidebar smaller," "Use a darker glass style," "Make the app
look more like macOS," "Increase subtitle size," "Change card spacing," "Create a custom
theme." The AI should:

1. Understand the request
2. Identify affected components
3. Generate changes
4. Preview changes
5. Ask for confirmation
6. Apply changes

### Theme Engine

A centralized theme system supporting: Colors, Fonts, Spacing, Borders, Shadows,
Animations, Layout density. Themes are stored as profiles — e.g. Default, macOS
inspired, Minimal, Japanese study mode, Dark OLED, Custom user theme.

### Custom CSS Support

For advanced users: Custom stylesheet editor, Syntax highlighting, Live preview,
Enable/disable styles, Import/export themes. Store user CSS overrides **separately** from
application code; never modify core files directly.

### AI CSS Generation

The AI can generate CSS modifications — e.g. *"Make my vocabulary cards look like Anki
but more modern"* → card layout changes, spacing, animations, typography.

### Visual Customization Mode

A visual editor letting users: Move panels, Resize sections, Hide components, Change
layouts, Create dashboards. The AI can advise, e.g. *"Your current layout has too much
information. I recommend hiding X."*

### Component-Level Customization

Each component exposes settings, e.g.:

- **Media cards** — Size, Information displayed, Cover ratio
- **Subtitle panel** — Position, Font, Colors, Transparency
- **Vocabulary cards** — Fields shown, Order, Styling

### Safety System

Before applying changes, provide: Preview mode, Undo, Version history, Restore defaults.
Never allow the AI to break core UI, modify protected files, or remove essential
components.

### Developer Mode

Advanced users can: Inspect the component tree, Edit CSS variables, View generated code,
Export themes, Share themes.

### Architecture

```
AI Assistant
      ↓
Theme/UI API
      ↓
CSS Variables + Component Settings
      ↓
Application UI
```

Not: *AI → directly edits app files → potentially breaks everything.*

---

# Part VI — Consolidation, Quality & Release

## 21 — Architecture Streamline & Optimization Audit

Perform a complete final architecture review and optimization pass. The objective is
**not to add features** — it is to transform the system into a clean, fast, maintainable,
production-quality application. Priorities: Simplicity, Performance, Reliability,
Integration, Maintainability, User experience. This tells the AI: *stop expanding, start
engineering.*

### Feature Audit

Review every existing feature. For each, determine: Is it necessary? Does another system
already do this? Can it be merged? Can it become a plugin? Does it create unnecessary
complexity? Remove: Duplicate functionality, Unused features, Redundant databases,
Repeated settings, Conflicting workflows. Maintain a clear purpose for every module.

### System Architecture Review

Audit: Application structure, Module boundaries, Shared services, Database design, API
communication, Event systems, State management, File organization, Plugin architecture.
Identify duplicate systems, unused code, conflicting features, overlapping databases, and
redundant workflows. Refactor into clean modules.

### Core Platform Layer

Create a central Japanese Study OS Core. All applications communicate through shared
services: User Profile Service, Settings Service, Database Service, Media Service, Search
Service, AI Service, Notification Service, Sync Service, Learning Progress Service. Every
module reuses these.

### Final Module Structure

- **Core** — User system, Settings, Database, Search, Notifications, AI manager, Plugin
  manager
- **Learning** — Flashcards, Kanji, Grammar, Dictionary, Writing practice
- **Media** — Media Hub, Anime manager, Drama manager, YouTube manager, Visual novel
  manager, Music manager
- **Tools** — Import/export, Backup, Analytics, Automation

Each module must communicate through the Core.

### Unified Data Model

Avoid separate isolated databases for anime, drama, movies, YouTube, visual novels,
music, books. Shared entities: User, Media, Episode, Chapter, Subtitle, Sentence,
Vocabulary, Kanji, Grammar, Flashcard, Study Session, Progress. Ensure no duplicate data,
proper relationships, efficient indexing, data validation, migration support.

Example relationship chain:

```
Anime Episode → Japanese Subtitle → Sentence → Vocabulary → Flashcard → Study Progress
```

### Unified Pipelines

Merge duplicate systems into universal pipelines — do not rebuild separate pipelines for
anime, YouTube, or visual novels.

```
Content Pipeline:  Source → Import → Metadata Matching → Identity Resolution → Storage → Analysis
Language Pipeline: Text → Tokenizer → Dictionary → Difficulty Analysis → Vocabulary Extraction → Flashcards
```

### Search System Consolidation

One universal search engine across Media, Local files, Anime database, Visual novels,
YouTube, Vocabulary, Kanji, Grammar, Flashcards. Features: Instant search, Fuzzy matching,
Japanese text search, Romaji search, Kanji search, Translation search, Filters.

### Japanese Language Engine

One shared Japanese analysis engine, used by anime subtitles, drama subtitles, YouTube
transcripts, visual novels, and reading materials. Capabilities: Tokenization, Word
detection, Kanji analysis, Grammar detection, Difficulty scoring, Vocabulary frequency,
Sentence extraction. Do not duplicate language-analysis logic.

### AI System Optimization

One AI assistant layer, used by media analysis, dictionary help, grammar explanations,
recommendations, study planning. Keep it lightweight, offline-capable, on-demand, with
resource limits and model management. AI operates through tools and does not directly
control databases (see §17 architecture). Implement permissions, confirmation, task
queue, memory management.

### Settings Consolidation

One global settings system (avoid per-module settings): General, Appearance, Storage,
Notifications, Privacy, AI, Language, Media, Learning. Modules extend settings without
creating separate systems.

### Database Optimization

Implement proper indexing, database migrations, data validation, backup system, duplicate
detection, cleanup tools. Optimize for large libraries, thousands of media entries, and
millions of vocabulary entries.

### Plugin System Audit

Review the plugin architecture (Scrapers, Metadata providers, Subtitle providers, AI
providers, Exporters). Ensure version compatibility, permissions, error isolation,
updates, easy installation. Move optional features into plugins so the core stays
lightweight.

### Automation System

Background automation, e.g. when a new anime episode appears → download/update metadata →
analyze subtitles → update vocabulary profile → notify user; when a new VN chapter is
read → extract text → analyze vocabulary → update study progress.

### Performance Optimization

Optimize: Startup time, Memory usage, Database queries, Background tasks, File scanning,
Image loading, AI processing. Implement: Lazy loading, Background workers, Task queues,
Caching, Pagination, Virtualized lists, Efficient indexing. Stay responsive with large
media libraries, thousands of anime, and millions of vocabulary entries.

### Offline-First Design

Core functionality works offline: Library, Flashcards, Dictionary, Progress tracking,
Notes, Search, Media organization. Online features (metadata updates, new releases, cloud
sync) are optional.

### Security Review

Audit file permissions, plugin permissions, credentials, local storage, and AI actions.
Implement secure storage, backups, recovery, an undo system, and activity logs.

### Testing

Complete coverage: Core system, Database, Plugins, Media importing, Search, AI tools,
Flashcard generation, Subtitle processing, Synchronization. Create unit, integration, and
performance tests.

### Developer Experience

Improve maintainability: Documentation, Architecture diagrams, API documentation, Coding
standards, Contribution guidelines. Ensure new features can be added without rewriting the
system.

### Final Quality Check

Before completion verify:

```
✓ No duplicate systems
✓ No unnecessary modules
✓ All apps share the same foundation
✓ AI is optional and efficient
✓ Databases are unified
✓ Settings are centralized
✓ Plugins are isolated
✓ Performance is optimized
✓ Offline mode works
✓ User experience is consistent
```

### Final vision

Japanese Study OS should become a lightweight, offline-first Japanese learning ecosystem
— a single platform combining learning tools + media immersion + AI assistance + personal
knowledge management + progress tracking. Prioritize elegance and reliability over endless
features. All modules should strengthen each other instead of operating separately.

---

## 22 — Autonomous QA & Visual Testing Agent

Create a dedicated AI-powered testing and validation system that continuously tests,
verifies, and improves the entire ecosystem. It behaves like a senior QA engineer, UX
tester, performance engineer, security reviewer, integration tester, and end-user
simulator.

### Testing Architecture

Covering: Unit testing, Integration testing, UI testing, Visual regression testing,
Performance testing, AI behavior testing, Database testing, Plugin testing, Network
testing, Offline testing.

### AI Testing Agent Rules

The QA AI must: Never assume a feature works, Verify actual results, Test edge cases, Test
failure scenarios, Record evidence, Generate reports, Suggest fixes. Every test contains:
Feature tested, Expected result, Actual result, Screenshot/video evidence, Performance
data, Error logs, Pass/fail status.

### Visual Testing System

Automated visual testing of: Layout, Spacing, Alignment, Fonts, Icons, Animations, Dark
mode, Light mode, Responsive layouts. Compare expected vs current screenshots and detect:
UI shifts, Missing elements, Broken layouts, Incorrect colors, Overlapping components.

### UI Scenario Testing

Simulate real users. New user: Opens app → Creates profile → Sets Japanese level →
Imports media → Starts studying. Advanced user: Imports anime → Analyzes subtitles →
Creates Anki deck → Tracks progress → Uses AI assistant. Test every major workflow.

### Server / Connection Testing

A server and source monitoring system. For every external connection store: Service name,
Server location, Provider, Status, Response time, Last checked, Failure rate. Monitor:
Metadata providers, Scraper sources, Subtitle sources, Dictionary sources, AI model
downloads, Sync services. Display a server map (Green = working, Yellow = slow, Red =
offline).

### Network Simulation Testing

Test: Slow connection, No connection, Server failure, Timeout, Partial data, API changes.
Verify the application continues working offline.

### Scraper Testing

For every scraper, test: Search, Metadata extraction, Episode extraction, Subtitle
detection, Thumbnail extraction, Pagination, Error handling. Detect: HTML changes,
Selector failures, Anti-bot changes, Missing data. Automatically generate a scraper health
score.

### Media System Testing

Test the Anime, Drama, Movie, YouTube, Visual novel, and Music managers. Verify: Import
works, Metadata matches, Files organize correctly, Duplicates detected, Progress saves.

### Japanese Analysis Testing

Test: Vocabulary extraction, Kanji extraction, Grammar detection, Difficulty scoring,
Sentence splitting. Validate that a Japanese subtitle input produces the correct
vocabulary list, and measure accuracy.

### Anki Integration Testing

Test: Creating cards, Exporting decks, Updating cards, Duplicate prevention, Media
attachment, Sentence formatting. Verify cards open correctly.

### AI Agent Testing

Test AI commands. E.g. *"Create an N3 anime study deck"* → verify the AI finds suitable
anime, checks level, extracts vocabulary, creates deck. *"Organize my media"* → verify the
AI identifies files, suggests changes, requests permission, executes safely.

### AI Safety Testing

Verify the AI cannot delete files without permission, modify protected code, access
restricted data, or change security settings. Test: Permission requests, Undo, Rollback,
Logs.

### Offline Testing

Disable internet and verify these still work: Flashcards, Dictionary, Media library,
Notes, Progress tracking, Local AI. Report an offline compatibility score.

### Performance Testing

Measure: Startup time, RAM usage, CPU usage, GPU usage, Database speed, Search speed.
Stress test: 10,000 media entries, millions of vocabulary entries, large subtitle files,
large libraries.

### Database Testing

Test: Corruption recovery, Backup restore, Migration, Duplicate detection, Search
indexing.

### Plugin Testing

For every plugin, test: Installation, Removal, Updates, Compatibility, Permissions,
Failure isolation.

### Automated Daily Test Run

Scheduled testing — Daily: quick health check; Weekly: full integration test; Before
release: complete system audit.

### QA Dashboard

Show: Overall health score, Module status, Failed tests, Performance metrics, Server
status, Scraper status, AI status, Visual regression results.

### Fake User Simulator

Because the OS has scrapers, AI, media, and local databases, the QA agent creates
artificial users — Beginner Japanese learner, N1 learner, Media collector, Power user,
Offline-only user — then tries to break the app from each perspective. This is how large
commercial software teams test complex ecosystems.

### Final requirement

The QA agent must ensure Japanese Study OS stays stable, fast, visually consistent,
offline-capable, secure, and maintainable — detecting problems before users experience
them.

---

# Appendix — How the original prompts were merged

This roadmap is a **content-preserving** consolidation. Every feature from the original
prompts is present; only ordering, duplicates, and three self-contradictions were
resolved.

**De-duplicated (pasted twice → kept once, in full):**

- *Japanese Content Intelligence & Study Extraction* → §14.
- *External Player Integration / Playback Handoff* → §9.

**Reconciled contradictions (kept the final decision, noted inline):**

- **Anti-bot / evasion** — the original "Advanced Settings > Anti-Bot" list (randomize
  fingerprint, Cloudflare handling, CAPTCHA detection as bypass) was reframed per the
  user's later correction. Legitimate pacing/session controls stay in §1 and §2;
  Cloudflare/CAPTCHA remain only as *detection/health* signals in §3. No evasion features.
- **Built-in vs external player** — an early prompt added, then explicitly removed, a
  built-in "Media Player Integration." Final decision: **no built-in general player**; use
  External Player handoff (§9). The one in-app player is the study-only learning player
  (§16).
- **"Manage subtitles and play them"** → changed to "manage, download, organize, and
  **provide** subtitle files to external playback applications" (§8), consistent with §9.

**Merged near-duplicates:**

- Two "Local AI Agent" prompts (an early lightweight one + the full "Agent Engine") →
  merged into §17; the later config/control prompt → §18.
- Two video-player prompts ("Refinement" + "Complete Rework") → merged into §16.
- Two optimization-audit prompts ("Final Architecture Audit" + "Ultimate Streamline") →
  merged into §21.
- The brief Visual-Novel tracker embedded in the Content-Intelligence prompt → folded into
  the full Visual Novel Immersion Platform (§15); §14 keeps a pointer.

**Reclassified for logical flow:**

- *Community Site Sources (FMHY)*, originally appended to Advanced Settings → its own §4.
- *Unified Multi-Source Search*, originally bundled with the first Local AI prompt → §6.
- *Model-stack recommendation + lightweight/on-demand architecture* (advice, not a build
  prompt) → §19.
- The *Global Media Provider* mega-prompt was split across §7 (providers/identity/browser/
  tracking/global search), §8 (subtitles), and §9 (external player).

Nothing was dropped for brevity. Where a choice ever came down to cut-detail vs
keep-detail, detail was kept.





