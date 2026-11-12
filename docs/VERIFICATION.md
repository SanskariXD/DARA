# DARA independent verification

Checked 13 November 2026 (Asia/Kolkata). All test data is synthetic. Provider placeholders are intentional: these checks do not establish Gnani/Gemini accuracy, real authentication, cloud synchronization, clinical efficacy, or patient-data readiness.

## Verification scope

- Independent code inspection of the patch engine, schema, IndexedDB repository, save controller, API boundaries, service worker and UI.
- Engine unit tests: validation, duplicate suppression, order, manual ownership, member attribution, conflict resolution, review and completion invariants.
- Repository tests: initialization, atomic writes, reload, stale revision, concurrent tabs, reset generations, export/recovery and completed immutability.
- HTTP tests: bounded JSON, malformed input, content type/origin restrictions, synthetic fixture allowlist and explicit unconfigured live adapters.
- Independent integration regressions in `tests/verification.test.ts` combine finalized transcript ingestion and database persistence, manual edits during outstanding extraction, and husband-specific symptom reports.
- Browser scenarios in `tests/e2e.spec.ts`: manual completion/history, invalid phone, decimal keyboard entry, sample replay/manual conflicts, member attribution, mobile search/add, offline reload.

## Issues caught during independent review

| Issue | Resolution / status |
| --- | --- |
| Transcript append changed a visit without advancing its revision; persisting before asynchronous extraction raised `StorageConflictError`. | Fixed in engine; independent regression passes. |
| Manual text normalization stripped trailing spaces while typing a multiword name. | Engine preserves raw manual text; validation normalizes separately. |
| Save error state tracked only one record; an unrelated subsequent save could hide another unsaved record. | Fixed with per-record failure tracking. |
| Exported snapshot could update concurrency knowledge and allow stale-tab overwrite. | Repository export no longer grants write-version knowledge; regression included. |
| Stale tabs could write after another tab reset demo data. | Repository generation check added; regression included. |
| Corrupted data could not be exported for recovery. | Raw recovery export added; original data remains untouched. |
| Decimal numeric text was converted before the user finished entering the decimal point. | Frontend owner notified; browser regression added, pending run. |
| Browser history omitted visit identity, risking mismatched household and visit views. | Frontend owner notified; pending browser check. |
| Sample action offered on newly added households, though server accepts only seeded fixtures. | Frontend owner notified; pending browser check. |
| Conditional evidence could add row height during extraction. | Frontend owner notified; pending layout check. |
| Invalid proposed conflict value was accepted through an uncaught throwing call. | Frontend owner notified; pending UI review. |

## Results so far

- 48 unit, API, persistence and independent integration tests passed at the initial integrated checkpoint.
- Type check passed after repository export union was narrowed in its tests.
- Browser and production-build verification are pending the completed UI and server; this document will be updated with actual observed results before release.

## Limits

A passing demo test suite verifies the implemented synthetic/manual workflow. It does not justify a promise of zero bugs. Browser storage is local to this origin and device, not encrypted patient storage or a cloud backup. The API placeholders fail closed and cannot be activated solely by populating a credential until the documented provider work and access controls are implemented.
