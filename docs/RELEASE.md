# DARA 0.4 release

Released 13 November 2026.

- App: https://dara-sigma.vercel.app/
- Repository: https://github.com/SanskariXD/DARA
- Implementation commit: `bc25652869955d7f660f11e1f64b5797b26a9c97`.
- Production deployment: `dpl_CSADQuVEQRm8PYa78Cwe4boqBGGh`, READY.
- Deployment URL: https://dara-hetnlo5pi-sanskaris-projects.vercel.app/
- Deployment method: Git integration from main, Next.js on Node 24.
- CI: https://github.com/SanskariXD/DARA/actions/runs/43447296578

## Changes

- Fixed health extraction on fresh person introductions, repeated introduction backfill, Kannada spouse references and contextual pronouns. Person changes prevent stale references from assigning someone else’s answer.
- Recovered household notes and missing portions of machine-generated history, while preserving manual answers, newer corrections and focused fields.
- Removed the large conversation-check gate and extra manual-check acknowledgement. Checks retry automatically; missing answers get a small status hint. A final check that adds answers still requires the worker to review those additions.
- Added one household contact number and moved weight to expanded health details. Existing stored values and completed records remain intact.
- Added pregnancy and postnatal details: reported duration, MCP card, nutrition, supplements, injections, facility and care visits. Source-backed editable checklists distinguish delivered counselling from patient reports or future promises.
- Added rainy-season visits with known family identities, fresh health questions, stagnant-water observations and a short guidance checklist.
- Enriched the two pregnancy examples and changed one example to a four-person rainy-season visit. Only untouched canonical examples upgrade automatically; edited examples and user records are preserved.
- Added translations for the new controls in all six interface languages and compact report assignment in Review.

## Verification

TypeScript, all **275 unit/API/domain/storage/integration tests**, the production build and **all 10 Chromium journeys** passed on implementation commit `bc25652869955d7f660f11e1f64b5797b26a9c97` in the linked CI run. The browser suite covers fresh English/Kannada capture and reload, protected focused/manual edits, household phone/health weight, pregnancy and rainy visits, six languages, offline/reset behavior and automatic retry/final review.

Five real Gemini requests produced four successful synthetic scenarios; one upstream rejection succeeded on retry. All four captured responses were decoded, applied to the final domain engine and saved/reloaded through the repository. English health and household notes, Kannada spouse attribution, pregnancy details/direct counselling, and Kannada rainy-season observations/advice passed those checks. These are specific regression probes, not a field-accuracy guarantee. See [PROVIDERS.md](PROVIDERS.md).

The public health endpoint reports 0.4.0. Hosted checks verified the homepage and client assets (HTTP 200), unauthenticated extraction rejection (401), workspace unlock/session/logout (200) and a Secure session cookie. Configured secrets are absent from published source and built client assets. Verification screenshots contain fictional records and are not committed to this repository.

## Recording boundaries

A bare “temperature 103” is retained in history with a request to clarify its unit, never silently treated as Celsius. Unmentioned health is not marked healthy. A patient mentioning an injection or appointment does not by itself complete a counselling task.

Records remain in this browser/device’s IndexedDB, with export; this release does not add a shared cloud database or individual worker accounts. Native-speaker review, noisy field audio and target-phone validation remain outstanding. Care-field sources and scope are documented in [CARE-WORKFLOWS.md](CARE-WORKFLOWS.md).
