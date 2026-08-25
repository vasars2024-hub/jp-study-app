/**
 * L8 instrument — rubric category 8's four states (empty, loading, error, offline) on the **Video**
 * window, i.e. the Media Center.
 *
 * WHY THIS IS A SIBLING OF `l8-honest-states.cjs` RATHER THAN A FLAG ON IT. That probe is not
 * "the states probe with Dictionary selectors in it": its induction, its four state renders, its
 * safety argument for clicking `+ Add to Anki`, and its reversibility finding about `AnkiSetup`'s
 * missing `onBack` are all statements about the Dictionary. Porting it by parameter would leave one
 * file where every paragraph needed "except on the other surface". The shared 30 lines — the raw-key
 * regex, the out-of-process TCP prober, the language sweep — are duplicated deliberately, and the
 * Dictionary's evidence trail is left byte-for-byte intact.
 *
 * THE INDUCTION IS REAL AND IT IS NOT MINE. Two of this window's dependencies are genuinely down on
 * this machine, and the probe proves the first from OUTSIDE the app before it reads a single pixel:
 * `127.0.0.1:8765` (AnkiConnect) refuses a TCP connect from this node process, while `5173` accepts
 * one through the same prober — the control on the control, because a prober that returns REFUSED
 * for everything proves nothing. The second is MyAnimeList, which the Discover panel reports
 * unreachable while AniList, in that same panel, serves ranked titles.
 *
 * WHAT THE FOUR STATES MAP TO HERE:
 *
 *   empty    `.medialib-empty`            — a shelf or search with no entries
 *            `.disc-inspector-empty`      — Discover with nothing selected
 *   loading  the surface's own loading vocabulary, observed IN THE PAGE. Polling over the bridge
 *            cannot see a transient render — one `/eval` round trip is longer than the state — so a
 *            MutationObserver is armed before the navigation and read back afterwards. It captures
 *            on CLASS and on TEXT, because this surface's loading strings
 *            (`media.tracking.loadingLong`, `media.subStatus.searching`, `mediaLibActions.working`)
 *            are not all carried on a `loading`-named element.
 *   error    Readiness — "Anki is not reachable, so nothing can be mined yet."
 *   offline  Review — the dependency named, WITH its remedy, and the counts it cannot compute
 *            explicitly refused rather than rendered as zero.
 *
 * THE FALSE-SUCCESS TEST IS THE POINT OF THE CATEGORY, so it is measured rather than eyeballed:
 * the Review panel must NOT report an Anki-derived count as a fact while Anki is unreachable, and
 * it must still show what it genuinely knows locally. Both halves are asserted.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l8-states-video.cjs [--langs] [--title Video]
 */
'use strict';
const fs = require('node:fs');
const net = require('node:net');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const TITLE = argOf('--title', 'Video');
const LANGS = process.argv.includes('--langs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * THE WINDOW IS PINNED ONCE, BY TITLE, AND THEN HELD BY REFERENCE — because the title is
 * TRANSLATED. `--title Video` reads `動画` the moment the sweep switches to Japanese, `辞書` for the
 * Dictionary and `設定` for Settings, so a title matcher refuses on the second language of a
 * four-language run. That is the correct failure (it refuses rather than measuring the wrong
 * surface), but it makes the sweep impossible. The pin is taken while the UI is still in its
 * starting language and re-picked only if the element leaves the document; the probe reports the
 * title it saw at pin time so the run still names its surface.
 */
const PIN = `(() => {
  const wanted = ${JSON.stringify(TITLE)};
  const painted = [...document.querySelectorAll('.fwin')].filter((w) => {
    const r = w.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const win = painted.find((w) => {
    const t = w.querySelector('.fwin-title-text, .fwin-title');
    return !!t && (t.textContent || '').includes(wanted);
  });
  if (!win) return JSON.stringify({ refuse: 'no painted .fwin titled ' + wanted });
  window.__l8vWin = win;
  const r = win.getBoundingClientRect();
  return JSON.stringify({
    pinnedTitle: (win.querySelector('.fwin-title-text') || {}).textContent || null,
    presentation: win.getAttribute('data-presentation'),
    box: Math.round(r.width) + 'x' + Math.round(r.height),
  });
})()`;
const WIN = '(window.__l8vWin && document.contains(window.__l8vWin) ? window.__l8vWin : null)';

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

/** The induction's own proof, from outside every layer the probe is measuring. */
function tcpProbe(port, host = '127.0.0.1', timeoutMs = 2000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (verdict, detail) => { sock.destroy(); resolve({ verdict, detail }); };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done('LISTENING', 'connect succeeded'));
    sock.once('timeout', () => done('TIMEOUT', `no answer in ${timeoutMs} ms`));
    sock.once('error', (e) => done('REFUSED', e.code || e.message));
    sock.connect(port, host);
  });
}

/** A raw i18n key reaches the user as its own dotted name. */
const RAW_KEY = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+){2,}$/;
const rawKeysIn = (strings) => strings.filter((s) => RAW_KEY.test(String(s).trim()));

/**
 * NAVIGATION IS BY INDEX, NOT BY LABEL, AND THAT IS THE WHOLE REASON THIS SWEEP CAN RUN.
 *
 * Every destination on this surface is translated. `LibraryAll local media` reads
 * `ライブラリ...` in Japanese and `Recently added36` reads `最近追加 36`, so a
 * label-matching driver refuses on the second language of a four-language run. `.mc-nav`'s buttons
 * and `.medialib-rail`'s rows are in a fixed source order that no translation moves, so the index
 * is the stable address. The English name stays in the call as the reader's anchor and the probe
 * reports the label the button ACTUALLY carried when it was clicked, so a shifted index shows up as
 * a wrong name in the evidence rather than as a silently different destination.
 *
 * Order, read from `MediaCenterView.tsx:1758`: 0 Home, 1 Library, 2 Video, 3 Music, 4 Study Mode,
 * 5 Readiness, 6 Review, 7 Discover, 8 Media workspace.
 */
const NAV = { library: 1, readiness: 5, review: 6, discover: 7 };
/** Rail order: 0 Home, 1 Recently added, 2 Continue watching, 3 Study queue, 4 Favorites, 5 Tracking. */
const RAIL = { recentlyAdded: 1, favorites: 4, tracking: 5 };

const nav = (i, name) => `(() => {
  const win = ${WIN};
  if (!win) return JSON.stringify({ refuse: 'the pinned window left the document' });
  const b = [...win.querySelectorAll('.mc-nav button')][${i}];
  if (!b) return JSON.stringify({ refuse: 'no .mc-nav button at index ' + ${i} + ' (' + ${JSON.stringify(name)} + ')' });
  b.click();
  return JSON.stringify({ index: ${i}, expected: ${JSON.stringify(name)}, wore: (b.textContent || '').trim().slice(0, 40) });
})()`;

const shelf = (i, name) => `(() => {
  const win = ${WIN};
  if (!win) return JSON.stringify({ refuse: 'the pinned window left the document' });
  const row = [...win.querySelectorAll('.medialib-rail .ui-sidebar__item')][${i}];
  if (!row) return JSON.stringify({ refuse: 'no rail row at index ' + ${i} + ' (' + ${JSON.stringify(name)} + ')' });
  row.click();
  return JSON.stringify({ index: ${i}, expected: ${JSON.stringify(name)}, wore: (row.textContent || '').trim().slice(0, 40) });
})()`;

const setSearch = (term) => `(() => {
  const win = ${WIN};
  const i = win.querySelector('input[type=search]');
  if (!i) return JSON.stringify({ refuse: 'no search input' });
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(i, ${JSON.stringify(term)});
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return JSON.stringify({ typed: ${JSON.stringify(term)} });
})()`;

/**
 * READ THE DEPENDENCY MESSAGE OFF ITS OWN ELEMENT, NOT OUT OF THE WINDOW BODY — and this is the
 * difference between a number and a coincidence. The first version of this probe asked
 * `/anki/i.test(win.textContent)`, which is true on this surface no matter what is rendered: the
 * Media Center's own nav carries the word. It would have scored 10/10 against a panel that printed
 * nothing at all.
 *
 * `SeanimeStudyLibraryPanel.tsx:458` renders the Readiness message as `p.study-lib-anki` with
 * `data-ok` reflecting the live probe, and `SeanimeWatchLoopPanel.tsx:288` renders Review's as
 * `p.study-loop-note[data-alert="true"][role="status"]`. Both are the honest render's OWN node, so
 * an absent message is an absent element and the probe refuses by name instead of scoring the nav.
 *
 * AND THE CHECK IS LANGUAGE-AGNOSTIC BY CONSTRUCTION, because a four-language sweep cannot match
 * English prose. `Anki` is a proper noun and stays Latin in all four catalogs — verified in the
 * source, not assumed: `studyLibrary.anki.disconnected` reads `Anki に接続できないため…` (ja),
 * `无法连接 Anki，暂时无法挖掘卡片。` (zh), `Anki недоступен, пока ничего нельзя добавить.` (ru).
 * So "names the dependency" is the proper noun surviving translation, and the CONTROL that stops
 * that from passing on an untranslated fallback is that the message must also CHANGE between
 * languages. A panel stuck in English scores namesDependency true and translated false.
 */
const DEP = `(() => {
  const win = ${WIN};
  if (!win) return JSON.stringify({ refuse: 'no painted .fwin titled ' + ${JSON.stringify(TITLE)} });
  const one = (sel) => {
    const e = win.querySelector(sel);
    if (!e) return { present: false, selector: sel };
    const text = (e.textContent || '').trim();
    return {
      present: true, selector: sel, text,
      // The proper noun, not an English sentence. See the block comment above.
      namesDependency: /anki/i.test(text),
      role: e.getAttribute('role'), dataOk: e.getAttribute('data-ok'),
      dataAlert: e.getAttribute('data-alert'),
    };
  };
  return JSON.stringify({
    error: one('.study-lib-anki[data-ok="false"]'),
    offline: one('.study-loop-note[data-alert="true"]'),
    // THE FALSE-SUCCESS TEST, and it is a single node with two possible strings.
    // SeanimeWatchLoopPanel.tsx:316 renders p.study-loop-clear as either
    // studyLoop.attentionClear ("Nothing is stuck -- every mined card is in normal rotation")
    // or studyLoop.attentionUnknown ("Anki could not be asked..."). With Anki down the FIRST is a
    // manufactured clean bill of health from a question that was never asked. The discriminator is
    // language-agnostic for the same reason as above and it was checked in all four catalogs:
    // attentionUnknown carries the token Anki in en/ja/zh/ru, attentionClear carries it in none.
    clear: one('.study-loop-clear'),
  });
})()`;

/**
 * DISCOVER'S TWO-PROVIDER CONTROL, READ OFF ATTRIBUTES RATHER THAN ENGLISH PROSE.
 *
 * The first version asked /MyAnimeList.*unreachable/i and /(\\d+) ranked titles/ against the window
 * text. Both are English sentences, so the four-language sweep reported malUnreachable FALSE and
 * aniListRanked NULL for ja, zh-Hans and ru — which reads exactly like the panel losing its honest
 * state in three languages, and is really the probe losing its selector. A measurement that only
 * works in the language it was written in is not a measurement of this category.
 *
 * MediaCenterView.tsx:1136 stamps each chip with data-state = down | live | idle, and the label is
 * the provider's own name, which is a proper noun in every catalog. So the address is the attribute
 * and the untranslated name, and the count comes from digits rather than from the words around them.
 */
const DISCOVER = `(() => {
  const win = ${WIN};
  if (!win) return JSON.stringify({ refuse: 'no painted .fwin titled ' + ${JSON.stringify(TITLE)} });
  const chips = [...win.querySelectorAll('.mc-provider-chips span')].map((s) => ({
    text: (s.textContent || '').trim(), state: s.getAttribute('data-state'),
  }));
  const mal = chips.find((c) => /MyAnimeList/i.test(c.text));
  const ani = chips.find((c) => /AniList/i.test(c.text));
  const head = win.querySelector('.mc-discover-featured .mc-section-head span:last-child');
  const digits = (head && (head.textContent || '').match(/\\d+/)) || null;
  return JSON.stringify({
    chips,
    // Present AND down, not merely absent — an absent chip is not a report of unreachability.
    malUnreachable: !!mal && mal.state === 'down',
    aniListState: ani ? ani.state : null,
    aniListRanked: digits ? digits[0] : null,
  });
})()`;

const READ = `(() => {
  const win = ${WIN};
  if (!win) return JSON.stringify({ refuse: 'no painted .fwin titled ' + ${JSON.stringify(TITLE)} });
  const txt = (sel) => [...win.querySelectorAll(sel)].map((e) => (e.textContent || '').trim()).filter(Boolean);
  return JSON.stringify({
    cards: win.querySelectorAll('.medialib-card').length,
    empty: txt('.medialib-empty, .disc-inspector-empty, .mc-empty-shelf'),
    alerts: txt('[role="alert"]'),
    chars: (win.textContent || '').length,
    body: (win.textContent || '').trim(),
  });
})()`;

/**
 * Arm an in-page observer for the loading state. Two capture rules, because this surface carries its
 * loading vocabulary on ordinary elements: any node matching a loading-named class or `aria-busy`,
 * and any node whose own text is one of the product's loading strings.
 */
const LOADING_WORDS = ['Loading', 'Searching', 'Working', 'Analysing', 'Analyzing', 'Downloading',
  '読み込', '検索中', '加载', '搜索', 'Загруз', 'Поиск'];
const ARM_LOADING = `(() => {
  const win = ${WIN};
  if (window.__l8v && window.__l8v.obs) window.__l8v.obs.disconnect();
  const WORDS = ${JSON.stringify(LOADING_WORDS)};
  const seen = [];
  const note = (s) => { if (s && !seen.includes(s)) seen.push(s); };
  const capture = () => {
    for (const e of win.querySelectorAll('[aria-busy="true"],[class*="loading"],[class*="skeleton"],[class*="spinner"],[class*="pending"]')) {
      note('[class] ' + String(e.className || e.tagName).slice(0, 40) + ' :: ' + (e.textContent || '').trim().slice(0, 60));
    }
    for (const e of win.querySelectorAll('*')) {
      if (e.children.length) continue;
      // OPTION is chrome, not a state: a <select> holding "Working sources" matched the text rule
      // and put two menu items into the loading evidence, which is the same noise the leaf rule
      // above (e.children.length) excludes structurally rather than by how the string looks.
      if (e.tagName === 'OPTION') continue;
      const s = (e.textContent || '').trim();
      if (s && s.length < 80 && WORDS.some((w) => s.includes(w))) {
        note('[text] ' + String(e.className || e.tagName).slice(0, 40) + ' :: ' + s.slice(0, 60));
      }
    }
  };
  const obs = new MutationObserver(capture);
  obs.observe(win, { childList: true, subtree: true, attributes: true, characterData: true });
  window.__l8v = { obs, seen };
  capture();
  return 'armed';
})()`;
const READ_LOADING = `(() => {
  const rec = window.__l8v;
  if (!rec) return JSON.stringify({ refuse: 'observer never armed' });
  rec.obs.disconnect();
  return JSON.stringify(rec.seen);
})()`;

/**
 * PARK SETTINGS ON APPEARANCE BEFORE THE SWEEP, because `.sp-seg-btn` is a GENERIC segmented-control
 * class and the language selector is only one of its users. This cost a run: with Settings left on
 * another page the document's only `.sp-seg-btn` elements were MediaContent.tsx:1835/1846 — the
 * SUBTITLE language pair — so the query returned two buttons carrying lang="ja" and lang="zh" and
 * the sweep refused with "no .sp-seg-btn for en". A refusal, correctly, rather than a wrong click:
 * neither button matches "en" or "zh-Hans". But it means the probe cannot assume where a previous
 * run parked that window, so it navigates there itself.
 *
 * Index, not label: the nav is translated like everything else here. Order read from the live
 * window — 0 Home, 1 Appearance, 2 Wallpaper, 3 Companions, ... The label it actually wore is
 * reported so a shifted index shows up as a wrong name rather than a silent wrong page.
 */
const SETTINGS_APPEARANCE = `(() => {
  const w = [...document.querySelectorAll('.fwin')].find((x) => {
    const t = x.querySelector('.fwin-title-text, .fwin-title');
    return !!t && /Settings|設定|设置|Настройки/.test(t.textContent || '');
  });
  if (!w) return JSON.stringify({ refuse: 'no Settings window open — the language sweep needs one' });
  const b = [...w.querySelectorAll('[class*="settings"] nav button')][1];
  if (!b) return JSON.stringify({ refuse: 'no settings nav button at index 1 (Appearance)' });
  b.click();
  return JSON.stringify({ wore: (b.textContent || '').trim().slice(0, 30) });
})()`;

const clickLang = (tag) => `(() => {
  const b = [...document.querySelectorAll('.sp-seg-btn')].find((x) => x.getAttribute('lang') === ${JSON.stringify(tag)});
  if (!b) return JSON.stringify({ refuse: 'no .sp-seg-btn for ' + ${JSON.stringify(tag)} + ' — open Settings first' });
  b.click();
  return JSON.stringify({ clicked: ${JSON.stringify(tag)} });
})()`;

/** Every state string this surface renders, in whatever language is current. */
async function collectStates() {
  const out = {};
  // The Library section FIRST, every time. The rail only exists inside it, so a pass that starts
  // on Discover (where the previous pass ended) finds no `.ui-sidebar__item`, silently measures
  // nothing, and returns four empty state lists that read exactly like a surface with no states.
  const toLibrary = await ev(nav(NAV.library, 'Library'));
  if (toLibrary.refuse) throw new Error(toLibrary.refuse);
  await sleep(1400);
  const s0 = await ev(shelf(RAIL.recentlyAdded, 'Recently added'));
  if (s0.refuse) throw new Error(s0.refuse);
  await sleep(1200);

  await ev(setSearch('zzzqqqxxwv'));
  await sleep(1600);
  const e1 = await ev(READ);
  out.emptySearch = { rendered: e1.empty, cards: e1.cards };
  await ev(setSearch(''));
  await sleep(1400);

  out.droveFavorites = await ev(shelf(RAIL.favorites, 'Favorites'));
  await sleep(1500);
  const e2 = await ev(READ);
  out.emptyShelf = { rendered: e2.empty, cards: e2.cards };

  await ev(ARM_LOADING);
  out.droveTracking = await ev(shelf(RAIL.tracking, 'Tracking'));
  await sleep(2500);
  out.loading = { observed: await ev(READ_LOADING) };

  await ev(shelf(RAIL.recentlyAdded, 'Recently added'));
  await sleep(1400);

  out.droveReview = await ev(nav(NAV.review, 'Review'));
  await sleep(4000);
  const rvDep = await ev(DEP);
  if (rvDep.refuse) throw new Error(rvDep.refuse);
  if (!rvDep.offline.present) {
    throw new Error(`Review rendered no ${rvDep.offline.selector} while AnkiConnect is refusing connections`);
  }
  out.offline = {
    ...rvDep.offline,
    // The count it CANNOT compute, refused rather than rendered as a fact. Absent element is
    // NOT a pass: with Anki down this panel owes one of the two strings.
    clear: rvDep.clear,
    falseSuccess: rvDep.clear.present ? !rvDep.clear.namesDependency : null,
  };

  out.droveReadiness = await ev(nav(NAV.readiness, 'Readiness'));
  await sleep(4000);
  const rdDep = await ev(DEP);
  if (rdDep.refuse) throw new Error(rdDep.refuse);
  if (!rdDep.error.present) {
    throw new Error(`Readiness rendered no ${rdDep.error.selector} while AnkiConnect is refusing connections`);
  }
  out.error = { ...rdDep.error };

  out.droveDiscover = await ev(nav(NAV.discover, 'Discover'));
  await sleep(5000);
  const dc = await ev(READ);
  const dcChips = await ev(DISCOVER);
  out.discover = {
    empty: dc.empty,
    // The control that makes "unreachable" mean something: TWO providers in ONE panel, one named
    // down and one serving data. A panel that printed "unreachable" unconditionally would fail here.
    ...dcChips,
  };

  await ev(nav(NAV.library, 'Library'));
  await sleep(1400);
  await ev(shelf(RAIL.recentlyAdded, 'Recently added'));
  await sleep(1400);
  out.restored = await ev(READ);

  const allStrings = [
    ...out.emptySearch.rendered, ...out.emptyShelf.rendered, ...out.discover.empty,
    out.offline.text, out.error.text, out.offline.clear.text,
    ...(Array.isArray(out.loading.observed) ? out.loading.observed : []),
  ].filter(Boolean);
  out.rawKeys = rawKeysIn(allStrings);
  out.stringCount = allStrings.length;
  return out;
}

(async () => {
  const report = { at: new Date().toISOString(), surface: TITLE };

  report.induction = {
    ankiConnect: await tcpProbe(8765),
    viteControl: await tcpProbe(5173),
  };
  if (report.induction.ankiConnect.verdict !== 'REFUSED') {
    throw new Error('the induction did not hold: 8765 is not refused, so the offline state cannot be observed');
  }
  if (report.induction.viteControl.verdict !== 'LISTENING') {
    throw new Error('the control on the control failed: 5173 did not answer, so REFUSED proves nothing');
  }

  // Pin BEFORE the first language switch, while the window still carries the title asked for.
  const pinned = await ev(PIN);
  if (pinned.refuse) throw new Error(pinned.refuse);
  report.pinned = pinned;

  const before = await ev("JSON.stringify({html:document.documentElement.lang,stored:localStorage.getItem('ui-lang')})");
  report.langBefore = before;

  if (!LANGS) {
    report.states = { [before.html || 'en']: await collectStates() };
  } else {
    report.settingsNav = await ev(SETTINGS_APPEARANCE);
    if (report.settingsNav.refuse) throw new Error(report.settingsNav.refuse);
    await sleep(1200);
    // Prove the LANGUAGE selector is the one now in the document, not another segmented control.
    const segs = await ev("JSON.stringify([...document.querySelectorAll('.sp-seg-btn')].map((b) => b.getAttribute('lang')))");
    for (const want of ['en', 'ja', 'zh-Hans', 'ru']) {
      if (!segs.includes(want)) throw new Error(`Appearance is open but .sp-seg-btn lacks ${want} — saw ${JSON.stringify(segs)}`);
    }
    report.langSegments = segs;

    const TAGS = [{ tag: 'en' }, { tag: 'ja' }, { tag: 'zh-Hans' }, { tag: 'ru' }];
    report.states = {};
    for (const l of TAGS) {
      const c = await ev(clickLang(l.tag));
      if (c.refuse) throw new Error(c.refuse);
      await sleep(1600);
      const live = await ev('JSON.stringify(document.documentElement.lang)');
      // A sweep whose <html lang> did not move measured the previous language twice.
      if (live !== l.tag) throw new Error(`language did not switch: asked ${l.tag}, html reads ${live}`);
      process.stderr.write(`--- ${l.tag} ---\n`);
      report.states[l.tag] = await collectStates();
    }
    const restoreTag = before.stored === 'zh' ? 'zh-Hans' : (before.stored || 'en');
    await ev(clickLang(restoreTag));
    await sleep(1600);
    report.langAfter = await ev("JSON.stringify({html:document.documentElement.lang,stored:localStorage.getItem('ui-lang')})");
    report.langRestored = report.langAfter.stored === before.stored && report.langAfter.html === before.html;
  }

  report.summary = Object.fromEntries(Object.entries(report.states).map(([lang, s]) => [lang, {
    drove: [s.droveReview, s.droveReadiness, s.droveDiscover].map((d) => d && d.wore),
    emptySearch: s.emptySearch.rendered, emptyShelfCards: s.emptyShelf.cards,
    emptyShelf: s.emptyShelf.rendered,
    loadingObserved: s.loading.observed,
    offline: s.offline.text, offlineNamesDependency: s.offline.namesDependency,
    error: s.error.text, errorNamesDependency: s.error.namesDependency,
    clear: s.offline.clear.text, falseSuccess: s.offline.falseSuccess,
    malUnreachable: s.discover.malUnreachable, aniListState: s.discover.aniListState,
    aniListRanked: s.discover.aniListRanked,
    strings: s.stringCount, rawKeys: s.rawKeys,
    restoredCards: s.restored.cards, restoredChars: s.restored.chars,
  }]));

  /**
   * THE TRANSLATION CONTROL. `namesDependency` is a proper-noun match, so it is true for a panel
   * that never left English — which is precisely the failure a four-language sweep exists to catch,
   * and `rawKeys: []` would not catch it either (an English fallback is a real string, not a key).
   * So every language other than the reference must render a message that DIFFERS from English on
   * all four measured slots. A slot legitimately equal across languages would show up here by name
   * rather than being averaged into a pass.
   */
  if (LANGS && report.states.en) {
    const SLOTS = ['emptySearch', 'emptyShelf', 'offline', 'error', 'clear'];
    const slotOf = (s, k) => (k === 'emptySearch' || k === 'emptyShelf'
      ? (s[k].rendered || []).join(' | ')
      : k === 'clear' ? s.offline.clear.text : s[k].text) || '';
    report.translationControl = Object.fromEntries(Object.entries(report.states)
      .filter(([lang]) => lang !== 'en')
      .map(([lang, s]) => {
        const same = SLOTS.filter((k) => slotOf(s, k) && slotOf(s, k) === slotOf(report.states.en, k));
        return [lang, { slots: SLOTS.length, differsFromEn: SLOTS.length - same.length, identicalSlots: same }];
      }));
  }

  console.log(JSON.stringify(report.summary, null, 1));
  if (report.translationControl) console.log(JSON.stringify({ translationControl: report.translationControl }, null, 1));
  fs.writeFileSync(
    `src/.coordination/liquid-workplace/baselines/l8-states-video${LANGS ? '-langs' : ''}.json`,
    JSON.stringify(report, null, 1),
  );
})().catch((e) => {
  console.error('PROBE FAILED', e.message);
  process.exit(1);
});
