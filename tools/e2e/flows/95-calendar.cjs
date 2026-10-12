'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Calendar, end to end in the real app: create two events through the editor (one-off and
 * weekly), move the one-off with the keyboard route to a drag (Alt+Arrow on the focused chip,
 * real key events through the bridge) in the month grid and again in the week hour grid,
 * export `.ics` (saved by headless mode into the profile), empty the calendar, import the
 * file back through the preview, check every count and field, and import it once more to
 * prove the UID dedupe adds nothing.
 */
const fs = require('node:fs');
const path = require('node:path');
const { installHelpers, poll } = require('./_lib.cjs');

const STORE = 'jp-calendar-events';

/** Local `YYYY-MM-DD` of a Date, shifted by `days`. */
function dayKey(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** First-run dialogs left over when this flow runs without `setup` before it. */
async function dismissFirstRun(ctx) {
  await ctx.eval(`(() => { const b = [...document.querySelectorAll('.consent button')].find((x) => /No thanks/i.test(x.innerText)); if (b) b.click(); return true; })()`);
  await ctx.sleep(300);
  await ctx.eval(`(() => { const b = document.querySelector('.frs-root .frs-quiet'); if (b) b.click(); return true; })()`);
  await poll(ctx, `!document.querySelector('.frs-root') || null`, 5000);
}

module.exports = {
  id: 'calendar',
  title: 'Calendar: create, keyboard move, week grid, .ics export → import round trip',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    await dismissFirstRun(ctx);
    const events = () => ev(`JSON.parse(localStorage.getItem(${JSON.stringify(STORE)}) || '[]')`);
    const empty = () => ev(`(() => { localStorage.setItem(${JSON.stringify(STORE)}, '[]'); window.dispatchEvent(new CustomEvent('calendar-events-changed')); return true; })()`);

    await ev(`__e2e.open('calendar')`);
    const opened = await poll(ctx, `!!document.querySelector('.calendar-view .cal-month-grid') || null`, 20000);
    result.check('the Calendar opens on the month grid', Boolean(opened));
    // Known state first: an earlier flow may have left this window open on another month or
    // mode (`os:open` re-uses it, cursor and all). Month view, on today.
    await ev(`__e2e.clickText('.calendar-view .cal-modes button', 'Month')`);
    await ev(`__e2e.clickText('.calendar-view .cal-nav button', 'Today')`);
    const onToday = await poll(ctx, `(() => { const g = document.querySelector('.calendar-view .cal-month-grid'); const id = 'cal-month-cell-${dayKey(0)}'; return g && document.getElementById(id) && !document.getElementById(id).classList.contains('out') ? true : null; })()`, 5000);
    result.check("the month grid shows today's month", Boolean(onToday));
    await empty();
    await poll(ctx, `document.querySelectorAll('.calendar-view .cal-chip').length === 0 || null`, 5000);

    // --- 1. Create through the editor ----------------------------------------------------
    const today = dayKey(0);
    const create = async ({ title, date, start, end, repeat }) => {
      await ev(`__e2e.click(document.querySelector('.calendar-view .cal-toolbar-actions .btn.primary'))`);
      const modal = await poll(ctx, `!!document.querySelector('.cal-modal[role=dialog]') || null`, 5000);
      if (!modal) return false;
      return ev(`(() => {
        const m = document.querySelector('.cal-modal[role=dialog]');
        const set = (el, value) => {
          const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        set(m.querySelector('.cal-field input:not([type])'), ${JSON.stringify(title)});
        set(m.querySelector('input[type=date]'), ${JSON.stringify(date)});
        const times = m.querySelectorAll('input[type=time]');
        set(times[0], ${JSON.stringify(start)});
        set(times[1], ${JSON.stringify(end)});
        ${repeat ? `set([...m.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'weekly')), ${JSON.stringify(repeat)});` : ''}
        return true;
      })()`).then(async () => {
        await ctx.sleep(150);
        await ev(`__e2e.click(document.querySelector('.cal-modal .cal-modal-actions .btn.primary'))`);
        return poll(ctx, `!document.querySelector('.cal-modal[role=dialog]') || null`, 5000);
      });
    };
    await create({ title: 'E2E kanji review', date: today, start: '10:00', end: '11:30' });
    await create({ title: 'E2E weekly class', date: today, start: '18:00', end: '19:00', repeat: 'weekly' });
    let stored = await events();
    const oneOff = stored.find((e) => e.title === 'E2E kanji review');
    const weekly = stored.find((e) => e.title === 'E2E weekly class');
    result.check('two events were created through the editor', stored.length === 2 && Boolean(oneOff) && weekly?.recurrence === 'weekly', stored.map((e) => ({ title: e.title, date: e.date, recurrence: e.recurrence })));
    await ctx.shot('created');

    // --- 2. Keyboard drag: Alt+ArrowRight on the focused chip (real key events) ------------
    // Focus is put on the chip explicitly; nothing relies on where focus happened to be.
    const focusChip = () => ev(`(() => { const el = [...document.querySelectorAll('.calendar-view [data-occurrence]')].find((x) => x.getAttribute('data-occurrence').startsWith(${JSON.stringify(`${oneOff?.id}|`)})); if (!el) return false; el.focus(); return document.activeElement === el; })()`);
    const focused = oneOff ? await focusChip() : false;
    result.check('the one-off event chip takes keyboard focus in the month grid', focused === true);
    await ctx.request('/key', { window: 'main', key: 'ArrowRight', modifiers: ['alt'] });
    const tomorrow = dayKey(1);
    const movedDay = await poll(ctx, `(() => { const e = JSON.parse(localStorage.getItem(${JSON.stringify(STORE)}) || '[]').find((x) => x.id === ${JSON.stringify(oneOff?.id ?? '')}); return e && e.date === ${JSON.stringify(tomorrow)} ? e.date : null; })()`, 5000);
    result.check('Alt+ArrowRight moved it one day (the keyboard route to a drag)', movedDay === tomorrow, { expected: tomorrow, got: movedDay });
    const stillFocused = await poll(ctx, `(document.activeElement && (document.activeElement.getAttribute('data-occurrence') || '').startsWith(${JSON.stringify(`${oneOff?.id}|`)})) || null`, 3000);
    result.check('focus followed the event to its new day', Boolean(stillFocused));
    const announced = await ev(`document.querySelector('.calendar-view [role=status].cal-sr-only')?.textContent || ''`);
    result.check('the move was announced for a screen reader', announced.length > 0, announced);

    // The week hour grid: the event is placed at 10:00 and Alt+ArrowDown moves it 15 minutes.
    await ev(`__e2e.clickText('.cal-modes button', 'Week')`);
    const grid = await poll(ctx, `(() => { const g = document.querySelector('.cal-wk[role=grid]'); return g ? { slots: g.querySelectorAll('[role=gridcell]').length, active: g.getAttribute('aria-activedescendant') } : null; })()`, 5000);
    result.check('Week shows the hour grid (7 days × (24 hours + all-day))', grid?.slots === 7 * 25, grid);
    const block = await ev(`(() => { const el = [...document.querySelectorAll('.cal-wk-event')].find((x) => (x.getAttribute('data-occurrence') || '').startsWith(${JSON.stringify(`${oneOff?.id}|`)})); return el ? { cell: el.closest('[role=gridcell]').id, top: el.style.top } : null; })()`);
    result.check("the event sits in its start hour's slot", Boolean(block) && block.cell.endsWith(`${tomorrow}-10`), block);
    await focusChip();
    await ctx.request('/key', { window: 'main', key: 'ArrowDown', modifiers: ['alt'] });
    const retimed = await poll(ctx, `(() => { const e = JSON.parse(localStorage.getItem(${JSON.stringify(STORE)}) || '[]').find((x) => x.id === ${JSON.stringify(oneOff?.id ?? '')}); return e && e.startTime === '10:15' ? { start: e.startTime, end: e.endTime } : null; })()`, 5000);
    result.check('Alt+ArrowDown in the week grid moves it 15 minutes, keeping its length', retimed?.start === '10:15' && retimed?.end === '11:45', retimed);
    // The grid's own keys: one tab stop, arrows pick a slot, Enter opens the editor there.
    await ev(`document.querySelector('.cal-wk[role=grid]').focus()`);
    await ctx.request('/key', { window: 'main', key: 'ArrowDown' });
    await ctx.request('/key', { window: 'main', key: 'Enter' });
    const slotEditor = await poll(ctx, `(() => { const m = document.querySelector('.cal-modal[role=dialog]'); if (!m) return null; return m.querySelectorAll('input[type=time]')[0]?.value || 'no-time'; })()`, 5000);
    result.check('Enter on a week-grid slot opens a new event at that hour', /^\d\d:00$/.test(slotEditor ?? ''), slotEditor);
    await ctx.shot('week-grid');
    await ev(`__e2e.click([...document.querySelectorAll('.cal-modal .cal-modal-actions .btn')].find((b) => !b.classList.contains('primary')))`);
    await poll(ctx, `!document.querySelector('.cal-modal[role=dialog]') || null`, 3000);
    await ev(`__e2e.clickText('.cal-modes button', 'Month')`);

    // --- 3. Export .ics (saved by headless mode into <profile>/e2e-downloads) -------------
    const downloads = path.join(ctx.profile, 'e2e-downloads');
    const before = new Set(fs.existsSync(downloads) ? fs.readdirSync(downloads) : []);
    await ev(`__e2e.click(document.querySelector('.calendar-view .cal-export-ics'))`);
    let file = null;
    for (let i = 0; i < 40 && !file; i++) {
      await ctx.sleep(250);
      const now = fs.existsSync(downloads) ? fs.readdirSync(downloads) : [];
      const fresh = now.find((n) => n.endsWith('.ics') && !before.has(n)) ?? now.find((n) => n.endsWith('.ics'));
      if (fresh) {
        const full = path.join(downloads, fresh);
        // Wait for the write to settle.
        if (fs.statSync(full).size > 0) file = full;
      }
    }
    result.check('the .ics export was saved (no dialog)', Boolean(file), file);
    const ics = file ? fs.readFileSync(file, 'utf8') : '';
    const vevents = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    result.check('the export holds both events, the weekly rule and the moved time', vevents === 2 && ics.includes('RRULE:FREQ=WEEKLY') && ics.includes(`DTSTART:${tomorrow.replace(/-/g, '')}T101500`), { vevents, bytes: ics.length });

    // --- 4. Fresh state, then import the file back through the preview -------------------
    await empty();
    result.check('the calendar is empty before the import', (await events()).length === 0);
    const setFile = (text) => ev(`(() => {
      const input = document.querySelector('.calendar-view .cal-import-input');
      if (!input) return false;
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(text)}], 'gum-e2e.ics', { type: 'text/calendar' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    result.check('the Import .ics control is present', await setFile(ics));
    const preview = await poll(ctx, `(() => { const m = document.querySelector('.cal-import-modal'); return m ? { text: m.innerText.replace(/\\s+/g, ' '), rows: m.querySelectorAll('.cal-import-list > li').length, canImport: !m.querySelector('.cal-import-confirm')?.disabled } : null; })()`, 8000);
    result.check('the preview lists 2 new events before anything is written', Boolean(preview) && preview.rows === 2 && /\b2\b/.test(preview.text) && preview.canImport && (await events()).length === 0, preview);
    await ctx.shot('import-preview');
    await ev(`__e2e.click(document.querySelector('.cal-import-confirm'))`);
    await poll(ctx, `!document.querySelector('.cal-import-modal') || null`, 5000);
    stored = await events();
    const back1 = stored.find((e) => e.id === oneOff?.id);
    const back2 = stored.find((e) => e.id === weekly?.id);
    result.check('the import restored both events with their original ids', stored.length === 2 && Boolean(back1) && Boolean(back2), stored.map((e) => e.id));
    result.check('fields survived the round trip (date, times, repeat)',
      back1?.date === tomorrow && back1?.startTime === '10:15' && back1?.endTime === '11:45' && back2?.recurrence === 'weekly' && back2?.startTime === '18:00',
      { back1, back2 });
    const chips = await poll(ctx, `document.querySelectorAll('.calendar-view .cal-month-grid .cal-chip').length || null`, 5000);
    result.check('the imported events show on the month grid', (chips ?? 0) >= 2, chips);

    // --- 5. The same file again: deduped by UID, nothing to add ---------------------------
    await setFile(ics);
    const again = await poll(ctx, `(() => { const m = document.querySelector('.cal-import-modal'); return m ? { dup: m.querySelector('.cal-import-duplicates')?.innerText || '', canImport: !m.querySelector('.cal-import-confirm')?.disabled } : null; })()`, 8000);
    result.check('a second import finds both already present and offers nothing to add', Boolean(again) && again.canImport === false && /\b2\b/.test(again.dup), again);
    await ev(`__e2e.click([...document.querySelectorAll('.cal-import-modal .cal-modal-actions .btn')].find((b) => !b.classList.contains('primary')))`);
    await poll(ctx, `!document.querySelector('.cal-import-modal') || null`, 3000);
    result.check('still exactly two events', (await events()).length === 2);
    await ctx.shot('after-import');

    // Leave the profile's calendar empty for whatever runs next.
    await empty();
  },
};
