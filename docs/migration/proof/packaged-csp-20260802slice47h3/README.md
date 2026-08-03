# The packaged CSP is real and enforced — Phase 9 / slice 47h

```
node docs/migration/tools/packaged-csp-gate.mjs
```

Needs a packaged build in `out/`. Needs no dev server, and runs the packaged app against a
throwaway `--user-data-dir`, so it never touches the real profile.

## The result

```text
0   window origin        app://bundle/index.html
0b  document             readyState complete, head present
1   header               527 chars, byte-identical to shared/contentSecurityPolicy.ts
2   script-src           ['self'] — no unsafe-eval anywhere in the header
3   ENFORCEMENT          inline <script> refused; violatedDirective = script-src-elem;
                         the script did not run
```

Build under test: `out/jp-study-app-win32-x64/jp-study-app.exe`, built 2026-08-01.

`PHASE_6_5_AUDIT.md` §3's chained High finding is mitigated by this policy, and until now every
claim for it was an argument about source code — the header is attached to the `app:` origin,
which **only exists in a packaged build**, so no dev run could ever exercise it. This is the
first measurement of it in a shipped artifact.

Corroboration, recorded but not load-bearing: a `fetch` to an off-machine host
(`https://example.invalid`) was rejected, consistent with `connect-src`. A network failure and
a CSP refusal look alike from a rejected promise, so it supports the reading and does not carry
it.

## The trap this gate hit first, which would have been a fabricated security finding

The first version tested enforcement with `eval('1+1')` and reported **`eval-allowed`** — on a
build whose header is demonstrably correct. That is not a defect in the app:

> **`Runtime.evaluate` bypasses the page's CSP by design**, exactly as the DevTools console
> does. So does `Page.addScriptToEvaluateOnNewDocument`. Anything the harness executes
> *directly* is the wrong instrument for measuring a page's policy.

What is subject to CSP is the page's own DOM. The gate now appends an inline `<script>` and
listens for `securitypolicyviolation`: the element is created from a bypassing context, but the
*load* of it belongs to the page, so it measures the document's policy rather than the
debugger's privileges.

Had that first reading been written down, the record would carry "the packaged CSP does not
block eval" — a false alarm about a live security control, in the direction that invites
someone to "fix" a policy that was already correct.

A second, duller trap: the CDP target exists as soon as the **window** does, which is before
the **document** is usable. Probing then gives `Failed to fetch` and a null `document.head` —
findings about timing that read as findings about the policy. The gate waits for
`readyState === 'complete'` now.

## What this does NOT show

- **This build predates slice 47g's extraction.** The header it serves is byte-identical to
  the directives now in `shared/contentSecurityPolicy.ts`, so it validates the *mechanism* and
  the *policy content* — but the packaged artifact was built from the version where the string
  was inline in `main.ts`. Re-run this gate after the next `npm run package`.
- **Only `script-src` was exercised behaviourally.** `object-src`, `form-action`, `base-uri`
  and the `connect-src` host list are asserted from the header text, not by attempting each
  violation.
- Nothing here says the policy is *sufficient*, only that it is delivered and enforced.
