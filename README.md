<h1 align="center">Gum</h1>

<p align="center">
  <b>A desktop you study Japanese inside.</b><br>
  Dictionary, grammar, reader, flashcards, video, games and stats as windows on one offline-first desktop.
</p>

<p align="center">
  <a href="https://github.com/vasars2024-hub/jp-study-app/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/vasars2024-hub/jp-study-app?label=release"></a>
  <img alt="Platform: Windows x64" src="https://img.shields.io/badge/platform-Windows%20x64-blue">
  <a href="LICENSE"><img alt="License: GPL-3.0-or-later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-green"></a>
  <img alt="UI languages: English, Japanese, Chinese, Russian" src="https://img.shields.io/badge/UI-EN%20%C2%B7%20JA%20%C2%B7%20ZH%20%C2%B7%20RU-orange">
</p>

![Gum desktop with the Start menu, dictionary, grammar explorer and a desktop widget](docs/readme/gum-desktop.png)

Gum is an Electron app that looks and behaves like a small operating system: a
wallpaper, a taskbar, a Start menu, draggable windows and desktop widgets. Every
study tool is an app on that desktop, and they share one store of what you know —
a word you look up in the reader shows up in your flashcards, your statistics and
your widgets without being copied anywhere.

It is built for Japanese first. The grammar explorer also covers Chinese (HSK),
and the interface is available in English, Japanese, Chinese and Russian.

## What is in it

| | |
|---|---|
| **Look things up** | Offline JMdict dictionary with pitch accent and audio, saved searches and your own notes. Sentence analysis and translation. A global overlay so a lookup never means leaving what you are reading. |
| **Grammar** | 1,810 grammar points across JLPT N5–N1 and HSK 1–10, each with structure, usage and examples, plus a practice builder, tests and guides. |
| **Read** | Novel reader with tap-to-look-up, highlights and annotations. Manga reader with OCR. A browser for reading real sites with the dictionary attached. |
| **Reading Lens** | A system-wide hotkey that OCRs any region of your screen — a game, a PDF, a video — and opens it as text you can look up and mine. |
| **Mine and review** | One-click mining to Anki through AnkiConnect, `.apkg` import, a field-mapping editor, and a built-in flashcard deck with its own scheduling for when you do not use Anki. |
| **Watch and listen** | Local video with study subtitles, sentence mining from a line, dictation practice, YouTube playlists and a music player with a visualizer. |
| **Play** | Fifteen small games built on your own vocabulary: kana sprint, cloze blitz, particle panic, listening flash and more. |
| **Track** | Statistics, streaks with an optional weekly rest day, a review forecast, reading speed, a study calendar with reminders, and desktop widgets for all of it. |
| **Focus** | Soundscape: fourteen generated sounds (rain, thunder, waves, café, fireplace, noise and more), each with its own slider, under generated lofi, jazz or piano. Scenes, saved mixes and a sleep timer. Nothing is a recording, so nothing loops. |
| **Make it yours** | Themes, wallpapers and rotation playlists, a companion that reacts to your study, over a hundred rebindable keyboard commands and a command palette. |

<p align="center">
  <img alt="Dictionary result for a word, with readings, senses and an Add to Anki button" src="docs/readme/dictionary.png" width="44%">
  <img alt="Grammar explorer showing a grammar point with its structure and an example" src="docs/readme/grammar.png" width="34%">
  <img alt="Soundscape widget: a list of sounds with a volume slider each, a scene picker and a sleep timer" src="docs/readme/soundscape.png" width="18%">
</p>

### What works, honestly

[`FEATURES.md`](FEATURES.md) lists every feature with the file it starts in and
one of four words: **driven** (someone ran it in the live app), **tested**,
**unverified** or **broken**. Nothing is called working on the strength of a
passing test. Measured defects that were left unfixed are in
[`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md), each with a command that
reproduces it. Read those two before relying on something.

## Install

### Installer (recommended)

1. Download **`Gum-<version> Setup.exe`** from the
   [latest release](https://github.com/vasars2024-hub/jp-study-app/releases/latest).
2. Run it. It installs for your Windows user only (no administrator prompt) into
   `%LOCALAPPDATA%\jp_study_app`, adds **Gum** to the Start menu and the desktop,
   and starts it.
3. Gum then updates itself: a new release downloads in the background and Gum
   offers **Restart to update**.

The installer also adds **Open with Gum** for `.epub`, `.cbz`, `.apkg`, `.srt`,
`.ass`, `.mkv` and `.mp4` files. It never makes itself the default app for a
type; pick it under **Open with** if you want that. An opened file goes where a
file dropped on the window would: books and manga to the Library, `.apkg` to
Anki import, subtitles onto their video, a video to the media library and the
player. Uninstall from **Settings → Apps → Installed apps → Gum**; that removes
the shortcuts and the file-type entries, and leaves your data under
`%APPDATA%\jp-study-app` in place.

### Portable zip

1. Download **`jp-study-app-win32-x64-<version>.zip`** from the same release.
2. Extract it anywhere, for example to `C:\Apps`.
3. Run `jp-study-app.exe` inside the extracted `jp-study-app-win32-x64` folder.
   Nothing is written outside the folder except your own data under `%APPDATA%`.
   The zip does not update itself; Gum tells you when a newer release exists.

Both use the same data folder, so you can switch between them.

Windows SmartScreen may warn that the app is unrecognised, because the builds
are not code-signed yet. Choose **More info → Run anyway**.

The Japanese tokenizer, OCR engine and Chinese dictionary ship inside the app.
The Japanese–English dictionary, pitch accent, example sentences and the larger
OCR, speech and AI models are downloaded from inside the app under
**Settings → Storage**, so you only fetch what you use. Downloads resume if
interrupted.

Optional, for mining to Anki: [Anki](https://apps.ankiweb.net/) with the
[AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on.

## Build from source

You need Git and a recent [Node.js](https://nodejs.org/) (it is developed on Node 24), on Windows.

```bash
git clone https://github.com/vasars2024-hub/jp-study-app.git
cd jp-study-app
npm install
npm start
```

`npm install` stages the tokenizer, ONNX and OCR engine files into `public/`. Two
things it cannot fetch: Tesseract's Japanese language data and the CC-CEDICT
Chinese dictionary. Copy `resources\public\tesseract\lang\` and
`resources\public\cedict\` from an extracted release into the same places under
`public/`. `npm run package:win` refuses to build while any
runtime file is missing and names the feature it would break.

| Command | What it does |
|---|---|
| `npm start` | Run the app in development mode with hot reload. |
| `npm test` | Run the test suite (Vitest). |
| `npm run lint` | Lint the TypeScript sources. |
| `npm run package:win` | Build a Windows package into `out/`. |
| `npm run package:installer` | Also build the installer into `out/make/squirrel.windows/x64/`. |
| `node tools/i18n-check.cjs` | List interface strings missing a translation. |

Development mode uses noticeably more memory than a packaged build. On a machine
with 8 GB of RAM, close other heavy apps first.

### Publishing a release

`npm run package:installer` (or `node tools/package-app.cjs --installer --zip`
for both) packages, prunes and then writes three files to
`out/make/squirrel.windows/x64/`: `Gum-<version> Setup.exe`, `RELEASES` and
`jp_study_app-<version>-full.nupkg`. It needs about three times the packaged
app's size free on the drive, because Squirrel copies the app to `%TEMP%` and
compresses it twice. Bump `version` in `package.json` first; an installed copy
only updates to a higher version.

Upload **all three** files, plus the zip, to the GitHub release, and mark it as
the latest release. Installed copies look for
`https://github.com/vasars2024-hub/jp-study-app/releases/latest/download/RELEASES`
and download the `.nupkg` it names from the same release, so a release without
`RELEASES` and the `.nupkg` cannot update anyone (they still get the "new
release" notice that links to the page).

### Code signing

Unsigned builds trigger SmartScreen and some antivirus heuristics. Signing needs
an Authenticode code-signing certificate (OV or EV) bought from a certificate
authority; none is included. With a `.pfx` file, set two environment variables
before building, and the build signs the app exe (through `@electron/windows-sign`)
and `Setup.exe`/`Update.exe` (through Squirrel):

```powershell
$env:GUM_WIN_CERT_FILE = 'C:\path\to\certificate.pfx'
$env:GUM_WIN_CERT_PASSWORD = '...'
npm run package:installer
```

Nothing is signed when `GUM_WIN_CERT_FILE` is unset. For a hardware token or a
cloud-hosted EV certificate, replace the `signing` object in `forge.config.ts`
with Squirrel's `signWithParams` (raw `signtool.exe` arguments, for example
`/a /n "Your Name" /fd sha256 /tr http://timestamp.digicert.com /td sha256`) and
a matching `windowsSign` entry in `packagerConfig`. Check a signed build with
`Get-AuthenticodeSignature '<path>\Gum-<version> Setup.exe'`.

## Browser extension

[`extension/`](extension) is a Chrome companion for reading on the web: hold a key
and hover Japanese text for a lookup with grammar and sentence analysis, save
words and sentences to the app, make Anki cards, and OCR a region of a page.

It is loaded unpacked rather than from the Chrome Web Store: open
`chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and
pick the `extension` folder, then pair it with the app using the token under
**Settings → Study → Chrome extension**. The extension's own
[`README`](extension/README.md) covers the rest.

## How the code is laid out

```
src/main/        Electron main process: files, OCR, downloads, Anki, media
src/renderer/    The desktop shell and every app (React)
src/shared/      Code and types used by both, including all interface text
src/media/       The video study player
extension/       Browser extension
tools/           Build, packaging and checking scripts
docs/            Plans, audits and known issues
```

Interface text lives in `src/shared/i18n/catalogs/` with one file per language.
New text is added in English first and must be translated into the other three
before the test suite passes; [`CLAUDE.md`](CLAUDE.md) describes the workflow.

## Branches

- **`master`** is the public line and what releases are cut from.
- **`relay/astra`** collects small bug fixes and quality-of-life changes, which
  land on `master` in reviewed batches.

## Contributing

Issues and pull requests are welcome. Two rules keep the codebase consistent:
keep changes inside `src/`, and put every new piece of interface text through the
translation catalogs. [`AGENTS.md`](AGENTS.md) has the short version of the house
style.

## Licence

[GPL-3.0-or-later](LICENSE). Dictionary data comes from
[JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) (EDRDG), pitch accent from
[Kanjium](https://github.com/mifunetoshiro/kanjium) and example sentences from
[Tatoeba](https://tatoeba.org/); each keeps its own licence.
