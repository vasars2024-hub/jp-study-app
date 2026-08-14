/**
 * F7 of `docs/ACTIVE/EN_JA_SUBTITLE_FUSION_PLAN.md` — the honesty gate.
 *
 * The EN→JA fusion feature makes an accuracy claim: that fusing a transcript with
 * a translated English caption beats either one alone. This script is the only
 * thing in the repo that can falsify that claim, and the plan says the feature
 * must not ship as "highly accurate" if the gate fails.
 *
 * Per episode you supply four subtitle files: the human Japanese track (the
 * reference), the pipeline's fused output, Whisper's transcript alone, and the
 * reference translation alone. The last two are the baselines; the fused track has
 * to beat *both*, on every episode, and there must be at least two episodes.
 *
 * It lives outside vitest because producing its inputs needs real media and the
 * Whisper runtime. But the scoring it prints is `src/shared/subtitleFusionEval.ts`
 * and the parsing is `src/shared/subtitleCues.ts` — the real modules, bundled with
 * esbuild exactly as tools/grammar-audit.cjs does it, not a second implementation
 * that can drift from the one the product uses.
 *
 * Usage:
 *   node tools/fusion-eval.cjs --manifest <path.json> [--json] [--out <path>]
 *   node tools/fusion-eval.cjs --episode <name> --reference a.srt --fused b.srt \
 *        --whisper c.srt --mt d.srt   (repeatable)
 *
 * Manifest shape:
 *   { "episodes": [ { "name": "...", "reference": "...", "fused": "...",
 *                     "whisperOnly": "...", "mtOnly": "..." } ] }
 * Relative paths resolve against the manifest's own directory.
 *
 * Exit code is the gate: 0 when it passes, 1 when it fails or the inputs are
 * unusable. A reporting script that always exits 0 is not a gate.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');

function bundle(entry) {
  const { outputFiles } = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
  });
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func -- trusted local source, not user input
  new Function('module', 'exports', 'require', outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
}

const evalCore = bundle(path.join(ROOT, 'src', 'shared', 'subtitleFusionEval.ts'));
const cueCore = bundle(path.join(ROOT, 'src', 'shared', 'subtitleCues.ts'));

function parseArgs(argv) {
  const out = { manifest: null, json: false, out: null, episodes: [] };
  let pending = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[i += 1];
    if (arg === '--json') out.json = true;
    else if (arg === '--out') out.out = next();
    else if (arg === '--manifest') out.manifest = next();
    else if (arg === '--episode') {
      pending = { name: next() };
      out.episodes.push(pending);
    } else if (arg === '--reference' || arg === '--fused' || arg === '--whisper' || arg === '--mt') {
      if (!pending) throw new Error(`${arg} must follow an --episode`);
      const key = { '--reference': 'reference', '--fused': 'fused', '--whisper': 'whisperOnly', '--mt': 'mtOnly' }[arg];
      pending[key] = next();
    } else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

function readEpisodes(args) {
  if (!args.manifest) return args.episodes;
  const manifestPath = path.resolve(args.manifest);
  const base = path.dirname(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.episodes)) throw new Error('manifest has no `episodes` array');
  return manifest.episodes.map((entry) => ({
    name: entry.name,
    reference: path.resolve(base, entry.reference),
    fused: path.resolve(base, entry.fused),
    whisperOnly: path.resolve(base, entry.whisperOnly),
    mtOnly: path.resolve(base, entry.mtOnly),
  })).concat(args.episodes);
}

const REQUIRED = ['reference', 'fused', 'whisperOnly', 'mtOnly'];

function loadTrack(file, label) {
  const raw = fs.readFileSync(file, 'utf8');
  const cues = cueCore.parseSubtitles(raw);
  // A track that parses to nothing would score as a total deletion and quietly
  // make one baseline look terrible, which is the opposite of a gate.
  if (!cues.length) throw new Error(`${label} parsed to zero cues: ${file}`);
  return cues.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text }));
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`fusion-eval: ${error.message}`);
    return 1;
  }

  let episodes;
  try {
    episodes = readEpisodes(args);
  } catch (error) {
    console.error(`fusion-eval: ${error.message}`);
    return 1;
  }
  if (!episodes.length) {
    console.error('fusion-eval: no episodes. Pass --manifest or --episode.');
    return 1;
  }

  const verdicts = [];
  for (const episode of episodes) {
    const missing = REQUIRED.filter((key) => !episode[key]);
    if (missing.length) {
      console.error(`fusion-eval: ${episode.name || '(unnamed)'} is missing ${missing.join(', ')}`);
      return 1;
    }
    try {
      verdicts.push(evalCore.evaluateEpisode(
        episode.name,
        loadTrack(episode.reference, 'reference'),
        {
          fused: loadTrack(episode.fused, 'fused'),
          whisperOnly: loadTrack(episode.whisperOnly, 'whisperOnly'),
          mtOnly: loadTrack(episode.mtOnly, 'mtOnly'),
        },
      ));
    } catch (error) {
      console.error(`fusion-eval: ${episode.name}: ${error.message}`);
      return 1;
    }
  }

  const gate = evalCore.fusionShipGate(verdicts);
  if (args.out) fs.writeFileSync(args.out, `${JSON.stringify(gate, null, 2)}\n`, 'utf8');
  if (args.json) {
    console.log(JSON.stringify(gate, null, 2));
    return gate.passed ? 0 : 1;
  }

  const pct = (value) => `${(value * 100).toFixed(2)}%`;
  for (const verdict of gate.episodes) {
    console.log(`\n${verdict.episode}`);
    console.log(`  reference     ${verdict.fused.referenceCues} cues, ${verdict.fused.referenceChars} chars`);
    for (const key of ['fused', 'whisperOnly', 'mtOnly']) {
      const track = verdict[key];
      console.log(
        `  ${key.padEnd(13)} CER ${pct(track.documentCer).padStart(8)}`
        + `   aligned ${pct(track.alignedCer).padStart(8)}`
        + `   ${track.candidateCues} cues, ${track.missedCues} reference cues missed`,
      );
    }
    console.log(`  → ${verdict.passed ? 'PASS' : `FAIL (lost to ${verdict.lostTo.join(', ')})`}`);
  }
  console.log(`\nship gate: ${gate.passed ? 'PASS' : 'FAIL'}`);
  for (const reason of gate.reasons) console.log(`  - ${reason}`);
  return gate.passed ? 0 : 1;
}

process.exitCode = main();
