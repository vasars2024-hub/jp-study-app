import { parseHTML } from 'linkedom';

const html = await fetch('https://news.web.nhk/newsweb/na/na-k10015174811000', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' },
}).then((r) => r.text());

for (const m of ['ご利用にあたって', '内容について確認', '利用意向', '次へ', 'サービスを利用しない', 'ctu=out']) {
  const i = html.indexOf(m);
  console.log(m, i >= 0 ? `yes @${i}` : 'no');
}

const { document } = parseHTML(html);
const buttons = [...document.querySelectorAll('button,a,[role=button]')].map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
console.log('\nbuttons', buttons.slice(0, 30));