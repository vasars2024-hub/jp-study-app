# Third-party notices

Gum is free software, licensed under the GNU General Public License, version 3 or (at your option) any later version (`LICENSE`). Its source code is at https://github.com/vasars2024-hub/jp-study-app.

Gum is built on, ships, or downloads on request the third-party material listed below. Each part keeps its own licence. This file and `THIRD_PARTY_LICENSES.json` (the machine-readable list, with the full licence text of every npm package) are shipped in the app's `resources` folder and shown in the app under Settings › Help › About › Open source licences.

The npm part at the end is regenerated with `node tools/generate-notices.cjs`; everything above it is maintained by hand together with `src/shared/thirdPartyBundled.json`.

## Dictionaries and language data

### JMdict (Japanese–English, Japanese–Russian)

Downloaded automatically on first start and stored, compacted, in your Gum profile. Licence: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), under the EDRDG licence.

Required acknowledgement (EDRDG licence statement):

> This application uses the JMdict dictionary files. These files are the property of the Electronic Dictionary Research and Development Group, and are used in conformance with the Group's licence. See https://www.edrdg.org/edrdg/licence.html and https://www.edrdg.org/jmdict/j_jmdict.html.

Gum stores a compacted copy (definitions kept, glossary markup dropped). The Yomitan-format builds come from https://github.com/yomidevs/jmdict-yomitan.

### KANJIDIC2 and JMnedict

Imported only when you add the files yourself. Licence: CC BY-SA 4.0, under the EDRDG licence.

> KANJIDIC2 and JMnedict are the property of the Electronic Dictionary Research and Development Group, and are used in conformance with the Group's licence (https://www.edrdg.org/edrdg/licence.html).

### CC-CEDICT

Downloaded on request for Chinese. Licence: CC BY-SA 4.0.

> CC-CEDICT, community maintained free Chinese-English dictionary. Published by MDBG (https://www.mdbg.net/). Licensed under the Creative Commons Attribution-ShareAlike 4.0 International licence (https://creativecommons.org/licenses/by-sa/4.0/). Referenced works: CEDICT © 1997, 1998 Paul Andrew Denisowski.

### Moedict (Ministry of Education, Taiwan)

Downloaded automatically on first start (Yomitan build from https://github.com/username-011/moe-dict-yomitan). Licence: CC BY-ND 3.0 Taiwan.

> 《國語辭典簡編本》, Ministry of Education, Republic of China (Taiwan), https://language.moe.gov.tw/, licensed CC BY-ND 3.0 Taiwan. Data via the g0v Moedict project (https://www.moedict.tw/).

Gum downloads it on your machine; it is not redistributed in the installer.

### Kanjium pitch accent data

Downloaded automatically on first start. Licence: CC BY-SA 4.0.

> Pitch accent data from Kanjium (https://github.com/mifunetoshiro/kanjium) by Uros O., licensed CC BY-SA 4.0.

### Tatoeba example sentences

706 grammar examples are compiled into the app; the full Japanese export downloads on request, and sentence search asks tatoeba.org when you use it. Licence: CC BY 2.0 FR.

> Example sentences from the Tatoeba Project (https://tatoeba.org), licensed under Creative Commons Attribution 2.0 France (https://creativecommons.org/licenses/by/2.0/fr/). Each sentence keeps its Tatoeba ID.

### Russian Wiktionary (kaikki.org / wiktextract)

Downloaded on request for Russian. Licence: CC BY-SA 4.0 and GFDL.

> Dictionary data from Wiktionary (https://www.wiktionary.org/) via wiktextract / kaikki.org (https://kaikki.org/), licensed CC BY-SA 4.0 and GFDL.

### Frequency lists

- FrequencyWords (OpenSubtitles 2018) for Chinese and Russian, by Hermit Dave, https://github.com/hermitdave/FrequencyWords. Content licence CC BY-SA 4.0. Downloaded on first use for the language you study.
- JPDB v2.2 frequency list (https://jpdb.io), compiled by Kuuuube, https://github.com/Kuuuube/yomitan-dictionaries. No licence is declared upstream. Downloaded on first use for Japanese; not redistributed.
- The short starter lists built into the app are Gum's own.

### kuromoji.js and mecab-ipadic

The Japanese tokenizer and its dictionary ship in the installer (`resources/public/kuromoji`). kuromoji.js is licensed under the Apache License 2.0 (https://github.com/takuyaa/kuromoji.js, also @sglkc/kuromoji). The dictionary data is mecab-ipadic-2.7.0-20070801, © 2000–2003 Nara Institute of Science and Technology, under the terms in kuromoji's NOTICE, reproduced here:

```
Library dependencies
====================

This software includes a binary and/or source version of data from

* mecab-ipadic-2.7.0-20070801

which can be obtained from

http://atilika.com/releases/mecab-ipadic/mecab-ipadic-2.7.0-20070801.tar.gz

or

http://jaist.dl.sourceforge.net/project/mecab/mecab-ipadic/2.7.0-20070801/mecab-ipadic-2.7.0-20070801.tar.gz



Copyright and license
=====================


mecab-ipadic-2.7.0-20070801
---------------------------

Copyright 2000, 2001, 2002, 2003 Nara Institute of Science
and Technology.  All Rights Reserved.

Use, reproduction, and distribution of this software is permitted.
Any copy of this software, whether in its original form or modified,
must include both the above copyright notice and the following
paragraphs.

Nara Institute of Science and Technology (NAIST),
the copyright holders, disclaims all warranties with regard to this
software, including all implied warranties of merchantability and
fitness, in no event shall NAIST be liable for
any special, indirect or consequential damages or any damages
whatsoever resulting from loss of use, data or profits, whether in an
action of contract, negligence or other tortuous action, arising out
of or in connection with the use or performance of this software.

A large portion of the dictionary entries
originate from ICOT Free Software.  The following conditions for ICOT
Free Software applies to the current dictionary as well.

Each User may also freely distribute the Program, whether in its
original form or modified, to any third party or parties, PROVIDED
that the provisions of Section 3 ("NO WARRANTY") will ALWAYS appear
on, or be attached to, the Program, which is distributed substantially
in the same form as set out herein and that such intended
distribution, if actually made, will neither violate or otherwise
contravene any of the laws and regulations of the countries having
jurisdiction over the User or the intended distribution itself.

NO WARRANTY

The program was produced on an experimental basis in the course of the
research and development conducted during the project and is provided
to users as so produced on an experimental basis.  Accordingly, the
program is provided without any warranty whatsoever, whether express,
implied, statutory or otherwise.  The term "warranty" used herein
includes, but is not limited to, any warranty of the quality,
performance, merchantability and fitness for a particular purpose of
the program and the nonexistence of any infringement or violation of
any right of any third party.

Each user of the program will agree and understand, and be deemed to
have agreed and understood, that there is no warranty whatsoever for
the program and, accordingly, the entire risk arising from or
otherwise connected with the program is assumed by the user.

Therefore, neither ICOT, the copyright holder, or any other
organization that participated in or was otherwise related to the
development of the program and their respective officials, directors,
officers and other employees shall be held liable for any and all
damages, including, without limitation, general, special, incidental
and consequential damages, arising out of or otherwise in connection
with the use or inability to use the program or any product, material
or result produced or otherwise obtained by using the program,
regardless of whether they have been advised of, or otherwise had
knowledge of, the possibility of such damages at any time during the
project or thereafter.  Each user will be deemed to have agreed to the
foregoing by his or her commencement of use of the program.  The term
"use" as used herein includes, but is not limited to, the use,
modification, copying and distribution of the program and the
production of secondary products from the program.

In the case where the program, whether in its original form or
modified, was distributed or delivered to or received by a user from
any person, organization or entity other than ICOT, unless it makes or
grants independently of ICOT any specific warranty to the user in
writing, such person, organization or entity, will also be exempted
from and not be held liable to the user for any such damages as noted
above as far as the program is concerned.
```

### World map

> World map paths derived from @svg-maps/world by Victor Cazanave (https://github.com/VictorCazanave/svg-maps), licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Modified: converted to a TypeScript module.

## Engines and programs shipped in the installer

### FFmpeg

`ffmpeg.exe` (from the ffmpeg-static npm package) is the FFmpeg 6.1.1 "essentials" static Windows build from https://www.gyan.dev, configured with `--enable-gpl --enable-version3`, so this build is licensed under the GNU GPL version 3. Its licence text is shipped as `ffmpeg.exe.LICENSE` beside it.

- Corresponding source: FFmpeg commit https://github.com/FFmpeg/FFmpeg/commit/e38092ef93, plus the external libraries listed in `ffmpeg.exe.README` (each at its own upstream).
- FFmpeg is a trademark of Fabrice Bellard, originator of the FFmpeg project.

### Seanime media server and adopted web UI code

Gum ships a modified build of Seanime (https://github.com/5rahim/seanime) v3.10.2, upstream commit 9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9, as `resources/seanime/seanime.exe`, and compiles adopted Seanime web UI code (`vendor/seanime-web`) into the app. Licence: GNU GPL v3. © 5rahim and Seanime contributors.

- Source of the modifications: `patches/seanime/` in Gum's repository, applied to the upstream commit above. The adopted web code and its changes are in `vendor/seanime-web/` (listed in its `ADOPTION.md`).
- The Go modules compiled into `seanime.exe` keep their own licences; see the upstream `go.mod`.

### 7-Zip (7z-wasm)

Used to open subtitle archives. 7-Zip © 1999-2015 Igor Pavlov, GNU LGPL 2.1 or later; the WebAssembly binary also carries the unRAR restriction (unRAR © Alexander Roshal): the unRAR code may not be used to develop a RAR (WinRAR) compatible archiver. Both texts are in `THIRD_PARTY_LICENSES.json` under 7z-wasm. Source: https://www.7-zip.org/.

### ONNX Runtime

The WebAssembly engine (`resources/public/ort`) and the Node binding (onnxruntime-node) are © Microsoft Corporation, MIT licence (https://github.com/microsoft/onnxruntime). onnxruntime-node also ships `DirectML.dll`, `dxcompiler.dll` and `dxil.dll`, Microsoft redistributables under their own terms.

### Tesseract.js and Tesseract OCR

The OCR worker, core WASM and the Japanese trained data (`jpn`, `jpn_vert`) ship in `resources/public/tesseract`. Licence: Apache License 2.0. © Tesseract.js contributors (https://github.com/naptha/tesseract.js); Tesseract OCR © Google and contributors (https://github.com/tesseract-ocr).

### JASSUB subtitle renderer

JASSUB (https://github.com/ThaUnknown/jassub) with libass (ISC), HarfBuzz (MIT), FriBidi (LGPL 2.1 or later), FreeType (FTL or GPL 2.0 or later) and smaller parts under MIT, Zlib and BSL-1.0. Portions of this software are copyright © The FreeType Project (https://www.freetype.org). All rights reserved.

### llama.cpp / ggml

Local AI inference through node-llama-cpp and its prebuilt llama.cpp/ggml binaries, MIT licence (https://github.com/ggml-org/llama.cpp).

### SQLite

Through better-sqlite3 (MIT). SQLite itself is in the public domain (https://www.sqlite.org/copyright.html).

### Electron and Chromium

Gum runs on Electron (https://www.electronjs.org/, MIT). Electron's `LICENSE` and Chromium's `LICENSES.chromium.html`, which lists Chromium's own third-party components, are shipped next to the executable.

## Fonts

- Roboto Medium (default subtitle font), © 2011 Google Inc., Apache License 2.0 (https://github.com/googlefonts/roboto). Roboto is a trademark of Google.
- Every other typeface Gum uses is a system font on your computer; none is bundled or downloaded.

## Icons and artwork

- Gum's interface icons are hand-drawn line glyphs that are part of Gum (GPL-3.0-or-later).
- Companion sprites are generated by `tools/generate-companion-sprites.cjs` and dedicated to the public domain (CC0 1.0).
- The adopted media UI uses react-icons (MIT, https://github.com/react-icons/react-icons). Each icon set keeps its own licence: Font Awesome Free icons by Fonticons, Inc. are licensed CC BY 4.0 (https://fontawesome.com/license/free); Material Design icons by Google are Apache License 2.0; Simple Icons are CC0 (brand marks belong to their owners); the other sets (Lucide, Feather, Tabler, Heroicons, Boxicons, Ionicons, Remix, Phosphor, Grommet, css.gg, Codicons, Radix, Octicons and others) are MIT, ISC or CC BY 4.0 as listed in the react-icons package.

## Downloaded on request

These are never in the installer. Gum downloads them only when you choose to, from the address shown in the app, and they keep their licences:

- Manga OCR (kha-white/manga-ocr; ONNX conversion mayocream/manga-ocr-onnx): Apache License 2.0.
- comic-text-detector (release of zyddnys/manga-image-translator): GNU GPL v3.
- PaddleOCR detection and recognition models (deepghs/paddleocr on Hugging Face): upstream PaddleOCR is Apache License 2.0; the repackaged models carry deepghs's model-distribution licence.
- Tesseract `jpn` trained data (tesseract-ocr/tessdata_fast): Apache License 2.0.
- Whisper speech recognition: OpenAI Whisper weights, MIT (whisper.cpp ggml builds and transformers.js conversions); kotoba-whisper by Kotoba Technologies, Apache License 2.0.
- Supertonic 3 voices (Supertone): OpenRAIL licence, which carries use-based restrictions that pass on to anyone you share the model with.
- Qwen3-1.7B GGUF (Qwen team, Alibaba Cloud): Apache License 2.0.
- The dictionaries and frequency lists above marked "downloaded".

## Programs Gum works with but does not ship

yt-dlp (Unlicense) is used only if it is installed on your PATH; Gum never ships or downloads it. Anki and AnkiConnect, qBittorrent, mpv, Ollama and LM Studio are separate programs you install yourself, under their own licences.

## Provenance not recorded

Open items, kept here until they are resolved:

- The upstream revision of the two bundled Tesseract Japanese trained-data files (`jpn.traineddata.gz`, `jpn_vert.traineddata.gz`) is not recorded. Tesseract's trained data is published under the Apache License 2.0.
- The origin of the reading-garden artwork (`src/renderer/assets/reading-garden`) and of the app and tray icons (`assets/icon.png`, `assets/icon.ico`, `public/tray-icon.png`) is not recorded.
- The JPDB frequency list declares no licence (see above).

## npm packages

<!-- BEGIN GENERATED: npm packages (tools/generate-notices.cjs) -->

494 npm packages are in the production dependency tree (package-lock.json, dev-only packages excluded). The packaged app carries a subset of them; every one is listed so none can be missing. The full licence text of each is in `THIRD_PARTY_LICENSES.json`, shipped next to this file, and in the app (Settings › Help › About › Open source licences).

Licences: MIT (383), ISC (28), Apache-2.0 (22), BSD-3-Clause (21), BSD-2-Clause (14), Unlicense (7), BlueOak-1.0.0 (5), (MIT OR CC0-1.0) (2), 0BSD (2), (BSD-2-Clause OR MIT OR Apache-2.0) (1), (MIT AND Zlib) (1), (MIT OR GPL-3.0-or-later) (1), Apache-2.0 AND LGPL-3.0-or-later (1), Apache-2.0 WITH LLVM-exception (1), CC0-1.0 (1), GPL-3.0 (1), GPL-3.0-or-later (1), LGPL-2.1-or-later AND (FTL OR GPL-2.0-or-later) AND MIT AND MIT-Modern-Variant AND ISC AND NTP AND Zlib AND BSL-1.0 (1), LGPL-2.1-or-later AND LicenseRef-unRAR-restriction (1).

- **@babel/runtime** 7.29.7 — MIT — https://github.com/babel/babel
- **@date-fns/tz** 1.5.0 — MIT — https://github.com/date-fns/date-fns
- **@derhuerst/http-basic** 8.2.4 — MIT — https://github.com/derhuerst/http-basic
- **@dnd-kit/accessibility** 3.1.1 — MIT — https://github.com/clauderic/dnd-kit
- **@dnd-kit/core** 6.3.1 — MIT — https://github.com/clauderic/dnd-kit (direct dependency)
- **@dnd-kit/modifiers** 9.0.0 — MIT — https://github.com/clauderic/dnd-kit (direct dependency)
- **@dnd-kit/sortable** 10.0.0 — MIT — https://github.com/clauderic/dnd-kit (direct dependency)
- **@dnd-kit/utilities** 3.2.2 — MIT — https://github.com/clauderic/dnd-kit (direct dependency)
- **@floating-ui/core** 1.8.0 — MIT — https://github.com/floating-ui/floating-ui
- **@floating-ui/dom** 1.8.0 — MIT — https://github.com/floating-ui/floating-ui
- **@floating-ui/react-dom** 2.1.9 — MIT — https://github.com/floating-ui/floating-ui
- **@floating-ui/utils** 0.2.12 — MIT — https://github.com/floating-ui/floating-ui
- **@hookform/resolvers** 5.5.7 — MIT — https://github.com/react-hook-form/resolvers (direct dependency)
- **@huggingface/jinja** 0.5.9 — MIT — https://github.com/huggingface/huggingface.js
- **@huggingface/tokenizers** 0.1.3 — Apache-2.0 — https://github.com/huggingface/tokenizers.js
- **@huggingface/transformers** 4.2.0 — Apache-2.0 — https://github.com/huggingface/transformers.js (direct dependency)
- **@img/colour** 1.1.0 — MIT — https://github.com/lovell/colour
- **@img/sharp-win32-x64** 0.34.5 — Apache-2.0 AND LGPL-3.0-or-later — https://github.com/lovell/sharp
- **@internationalized/number** 3.6.7 — Apache-2.0 — https://github.com/adobe/react-spectrum
- **@isaacs/fs-minipass** 4.0.1 — ISC — https://github.com/npm/fs-minipass
- **@jridgewell/sourcemap-codec** 1.5.5 — MIT — https://github.com/jridgewell/sourcemaps
- **@kwsites/file-exists** 1.1.1 — MIT — https://github.com/kwsites/file-exists
- **@kwsites/promise-deferred** 1.1.1 — MIT — https://github.com/kwsites/promise-deferred
- **@mozilla/readability** 0.6.0 — Apache-2.0 — https://github.com/mozilla/readability (direct dependency)
- **@napi-rs/canvas** 0.1.100 — MIT — https://github.com/Brooooooklyn/canvas
- **@napi-rs/canvas-win32-x64-msvc** 0.1.100 — MIT — https://github.com/Brooooooklyn/canvas (no licence file in the package; the standard text applies)
- **@node-llama-cpp/win-arm64** 3.19.0 — MIT — https://github.com/withcatai/node-llama-cpp
- **@node-llama-cpp/win-x64** 3.19.0 — MIT — https://github.com/withcatai/node-llama-cpp
- **@node-llama-cpp/win-x64-cuda** 3.19.0 — MIT — https://github.com/withcatai/node-llama-cpp
- **@node-llama-cpp/win-x64-cuda-ext** 3.19.0 — MIT — https://github.com/withcatai/node-llama-cpp
- **@node-llama-cpp/win-x64-vulkan** 3.19.0 — MIT — https://github.com/withcatai/node-llama-cpp
- **@protobufjs/aspromise** 1.1.2 — BSD-3-Clause — https://github.com/dcodeIO/protobuf.js
- **@protobufjs/base64** 1.1.2 — BSD-3-Clause — https://github.com/dcodeIO/protobuf.js
- **@protobufjs/codegen** 2.0.5 — BSD-3-Clause — https://github.com/dcodeIO/protobuf.js
- **@protobufjs/eventemitter** 1.1.1 — BSD-3-Clause — https://github.com/dcodeIO/protobuf.js
- **@protobufjs/fetch** 1.1.1 — BSD-3-Clause — https://github.com/dcodeIO/protobuf.js
- **@protobufjs/float** 1.0.2 — BSD-3-Clause — https://github.com/dcodeIO/protobuf.js
- **@protobufjs/inquire** 1.1.2 — BSD-3-Clause — https://github.com/dcodeIO/protobuf.js
- **@protobufjs/path** 1.1.2 — BSD-3-Clause — https://github.com/dcodeIO/protobuf.js
- **@protobufjs/pool** 1.1.0 — BSD-3-Clause — https://github.com/dcodeIO/protobuf.js
- **@protobufjs/utf8** 1.1.1 — BSD-3-Clause — https://github.com/dcodeIO/protobuf.js
- **@radix-ui/number** 1.1.3 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/primitive** 1.1.5 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/primitive** 1.1.7 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-accordion** 1.2.20 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-arrow** 1.1.11 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-arrow** 1.1.15 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-checkbox** 1.3.11 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-collapsible** 1.1.20 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-collection** 1.1.15 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-compose-refs** 1.1.3 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-compose-refs** 1.1.5 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-context** 1.2.0 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-context** 1.2.2 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-context-menu** 2.3.7 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-dialog** 1.1.23 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-direction** 1.1.4 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-dismissable-layer** 1.1.15 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-dismissable-layer** 1.1.19 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-dropdown-menu** 2.1.24 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-focus-guards** 1.1.6 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-focus-scope** 1.1.16 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-hover-card** 1.1.19 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-id** 1.1.4 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-menu** 2.1.24 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-popover** 1.1.23 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-popper** 1.3.3 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-popper** 1.3.7 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-portal** 1.1.13 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-portal** 1.1.17 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-presence** 1.1.10 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-presence** 1.1.7 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-primitive** 2.1.10 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-primitive** 2.1.7 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-progress** 1.1.12 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-radio-group** 1.4.7 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-roving-focus** 1.1.19 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-scroll-area** 1.2.18 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-select** 2.3.7 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-separator** 1.1.15 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-slot** 1.3.0 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-slot** 1.3.3 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-switch** 1.3.7 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-tabs** 1.1.21 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-tooltip** 1.2.16 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/react-use-callback-ref** 1.1.2 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-callback-ref** 1.1.4 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-controllable-state** 1.2.3 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-controllable-state** 1.2.6 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-effect-event** 0.0.3 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-effect-event** 0.0.5 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-is-hydrated** 0.1.3 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-layout-effect** 1.1.2 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-layout-effect** 1.1.4 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-previous** 1.1.4 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-rect** 1.1.2 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-rect** 1.1.4 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-size** 1.1.2 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-use-size** 1.1.4 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/react-visually-hidden** 1.2.11 — MIT — https://github.com/radix-ui/primitives (direct dependency)
- **@radix-ui/rect** 1.1.2 — MIT — https://github.com/radix-ui/primitives
- **@radix-ui/rect** 1.1.3 — MIT — https://github.com/radix-ui/primitives
- **@reflink/reflink** 0.1.19 — MIT — https://github.com/pnpm/reflink (no licence file in the package; the standard text applies)
- **@reflink/reflink-win32-x64-msvc** 0.1.19 — MIT — https://github.com/pnpm/reflink (no licence file in the package; the standard text applies)
- **@rrweb/types** 2.1.1 — MIT — https://github.com/rrweb-io/rrweb (no licence file in the package; the standard text applies)
- **@rrweb/utils** 2.1.1 — MIT — https://github.com/rrweb-io/rrweb (no licence file in the package; the standard text applies)
- **@sglkc/kuromoji** 1.1.0 — Apache-2.0 — https://github.com/sglkc/kuromoji.js (direct dependency)
- **@simple-git/args-pathspec** 1.0.3 — MIT — https://github.com/steveukx/git-js (no licence file in the package; the standard text applies)
- **@simple-git/argv-parser** 1.1.1 — MIT — https://github.com/steveukx/git-js (no licence file in the package; the standard text applies)
- **@standard-schema/utils** 0.3.0 — MIT — https://github.com/standard-schema/standard-schema
- **@swc/helpers** 0.5.23 — Apache-2.0 — https://github.com/swc-project/swc
- **@tabby_ai/hijri-converter** 1.0.5 — MIT
- **@tanstack/history** 1.162.0 — MIT — https://github.com/TanStack/router
- **@tanstack/query-core** 5.101.4 — MIT — https://github.com/TanStack/query
- **@tanstack/react-query** 5.101.4 — MIT — https://github.com/TanStack/query (direct dependency)
- **@tanstack/react-router** 1.170.18 — MIT — https://github.com/TanStack/router (direct dependency)
- **@tanstack/react-store** 0.9.3 — MIT — https://github.com/TanStack/store
- **@tanstack/router-core** 1.171.15 — MIT — https://github.com/TanStack/router
- **@tanstack/store** 0.9.3 — MIT — https://github.com/TanStack/store
- **@tinyhttp/content-disposition** 2.2.4 — MIT — https://github.com/tinyhttp/tinyhttp
- **@types/css-font-loading-module** 0.0.7 — MIT — https://github.com/DefinitelyTyped/DefinitelyTyped
- **@types/js-cookie** 3.0.6 — MIT — https://github.com/DefinitelyTyped/DefinitelyTyped
- **@types/localforage** 0.0.34 — MIT — https://github.com/localForage/localForage (no licence file in the package; the standard text applies)
- **@types/node** 10.17.60 — MIT — https://github.com/DefinitelyTyped/DefinitelyTyped
- **@types/node** 25.9.1 — MIT — https://github.com/DefinitelyTyped/DefinitelyTyped
- **@uidotdev/usehooks** 2.4.1 — MIT — https://github.com/uidotdev/usehooks (direct dependency)
- **@webgpu/types** 0.1.71 — BSD-3-Clause — https://github.com/gpuweb/types
- **@xmldom/xmldom** 0.7.13 — MIT — https://github.com/xmldom/xmldom
- **@xobotyi/scrollbar-width** 1.9.5 — MIT — https://github.com/xobotyi/scrollbar-width
- **@xstate/fsm** 1.6.5 — MIT — https://github.com/statelyai/xstate
- **@zag-js/anatomy** 1.42.0 — MIT — https://github.com/chakra-ui/zag/tree/main/packages/machine
- **@zag-js/core** 1.42.0 — MIT — https://github.com/chakra-ui/zag/tree/main/packages/machine
- **@zag-js/dom-query** 1.42.0 — MIT — https://github.com/chakra-ui/zag/tree/main/packages/utilities/dom-helpers
- **@zag-js/number-input** 1.42.0 — MIT — https://github.com/chakra-ui/zag/tree/main/packages/number-input (direct dependency)
- **@zag-js/react** 1.42.0 — MIT — https://github.com/chakra-ui/zag/tree/main/packages/frameworks/react (direct dependency)
- **@zag-js/store** 1.42.0 — MIT — https://github.com/chakra-ui/zag/tree/main/packages/utilities/store
- **@zag-js/types** 1.42.0 — MIT — https://github.com/chakra-ui/zag/tree/main/packages/utilities/types
- **@zag-js/utils** 1.42.0 — MIT — https://github.com/chakra-ui/zag/tree/main/packages/utilities/core
- **7z-wasm** 1.2.0 — LGPL-2.1-or-later AND LicenseRef-unRAR-restriction — https://github.com/use-strict/7z-wasm (direct dependency)
- **abslink** 1.2.2 — Apache-2.0 — https://github.com/ThaUnknown/abslink (no licence file in the package; the standard text applies)
- **adm-zip** 0.5.17 — MIT — https://github.com/cthackers/adm-zip (direct dependency)
- **agent-base** 6.0.2 — MIT — https://github.com/TooTallNate/node-agent-base (no licence file in the package; the standard text applies)
- **anime4k-webgpu** 1.0.0 — MIT — https://github.com/Anime4KWebBoost/Anime4K-WebGPU (direct dependency)
- **ansi-escapes** 6.2.1 — MIT — https://github.com/sindresorhus/ansi-escapes
- **ansi-regex** 5.0.1 — MIT — https://github.com/chalk/ansi-regex
- **ansi-regex** 6.2.2 — MIT — https://github.com/chalk/ansi-regex
- **ansi-styles** 4.3.0 — MIT — https://github.com/chalk/ansi-styles
- **ansi-styles** 6.2.3 — MIT — https://github.com/chalk/ansi-styles
- **aria-hidden** 1.2.6 — MIT — https://github.com/theKashey/aria-hidden
- **async** 2.6.4 — MIT — https://github.com/caolan/async
- **async-retry** 1.3.3 — MIT — https://github.com/vercel/async-retry
- **asynckit** 0.4.0 — MIT — https://github.com/alexindigo/asynckit
- **attr-accept** 2.2.5 — MIT — https://github.com/react-dropzone/attr-accept
- **axios** 1.18.1 — MIT — https://github.com/axios/axios (direct dependency)
- **base64-arraybuffer** 1.0.2 — MIT — https://github.com/niklasvh/base64-arraybuffer
- **better-sqlite3** 13.0.3 — MIT — https://github.com/WiseLibs/better-sqlite3 (direct dependency)
- **bmp-js** 0.1.0 — MIT — https://github.com/shaozilee/bmp-js
- **boolbase** 2.0.0 — ISC — https://github.com/fb55/boolbase
- **boolean** 3.2.0 — MIT — https://github.com/thenativeweb/boolean
- **buffer-from** 1.1.2 — MIT — https://github.com/LinusU/buffer-from
- **bytes** 3.1.2 — MIT — https://github.com/visionmedia/bytes.js
- **call-bind-apply-helpers** 1.0.2 — MIT — https://github.com/ljharb/call-bind-apply-helpers
- **caseless** 0.12.0 — Apache-2.0 — https://github.com/mikeal/caseless
- **chalk** 5.6.2 — MIT — https://github.com/chalk/chalk (direct dependency)
- **chmodrp** 1.0.2 — MIT — https://github.com/leonzalion/chmodrp
- **chownr** 3.0.0 — BlueOak-1.0.0 — https://github.com/isaacs/chownr
- **ci-info** 4.4.0 — MIT — https://github.com/watson/ci-info
- **class-variance-authority** 0.7.1 — Apache-2.0 — https://github.com/joe-bell/cva (direct dependency)
- **cli-cursor** 5.0.0 — MIT — https://github.com/sindresorhus/cli-cursor
- **cli-spinners** 2.9.2 — MIT — https://github.com/sindresorhus/cli-spinners
- **cli-spinners** 3.4.0 — MIT — https://github.com/sindresorhus/cli-spinners
- **cliui** 8.0.1 — ISC — https://github.com/yargs/cliui
- **clsx** 2.1.1 — MIT — https://github.com/lukeed/clsx (direct dependency)
- **cmake-js** 8.0.0 — MIT — https://github.com/cmake-js/cmake-js
- **cmdk** 1.1.1 — MIT — https://github.com/pacocoursey/cmdk (direct dependency)
- **color-convert** 2.0.1 — MIT — https://github.com/Qix-/color-convert
- **color-name** 1.1.4 — MIT — https://github.com/colorjs/color-name
- **colord** 2.9.3 — MIT — https://github.com/omgovich/colord (direct dependency)
- **combined-stream** 1.0.8 — MIT — https://github.com/felixge/node-combined-stream
- **commander** 10.0.1 — MIT — https://github.com/tj/commander.js
- **concat-stream** 2.0.0 — MIT — http://github.com/maxogden/concat-stream
- **cookie-es** 3.1.1 — MIT — https://github.com/unjs/cookie-es
- **copy-to-clipboard** 3.3.3 — MIT — https://github.com/sudodoki/copy-to-clipboard
- **copy-to-clipboard** 4.0.2 — MIT — https://github.com/sudodoki/copy-to-clipboard (direct dependency)
- **core-js** 3.49.0 — MIT — https://github.com/zloirock/core-js
- **core-util-is** 1.0.3 — MIT — https://github.com/isaacs/core-util-is
- **cross-spawn** 7.0.6 — MIT — https://github.com/moxystudio/node-cross-spawn
- **crypto-js** 4.2.0 — MIT — http://github.com/brix/crypto-js (direct dependency)
- **css-in-js-utils** 3.1.0 — MIT — https://github.com/robinweser/css-in-js-utils
- **css-select** 7.0.0 — BSD-2-Clause — https://github.com/fb55/css-select
- **css-tree** 1.1.3 — MIT — https://github.com/csstree/csstree
- **css-what** 8.0.0 — BSD-2-Clause — https://github.com/fb55/css-what
- **cssom** 0.5.0 — MIT — https://github.com/NV/CSSOM
- **csstype** 3.2.3 — MIT — https://github.com/frenic/csstype
- **d** 1.0.2 — ISC — https://github.com/medikoo/d
- **date-fns** 3.6.0 — MIT — https://github.com/date-fns/date-fns (direct dependency)
- **date-fns** 4.4.0 — MIT — https://github.com/date-fns/date-fns
- **date-fns-jalali** 4.1.0-0 — MIT — https://github.com/date-fns-jalali/date-fns-jalali
- **debug** 2.6.9 — MIT — https://github.com/visionmedia/debug
- **debug** 4.4.3 — MIT — https://github.com/debug-js/debug
- **deep-extend** 0.6.0 — MIT — https://github.com/unclechu/node-deep-extend
- **define-data-property** 1.1.4 — MIT — https://github.com/ljharb/define-data-property
- **define-properties** 1.2.1 — MIT — https://github.com/ljharb/define-properties
- **delayed-stream** 1.0.0 — MIT — https://github.com/felixge/node-delayed-stream
- **detect-libc** 2.1.2 — Apache-2.0 — https://github.com/lovell/detect-libc
- **detect-node** 2.1.0 — MIT — https://github.com/iliakan/detect-node
- **detect-node-es** 1.1.0 — MIT — https://github.com/thekashey/detect-node
- **dom-serializer** 2.0.0 — MIT — https://github.com/cheeriojs/dom-serializer
- **dom-serializer** 3.1.1 — MIT — https://github.com/cheeriojs/dom-serializer
- **domelementtype** 2.3.0 — BSD-2-Clause — https://github.com/fb55/domelementtype
- **domelementtype** 3.0.0 — BSD-2-Clause — https://github.com/fb55/domelementtype
- **domhandler** 5.0.3 — BSD-2-Clause — https://github.com/fb55/domhandler
- **domhandler** 6.0.1 — BSD-2-Clause — https://github.com/fb55/domhandler
- **domutils** 3.2.2 — BSD-2-Clause — https://github.com/fb55/domutils
- **domutils** 4.0.2 — BSD-2-Clause — https://github.com/fb55/domutils
- **doublearray** 0.0.2 — MIT — https://github.com/takuyaa/doublearray
- **dunder-proto** 1.0.1 — MIT — https://github.com/es-shims/dunder-proto
- **electron-squirrel-startup** 1.0.1 — Apache-2.0 — https://github.com/mongodb-js/electron-squirrel-startup (direct dependency)
- **embla-carousel** 8.6.0 — MIT — https://github.com/davidjerleke/embla-carousel (direct dependency) (no licence file in the package; the standard text applies)
- **embla-carousel-autoplay** 8.6.0 — MIT — https://github.com/davidjerleke/embla-carousel (direct dependency) (no licence file in the package; the standard text applies)
- **embla-carousel-react** 8.6.0 — MIT — https://github.com/davidjerleke/embla-carousel (direct dependency) (no licence file in the package; the standard text applies)
- **embla-carousel-reactive-utils** 8.6.0 — MIT — https://github.com/davidjerleke/embla-carousel (no licence file in the package; the standard text applies)
- **emoji-regex** 10.6.0 — MIT — https://github.com/mathiasbynens/emoji-regex
- **emoji-regex** 8.0.0 — MIT — https://github.com/mathiasbynens/emoji-regex
- **encoding** 0.1.13 — MIT — https://github.com/andris9/encoding
- **entities** 4.5.0 — BSD-2-Clause — https://github.com/fb55/entities
- **entities** 7.0.1 — BSD-2-Clause — https://github.com/fb55/entities
- **entities** 8.0.0 — BSD-2-Clause — https://github.com/fb55/entities
- **env-paths** 2.2.1 — MIT — https://github.com/sindresorhus/env-paths
- **env-var** 7.5.0 — MIT — https://github.com/evanshortiss/env-var
- **epubjs** 0.3.93 — BSD-2-Clause — https://github.com/futurepress/epub.js (direct dependency)
- **error-stack-parser** 2.1.4 — MIT — https://github.com/stacktracejs/error-stack-parser
- **es-define-property** 1.0.1 — MIT — https://github.com/ljharb/es-define-property
- **es-errors** 1.3.0 — MIT — https://github.com/ljharb/es-errors
- **es-object-atoms** 1.1.2 — MIT — https://github.com/ljharb/es-object-atoms
- **es-set-tostringtag** 2.1.0 — MIT — https://github.com/es-shims/es-set-tostringtag
- **es5-ext** 0.10.64 — ISC — https://github.com/medikoo/es5-ext
- **es6-error** 4.1.1 — MIT — https://github.com/bjyoungblood/es6-error
- **es6-iterator** 2.0.3 — MIT — https://github.com/medikoo/es6-iterator
- **es6-symbol** 3.1.4 — ISC — https://github.com/medikoo/es6-symbol
- **escalade** 3.2.0 — MIT — https://github.com/lukeed/escalade
- **escape-string-regexp** 4.0.0 — MIT — https://github.com/sindresorhus/escape-string-regexp
- **esniff** 2.0.1 — ISC — https://github.com/medikoo/esniff
- **event-emitter** 0.3.5 — MIT — https://github.com/medikoo/event-emitter
- **eventemitter3** 5.0.4 — MIT — https://github.com/primus/eventemitter3
- **ext** 1.7.0 — ISC — https://github.com/medikoo/es5-ext
- **fast-deep-equal** 3.1.3 — MIT — https://github.com/epoberezkin/fast-deep-equal
- **fast-shallow-equal** 1.0.0 — Unlicense — https://github.com/streamich/fast-shallow-equal
- **fastest-stable-stringify** 2.0.2 — MIT — https://github.com/streamich/fastest-stable-stringify
- **fflate** 0.8.3 — MIT — https://github.com/101arrowz/fflate (direct dependency)
- **ffmpeg-static** 5.3.0 — GPL-3.0-or-later — https://github.com/eugeneware/ffmpeg-static (direct dependency)
- **file-selector** 2.1.2 — MIT — https://github.com/react-dropzone/file-selector
- **filename-reserved-regex** 3.0.0 — MIT — https://github.com/sindresorhus/filename-reserved-regex
- **filenamify** 6.0.0 — MIT — https://github.com/sindresorhus/filenamify
- **flatbuffers** 25.9.23 — Apache-2.0 — https://github.com/google/flatbuffers
- **follow-redirects** 1.16.0 — MIT — https://github.com/follow-redirects/follow-redirects
- **form-data** 4.0.6 — MIT — https://github.com/form-data/form-data
- **framer-motion** 12.42.2 — MIT — https://github.com/motiondivision/motion/
- **fs-extra** 11.3.6 — MIT — https://github.com/jprichardson/node-fs-extra
- **function-bind** 1.1.2 — MIT — https://github.com/Raynos/function-bind
- **get-caller-file** 2.0.5 — ISC — https://github.com/stefanpenner/get-caller-file
- **get-east-asian-width** 1.6.0 — MIT — https://github.com/sindresorhus/get-east-asian-width
- **get-intrinsic** 1.3.0 — MIT — https://github.com/ljharb/get-intrinsic
- **get-nonce** 1.0.1 — MIT — https://github.com/theKashey/get-nonce
- **get-proto** 1.0.1 — MIT — https://github.com/ljharb/get-proto
- **global-agent** 3.0.0 — BSD-3-Clause — https://github.com/gajus/global-agent
- **global-agent** 4.1.3 — BSD-3-Clause — https://github.com/gajus/global-agent
- **globalthis** 1.0.4 — MIT — https://github.com/ljharb/System.global
- **gopd** 1.2.0 — MIT — https://github.com/ljharb/gopd
- **graceful-fs** 4.2.11 — ISC — https://github.com/isaacs/node-graceful-fs
- **guid-typescript** 1.0.9 — ISC — https://github.com/NicolasDeveloper/guid-typescript (no licence file in the package; the standard text applies)
- **has-property-descriptors** 1.0.2 — MIT — https://github.com/inspect-js/has-property-descriptors
- **has-symbols** 1.1.0 — MIT — https://github.com/inspect-js/has-symbols
- **has-tostringtag** 1.0.2 — MIT — https://github.com/inspect-js/has-tostringtag
- **hasown** 2.0.4 — MIT — https://github.com/inspect-js/hasOwn
- **hls.js** 1.6.16 — Apache-2.0 — https://github.com/video-dev/hls.js (direct dependency)
- **html-escaper** 3.0.3 — MIT — https://github.com/WebReflection/html-escaper
- **htmlparser2** 10.1.0 — MIT — https://github.com/fb55/htmlparser2
- **http-response-object** 3.0.2 — MIT — https://github.com/ForbesLindesay/http-response-object
- **https-proxy-agent** 5.0.1 — MIT — https://github.com/TooTallNate/node-https-proxy-agent (no licence file in the package; the standard text applies)
- **hyphenate-style-name** 1.1.0 — BSD-3-Clause — https://github.com/rexxars/hyphenate-style-name
- **iconv-lite** 0.6.3 — MIT — https://github.com/ashtuchkin/iconv-lite
- **idb-keyval** 6.2.4 — Apache-2.0 — https://github.com/jakearchibald/idb-keyval
- **ignore** 7.0.5 — MIT — https://github.com/kaelzhang/node-ignore
- **immediate** 3.0.6 — MIT — https://github.com/calvinmetcalf/immediate
- **immer** 11.1.15 — MIT — https://github.com/immerjs/immer
- **inherits** 2.0.4 — ISC — https://github.com/isaacs/inherits
- **ini** 1.3.8 — ISC — https://github.com/isaacs/ini
- **inline-style-prefixer** 7.0.1 — MIT — https://github.com/robinweser/inline-style-prefixer
- **ipull** 3.9.5 — MIT — https://github.com/ido-pluto/ipull
- **is-fullwidth-code-point** 3.0.0 — MIT — https://github.com/sindresorhus/is-fullwidth-code-point
- **is-fullwidth-code-point** 5.1.0 — MIT — https://github.com/sindresorhus/is-fullwidth-code-point
- **is-interactive** 2.0.0 — MIT — https://github.com/sindresorhus/is-interactive
- **is-unicode-supported** 2.1.0 — MIT — https://github.com/sindresorhus/is-unicode-supported
- **is-url** 1.2.4 — MIT — https://github.com/segmentio/is-url
- **isarray** 1.0.0 — MIT — https://github.com/juliangruber/isarray (no licence file in the package; the standard text applies)
- **isbot** 5.2.1 — Unlicense — https://github.com/omrilotan/isbot
- **isexe** 2.0.0 — ISC — https://github.com/isaacs/isexe
- **isexe** 4.0.0 — BlueOak-1.0.0 — https://github.com/isaacs/isexe
- **jassub** 2.5.6 — LGPL-2.1-or-later AND (FTL OR GPL-2.0-or-later) AND MIT AND MIT-Modern-Variant AND ISC AND NTP AND Zlib AND BSL-1.0 — https://github.com/ThaUnknown/jassub (direct dependency)
- **jotai** 2.20.2 — MIT — https://github.com/pmndrs/jotai (direct dependency)
- **jotai-derive** 0.1.3 — MIT (direct dependency)
- **jotai-family** 1.0.2 — MIT — https://github.com/jotaijs/jotai-family (direct dependency)
- **jotai-immer** 0.4.3 — MIT — https://github.com/jotaijs/jotai-immer (direct dependency)
- **jotai-scope** 0.11.0 — MIT — https://github.com/jotaijs/jotai-scope (direct dependency)
- **js-cookie** 3.0.8 — MIT — https://github.com/js-cookie/js-cookie
- **js-tokens** 4.0.0 — MIT — https://github.com/lydell/js-tokens
- **json-stringify-safe** 5.0.1 — ISC — https://github.com/isaacs/json-stringify-safe
- **jsonfile** 6.2.1 — MIT — https://github.com/jprichardson/node-jsonfile
- **jszip** 3.10.1 — (MIT OR GPL-3.0-or-later) — https://github.com/Stuk/jszip
- **kuromoji** 0.1.2 — Apache-2.0 — https://github.com/takuyaa/kuromoji.js (direct dependency)
- **lfa-ponyfill** 1.1.1 — MIT — https://github.com/ThaUnknown/lfa-ponyfill (no licence file in the package; the standard text applies)
- **lie** 3.1.1 — MIT — https://github.com/calvinmetcalf/lie
- **lie** 3.3.0 — MIT — https://github.com/calvinmetcalf/lie
- **lifecycle-utils** 2.1.0 — MIT — https://github.com/giladgd/lifecycle-utils
- **lifecycle-utils** 3.1.1 — MIT — https://github.com/giladgd/lifecycle-utils
- **linkedom** 0.18.13 — ISC — https://github.com/WebReflection/linkedom (direct dependency)
- **localforage** 1.10.0 — Apache-2.0 — https://github.com/localForage/localForage
- **lodash** 4.18.1 — MIT — https://github.com/lodash/lodash (direct dependency)
- **lodash.debounce** 4.0.8 — MIT — https://github.com/lodash/lodash
- **log-symbols** 7.0.1 — MIT — https://github.com/sindresorhus/log-symbols
- **long** 5.3.2 — Apache-2.0 — https://github.com/dcodeIO/long.js
- **loose-envify** 1.4.0 — MIT — https://github.com/zertosh/loose-envify
- **lowdb** 7.0.1 — MIT — https://github.com/typicode/lowdb
- **marks-pane** 1.0.9 — MIT — https://github.com/fchasen/marks (no licence file in the package; the standard text applies)
- **matcher** 3.0.0 — MIT — https://github.com/sindresorhus/matcher
- **matcher** 4.0.0 — MIT — https://github.com/sindresorhus/matcher
- **math-intrinsics** 1.1.0 — MIT — https://github.com/es-shims/math-intrinsics
- **mdn-data** 2.0.14 — CC0-1.0 — https://github.com/mdn/data
- **media-captions** 1.0.4 — MIT — https://github.com/vidstack/media-captions (direct dependency)
- **mime-db** 1.52.0 — MIT — https://github.com/jshttp/mime-db
- **mime-types** 2.1.35 — MIT — https://github.com/jshttp/mime-types
- **mimic-function** 5.0.1 — MIT — https://github.com/sindresorhus/mimic-function
- **minimist** 1.2.8 — MIT — https://github.com/minimistjs/minimist
- **minipass** 7.1.3 — BlueOak-1.0.0 — https://github.com/isaacs/minipass
- **minizlib** 3.1.0 — MIT — https://github.com/isaacs/minizlib
- **mitt** 3.0.1 — MIT — https://github.com/developit/mitt
- **motion** 12.42.2 — MIT — https://github.com/motiondivision/motion (direct dependency)
- **motion-dom** 12.42.2 — MIT — https://github.com/motiondivision/motion
- **motion-utils** 12.39.0 — MIT — https://github.com/motiondivision/motion
- **mousetrap** 1.6.5 — Apache-2.0 WITH LLVM-exception — https://github.com/ccampbell/mousetrap (direct dependency)
- **ms** 2.0.0 — MIT — https://github.com/zeit/ms
- **ms** 2.1.3 — MIT — https://github.com/vercel/ms
- **nano-css** 5.6.2 — Unlicense — https://github.com/streamich/nano-css
- **nanoid** 3.3.16 — MIT — https://github.com/ai/nanoid
- **nanoid** 5.1.16 — MIT — https://github.com/ai/nanoid
- **next-tick** 1.1.0 — ISC — https://github.com/medikoo/next-tick
- **node-addon-api** 8.9.0 — MIT — https://github.com/nodejs/node-addon-api
- **node-api-headers** 1.9.0 — MIT — https://github.com/nodejs/node-api-headers
- **node-fetch** 2.7.0 — MIT — https://github.com/bitinn/node-fetch
- **node-llama-cpp** 3.19.0 — MIT — https://github.com/withcatai/node-llama-cpp (direct dependency)
- **nth-check** 3.0.1 — BSD-2-Clause — https://github.com/fb55/nth-check
- **object-assign** 4.1.1 — MIT — https://github.com/sindresorhus/object-assign
- **object-keys** 1.1.1 — MIT — https://github.com/ljharb/object-keys
- **onetime** 7.0.0 — MIT — https://github.com/sindresorhus/onetime
- **onnxruntime-common** 1.24.0-dev.20251116-b39e144322 — MIT — https://github.com/Microsoft/onnxruntime (no licence file in the package; the standard text applies)
- **onnxruntime-common** 1.24.3 — MIT — https://github.com/Microsoft/onnxruntime (no licence file in the package; the standard text applies)
- **onnxruntime-common** 1.27.0 — MIT — https://github.com/Microsoft/onnxruntime (no licence file in the package; the standard text applies)
- **onnxruntime-node** 1.24.3 — MIT — https://github.com/Microsoft/onnxruntime (no licence file in the package; the standard text applies)
- **onnxruntime-node** 1.27.0 — MIT — https://github.com/Microsoft/onnxruntime (direct dependency) (no licence file in the package; the standard text applies)
- **onnxruntime-web** 1.26.0-dev.20260416-b7804b056c — MIT — https://github.com/Microsoft/onnxruntime (no licence file in the package; the standard text applies)
- **opencollective-postinstall** 2.0.3 — MIT — https://github.com/opencollective/opencollective-postinstall
- **ora** 9.4.1 — MIT — https://github.com/sindresorhus/ora
- **pako** 1.0.11 — (MIT AND Zlib) — https://github.com/nodeca/pako
- **parse-cache-control** 1.0.1 — BSD-3-Clause — https://github.com/roryf/parse-cache-control
- **parse-ms** 3.0.0 — MIT — https://github.com/sindresorhus/parse-ms
- **parse-ms** 4.0.0 — MIT — https://github.com/sindresorhus/parse-ms
- **path-key** 3.1.1 — MIT — https://github.com/sindresorhus/path-key
- **path-webpack** 0.0.3 — MIT — https://github.com/fchasen/path-webpack (no licence file in the package; the standard text applies)
- **pdfjs-dist** 4.10.38 — Apache-2.0 — https://github.com/mozilla/pdf.js (direct dependency)
- **picocolors** 1.1.1 — ISC — https://github.com/alexeyraspopov/picocolors
- **platform** 1.3.6 — MIT — https://github.com/bestiejs/platform.js
- **postcss** 8.5.23 — MIT — https://github.com/postcss/postcss
- **pretty-bytes** 6.1.1 — MIT — https://github.com/sindresorhus/pretty-bytes
- **pretty-ms** 8.0.0 — MIT — https://github.com/sindresorhus/pretty-ms
- **pretty-ms** 9.3.0 — MIT — https://github.com/sindresorhus/pretty-ms
- **process-nextick-args** 2.0.1 — MIT — https://github.com/calvinmetcalf/process-nextick-args
- **progress** 2.0.3 — MIT — https://github.com/visionmedia/node-progress
- **prop-types** 15.8.1 — MIT — https://github.com/facebook/prop-types
- **proper-lockfile** 4.1.2 — MIT — https://github.com/moxystudio/node-proper-lockfile
- **protobufjs** 7.6.2 — BSD-3-Clause — https://github.com/protobufjs/protobuf.js
- **proxy-compare** 3.0.1 — MIT — https://github.com/dai-shi/proxy-compare
- **proxy-from-env** 2.1.0 — MIT — https://github.com/Rob--W/proxy-from-env
- **rc** 1.2.8 — (BSD-2-Clause OR MIT OR Apache-2.0) — https://github.com/dominictarr/rc
- **react** 19.2.6 — MIT — https://github.com/facebook/react (direct dependency)
- **react-colorful** 5.8.0 — MIT — https://github.com/omgovich/react-colorful (direct dependency)
- **react-day-picker** 9.14.0 — MIT — https://github.com/gpbl/react-day-picker (direct dependency)
- **react-dom** 19.2.6 — MIT — https://github.com/facebook/react (direct dependency)
- **react-dropzone** 14.4.1 — MIT — https://github.com/react-dropzone/react-dropzone (direct dependency)
- **react-hook-form** 7.83.0 — MIT — https://github.com/react-hook-form/react-hook-form (direct dependency)
- **react-icons** 5.7.0 — MIT — https://github.com:react-icons/react-icons (direct dependency)
- **react-is** 16.13.1 — MIT — https://github.com/facebook/react
- **react-remove-scroll** 2.7.2 — MIT — https://github.com/theKashey/react-remove-scroll
- **react-remove-scroll-bar** 2.3.8 — MIT — https://github.com/theKashey/react-remove-scroll-bar (direct dependency) (no licence file in the package; the standard text applies)
- **react-style-singleton** 2.2.3 — MIT — https://github.com/theKashey/react-style-singleton
- **react-universal-interface** 0.6.2 — Unlicense — https://github.com/streamich/react-universal-interface
- **react-use** 17.6.1 — Unlicense — https://github.com/streamich/react-use (direct dependency)
- **readable-stream** 2.3.8 — MIT — https://github.com/nodejs/readable-stream
- **readable-stream** 3.6.2 — MIT — https://github.com/nodejs/readable-stream
- **readline-sync** 1.4.10 — MIT — https://github.com/anseki/readline-sync
- **regenerator-runtime** 0.13.11 — MIT — https://github.com/facebook/regenerator/tree/main/packages/runtime
- **require-directory** 2.1.1 — MIT — https://github.com/troygoode/node-require-directory
- **resize-observer-polyfill** 1.5.1 — MIT — https://github.com/que-etc/resize-observer-polyfill
- **restore-cursor** 5.1.0 — MIT — https://github.com/sindresorhus/restore-cursor
- **retry** 0.12.0 — MIT — https://github.com/tim-kos/node-retry
- **retry** 0.13.1 — MIT — https://github.com/tim-kos/node-retry
- **roarr** 2.15.4 — BSD-3-Clause — https://github.com/gajus/roarr
- **rrdom** 2.1.1 — MIT — https://github.com/rrweb-io/rrweb (no licence file in the package; the standard text applies)
- **rrweb** 2.1.1 — MIT — https://github.com/rrweb-io/rrweb (direct dependency) (no licence file in the package; the standard text applies)
- **rrweb-snapshot** 2.1.1 — MIT — https://github.com/rrweb-io/rrweb (no licence file in the package; the standard text applies)
- **rtl-css-js** 1.16.1 — MIT — https://github.com/kentcdodds/rtl-css-js
- **rvfc-polyfill** 1.0.8 — GPL-3.0 — https://github.com/ThaUnknown/rvfc-polyfill
- **safe-buffer** 5.1.2 — MIT — https://github.com/feross/safe-buffer
- **safe-buffer** 5.2.1 — MIT — https://github.com/feross/safe-buffer
- **scheduler** 0.27.0 — MIT — https://github.com/facebook/react
- **screenfull** 5.2.0 — MIT — https://github.com/sindresorhus/screenfull.js
- **semver** 7.8.1 — ISC — https://github.com/npm/node-semver
- **semver-compare** 1.0.0 — MIT — https://github.com/substack/semver-compare
- **serialize-error** 7.0.1 — MIT — https://github.com/sindresorhus/serialize-error
- **serialize-error** 8.1.0 — MIT — https://github.com/sindresorhus/serialize-error
- **seroval** 1.5.6 — MIT — https://github.com/lxsmnsyc/seroval
- **seroval-plugins** 1.5.6 — MIT — https://github.com/lxsmnsyc/seroval
- **set-harmonic-interval** 1.0.1 — Unlicense — https://github.com/streamich/set-harmonic-interval
- **setimmediate** 1.0.5 — MIT — https://github.com/YuzuJS/setImmediate
- **sharp** 0.34.5 — Apache-2.0 — https://github.com/lovell/sharp
- **shebang-command** 2.0.0 — MIT — https://github.com/kevva/shebang-command
- **shebang-regex** 3.0.0 — MIT — https://github.com/sindresorhus/shebang-regex
- **signal-exit** 3.0.7 — ISC — https://github.com/tapjs/signal-exit
- **signal-exit** 4.1.0 — ISC — https://github.com/tapjs/signal-exit
- **simple-git** 3.36.0 — MIT — https://github.com/steveukx/git-js (no licence file in the package; the standard text applies)
- **sleep-promise** 9.1.0 — MIT — https://github.com/brummelte/sleep-promise
- **slice-ansi** 7.1.2 — MIT — https://github.com/chalk/slice-ansi
- **slice-ansi** 8.0.0 — MIT — https://github.com/chalk/slice-ansi
- **sonner** 2.0.7 — MIT — https://github.com/emilkowalski/sonner (direct dependency)
- **source-map** 0.5.6 — BSD-3-Clause — http://github.com/mozilla/source-map
- **source-map** 0.6.1 — BSD-3-Clause — http://github.com/mozilla/source-map
- **source-map-js** 1.2.1 — BSD-3-Clause — https://github.com/7rulnik/source-map-js
- **sprintf-js** 1.1.3 — BSD-3-Clause — https://github.com/alexei/sprintf.js
- **sql.js** 1.12.0 — MIT — http://github.com/sql-js/sql.js (direct dependency)
- **stack-generator** 2.0.10 — MIT — https://github.com/stacktracejs/stack-generator
- **stackframe** 1.3.4 — MIT — https://github.com/stacktracejs/stackframe
- **stacktrace-gps** 3.1.2 — MIT — https://github.com/stacktracejs/stacktrace-gps
- **stacktrace-js** 2.0.2 — MIT — https://github.com/stacktracejs/stacktrace.js
- **stdin-discarder** 0.3.2 — MIT — https://github.com/sindresorhus/stdin-discarder
- **stdout-update** 4.0.1 — MIT — https://github.com/keindev/stdout-update
- **steno** 4.0.2 — MIT — https://github.com/typicode/steno
- **string_decoder** 1.1.1 — MIT — https://github.com/nodejs/string_decoder
- **string_decoder** 1.3.0 — MIT — https://github.com/nodejs/string_decoder
- **string-width** 4.2.3 — MIT — https://github.com/sindresorhus/string-width
- **string-width** 7.2.0 — MIT — https://github.com/sindresorhus/string-width
- **string-width** 8.2.1 — MIT — https://github.com/sindresorhus/string-width
- **strip-ansi** 6.0.1 — MIT — https://github.com/chalk/strip-ansi
- **strip-ansi** 7.2.0 — MIT — https://github.com/chalk/strip-ansi
- **strip-json-comments** 2.0.1 — MIT — https://github.com/sindresorhus/strip-json-comments
- **stylis** 4.4.0 — MIT — https://github.com/thysultan/stylis.js
- **tailwind-merge** 2.6.1 — MIT — https://github.com/dcastil/tailwind-merge (direct dependency)
- **tar** 7.5.19 — BlueOak-1.0.0 — https://github.com/isaacs/node-tar
- **tesseract.js** 7.0.0 — Apache-2.0 — https://github.com/naptha/tesseract.js (direct dependency)
- **tesseract.js-core** 7.0.0 — Apache-2.0 — https://github.com/naptha/tesseract.js-core
- **throttle-debounce** 3.0.1 — MIT — https://github.com/niksy/throttle-debounce
- **throughput** 1.0.2 — MIT — https://github.com/ThaUnknown/throughput (no licence file in the package; the standard text applies)
- **toggle-selection** 1.0.6 — MIT — https://github.com/sudodoki/toggle-selection (no licence file in the package; the standard text applies)
- **tr46** 0.0.3 — MIT — https://github.com/Sebmaster/tr46.js (no licence file in the package; the standard text applies)
- **ts-easing** 0.2.0 — Unlicense — https://github.com/streamich/ts-easing
- **tslib** 1.14.1 — 0BSD — https://github.com/Microsoft/tslib
- **tslib** 2.8.1 — 0BSD — https://github.com/Microsoft/tslib
- **type** 2.7.3 — ISC — https://github.com/medikoo/type
- **type-fest** 0.13.1 — (MIT OR CC0-1.0) — https://github.com/sindresorhus/type-fest
- **type-fest** 0.20.2 — (MIT OR CC0-1.0) — https://github.com/sindresorhus/type-fest
- **typedarray** 0.0.6 — MIT — https://github.com/substack/typedarray
- **uhyphen** 0.2.0 — ISC — https://github.com/WebReflection/uhyphen
- **undici-types** 7.24.6 — MIT — https://github.com/nodejs/undici
- **universalify** 2.0.1 — MIT — https://github.com/RyanZim/universalify
- **url-join** 4.0.1 — MIT — https://github.com/jfromaniello/url-join
- **use-callback-ref** 1.3.3 — MIT — https://github.com/theKashey/use-callback-ref/
- **use-debounce** 10.1.1 — MIT — https://github.com/xnimorz/use-debounce (direct dependency)
- **use-sidecar** 1.1.3 — MIT — https://github.com/theKashey/use-sidecar
- **use-sync-external-store** 1.6.0 — MIT — https://github.com/facebook/react
- **util-deprecate** 1.0.2 — MIT — https://github.com/TooTallNate/util-deprecate
- **validate-npm-package-name** 7.0.2 — ISC — https://github.com/npm/validate-npm-package-name
- **vaul** 1.1.2 — MIT — https://github.com/emilkowalski/vaul (direct dependency)
- **wasm-feature-detect** 1.8.0 — Apache-2.0 — https://github.com/GoogleChromeLabs/wasm-feature-detect
- **webidl-conversions** 3.0.1 — BSD-2-Clause — https://github.com/jsdom/webidl-conversions
- **whatwg-url** 5.0.0 — MIT — https://github.com/jsdom/whatwg-url
- **which** 2.0.2 — ISC — https://github.com/isaacs/node-which
- **which** 6.0.1 — ISC — https://github.com/npm/node-which
- **wrap-ansi** 7.0.0 — MIT — https://github.com/chalk/wrap-ansi
- **y18n** 5.0.8 — ISC — https://github.com/yargs/y18n
- **yallist** 5.0.0 — BlueOak-1.0.0 — https://github.com/isaacs/yallist
- **yargs** 17.7.2 — MIT — https://github.com/yargs/yargs
- **yargs-parser** 21.1.1 — ISC — https://github.com/yargs/yargs-parser
- **yoctocolors** 2.1.2 — MIT — https://github.com/sindresorhus/yoctocolors
- **zlibjs** 0.3.1 — MIT — https://github.com/imaya/zlib.js
- **zod** 3.25.76 — MIT — https://github.com/colinhacks/zod (direct dependency)

Platform builds npm installs only on other operating systems (not present in a Windows build; licence as the lockfile records it): @emnapi/runtime 1.11.1 (MIT), @img/sharp-darwin-arm64 0.34.5 (Apache-2.0), @img/sharp-darwin-x64 0.34.5 (Apache-2.0), @img/sharp-libvips-darwin-arm64 1.2.4 (LGPL-3.0-or-later), @img/sharp-libvips-darwin-x64 1.2.4 (LGPL-3.0-or-later), @img/sharp-libvips-linux-arm 1.2.4 (LGPL-3.0-or-later), @img/sharp-libvips-linux-arm64 1.2.4 (LGPL-3.0-or-later), @img/sharp-libvips-linux-ppc64 1.2.4 (LGPL-3.0-or-later), @img/sharp-libvips-linux-riscv64 1.2.4 (LGPL-3.0-or-later), @img/sharp-libvips-linux-s390x 1.2.4 (LGPL-3.0-or-later), @img/sharp-libvips-linux-x64 1.2.4 (LGPL-3.0-or-later), @img/sharp-libvips-linuxmusl-arm64 1.2.4 (LGPL-3.0-or-later), @img/sharp-libvips-linuxmusl-x64 1.2.4 (LGPL-3.0-or-later), @img/sharp-linux-arm 0.34.5 (Apache-2.0), @img/sharp-linux-arm64 0.34.5 (Apache-2.0), @img/sharp-linux-ppc64 0.34.5 (Apache-2.0), @img/sharp-linux-riscv64 0.34.5 (Apache-2.0), @img/sharp-linux-s390x 0.34.5 (Apache-2.0), @img/sharp-linux-x64 0.34.5 (Apache-2.0), @img/sharp-linuxmusl-arm64 0.34.5 (Apache-2.0), @img/sharp-linuxmusl-x64 0.34.5 (Apache-2.0), @img/sharp-wasm32 0.34.5 (Apache-2.0 AND LGPL-3.0-or-later AND MIT), @img/sharp-win32-arm64 0.34.5 (Apache-2.0 AND LGPL-3.0-or-later), @img/sharp-win32-ia32 0.34.5 (Apache-2.0 AND LGPL-3.0-or-later), @napi-rs/canvas-android-arm64 0.1.100 (MIT), @napi-rs/canvas-darwin-arm64 0.1.100 (MIT), @napi-rs/canvas-darwin-x64 0.1.100 (MIT), @napi-rs/canvas-linux-arm-gnueabihf 0.1.100 (MIT), @napi-rs/canvas-linux-arm64-gnu 0.1.100 (MIT), @napi-rs/canvas-linux-arm64-musl 0.1.100 (MIT), @napi-rs/canvas-linux-riscv64-gnu 0.1.100 (MIT), @napi-rs/canvas-linux-x64-gnu 0.1.100 (MIT), @napi-rs/canvas-linux-x64-musl 0.1.100 (MIT), @napi-rs/canvas-win32-arm64-msvc 0.1.100 (MIT), @node-llama-cpp/linux-arm64 3.19.0 (MIT), @node-llama-cpp/linux-armv7l 3.19.0 (MIT), @node-llama-cpp/linux-riscv64 3.19.0 (MIT), @node-llama-cpp/linux-x64 3.19.0 (MIT), @node-llama-cpp/linux-x64-cuda 3.19.0 (MIT), @node-llama-cpp/linux-x64-cuda-ext 3.19.0 (MIT), @node-llama-cpp/linux-x64-vulkan 3.19.0 (MIT), @node-llama-cpp/mac-arm64-metal 3.19.0 (MIT), @node-llama-cpp/mac-x64 3.19.0 (MIT), @reflink/reflink-darwin-arm64 0.1.19 (MIT), @reflink/reflink-darwin-x64 0.1.19 (MIT), @reflink/reflink-linux-arm64-gnu 0.1.19 (MIT), @reflink/reflink-linux-arm64-musl 0.1.19 (MIT), @reflink/reflink-linux-x64-gnu 0.1.19 (MIT), @reflink/reflink-linux-x64-musl 0.1.19 (MIT), @reflink/reflink-win32-arm64-msvc 0.1.19 (MIT).

<!-- END GENERATED: npm packages -->
