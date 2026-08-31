# files-app measurement harness

One harness, parameterised — not a probe per gate. RULE 1: a new single-use
probe is a defect, not a slice.

## `census.ts` — gate 1's instrument

Runs the **production** `buildFilesIndex` against a real profile, outside
Electron. It is not a replica: it imports the same module `main/filesApp/ipc.ts`
calls, so a reader that drifts breaks the census too.

```sh
npx esbuild src/.coordination/files-app/census.ts --bundle --platform=node \
  --format=cjs --external:better-sqlite3 --outfile=debug/filesapp-census.cjs
node debug/filesapp-census.cjs [userDataPath]
```

`userDataPath` defaults to `%APPDATA%\jp-study-app`. `debug/` is gitignored, so
the bundle is disposable and the source is the artefact.

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
