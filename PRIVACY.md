# Gum privacy statement

Gum is a desktop study app. Your decks, reviews, notes, library, snips, recordings and settings live on your computer. Gum has no account, no server of its own that receives your study data, no advertising, no analytics SDK and no crash-report upload.

Gum does go online for some things: to download dictionaries and updates, and to look things up for features you use. This statement lists each of them, what is sent, and when. It describes Gum v1 as it is built from https://github.com/vasars2024-hub/jp-study-app, and every item below is checked against that code.

## What stays on your computer

- Your flashcards, review history, statistics, known words, notes, calendar, books, manga, videos, music, mined sentences, snip pictures and their history, recordings and settings. They are stored in your Gum profile folder (Electron's user-data folder) and the app's local browser storage.
- Backups are local zip files. They leave your API keys and passwords out.
- The diagnostic log is written to your profile folder only, with keys and tokens removed. Gum never uploads it; you attach it to a bug report yourself if you want to.
- Crash reports are off by default. If you turn on "Keep crash reports on this PC" in Settings › Diagnostics, a crash writes a crash dump to the Crashpad folder in your profile. Gum never uploads it. "Save problem report…" puts the log and any dumps in a zip you save yourself, with keys, tokens and your home folder path removed.
- Built-in dictionary lookups, the Japanese tokenizer, offline translation, Tesseract OCR and the local AI model (when you download it) all run on your computer.

## The one count Gum can send about you (opt-in)

On first start Gum asks whether to "share my country anonymously" for the learner map. Only if you answer yes, Gum sends one empty request, once per install, to Gum's counter at jp-study-pings.vasars2024.workers.dev (a Cloudflare Worker). The worker adds one to the count for the country Cloudflare derives from the connection. It stores no IP address and no identifier; Cloudflare, like any server, sees your IP address while handling the request. You can change the answer at any time in Settings › Help › About › Privacy (a count already sent cannot be taken back, and none is sent again).

Whatever you answered, opening the learner map (the Resources page or the Learner Map widget) downloads the aggregate counts from the same worker. That request sends nothing about you.

There is no other telemetry or analytics in Gum.

## What Gum fetches without you switching anything on

These requests carry no study data and no identifier beyond what any web request carries (your IP address, and a user-agent naming Gum):

- Update check: Gum asks api.github.com for the latest release of Gum shortly after start, at most every six hours. The installed version also downloads an update from github.com in the background (not on a metered connection) and applies it when you restart.
- Built-in data: on first start Gum downloads its dictionaries (JMdict English and Russian, Moedict) from github.com and pitch-accent data from raw.githubusercontent.com. Each launch it refreshes its list of downloadable models from raw.githubusercontent.com. Frequency lists come from raw.githubusercontent.com the first time they are needed.
- Reading Lens: the first scan downloads the small OCR pack (about 15 MB) from huggingface.co if it is not installed yet.
- Speech recognition (Whisper) models come from huggingface.co the first time speech recognition runs, whether you start it or the automatic study track does for an imported video.
- Resources and Novels catalogs are downloaded from raw.githubusercontent.com when you open those pages.

## What is sent when you use a feature

These send the thing you are working on, and only while you use the feature:

- Media library metadata: after you import videos, and for your watch library, Gum looks up titles (taken from the file or folder name, or your list) on Jikan (api.jikan.moe), AniList (graphql.anilist.co) and TVmaze (api.tvmaze.com), and on TMDB (api.themoviedb.org) only if you added a TMDB key. The airing schedule sends AniList or MyAnimeList ids of the anime you are watching. Cover art loads from those services' image hosts.
- Subtitles: Jimaku (jimaku.cc) and OpenSubtitles (api.opensubtitles.com) are asked only after you add your key for them. They receive the title, season and episode (OpenSubtitles also the video's OpenSubtitles hash). The Nyaa source is off unless you turn it on.
- Lyrics: when a song plays with no lyrics on your computer, Gum asks LRCLIB (lrclib.net) with its artist, title, album and length.
- Dictionary: when the offline example sentences run short, the word you looked up is sent to Tatoeba (tatoeba.org). Playing a word's audio fetches it from JapanesePod101 (assets.languagepod101.com) with the word and its reading.
- Web pages, articles and the Immersion browser load the addresses you open.
- YouTube: search, download and playlist updates run through yt-dlp, which you install yourself; it talks to YouTube.
- Jiten (api.jiten.moe), VNDB (api.vndb.org) and MyAnimeList (myanimelist.net, after you sign in) receive the searches and list changes you make there.
- AnkiConnect is on your own computer (127.0.0.1:8765 unless you change it). Gum checks it in the background (every 30 seconds while Anki answers, backing off to once a minute while it does not) and sends cards to it when you mine.

## Only after you turn it on

- AI providers. Cloud AI needs your own key and the AI master switch, and each feature that would use a cloud model has its own opt-in. The text you ask about (and a picture, only when you send one to a vision model yourself, for example with "Ask the Agent", or with Read text with AI below) goes to the provider you chose: Anthropic (Claude, api.anthropic.com), OpenAI (api.openai.com), Google Gemini (generativelanguage.googleapis.com) or DeepSeek (api.deepseek.com), or any OpenAI-compatible address you enter. Local models (the built-in Qwen model, Ollama on localhost:11434, LM Studio on localhost:1234) stay on your computer.
- DeepL. Translation is offline by default. DeepL (api.deepl.com or api-free.deepl.com) receives the text only for a language pair where you chose it and agreed to send text to it.
- Snip to cards is off by default. When you turn it on, Gum reads pictures you copy to the clipboard (for example with Win+Shift+S) on your computer: the OCR is local and the pictures stay in your profile, unless you also turn on "Read text with AI" (below) or press "Check with AI" on a snip. The recognised text goes to an online translator only if you already chose one, and new cards go to Anki only through AnkiConnect on your computer.
- Read text with AI (AI OCR) is off by default. It sends a picture to the vision model you choose, on your own key, only when you have both picked a mode other than Off (Settings › AI › Read text with AI) or pressed "Check with AI" on a snip, and allowed "Read text in pictures" to use the cloud. Then the snip, manga page, or Reading Lens, visual novel or book region being read is sent as a picture, one request per picture, to Anthropic (api.anthropic.com), OpenAI (api.openai.com) or Google Gemini (generativelanguage.googleapis.com), or to the OpenAI-compatible server you entered (on your own computer when it is Ollama or LM Studio). DeepSeek is never sent pictures.
- The scraper and qBittorrent. The scraper fetches only the sites you add, and its schedule is off until you set one. Torrents are downloaded by your own qBittorrent; while it downloads, trackers and other peers see your IP address, as with any torrent client.
- The Mirror Writing evaluator sends your writing to the address you configure.
- Optional downloads (OCR models, speech recognition, voices, the local AI model, extra dictionaries) are fetched from the address shown next to each one (huggingface.co, github.com, mdbg.net, kaikki.org, downloads.tatoeba.org) when you choose them.

## The browser extension

The Gum browser extension talks only to Gum on your own computer, at 127.0.0.1 port 18765. That server listens on the loopback address only, refuses other machines, and needs the pairing token you set up.

## Your keys and passwords

API keys (AI providers, DeepL, Jimaku, OpenSubtitles, Jiten, TMDB), your MyAnimeList sign-in and your qBittorrent and scraper passwords are kept in Gum's vault, encrypted with your operating system's protection (Electron safeStorage, which is DPAPI on Windows), and are never handed to the app's windows. If the operating system's encryption is not available, Gum refuses to save a key rather than store it in plain text. Two exceptions: a key saved by an older version of Gum stays in its old plain-text file until it can be moved into the vault, and the extension pairing token is kept in plain text on a computer without that encryption.

## The media server

Gum's video features run a bundled copy of the Seanime media server on your computer, reachable only at 127.0.0.1. It is separate open-source software (GPL-3.0); when you use those features it may contact anime databases such as AniList on its own.

## Removing your data

Settings › Files can clear individual kinds of data or reset everything. Uninstalling Gum and deleting its profile folder removes the rest. Nothing is kept on a Gum server, because Gum has none.

## Changes

This statement ships with each version of Gum (PRIVACY.md, and in the app under Settings › Help › About › Privacy). Questions and corrections are welcome as issues at https://github.com/vasars2024-hub/jp-study-app/issues.
