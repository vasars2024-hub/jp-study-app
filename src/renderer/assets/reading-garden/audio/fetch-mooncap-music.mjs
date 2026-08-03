// Regenerates the Mooncap garden bed from the source YouTube upload.
// Requires yt-dlp + ffmpeg on PATH.
//
//   node src/renderer/assets/reading-garden/audio/fetch-mooncap-music.mjs

import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const dir = dirname(fileURLToPath(import.meta.url));
const outBase = join(dir, "mooncap-endless-dream");
const url = "https://www.youtube.com/watch?v=g33LSGLwLzo";

mkdirSync(dir, { recursive: true });

const download = spawnSync(
  "yt-dlp",
  [
    "-x",
    "--audio-format",
    "opus",
    "--audio-quality",
    "96K",
    "-o",
    `${outBase}.%(ext)s`,
    url,
  ],
  { stdio: "inherit", shell: true },
);

if (download.status !== 0) {
  process.exit(download.status ?? 1);
}

for (const leftover of [`${outBase}.webm`, `${outBase}.webm.part`]) {
  if (existsSync(leftover)) unlinkSync(leftover);
}

console.log(`Wrote ${outBase}.opus`);
