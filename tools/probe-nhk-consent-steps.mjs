import { parseHTML } from 'linkedom';

const html = await fetch('https://news.web.nhk/newsweb/na/na-k10015174811000', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' },
}).then((r) => r.text());

for (const m of ['1/2', '2/2', 'ご利用いただけるサービス', '放送番組の同時配信', 'ログイン', '確認しました']) {
  const i = html.indexOf(m);
  console.log(m, i >= 0 ? `yes @${i}` : 'no');
  if (i >= 0) console.log(' ', html.slice(i, i + 200).replace(/\s+/g, ' '));
}