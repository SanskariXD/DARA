# DARA independent verification

Checked 13 November 2026 (Asia/Kolkata). All test data is synthetic. Provider placeholders are intentional: these checks do not establish Gnani/Gemini accuracy, real authentication, cloud synchronization, clinical efficacy, or patient-data readiness.

## Verification scope

- Independent code inspection of the patch engine, schema, IndexedDB repository, save controller, API boundaries, service worker and UI.
- Engine unit tests: validation, duplicate suppression, order, manual ownership, member attribution, conflict resolution, review and completion invariants.
- Repository tests: initialization, atomic writes, reload, stale revision, concurrent tabs, reset generations, export/recovery and completed immutability.
- HTTP tests: bounded JSON, malformed input, content type/origin restrictions, synthetic fixture allowlist and explicit unconfigured live adapters.
- Independent integration regressions in `tests/verification.test.ts` combine finalized transcript ingestion and database persistence, manual edits during outstanding extraction, and husband-specific symptom reports.
- Browser scenarios in `tests/e2e.spec.ts`: manual completion/history, invalid phone, decimal keyboard entry, sample replay/manual conflicts, member attribution, mobile search/add, offline reload, browser history identity, and focus/caret/scroll stability.

## Issues caught during independent review

| Issue | Resolution / status |
| --- | --- |
| Transcript append changed a visit without advancing its revision; persisting before asynchronous extraction raised `StorageConflictError`. | Fixed in engine; independent regression passes. |
| Manual text normalization stripped trailing spaces while typing a multiword name. | Engine preserves raw manual text; validation normalizes separately. |
| Save error state tracked only one record; an unrelated subsequent save could hide another unsaved record. | Fixed with per-record failure tracking. |
| Exported snapshot could update concurrency knowledge and allow stale-tab overwrite. | Repository export no longer grants write-version knowledge; regression included. |
| Stale tabs could write after another tab reset demo data. | Repository generation check added; regression included. |
| Corrupted data could not be exported for recovery. | Raw recovery export added; original data remains untouched. |
| Raw manual age strings were not carried into the next household visit. | Fixed: identity carry-forward normalizes reviewed age; completion/reload regression passes. |
| Decimal numeric text was converted before the user finished entering the decimal point. | Fixed by retaining raw manual numeric strings; regression covers decimal intermediates. The Chromium CI manual-entry flow passed, including sequential decimal entry. |
| Browser history omitted visit identity, risking mismatched household and visit views. | Source fix implemented; the corresponding CI workflow passed. |
| Sample action offered on newly added households, though server accepts only seeded fixtures. | Source fix implemented; browser check is pending. |
| Conditional evidence could add row height during extraction. | Evidence space is reserved. Hosted browser verification reported stable field position, focus and caret during replay; automated regression remains in the sample test. |
| Local browser Origin was compared with Next’s internal bind address, blocking replay in CI. | Fixed to use the request Host authority; local and hostile forwarded-host regressions pass. |
| Invalid proposed conflict value was accepted through an uncaught throwing call. | Invalid acceptance is caught and shown as a notice. |

## Results so far

- 60 unit, API, persistence and independent integration tests passed after the origin-boundary regression was added.
- Type check passed after repository export union was narrowed in its tests.
- The first GitHub Actions browser run ([43316903856](https://github.com/SanskariXD/DARA/actions/runs/43316903856), commit `ffc182b`) passed four of five scenarios: manual entry/completion/reload/read-only history; mobile search/add at 390px; offline reload with saved drafts; and browser Back across households. Sample replay timed out because its HTTP endpoint rejected the browser Origin: Next constructed `Request.url` with the internal bind address `0.0.0.0`, while the browser used `127.0.0.1`. The root agent reproduced the 403 directly.
- The origin check now compares the browser Origin with the request protocol and actual `Host`; it does not trust `X-Forwarded-Host`. Regression tests cover the local bind-address case and rejection of a foreign forwarded host. Independent review found the fix consistent with this synthetic endpoint boundary.
- The main agent's hosted browser verification completed sample replay, preserved manual weight `62`, retained phone focus/caret and field position during updates, and placed the husband's fever report on Ramesh rather than Lakshmi. This is separate from the automated CI test result.
- The sample browser test now reports rejected API status, URL, Origin and bounded response body immediately instead of waiting for a generic UI timeout. Its original 40-second completion deadline remains unchanged and it checks that all seven fixture responses arrived. CI preserves screenshots, traces, HTML reports and API diagnostics for seven days.
- A CI rerun of the fixed commit is still required before claiming all five automated browser tests pass. Local Playwright remains unavailable in the agent execution runtime because Chromium's singleton socket is blocked; CI and hosted-browser evidence are used instead.

## Limits

A passing demo test suite verifies the implemented synthetic/manual workflow. It does not justify a promise of zero bugs. Browser storage is local to this origin and device, not encrypted patient storage or a cloud backup. The API placeholders fail closed and cannot be activated solely by populating a credential until the documented provider work and access controls are implemented.
