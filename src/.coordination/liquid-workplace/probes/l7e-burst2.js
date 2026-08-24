/**
 * L7-E SENSITIVITY CONTROL, second generation.
 *
 * Why a second one exists: `l7d-burst-control.js` (126 real headwords through
 * `lookupTermsBatch`) no longer blocks main. On the 2026-08-24 boot it completed in **62 ms**
 * with 126/126 glossed and left `/health` at max 5.5 ms — it did its work and the work is now
 * cheap, which is a fine result for the product and a useless control: a control that does not
 * fail cannot certify that the probe would see a failure.
 *
 * This one reproduces `PERF_BASELINE.md`'s recorded shape instead: the SINGLE-term path
 * (`lookupTerm`, one IPC per call) over the same headwords crossed with six particles, so most
 * queries are inflected forms the index has never been asked for. That is the burst that
 * measured 8,235.9 ms and 9,922.8 ms on the L0 boots.
 *
 * VOID unless `window.__l7eBurst2.done === true` and `fired === settled === 756`: a control
 * whose calls rejected instantly performed no work and its clean `/health` means nothing.
 */
(function () {
  var WORDS = (
    '勉強 図書館 新聞 冷蔵庫 自転車 ' +
    '食べる 飲む 読む 書く 話す 聞く ' +
    '見る 行く 来る 帰る 走る 歩く ' +
    '教える 習う 覚える 忘れる 考える ' +
    '思う 知る 分かる 使う 作る 休む ' +
    '働く 会う 待つ 選ぶ 持つ 取る 置く ' +
    '入る 出る 上がる 下がる 始める ' +
    '終わる 続く 変わる 違う 同じ 多い ' +
    '少ない 大きい 小さい 高い 安い ' +
    '新しい 古い 良い 悪い 楽しい ' +
    '悲しい 嬉しい 寒い 暑い 暖かい ' +
    '面白い 難しい 易しい 忙しい ' +
    '静か 便利 大丈夫 元気 有名 親切 ' +
    '安全 危険 完全 簡単 複雑 重要 必要 ' +
    '可能 自然 社会 文化 歴史 ' +
    '科学 数学 物理 化学 生物 医者 看護 ' +
    '病院 薬 健康 食事 料理 野菜 果物 ' +
    '肉 魚 牛乳 卸売 商店 市場 価格 お金 ' +
    '銀行 会社 仕事 工場 機械 電話 電気 ' +
    '水道 道路 鉄道 飛行機 空港 駅 切符 ' +
    '乗る 降りる 時間 曜日 今日 明日 ' +
    '昨日'
  ).split(/\s+/).filter(Boolean);
  var SUFFIXES = ['', 'が', 'を', 'に', 'で', 'は'];

  var st = { words: WORDS.length, fired: 0, settled: 0, started: Date.now(), done: false };
  window.__l7eBurst2 = st;
  if (WORDS.length !== 126) {
    st.err = 'VOID: word list is ' + WORDS.length + ', not 126';
    return 'void-wordlist';
  }
  if (!window.api || typeof window.api.lookupTerm !== 'function') {
    st.err = 'VOID: window.api.lookupTerm is not a function';
    return 'void-no-api';
  }
  for (var s = 0; s < SUFFIXES.length; s += 1) {
    for (var i = 0; i < WORDS.length; i += 1) {
      st.fired += 1;
      window.api
        .lookupTerm(WORDS[i] + SUFFIXES[s])
        .catch(function () {})
        .then(function () {
          st.settled += 1;
          if (st.settled === st.fired && st.fired === 756) {
            st.ms = Date.now() - st.started;
            st.done = true;
          }
        });
    }
  }
  return 'burst2-fired-' + st.fired;
})()
