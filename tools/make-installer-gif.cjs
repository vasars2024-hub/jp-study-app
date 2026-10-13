#!/usr/bin/env node
/**
 * Writes assets/installer-loading.gif, the animation Squirrel's Setup.exe shows while it
 * installs (MakerSquirrel `loadingGif` in forge.config.ts). Without one, Setup.exe shows
 * Squirrel's stock animation, which says nothing about which app is installing.
 *
 * Rendered offscreen from assets/icon.png with the ffmpeg-static binary the app already
 * depends on: no window, no new dependency, no network. The result is committed, so a
 * release build never needs ffmpeg; rerun this only when the icon or the design changes.
 *
 * The design: the app icon on a deep Aero night gradient, bobbing gently over a soft
 * reflection, above an indeterminate Vista-style progress sweep. 300x240, 20 fps, 2 s loop.
 *
 * Usage: node tools/make-installer-gif.cjs [--out=<file>]
 */
'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- a plain CommonJS build script */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'assets', 'icon.png');
const DEFAULT_OUT = path.join(ROOT, 'assets', 'installer-loading.gif');
/** Setup.exe holds the whole GIF in memory and it ships inside Setup.exe: keep it small. */
const MAX_BYTES = 400 * 1024;

const W = 300;
const H = 240;
const FPS = 20;
const SECONDS = 2;
const ICON_SIZE = 112;
const ICON_Y = 40;
const BOB = 5;
const REFLECTION = 36;
const TRACK = { x: 70, y: 200, w: 160, h: 6 };
const SWEEP = 44;

function filterGraph() {
  const period = SECONDS; // one bob and one sweep per loop, so the loop is seamless
  const bob = `${BOB}*sin(2*PI*t/${period})`;
  const sweepX = `${TRACK.x}+${TRACK.w - SWEEP}*(0.5-0.5*cos(2*PI*t/${period}))`;
  // A soft blue halo behind the icon, on a vertical night gradient (0x070b1a -> 0x1a2b55).
  const glow = `exp(-(pow(X-W/2,2)+pow(Y-${ICON_Y + ICON_SIZE / 2},2))/5200)`;
  const channel = (top, bottom, halo) => `'min(255,${top}+${bottom - top}*Y/H+${halo}*${glow})'`;
  return [
    `color=c=black:s=${W}x${H}:r=${FPS}:d=${SECONDS},format=rgba,` +
      `geq=r=${channel(7, 26, 28)}:g=${channel(11, 43, 62)}:b=${channel(26, 85, 120)}:a=255[bg]`,
    `[0:v]scale=${ICON_SIZE}:${ICON_SIZE}:flags=lanczos,format=rgba,split[icon][mirror]`,
    // A faded reflection under the icon: flipped, cropped, alpha ramped to nothing.
    `[mirror]vflip,crop=${ICON_SIZE}:${REFLECTION}:0:0,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*0.32*(1-Y/${REFLECTION})'[refl]`,
    `[bg][refl]overlay=x=(W-w)/2:y=${ICON_Y + ICON_SIZE + 4}-(${bob}):format=auto[withrefl]`,
    `[withrefl][icon]overlay=x=(W-w)/2:y=${ICON_Y}+${bob}:format=auto,` +
      // The progress track (drawbox cannot animate: its `t` is thickness, not time).
      `drawbox=x=${TRACK.x - 1}:y=${TRACK.y - 1}:w=${TRACK.w + 2}:h=${TRACK.h + 2}:color=0x0a1024@1:t=fill,` +
      `drawbox=x=${TRACK.x}:y=${TRACK.y}:w=${TRACK.w}:h=${TRACK.h}:color=0x24365f@1:t=fill[track]`,
    // The glowing sweep, a sprite moved by overlay (whose x IS evaluated per frame).
    `color=c=0x4f98f5:s=${SWEEP}x${TRACK.h}:r=${FPS}:d=${SECONDS},` +
      `drawbox=x=4:y=0:w=${SWEEP - 8}:h=${Math.ceil(TRACK.h / 2)}:color=0xcfe6ff@0.9:t=fill[sweep]`,
    `[track][sweep]overlay=x='${sweepX}':y=${TRACK.y}:format=auto,format=rgb24,split[a][b]`,
    '[a]palettegen=max_colors=96:stats_mode=full:reserve_transparent=0[pal]',
    '[b][pal]paletteuse=dither=bayer:bayer_scale=4[out]',
  ].join(';');
}

function main(argv = process.argv.slice(2)) {
  const outArg = argv.find((a) => a.startsWith('--out='));
  const out = outArg ? path.resolve(outArg.slice('--out='.length)) : DEFAULT_OUT;
  const ffmpeg = require('ffmpeg-static');
  if (!ffmpeg || !fs.existsSync(ffmpeg)) throw new Error('ffmpeg-static binary not found (npm install)');
  if (!fs.existsSync(ICON)) throw new Error(`missing ${ICON}`);

  // Written next to the target and renamed in, so a failed render never leaves a broken GIF.
  const tmp = path.join(os.tmpdir(), `gum-installer-gif-${process.pid}.gif`);
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1', '-framerate', String(FPS), '-t', String(SECONDS), '-i', ICON,
    '-filter_complex', filterGraph(),
    '-map', '[out]', '-frames:v', String(FPS * SECONDS), '-loop', '0',
    tmp,
  ];
  const r = spawnSync(ffmpeg, args, { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
  if (r.status !== 0) throw new Error(`ffmpeg exited ${r.status}`);
  const bytes = fs.statSync(tmp).size;
  if (bytes > MAX_BYTES) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`installer GIF is ${bytes} bytes, over the ${MAX_BYTES}-byte cap`);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(tmp, out);
  fs.rmSync(tmp, { force: true });
  console.log(`[installer-gif] ${path.relative(ROOT, out)}: ${W}x${H}, ${FPS * SECONDS} frames, ${bytes} bytes`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[installer-gif] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { MAX_BYTES, W, H, FPS, SECONDS };
