# DARA 0.3 release

13 November 2026. Final deployment identity and passing CI evidence will be recorded here after publication.

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

See [VERIFICATION.md](VERIFICATION.md) for resolved review findings and [PROVIDERS.md](PROVIDERS.md) for real synthetic provider checks. CI covers TypeScript, unit/API/domain/storage/recorder/integration checks, production build and browser workflows. Final exact counts and run links are recorded after completion.

The live Kannada probe assigned BP, overall no-concerns and breathing reports to three different intended members. A Hindi correction changed an extracted age from 60 to 62; a full-history probe recovered an earlier missing age without undoing that correction. These establish specific working cases, not field accuracy guarantees.

## Existing boundaries

Records remain in the current browser/device's IndexedDB, with JSON export. There is no shared cloud database or individual worker account management. The shared private access code protects provider API use; it does not encrypt local records. Credentials stay server-only and out of Git.

Native-speaking review of translated copy and noisy human speech on target phones remain field-validation work. The questionnaire is not represented as an approved government form or a clinical diagnosis system.

Vercel's GitHub installation still lacks repository access. The source is kept on GitHub and deployed directly; automatic future Git deployments need that installation access granted and the existing project linked.
