# DARA 0.3 release

Released 13 November 2026.

- Tested and deployed runtime: `249c91d5253bab7ebf2db11cca699be50a868a72`.
- [Passing GitHub Actions run 43424538682](https://github.com/SanskariXD/DARA/actions/runs/43424538682).
- Production deployment: `dpl_AVuDD9Vx9z1ENSTZdq5kJ1W77nVJ`.
- Deployment URL: https://dara-8ntzoh0c1-sanskaris-projects.vercel.app/

- App: https://dara-sigma.vercel.app/
- Repository: https://github.com/SanskariXD/DARA
- Vercel project: `dara` (`prj_jTIgFE5HlXN7bEAZQaKwoVOem81F`)
- Deployment method: direct source upload, Node 24, Next.js 16.4.6.

## Changes

- Five clearly marked fictional households: two pregnancy surveys and three general household surveys. Existing records are retained.
- Relationship dropdown with grandparents, aunts, uncles and male/female cousins; guarded, editable sex defaults.
- Compact per-person health cards. “Not discussed” remains distinct from an explicit report of no concerns. Optional fever duration, temperature and breathing details expand for concerns or recorded facts. Numeric BP is replaced with reported hypertension; pregnancy details remain conditional.
- One combined reported symptoms/history field for each person, weight in family details, and one household notes area. Old draft answers migrate without discarding evidence; completed history remains unchanged.
- More conservative person attribution using precise field evidence, explicit correction handling, and better Kannada/Hindi health terminology instructions.
- A background full-conversation check recovers missing answers without overwriting manual edits or newer corrections. Final review links to specific fields and requires another review if the final check changes an answer.
- English, Kannada, Hindi, Telugu, Tamil and Malayalam interface dictionaries bundled locally. Speech uses automatic language detection independently of the interface choice.
- Confirmed reset restores the five original examples and preserves preferences. Delayed responses and stale tabs cannot recreate removed records.

## Verification

See [VERIFICATION.md](VERIFICATION.md) for resolved review findings and [PROVIDERS.md](PROVIDERS.md) for real synthetic provider checks. CI covers TypeScript, unit/API/domain/storage/recorder/integration checks, production build and browser workflows. All **206 tests across 13 files**, TypeScript, the production build and **10 Chromium journeys** passed on the exact deployed runtime. Browser checks cover manual/custom visits and blank repeats, 360/390/768px layouts, offline recovery, automatic member creation and protected edits, microphone denial, health/review navigation, all six languages, delayed-response reset, background backfill and recovery during final completion.

The live Kannada probe assigned BP, overall no-concerns and breathing reports to three different intended members. A Hindi correction changed an extracted age from 60 to 62; a full-history probe recovered an earlier missing age without undoing that correction. These establish specific working cases, not field accuracy guarantees.

The final screenshot review verified localized fields and navigation, including wrapped Malayalam step labels. All reviewed names and records were fictional. Verification screenshots are not published in this repository.

The hosted reconciliation endpoint rejected unauthenticated access, returned a valid response for an original synthetic passage and recovered the missing age while preserving a newer correction and an unstated age. Signed Secure session and logout checks passed. Actual configured secrets were absent from published source and built client assets.

This release record follows the runtime in a documentation-only commit.

## Existing boundaries

Records remain in the current browser/device's IndexedDB, with JSON export. There is no shared cloud database or individual worker account management. The shared private access code protects provider API use; it does not encrypt local records. Credentials stay server-only and out of Git.

Native-speaking review of translated copy and noisy human speech on target phones remain field-validation work. The questionnaire is not represented as an approved government form or a clinical diagnosis system.

The initial release used direct upload. Automatic Git deployments were subsequently verified at commit `62a4cc7` on 13 November 2026.
