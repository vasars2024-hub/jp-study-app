import { extractReadableFromUrl } from '../src/main/readabilityExtract.ts';

const SITES = [
  { lang: 'ja', name: 'NHK News', url: 'https://news.web.nhk/newsweb/na/na-k10015174811000' },
  { lang: 'ja', name: 'NHK Easy hub', url: 'https://news.web.nhk/news/easy/' },
  { lang: 'ja', name: 'Wikipedia JP', url: 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC' },
  { lang: 'ja', name: 'Yahoo News JP', url: 'https://news.yahoo.co.jp/' },
  { lang: 'ja', name: 'Mainichi', url: 'https://mainichi.jp/' },
  { lang: 'zh', name: 'BBC Chinese', url: 'https://www.bbc.com/zhongwen/simp' },
  { lang: 'zh', name: 'Wikipedia ZH', url: 'https://zh.wikipedia.org/wiki/%E4%B8%AD%E5%9B%BD' },
  { lang: 'zh', name: 'RFI Chinese', url: 'https://www.rfi.fr/cn/' },
  { lang: 'zh', name: 'People Daily', url: 'http://www.people.com.cn/' },
  { lang: 'zh', name: 'Xinhua', url: 'https://www.news.cn/' },
];

function textLen(html = '') {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
}

const results = [];
for (const site of SITES) {
  const started = Date.now();
  try {
    const r = await extractReadableFromUrl(site.url);
    const len = textLen(r.content);
    results.push({
      lang: site.lang,
      name: site.name,
      ok: r.ok && len >= 80,
      textLen: len,
      title: (r.title ?? '').slice(0, 55),
      ms: Date.now() - started,
      error: r.error,
    });
  } catch (e) {
    results.push({
      lang: site.lang,
      name: site.name,
      ok: false,
      textLen: 0,
      title: '',
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

const ja = results.filter((r) => r.lang === 'ja');
const zh = results.filter((r) => r.lang === 'zh');
console.log('\n=== Japanese sites ===');
for (const r of ja) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.name.padEnd(14)} | ${String(r.textLen).padStart(5)} chars | ${r.ms}ms`);
  if (!r.ok) console.log(`       ${r.error ?? r.title}`);
  else console.log(`       ${r.title}`);
}
console.log('\n=== Chinese sites ===');
for (const r of zh) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.name.padEnd(14)} | ${String(r.textLen).padStart(5)} chars | ${r.ms}ms`);
  if (!r.ok) console.log(`       ${r.error ?? r.title}`);
  else console.log(`       ${r.title}`);
}
console.log(`\nTotal: ${results.filter((r) => r.ok).length}/${results.length} passed`);