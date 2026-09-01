# files-app measurement harness

One harness, parameterised — not a probe per gate. RULE 1: a new single-use
probe is a defect, not a slice.

## `census.ts` — gate 1's instrument

Runs the **production** `buildFilesIndex` against a real profile, outside
Electron. It is not a replica: it imports the same module `main/filesApp/ipc.ts`
calls, so a reader that drifts breaks the census too.

```sh
npx esbuild src/.coordination/files-app/census.ts --bundle --platform=node \
  --format=cjs --external:better-sqlite3 --external:node-llama-cpp \
  --alias:electron=./src/.coordination/files-app/electron-stub.ts \
  --outfile=debug/filesapp-census.cjs
node debug/filesapp-census.cjs [userDataPath] [--mining] [--detail] [--dupes] [--gate68] [--gate7]
```

`userDataPath` defaults to `%APPDATA%\jp-study-app`. `debug/` is gitignored, so
the bundle is disposable and the source is the artefact.

**The alias and the second external are load-bearing, added for `--gate7`.**
That mode walks the real mine chain, which reaches `main/filesApp/mineSource.ts`
→ `main/mining.ts`, and that module imports `electron` and registers IPC at
module scope; `electron-stub.ts` is the same stand-in `filesAppMineSource.test.ts`
installs with `vi.mock`, so the census and that suite exercise one path. Without
`--external:node-llama-cpp` the bundle fails outright with *"top-level await is
not supported with the cjs output format"* — the AI provider client reaches it.
Neither is optional and neither changes what any earlier mode measures; the
bundle simply grows from 53 KB to 1.1 MB.

The modes:

| flag | what it measures |
| --- | --- |
| *(none)* | gate 1 — items, per-enumerator counts and timings, every category |
| `--mining` | MINING gate 5 — mineable assets, with a disk control per category |
| `--dupes` | one file / one row, with a no-dedupe CONTROL pass beside it |
| `--gate68` | MINING gates 6 & 8 — transcribed assets found through the presets |
| `--gate7` | MINING gate 7 — the whole mine chain, end to end, per category |

It prints items, per-enumerator counts and timings, every category including the
empty ones, total bytes, broken links, orphans, the provenance split, and every
subtitle row.

### Two traps it was built around

1. **It reports only what MAIN can see.** `outputs/notes` and
   `outputs/highlights` will read 0 here forever: the Notebook is in renderer
   `localStorage`, and `components/filesapp/rendererEnumerators.ts` joins it on
   arrival in the renderer. Read those two numbers from the running app, never
   from this script.
2. **`dictionaryDir()` is `userData/dictionary` — singular.** The plural spelt
   in a first draft opened nothing and printed a confident `dictionaries 0`,
   which is exactly the shape gate 1 calls a FINDING. A category reading 0 in
   this output is a claim about the reader as much as about the store; check the
   path before believing the number.
