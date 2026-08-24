/**
 * L7-D category-7 SENSITIVITY CONTROL: 126 cold, unseen, REAL headword lookups fired at
 * `dict:lookupTermsBatch` while `tools/liquid-perf-probe.ps1` samples `/health`.
 *
 * Fed to that probe as `-DuringJs (Get-Content ... -Raw)`.
 *
 * TWO ways this control has already produced a false pass, both fixed here:
 *
 * 1. **Wrong argument shape reads exactly like a clean run.** `lookupTermsBatch` takes
 *    `Array<{expression, reading?}>`, not `string[]`. Passing strings rejects inside the
 *    main handler with `Cannot read properties of undefined (reading 'trim')` — the promise
 *    is caught in the renderer, `/health` never sees a block, and the probe reports
 *    max 3.2 ms. A control that silently performs no work is indistinguishable from a
 *    surface that is fast. So the result is parked on `window.__l7dBurst` and the run is
 *    VOID unless `done === true` and `keys === 126`.
 * 2. **Synthetic CJK pairs are not a load.** Codepoint-arithmetic "words" miss the index
 *    and return 126 empty rows in 351 ms, moving main to only 230.6 ms — under category 7's
 *    own 500 ms bar, so the control could not demonstrate the probe seeing a bar-crossing
 *    failure. The words below are real headwords that return real gloss rows.
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

  window.__l7dBurst = { n: WORDS.length, started: Date.now(), done: false };
  if (WORDS.length !== 126) {
    window.__l7dBurst.err = 'VOID: word list is ' + WORDS.length + ', not 126';
    return 'void-wordlist';
  }
  var queries = WORDS.map(function (w) { return { expression: w }; });
  window.api.lookupTermsBatch(queries, ['en']).then(function (r) {
    var keys = r && typeof r === 'object' ? Object.keys(r) : [];
    var withGloss = keys.filter(function (k) {
      var v = r[k];
      return v && typeof v === 'object' && Object.keys(v).some(function (l) { return !!v[l]; });
    });
    window.__l7dBurst.done = true;
    window.__l7dBurst.ms = Date.now() - window.__l7dBurst.started;
    window.__l7dBurst.keys = keys.length;
    window.__l7dBurst.withGloss = withGloss.length;
  }).catch(function (e) { window.__l7dBurst.err = String(e).slice(0, 160); });
  return 'burst-fired';
})()
