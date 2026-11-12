# DARA performance and interaction review

Review date: 13 November 2026 (India). This document distinguishes measurements from design targets. Live Gnani and Gemini latency cannot be measured while provider integrations intentionally remain placeholders.

## Findings so far

| Area | Evidence | Decision |
| --- | --- | --- |
| Deterministic patch engine | `src/lib/engine.ts` updates the affected member with structural sharing. It does not deep-clone every member for each field. | Keep the simple synchronous engine; no worker or orchestration service justified. |
| Patch size | `src/lib/schema.ts` restricts a patch to 40 changes and transcript segments to 8,000 characters. The demo endpoint accepts fixture identifiers rather than a whole visit. | Retain bounded contracts and small HTTP payloads. |
| Persistence | `src/lib/db.ts` serializes writes, checks versions inside Dexie transactions, and keeps external network work outside transactions. | Preserve transaction boundaries; do not move provider calls into storage transactions. |
| Save scheduling | The initial frontend debounces visit persistence by 350 ms. | Avoid a database write per keystroke, but ensure navigation/finalization flushes outstanding work and never claims saved early. |
| Raw input | The first frontend version normalized every keystroke, which trimmed a space and removed an unfinished decimal. | Reported to frontend/engine owners. Engine now preserves manual text; frontend owns raw numeric editing. This is a correctness fix that also avoids caret disruption. |
| Transcript persistence | A transcript can be added before the extraction response arrives. The original helper did not advance the visit revision. | Engine owner fixed the helper to increment revision; frontend must use the helper before saving. |
| Service-worker readiness | The first registration component announced readiness immediately after `register()` resolved, before precache installation completed. | Fixed in `src/app/pwa.tsx`: it now awaits `navigator.serviceWorker.ready`. |
| Rendering/assets | System fonts, CSS, outline icons, no external photography, charting library, waveform or perpetual animation. | Keep this lightweight direction. Do not introduce media or decorative animation during polish. |
| Form layout | The first stylesheet used some essential help/review text below 12px and conditionally added evidence rows. | Reported to frontend owner: improve readable text sizes and reserve evidence space so incoming updates do not move later fields. |
| Unused dependency | Source search found no `react-hook-form` import in the initial implementation. | Root will remove the unused package. Do not force another form state system into a working small form solely for nominal reuse. |

## CPU-only engine sanity measurement

Compiled a temporary copy of the engine and fixture modules, then replayed all seven sample segments and ran review in a loop of 1,000 visits using Node's monotonic performance timer.

| Measurement | Result |
| --- | ---: |
| Work per run | 7 transcript additions + 7 patch applications + final review |
| Runs | 1,000 |
| Median | 0.068 ms |
| 95th percentile | 0.183 ms |
| Maximum observed | 6.315 ms |

This is a server-CPU microbenchmark during implementation, **not a phone or end-to-end benchmark**. It excludes network, model inference, speech finalization, rendering and IndexedDB. It only establishes that the small deterministic fixture engine was not an observed bottleneck. Do not advertise these values as DARA's response time.

## Initial production build measurement

Measured the first successful `.next/BUILD_ID` build. Frontend accessibility and input fixes were still in progress, so this is a labeled baseline, not a claim about the exact final release bytes.

| Measurement | Result |
| --- | ---: |
| Precached JavaScript/CSS build assets | 13 |
| Combined uncompressed build assets | 921,887 bytes (900.3 KiB) |
| Sum of separately gzip-compressed assets | 272,192 bytes (265.8 KiB) |
| CSS | 48,442 raw bytes / 9,962 gzip bytes |
| Largest JavaScript chunk | 288,406 raw bytes / 84,029 gzip bytes |
| External font files | 0 |
| Generated service-worker script | 1,747 bytes |

Method: recursively enumerated `.next/static` `.js`, `.css` and `.woff2` files and calculated gzip sizes using Python's gzip implementation. These are **compression estimates**, not observed transfer sizes; the hosting platform may use a different compression format. The app-shell precache additionally contains the root HTML, icons and manifest. The package installation size is not a browser download size.

The dependency set does not justify adding code-splitting machinery solely for this baseline. The heavier shared code is Next/React, the schema layer and browser persistence. Focus on correct field editing and no unexpected layout motion before pursuing marginal byte savings.

## Service-worker review

`scripts/build-sw.mjs` enumerates build assets and derives a cache version from their hashed paths. It caches the root shell, icons and manifest, not visit records or API responses. Fetch handling rejects other origins and non-GET requests, excludes `/api/`, and caches only successful HTML responses for root navigation. Activation removes older DARA shell caches. No forced `skipWaiting` is used, reducing the risk of switching an active visit to a new worker unexpectedly.

Two small resilience improvements were implemented in the generator after review: static assets match by pathname so an irrelevant query string cannot defeat precache lookup; root navigation aborts its network request after 3 seconds and falls back to the saved shell. With no cached shell it returns `Response.error()`. Root non-navigation requests are explicitly excluded from the static branch so Next RSC requests cannot accidentally receive cached HTML.

`node --check` passed. A temporary Node VM simulation of the generated worker body passed five targeted checks: static cache hit with a deployment query string, API exclusion, root RSC exclusion, timed cached-shell fallback, and error response with no cached shell. This is a code-level simulation, not a replacement for an actual offline-browser test. The next production build regenerates `public/sw.js` from the updated generator.

## Browser measurement limitations

Independent local Playwright timing was attempted. The bundled Playwright browser was absent, and the installed Chromium could not create its process-singleton socket in the execution environment (`Operation not permitted`). Therefore this report contains **no measured browser latency, frame rate, layout-shift score, or phone benchmark**.

The verification suite includes manual-edit/focus/caret preservation during sample replay and offline reload recovery. Root is arranging visual and functional verification through an available browser surface after deployment. Final verification results belong in the verification report; source inspection alone does not establish those checks passed.

## Limits to retain when enabling live providers

- Keep provider context bounded to the current form and relevant recent finalized segments; do not resend an entire growing visit on every utterance.
- Separate the complete auditable transcript from the small context sent to extraction. Do not silently delete record evidence to meet a prompt budget.
- Limit simultaneously pending extraction requests and preserve per-field source ordering. A late result must never overwrite a newer correction.
- Keep real-time transcript rendering out of the form's input subtree where practical. Introduce transcript windowing only after real conversation volume warrants it; seven demo passages do not justify virtualization.
- Store credentials only on the server. Do not introduce client-side provider retries that can multiply paid requests without limits.
- Measure end-of-speech to accepted field update on actual target phones and networks after integration. Report p50 and p95 separately from provider-only latency.
