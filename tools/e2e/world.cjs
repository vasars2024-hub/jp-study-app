'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * The world the headless app lives in during a run: every local service it may talk to
 * is a fake the harness owns, started on an ephemeral 127.0.0.1 port before the app boots.
 *
 *   AnkiConnect      src/main/__tests__/e2eFixtures/fakeAnkiServer.ts (the shared
 *                    FakeAnkiConnect behind a socket). The app's `ankiUrl` is seeded to it
 *                    in profiles.json, AND headless mode remaps 8765 onto it.
 *   qBittorrent      e2eFixtures/fakeQbit.ts (v5 WebUI). 8080 remaps onto it.
 *   a web site       e2eFixtures/fixtureSite.ts (an episode table + Nyaa-shaped RSS).
 *   texthooker       e2eFixtures/texthooker.ts (a WebSocket that sends hooked lines).
 *                    6677 remaps onto it.
 *   providers        an inline server answering "nothing found" for the subtitle and
 *                    metadata providers (Jimaku, OpenSubtitles, Jikan, AniList, TVmaze,
 *                    TMDB, VNDB, LRCLIB), so an import's metadata sweep or a subtitle
 *                    search stays on this machine (`GUM_E2E_REMOTE`).
 *   AI (opt-in)      `startFakeAi`: an OpenAI-compatible chat-completions server (the "local
 *                    server" provider) with deterministic answers for the study helpers.
 *                    Only with `startWorld(..., { ai: true })`, which also presets the
 *                    profile's AI settings to it. Ollama 11434 / LM Studio 1234 stay
 *                    refused by headless mode either way: the fake is never on them.
 *
 * The .ts fakes are bundled once per run with the repo's esbuild into the run's own
 * output folder (tools/e2e/out/<run-id>/).
 * Every fake records what it was asked; `summary()` is what the report prints.
 */
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const FFMPEG = path.join(REPO, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const FONT = ['C:/Windows/Fonts/msgothic.ttc', 'C:/Windows/Fonts/YuGothM.ttc', 'C:/Windows/Fonts/meiryo.ttc'].find((f) => fs.existsSync(f));

const FIXTURES = path.join(REPO, 'src', 'main', '__tests__', 'e2eFixtures');
const posix = (p) => p.replace(/\\/g, '/');

/**
 * Bundle the TypeScript fakes (and the shared scraper settings) into one CJS module, in
 * `outDir` — the run's own output folder, so two concurrent runs never read each other's
 * half-written bundle.
 */
function bundleFakes(outDir = OUT) {
  const BUNDLE = path.join(outDir, 'fakes.bundle.cjs');
  const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
  const entry = [
    `export { startFakeAnkiServer } from '${posix(path.join(FIXTURES, 'fakeAnkiServer'))}';`,
    `export { startFakeQbit } from '${posix(path.join(FIXTURES, 'fakeQbit'))}';`,
    `export { startFixtureSite } from '${posix(path.join(FIXTURES, 'fixtureSite'))}';`,
    `export { startTexthooker } from '${posix(path.join(FIXTURES, 'texthooker'))}';`,
    `export { makeTorrent } from '${posix(path.join(FIXTURES, 'torrentFixture'))}';`,
    `export * as texts from '${posix(path.join(FIXTURES, 'texts'))}';`,
    `export { resolveScraperSettings, createDefaultScraperSettingsDocument } from '${posix(path.join(REPO, 'src', 'shared', 'scraperSettings'))}';`,
    `export { DEFAULT_SITE_RULE } from '${posix(path.join(REPO, 'src', 'shared', 'scraperSiteRules'))}';`,
    `export { DEFAULT_SCRAPER_QBITTORRENT_SETTINGS } from '${posix(path.join(REPO, 'src', 'shared', 'scraperSourceSettings'))}';`,
  ].join('\n');
  fs.mkdirSync(outDir, { recursive: true });
  esbuild.buildSync({
    stdin: { contents: entry, resolveDir: REPO, sourcefile: 'e2e-fakes-entry.ts', loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    packages: 'external',
    outfile: BUNDLE,
    logLevel: 'error',
  });
  delete require.cache[BUNDLE];
  return require(BUNDLE);
}

function ffmpeg(args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, timeout }, (err, _o, stderr) =>
      err ? reject(new Error(`ffmpeg: ${stderr || err.message}`)) : resolve(),
    );
  });
}

const filterPath = (p) => posix(p).replace(/:/g, '\\:');

/**
 * A 4 s noisy lossless clip: above the 2 MiB floor the auto-import keeps (shared/mediaIngest),
 * so a "downloaded" episode is imported the way a real one is.
 */
async function ingestVideo(dir) {
  const file = path.join(dir, 'ingest-source.mkv');
  await ffmpeg([
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=4',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=22050:duration=4',
    '-vf', 'noise=alls=80:allf=t+u', '-pix_fmt', 'yuv420p', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', '-shortest', file,
  ]);
  return file;
}

/** The picture every synthetic screen shows: Japanese text on paper, at the display's size. */
const SCREEN_LINES = ['窓辺の猫は静かに眠っていた。', '今日は雨ですね。'];
async function screenImage(dir, width = 1920, height = 1080) {
  const file = path.join(dir, 'synthetic-screen.png');
  const draws = SCREEN_LINES.map((line, i) => {
    const t = path.join(dir, `screen-line-${i}.txt`);
    fs.writeFileSync(t, line, 'utf8');
    return `drawtext=fontfile='${filterPath(FONT)}':textfile='${filterPath(t)}':x=160:y=${240 + i * 160}:fontsize=88:fontcolor=black`;
  });
  draws.push(`drawbox=x=120:y=200:w=${width - 240}:h=360:color=gray@0.6:t=4`);
  await ffmpeg(['-f', 'lavfi', '-i', `color=c=0xf4f1e8:s=${width}x${height}`, '-frames:v', '1', '-vf', draws.join(','), file]);
  return { file, lines: SCREEN_LINES, region: { x: 120, y: 200, width: width - 240, height: 360 } };
}

/** Hosts whose answers the providers fake gives instead of the internet. */
const REMOTE_HOSTS = [
  'jimaku.cc',
  'api.opensubtitles.com',
  'api.jikan.moe',
  'graphql.anilist.co',
  'api.tvmaze.com',
  'api.themoviedb.org',
  'api.vndb.org',
  'lrclib.net',
  // DeepL (Translate's cloud engine): a fake that translates (tools/e2e/fixtures.cjs).
  'api-free.deepl.com',
  'api.deepl.com',
];

/** "Nothing found", in each provider's own shape. Every hit is recorded. */
async function startProviders() {
  const hits = [];
  /** Every request the fake DeepL answered (fixtures.cjs `answerFakeDeepl`), newest last. */
  const deepl = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://providers.invalid');
    const [, host = '', ...rest] = url.pathname.split('/');
    const p = `/${rest.join('/')}`;
    hits.push(`${req.method} ${host}${p}`);
    if (host === 'api-free.deepl.com' || host === 'api.deepl.com') {
      return require('./fixtures.cjs').answerFakeDeepl(req, res, p, deepl);
    }
    req.resume();
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    switch (host) {
      case 'jimaku.cc':
        return json(200, []);
      case 'api.opensubtitles.com':
        return json(200, { data: [], total_count: 0, total_pages: 0, page: 1 });
      case 'api.jikan.moe':
        return json(200, { data: [], pagination: { has_next_page: false, last_visible_page: 1 } });
      case 'graphql.anilist.co':
        return json(200, { data: { Page: { pageInfo: { hasNextPage: false }, media: [], airingSchedules: [] }, Media: null } });
      case 'api.tvmaze.com':
        return json(p.startsWith('/search') ? 200 : 404, p.startsWith('/search') ? [] : { name: 'Not Found', status: 404 });
      case 'api.themoviedb.org':
        return json(200, { page: 1, results: [], total_results: 0, total_pages: 0 });
      case 'api.vndb.org':
        return json(200, { results: [], more: false, count: 0 });
      case 'lrclib.net':
        return json(p.startsWith('/api/search') ? 200 : 404, p.startsWith('/api/search') ? [] : { code: 404, name: 'TrackNotFound' });
      default:
        return json(404, {});
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    hits,
    deepl,
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

/** The repository the app's release feed names (`shared/release.ts`). */
const FEED_REPO = 'vasars2024-hub/jp-study-app';

/**
 * The update feed: GitHub's release API for this repository, faked. Headless mode points
 * every update check here through `GUM_UPDATE_FEED_URL` (honoured only under the harness),
 * so a run never asks the real api.github.com. Stable answers this build's own version;
 * the release list adds a newer pre-release for the beta channel. Every hit is recorded.
 *
 * Downloads (main/updateDownloader.ts): `<base>/download/<tag>/RELEASES` and the
 * `-full.nupkg` it names — a deterministic fake package, served in throttled chunks with
 * HTTP Range support (206), so a flow can watch real byte progress, cancel and resume.
 * The FIRST whole-file request is cut off part-way (`dropAfter`), so a run also proves the
 * automatic retry resumes with a Range instead of starting over. `/releases/tags/<tag>`
 * answers "What's new" for one version. `downloads` records every package request with
 * its Range header and status.
 */
async function startUpdateFeed() {
  const version = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
  const [maj, min] = String(version).split('.').map((n) => parseInt(n, 10) || 0);
  const beta = `${maj}.${min + 1}.0-beta.1`;
  const page = (tag) => `https://github.com/${FEED_REPO}/releases/tag/${tag}`;
  const stable = {
    tag_name: `v${version}`,
    name: `Gum ${version} (E2E feed)`,
    body: [
      '- E2E stable notes',
      '<script>alert("not html")</script>',
      '',
      '## Highlights',
      '',
      '- **Bold words**, *italic words* and `inline code`',
      `- [Project issue](https://github.com/${FEED_REPO}/issues/1)`,
      '- [Elsewhere](https://evil.example/phish)',
      '',
      '<img src=x onerror="alert(1)">',
    ].join('\n'),
    html_url: page(`v${version}`),
    published_at: '2026-10-01T00:00:00Z',
    prerelease: false,
    draft: false,
  };
  const pre = { ...stable, tag_name: `v${beta}`, name: `Gum ${beta} (E2E feed)`, body: '- E2E beta notes', html_url: page(`v${beta}`), prerelease: true };
  const draft = { ...stable, tag_name: 'v99.0.0', name: 'never shown', draft: true };
  // The beta's Squirrel package: Squirrel spells SemVer 1, so 1.1.0-beta.1 is 1.1.0-beta1.
  const squirrelBeta = beta.replace(/-(.*)$/, (_m, pre) => `-${pre.replace(/\./g, '')}`);
  const pkgName = `gum-${squirrelBeta}-full.nupkg`;
  const pkg = Buffer.alloc(4 * 1024 * 1024);
  for (let off = 0, n = 0; off < pkg.length; n++) {
    const block = crypto.createHash('sha256').update(`gum-e2e-package-${n}`).digest();
    off += block.copy(pkg, off);
  }
  const pkgSha1 = crypto.createHash('sha1').update(pkg).digest('hex').toUpperCase();
  const releasesText = `${pkgSha1} ${pkgName} ${pkg.length}`;
  const CHUNK = 64 * 1024;
  const CHUNK_MS = 60;
  /** The first whole-file GET is cut off after this many bytes (once). */
  const dropAfter = 1024 * 1024;
  let dropped = false;
  const downloads = [];
  const servePackage = (req, res) => {
    const range = /^bytes=(\d+)-$/.exec(String(req.headers.range ?? ''));
    const start = range ? Number(range[1]) : 0;
    if (start >= pkg.length) {
      downloads.push({ range: req.headers.range ?? null, status: 416 });
      res.writeHead(416, { 'content-range': `bytes */${pkg.length}` });
      return res.end();
    }
    const status = range ? 206 : 200;
    const cut = !range && !dropped;
    if (cut) dropped = true;
    downloads.push({ range: req.headers.range ?? null, status, cut });
    res.writeHead(status, {
      'content-type': 'application/octet-stream',
      'content-length': String(pkg.length - start),
      'accept-ranges': 'bytes',
      ...(range ? { 'content-range': `bytes ${start}-${pkg.length - 1}/${pkg.length}` } : {}),
    });
    let at = start;
    const timer = setInterval(() => {
      if (res.destroyed) return clearInterval(timer);
      if (cut && at - start >= dropAfter) {
        clearInterval(timer);
        return res.destroy();
      }
      const end = Math.min(pkg.length, at + CHUNK);
      res.write(pkg.subarray(at, end));
      at = end;
      if (at >= pkg.length) {
        clearInterval(timer);
        res.end();
      }
    }, CHUNK_MS);
    res.on('close', () => clearInterval(timer));
  };
  const hits = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://feed.invalid');
    hits.push(`${req.method} ${url.pathname}${url.search}`);
    req.resume();
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === `/repos/${FEED_REPO}/releases/latest`) return json(200, stable);
    if (url.pathname === `/repos/${FEED_REPO}/releases`) return json(200, [draft, pre, stable]);
    if (url.pathname === `/repos/${FEED_REPO}/releases/tags/v${version}`) return json(200, stable);
    if (url.pathname === `/repos/${FEED_REPO}/releases/tags/v${beta}`) return json(200, pre);
    if (url.pathname === `/repos/${FEED_REPO}/download/v${beta}/RELEASES`) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(releasesText);
    }
    if (url.pathname === `/repos/${FEED_REPO}/download/v${beta}/${pkgName}`) return servePackage(req, res);
    return json(404, { message: 'Not Found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    port,
    base: `http://127.0.0.1:${port}/repos/${FEED_REPO}`,
    version,
    beta,
    hits,
    /** The beta's fake Squirrel package, as RELEASES describes it. */
    pkg: { name: pkgName, size: pkg.length, sha1: pkgSha1, dropAfter },
    downloads,
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

/** The model id the fake AI server answers as (and the profile preset names). */
const FAKE_AI_MODEL = 'gum-e2e-fake';

/** The optional AI study helpers the fake answers (src/main/aiStudyAssist.ts). */
const FAKE_AI_FEATURES = ['whyWrong', 'exampleSentences', 'leechRescue', 'contextExplain'];

/**
 * The speaking and writing helpers the fake also answers (src/main/aiSpeakAssist.ts), and
 * the preset allows: the conversation partner, writing correction, the journal grade and
 * the shadowing explanation. Their prompts are kept on the hit (`hit.prompt`), so a flow
 * can check what was sent — and what was withheld.
 */
const FAKE_AI_SPEAK_FEATURES = ['conversationPartner', 'writingCorrection', 'journalGrade', 'shadowingFeedback'];

/**
 * The Agent's two requests the fake also answers, only when the flow asks for them by name:
 *
 *  - `agentChat`: a chat send (src/main/agentProviderRouter.ts) whose prompt carries
 *    `FAKE_AI_AGENT_MARK`. Answered in prose, streamed in several chunks. With
 *    `FAKE_AI_AGENT_SLOW_MARK` the first chunk is sent and the rest is held back until the
 *    app hangs up (a Stop press) or `FAKE_AI_AGENT_HOLD_MS` passes.
 *  - `agentPlan`: the cloud planner (src/main/localAgent.ts `planWithCloud`) asked for a
 *    request carrying `FAKE_AI_PLAN_MARK`. Answered with a real plan in the planner's JSON
 *    shape: one `calendar.create-reminder` step with a yearly, 2nd-weekday repeat (see
 *    `fakeAiPlanStep`), which the app then validates, queues and runs like any other plan.
 *
 * A request without a mark is still refused (400), so nothing reaches the Agent's fake by
 * accident.
 */
const FAKE_AI_AGENT_FEATURES = ['agentChat', 'agentPlan'];
const FAKE_AI_AGENT_MARK = '[e2e-agent]';
const FAKE_AI_AGENT_SLOW_MARK = '[e2e-agent-slow]';
const FAKE_AI_PLAN_MARK = '[e2e-plan]';
const FAKE_AI_AGENT_HOLD_MS = 30000;
/** The reply, in the chunks it is streamed in. The flow reads them back from the app. */
const FAKE_AI_AGENT_REPLY = ['E2E fake AI agent: ', 'は marks the topic, ', 'が marks the subject.'];
const FAKE_AI_AGENT_PARTIAL = 'E2E fake AI agent: partial reply before Stop. ';

/** `YYYY-MM-DD` of a local date. */
function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The step the planner fake proposes: a yearly reminder on the 2nd Tuesday of next month
 * (computed from today, so it is always in the future and always a real 2nd Tuesday).
 */
function fakeAiPlanStep() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const day = 1 + ((2 - first.getDay() + 7) % 7) + 7;
  const date = localDateKey(new Date(first.getFullYear(), first.getMonth(), day));
  return {
    label: 'Yearly JLPT application reminder',
    operation: 'calendar.create-reminder',
    arguments: { title: 'E2E yearly JLPT reminder', date, recurrence: 'yearly', recurrenceNth: 2 },
  };
}

/** The text of the request's messages: a string, or the parts of a multimodal message. */
function messageText(message) {
  const content = message && message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (part && typeof part.text === 'string' ? part.text : '')).join('\n');
  return '';
}

/**
 * Which study helper a chat-completions request is: by the JSON schema it asks for
 * (`response_format.json_schema.schema`, what the app sends a compatible server), else
 * by the prompt's own wording. `null` for anything else.
 */
function fakeAiFeatureOf(body) {
  const schema = body && body.response_format && body.response_format.json_schema && body.response_format.json_schema.schema;
  const props = schema && typeof schema === 'object' && schema.properties ? Object.keys(schema.properties) : [];
  if (props.includes('confusion')) return 'whyWrong';
  if (props.includes('sentences')) return 'exampleSentences';
  if (props.includes('mnemonic')) return 'leechRescue';
  if (props.includes('sense')) return 'contextExplain';
  if (props.includes('reply') && props.includes('correction')) return 'conversationPartner';
  if (props.includes('edits')) return 'writingCorrection';
  if (props.includes('feedback') && props.includes('words')) return 'journalGrade';
  if (props.includes('issues') && props.includes('summary')) return 'shadowingFeedback';
  const prompt = (Array.isArray(body && body.messages) ? body.messages : []).map(messageText).join('\n');
  // The planner first: its system prompt quotes the user's request, marks included.
  if (/You are the offline planning model for Gum/.test(prompt)) return prompt.includes(FAKE_AI_PLAN_MARK) ? 'agentPlan' : null;
  if (prompt.includes(FAKE_AI_AGENT_MARK) || prompt.includes(FAKE_AI_AGENT_SLOW_MARK)) return 'agentChat';
  if (/understand a mistake on a flashcard/.test(prompt)) return 'whyWrong';
  if (/example sentences? for a learner/.test(prompt)) return 'exampleSentences';
  if (/keeps forgetting this flashcard/.test(prompt)) return 'leechRescue';
  if (/Which sense does the word have IN THIS SENTENCE/.test(prompt)) return 'contextExplain';
  if (/You are a conversation partner for a learner of/.test(prompt)) return 'conversationPartner';
  if (/Find its mistakes in/.test(prompt)) return 'writingCorrection';
  if (/Grade how they used each word/.test(prompt)) return 'journalGrade';
  if (/shadowed \(repeated aloud\) this line/.test(prompt)) return 'shadowingFeedback';
  return null;
}

const firstMatch = (text, re) => {
  const m = re.exec(text);
  return m ? m[1].trim() : '';
};

/**
 * The deterministic, schema-valid answer for one feature, built from the prompt the app
 * sent (src/shared/aiWhyWrong.ts, aiExampleSentences.ts, aiLeechRescue.ts,
 * aiContextExplain.ts), so the same request always gets the same reply.
 *
 *  - whyWrong: a typed answer is judged acceptable (so "Accept as correct" is offered);
 *    a flip-card Again (nothing typed) never is.
 *  - exampleSentences: three sentences — one that passes the i+1 check (only the target
 *    word), one with many unknown words (the renderer must discard it), and one without
 *    the target word at all (main's validation must drop it).
 *  - leechRescue: all three parts; a distinction only when similar cards were sent.
 *  - contextExplain: sense 2 when there are two or more, else sense 1.
 */
function fakeAiAnswer(feature, prompt) {
  switch (feature) {
    case 'whyWrong': {
      const word = firstMatch(prompt, /^- word: (.+)$/m);
      const typed = firstMatch(prompt, /^The learner typed: "(.*)"$/m);
      return {
        confusion: typed ? 'synonym' : 'similar-word',
        explanation: `E2E fake AI: ${word} was confused with a similar card in the deck.`,
        tip: `E2E tip: picture ${word} once more.`,
        acceptable: Boolean(typed),
        acceptableReason: typed ? `E2E fake AI: "${typed}" is an accepted variant for ${word}.` : '',
      };
    }
    case 'exampleSentences': {
      const word = firstMatch(prompt, /MUST use the word "([^"]+)"/);
      return {
        sentences: [
          { text: `${word}です。`, translation: 'E2E fake AI: the kept sentence.' },
          { text: `${word}は量子力学と統計熱力学の専門家に研究された。`, translation: 'E2E fake AI: too many unknown words.' },
          { text: '今日は雨が降っています。', translation: 'E2E fake AI: does not use the word.' },
        ],
      };
    }
    case 'leechRescue': {
      const word = firstMatch(prompt, /^- word: (.+)$/m);
      const similar = /Similar cards in the same deck:/.test(prompt);
      return {
        mnemonic: `E2E fake AI mnemonic: ${word} waits by the window.`,
        clearerMeaning: `E2E fake AI clearer meaning for ${word}`,
        distinction: similar ? `E2E fake AI: ${word} is not the similar card.` : '',
      };
    }
    case 'contextExplain': {
      const count = Number.parseInt(firstMatch(prompt, /\(1 to (\d+)\)/), 10) || 1;
      const sense = count >= 2 ? 2 : 1;
      return { sense, explanation: `E2E fake AI: sense ${sense} fits the words around it here.`, confidence: 'high' };
    }
    case 'agentPlan':
      return { summary: 'E2E fake AI plan: a yearly reminder on the 2nd Tuesday.', steps: [fakeAiPlanStep()] };
    case 'conversationPartner': {
      // The opening names a word the learner does not know (改札), so the next session can bring it back.
      if (/Open the conversation with your first line/.test(prompt)) {
        return { reply: 'いらっしゃいませ。改札はあちらです。', translation: 'E2E fake AI: welcome; the ticket gate is over there.', correction: { corrected: '', explanation: '' } };
      }
      const said = [...prompt.matchAll(/^Learner: (.+)$/gm)].pop();
      const message = said ? said[1].trim() : '';
      const wrong = message.includes('がください');
      return {
        reply: 'そうですか。改札で待ちましょう。',
        translation: 'E2E fake AI: I see. Let us wait at the ticket gate.',
        correction: wrong
          ? { corrected: message.replace('がください', 'をください'), explanation: 'E2E fake AI: ください takes を.' }
          : { corrected: '', explanation: '' },
      };
    }
    case 'writingCorrection': {
      const text = firstMatch(prompt, /<<<\n([\s\S]*?)\n>>>/);
      const edits = text.includes('私はは')
        ? [{ original: '私はは', corrected: '私は', explanation: 'E2E fake AI: doubled は.', kind: 'particle' }]
        : [];
      return { edits, overall: 'E2E fake AI: one slip to fix.' };
    }
    case 'journalGrade': {
      const words = [...prompt.matchAll(/^- ([^\s(:]+)/gm)].map((m) => m[1]);
      return { words: words.map((word) => ({ word, used: true, correct: true, note: `E2E fake AI: ${word} fits.` })), feedback: 'E2E fake AI: well done.' };
    }
    case 'shadowingFeedback':
      return { summary: 'E2E fake AI: keep the pitch steady.', issues: [] };
    default:
      return null;
  }
}

/**
 * A fake OpenAI-compatible server (the "local server" provider: Ollama, LM Studio) on an
 * ephemeral loopback port — never 11434 / 1234, which headless mode keeps refusing. It
 * answers `POST /v1/chat/completions` for the four study helpers with deterministic,
 * schema-valid JSON (see `fakeAiAnswer`), and `GET /v1/models`. Anything else is a 400, so
 * an unexpected caller shows up as a failure instead of a plausible answer.
 * `failNext(feature)` makes that feature's next request fail (HTTP 500): how a flow reaches
 * the non-AI fallbacks. Every request is recorded in `hits`.
 */
async function startFakeAi({ model = FAKE_AI_MODEL } = {}) {
  const hits = [];
  const failing = new Set();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fake-ai.invalid');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const json = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.method === 'GET' && url.pathname === '/v1/models') {
        hits.push({ path: url.pathname, feature: null, status: 200 });
        return json(200, { object: 'list', data: [{ id: model, object: 'model', owned_by: 'gum-e2e' }] });
      }
      if (req.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
        hits.push({ path: url.pathname, feature: null, status: 404 });
        return json(404, { error: { message: `fake AI: no route ${req.method} ${url.pathname}` } });
      }
      let body = null;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        hits.push({ path: url.pathname, feature: null, status: 400 });
        return json(400, { error: { message: 'fake AI: the body is not JSON' } });
      }
      const feature = fakeAiFeatureOf(body);
      const prompt = (Array.isArray(body.messages) ? body.messages : []).map(messageText).join('\n');
      const hit = { path: url.pathname, feature, model: body.model ?? null, schema: Boolean(body.response_format), stream: body.stream === true };
      if (FAKE_AI_SPEAK_FEATURES.includes(feature)) hit.prompt = prompt.slice(0, 8000);
      hits.push(hit);
      if (!feature) {
        hit.status = 400;
        return json(400, { error: { message: 'fake AI: not one of the study helpers it answers' } });
      }
      if (body.model !== model) {
        hit.status = 404;
        return json(404, { error: { message: `fake AI: model "${body.model}" not found` } });
      }
      if (failing.has(feature)) {
        failing.delete(feature);
        hit.status = 500;
        return json(500, { error: { message: `fake AI: ${feature} failed on purpose` } });
      }
      if (feature === 'agentChat') return answerAgentChat(req, res, body, prompt, hit);
      const content = JSON.stringify(fakeAiAnswer(feature, prompt));
      hit.status = 200;
      const usage = { prompt_tokens: Math.ceil(prompt.length / 4), completion_tokens: Math.ceil(content.length / 4) };
      usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
      if (body.stream === true) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ id: 'e2e', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ id: 'e2e', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage })}\n\n`);
        return res.end('data: [DONE]\n\n');
      }
      return json(200, {
        id: `chatcmpl-e2e-${hits.length}`,
        object: 'chat.completion',
        created: 1791000000,
        model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage,
      });
    });
  });
  /**
   * The Agent's chat: prose, not JSON. Streamed as `FAKE_AI_AGENT_REPLY` when the app asks
   * for a stream; the slow mark holds the rest back until the app hangs up (recorded as
   * `hit.aborted`) or the hold time passes.
   */
  function answerAgentChat(req, res, body, prompt, hit) {
    const slow = prompt.includes(FAKE_AI_AGENT_SLOW_MARK);
    const chunks = slow ? [FAKE_AI_AGENT_PARTIAL, 'and the rest, which a Stop never receives.'] : FAKE_AI_AGENT_REPLY;
    const content = chunks.join('');
    const usage = { prompt_tokens: Math.ceil(prompt.length / 4), completion_tokens: Math.ceil(content.length / 4) };
    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
    hit.status = 200;
    if (body.stream !== true) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({
        id: `chatcmpl-e2e-${hits.length}`,
        object: 'chat.completion',
        created: 1791000000,
        model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage,
      }));
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (delta, finish = null, extra = {}) => res.write(`data: ${JSON.stringify({ id: 'e2e', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`);
    const finishStream = () => {
      if (res.writableEnded || res.destroyed) return;
      send({}, 'stop', { usage });
      res.end('data: [DONE]\n\n');
    };
    if (!slow) {
      chunks.forEach((text, index) => send(index === 0 ? { role: 'assistant', content: text } : { content: text }));
      return finishStream();
    }
    send({ role: 'assistant', content: chunks[0] });
    const timer = setTimeout(() => {
      send({ content: chunks[1] });
      finishStream();
    }, FAKE_AI_AGENT_HOLD_MS);
    res.on('close', () => {
      clearTimeout(timer);
      if (!res.writableEnded) hit.aborted = true;
    });
    return undefined;
  }

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    port,
    /** What Settings > AI stores as the server's base URL. */
    base: `http://127.0.0.1:${port}/v1`,
    model,
    hits,
    /** The next request for `feature` fails with HTTP 500. */
    failNext(feature) {
      failing.add(feature);
    },
    /** The prompts the fake was sent for `feature` (speaking and writing helpers only), oldest first. */
    prompts(feature) {
      return hits.filter((h) => h.feature === feature && typeof h.prompt === 'string').map((h) => h.prompt);
    },
    /** Requests that reached chat-completions for `feature` (or for any helper). */
    count(feature) {
      return hits.filter((h) => h.path === '/v1/chat/completions' && (feature ? h.feature === feature : h.feature)).length;
    },
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

/**
 * The AI preset for a fresh profile (`startWorld(..., { ai: true })`): "Use AI features"
 * on, the provider set to the local OpenAI-compatible server at the fake's URL, and the
 * study helpers allowed to use it. Written where main reads them: `ai/settings-v1.json`
 * (src/main/aiSetupStore.ts) and the provider/engine in `mining/config.json`
 * (src/main/mining.ts).
 */
function writeAiPreset(profileDir, ai) {
  const aiDir = path.join(profileDir, 'ai');
  fs.mkdirSync(aiDir, { recursive: true });
  fs.writeFileSync(path.join(aiDir, 'settings-v1.json'), JSON.stringify({
    version: 1,
    enabled: true,
    cloudFeatures: Object.fromEntries([...FAKE_AI_FEATURES, ...FAKE_AI_SPEAK_FEATURES].map((id) => [id, true])),
    openaiModel: '',
    compatBaseUrl: ai.base,
    compatModel: ai.model,
  }, null, 2));
  const miningDir = path.join(profileDir, 'mining');
  fs.mkdirSync(miningDir, { recursive: true });
  fs.writeFileSync(path.join(miningDir, 'config.json'), JSON.stringify({ providerId: 'openai-compatible', engine: 'cloud' }, null, 2));
}

/**
 * Start every fake, generate the shared media. `dir` is the run's media folder (deleted
 * with the run). `options.outDir` is the run's output folder (the fakes bundle goes there).
 * `options.ai`: also start the fake OpenAI-compatible AI server and preset the profile's
 * AI settings to it (opt-in; without it the profile has AI on and nothing configured).
 * Returns the handles plus the env headless mode reads.
 */
async function startWorld(dir, options = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const fakes = bundleFakes(options.outDir);
  const [video, screen] = await Promise.all([ingestVideo(dir), screenImage(dir)]);
  const qbitPassword = crypto.randomBytes(12).toString('hex');
  const qbitSaveDir = path.join(dir, 'qbit-downloads');
  const anki = await fakes.startFakeAnkiServer({});
  const qbit = await fakes.startFakeQbit({
    password: qbitPassword,
    mediaPath: video,
    defaultSavePath: qbitSaveDir,
    version: '5',
    completeAfterPolls: 1,
    sidecars: { '.ja.srt': fakes.texts.SRT_JA },
  });
  const site = await fakes.startFixtureSite({ mediaPath: video });
  const hook = await fakes.startTexthooker();
  const providers = await startProviders();
  const updateFeed = await startUpdateFeed();
  const ai = options.ai ? await startFakeAi() : null;
  const world = {
    fakes,
    anki,
    qbit,
    qbitPassword,
    qbitSaveDir,
    site,
    hook,
    providers,
    updateFeed,
    /** The fake OpenAI-compatible AI server, or null when the run did not opt in. */
    ai,
    video,
    screen,
    /** What headless mode reads: remaps for the owner's ports, fakes for the providers. */
    env() {
      return {
        GUM_E2E_LOOPBACK: JSON.stringify({ remap: { 8765: anki.port, 8080: qbit.port, 6677: hook.port } }),
        GUM_E2E_REMOTE: JSON.stringify(Object.fromEntries(REMOTE_HOSTS.map((h) => [h, providers.base]))),
        GUM_E2E_SCREEN_IMAGE: screen.file,
        // Every update check (boot notifier, "Check now", release notes) reads this fake.
        GUM_UPDATE_FEED_URL: updateFeed.base,
        // A flow that opts in (`world: { updateInstall: true }`) gets an "installed" copy:
        // Gum's own downloader against this feed, and a stand-in Update.exe (headless only).
        ...(options.updateInstall ? { GUM_E2E_UPDATE_INSTALL: '1' } : {}),
      };
    },
    /** Files written into the fresh profile before the app first starts. */
    seedProfile(profileDir) {
      fs.mkdirSync(profileDir, { recursive: true });
      // The configurable endpoint: the app's own AnkiConnect setting points at the fake.
      fs.writeFileSync(
        path.join(profileDir, 'profiles.json'),
        JSON.stringify({ schemaVersion: 1, ankiUrl: anki.url, legacyMigrated: true }, null, 2),
      );
      if (ai) writeAiPreset(profileDir, ai);
      // Update history: this profile last ran an older Gum, so the build under test
      // starts as an update and arms "What's new" (main/updateHistory.ts).
      if (options.updateInstall) {
        fs.writeFileSync(
          path.join(profileDir, 'app-update-state.json'),
          JSON.stringify({ history: [{ version: '0.9.0', at: Date.UTC(2026, 8, 1) }] }, null, 2),
        );
      }
      // Local runs only (GUM_E2E_OCR_MODELS): real OCR models, installed as after a download.
      require('./realModels.cjs').seedRealModels(profileDir);
    },
    /** Which fake ports are whose (the report names loopback ports by owner). */
    ports() {
      return {
        [anki.port]: 'fake AnkiConnect',
        [qbit.port]: 'fake qBittorrent',
        [site.port]: 'fixture site',
        [hook.port]: 'fake texthooker',
        [providers.port]: 'fake providers',
        [updateFeed.port]: 'fake update feed',
        ...(ai ? { [ai.port]: 'fake AI (OpenAI-compatible)' } : {}),
      };
    },
    summary() {
      const actions = {};
      for (const c of anki.fake.calls) actions[c.action] = (actions[c.action] ?? 0) + 1;
      // Which note types were asked about: a storm on one name shows up here.
      const modelFieldNamesBy = {};
      // And what the searches were (an interval poll's `deck:*`, a link pass's
      // `"deck:…" "note:…"`, a review sync's `nid:`), by their first words.
      const findNotesBy = {};
      for (const c of anki.fake.calls) {
        if (c.action === 'modelFieldNames') {
          const name = String(c.params?.modelName ?? '');
          modelFieldNamesBy[name] = (modelFieldNamesBy[name] ?? 0) + 1;
        } else if (c.action === 'findNotes') {
          const q = String(c.params?.query ?? '');
          const kind = q.startsWith('nid:') ? 'nid:…' : q.slice(0, 32);
          findNotesBy[kind] = (findNotesBy[kind] ?? 0) + 1;
        }
      }
      return {
        // `requests` = HTTP round trips; a `multi` batch is one request and each of its
        // actions is still counted under `actions`.
        anki: { port: anki.port, notes: anki.fake.notes.size, requests: anki.fake.requests, actions, modelFieldNamesBy, findNotesBy },
        qbit: { port: qbit.port, torrents: qbit.torrents.size, calls: qbit.calls.length, logins: qbit.logins() },
        site: { port: site.port, hits: site.hits.length },
        texthooker: { port: hook.port, handshakes: hook.handshakes.length, clients: hook.clients() },
        providers: { port: providers.port, hits: providers.hits.slice(0, 40), total: providers.hits.length },
        updateFeed: { port: updateFeed.port, hits: updateFeed.hits.slice(0, 40), total: updateFeed.hits.length },
        ...(ai ? { ai: { port: ai.port, model: ai.model, byFeature: Object.fromEntries([...FAKE_AI_FEATURES, ...FAKE_AI_AGENT_FEATURES, ...FAKE_AI_SPEAK_FEATURES].map((f) => [f, ai.count(f)])), total: ai.hits.length } } : {}),
      };
    },
    async close() {
      for (const f of [anki, qbit, site, hook, providers, updateFeed, ai].filter(Boolean)) {
        try {
          await f.close();
        } catch {
          /* already closed */
        }
      }
    },
  };
  return world;
}

module.exports = {
  startWorld,
  startFakeAi,
  writeAiPreset,
  bundleFakes,
  ffmpeg,
  filterPath,
  FONT,
  REMOTE_HOSTS,
  SCREEN_LINES,
  FAKE_AI_MODEL,
  FAKE_AI_FEATURES,
  FAKE_AI_AGENT_FEATURES,
  FAKE_AI_SPEAK_FEATURES,
  FAKE_AI_AGENT_MARK,
  FAKE_AI_AGENT_SLOW_MARK,
  FAKE_AI_PLAN_MARK,
  FAKE_AI_AGENT_REPLY,
  FAKE_AI_AGENT_PARTIAL,
};
