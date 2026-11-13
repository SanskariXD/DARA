# DARA implementation plan

Digital Assisted Recordkeeping for ASHA Workers

Owner: Anjan Shetty • Repository: https://github.com/SanskariXD/DARA
Started: 13 November 2026 (Asia/Kolkata)

## Refined brief
Build an installable, responsive household register for ASHA workers. A worker selects a household, sees its members and previous visits, opens a visit and keeps asking the visible questions naturally. Finalized Gnani transcripts will be sent to Gemini for structured, evidence-backed field changes. A deterministic engine validates and applies these changes without moving the screen or overwriting manual edits. At review, show missing data, uncertain/conflicting answers and reported concerns. Preserve the speaker's original report and the correct household member. Only reviewed clinical rules may authorize future spoken alerts.

This release deliberately uses synthetic records and explicit provider placeholders. No real patient data, paid integrations, or external AI calls. It must remain useful with manual entry and demonstrate the asynchronous extraction flow honestly. The user expressly requested these placeholders; live provider credentials and clinical validation are a later activation phase.

## Phase 1 — Research and decisions
- [x] Inspect the target GitHub repository and permissions.
- [x] Verify five mature GitHub references, licenses, activity and relevant capabilities.
- [x] Commit research findings in `docs/RESEARCH.md`.
- [x] Choose a small Next.js + React + TypeScript stack; Zod validation; Dexie local persistence; isolated form updates.
- [x] Record the Apple-inspired design system and interaction rules.

## Phase 2 — Foundation and backend
- [x] Create typed household, member, visit, transcript, patch, conflict and audit models.
- [x] Implement incremental validated patches, duplicate suppression and stale response handling.
- [x] Protect manually edited and focused fields; expose conflicts for review.
- [x] Implement review/completion invariants and immutable completed visits.
- [x] Add server route contracts and bounded validation, with demo extraction and explicit disabled live adapters.
- [x] Create `.env.example`, ignore secrets, document future provider activation.

## Phase 3 — Frontend and local records
- [x] Build demo entry, household directory/search/filter/add, household detail and member views.
- [x] Build visit form, manual editing, pause/resume sample transcript flow, progress and transcript evidence.
- [x] Build review/finish, conflict decisions, history, follow-ups, settings and export.
- [x] Persist drafts in IndexedDB, recover after reload, handle storage errors and connection changes.
- [x] Preserve focus, caret, field order and scroll position during updates.
- [x] Installable PWA, offline app shell, safe areas, keyboard and reduced-motion support.

## Phase 4 — Independent verification
- [x] Unit tests for patch order, manual protection, member attribution, evidence, invalid numbers, deduplication, review and completion.
- [x] Integration tests for local persistence and API limits/configuration failure.
- [x] Browser flows on desktop/mobile: directory → visit → corrections → review → saved history.
- [x] Reload/offline/permission/error-state tests, console scan and accessibility checks.
- [x] Independent security/functionality review; fix material findings.

## Phase 5 — Optimization and release
- [x] Independent bundle, render and UX review; implement useful measured improvements.
- [x] Re-run affected checks after fixes; production build.
- [x] Commit and push source, plan, docs, tests and lockfile to `main`.
- [x] Create Vercel project in the connected `Sanskari's projects` team.
- [x] Deploy tested commit; inspect build and live app/API behavior.
- [x] Record release URL, commit and verified limitations, then stop.

## Acceptance criteria
- All visible navigation and primary actions work; no fake live AI or fake cloud save status.
- Updates target a specific member and field, retain transcript evidence and cannot replace an active/manual edit silently.
- Duplicate or stale extraction cannot regress newer values. Completed records cannot change through delayed jobs.
- A draft survives reload; a completed visit is available in history.
- Provider keys never enter browser bundles or Git. Unconfigured live functionality fails explicitly.
- Comfortable at 360px, tablet and desktop widths; no unexpected auto-scroll or layout jumps.
- Research, architecture, setup instructions and remaining activation tasks are in the repository.

## Next rebuild — Template-driven family health surveys

Add this feature in the next rebuild; it is not part of the current deployed release. The full interaction and acceptance notes are in [`docs/NEXT_REBUILD.md`](docs/NEXT_REBUILD.md).

- [ ] Add a versioned survey-template registry, starting with a Family Health Survey template and its required, optional, repeatable and conditional fields.
- [ ] Let the worker start a fresh survey for a household whose survey answers are missing, or intentionally start the survey again. Begin with unanswered template fields rather than carrying old clinical answers forward.
- [ ] Allow the worker to add household-level or per-member survey fields manually, with a label, supported input type and optional/required setting.
- [ ] Ask household size in the conversation; when the worker confirms the stated count, create that many empty member sections from the template.
- [ ] Map later answers such as each person’s name, relationship and age to the right member and template field; preserve evidence, identify uncertainty and protect manual edits.
- [ ] Keep additional relevant information in notes with its transcript evidence and member attribution where clear; put unclear attribution into review rather than guessing.
- [ ] Review count, member identities, missing required answers, conflicts and notes before completing the survey; keep completed surveys immutable and allow a requested repeat as a new survey.
- [ ] Add unit, persistence, API-contract, browser and 360px/tablet/desktop regression coverage before deployment.

### Acceptance for the next rebuild

- A new or repeated survey starts with a blank answer set while retaining only household context needed to select the family and start the visit.
- A spoken family size of three creates exactly three editable member sections after confirmation; corrections update the count safely without losing already reviewed entries silently.
- Names, relationships, ages and other answers attach to the correct member and template fields only when supported by the conversation; uncertain answers and attribution remain visible for worker review.
- Additional information can be added to notes with source evidence. No household health answer is silently inferred from old visits or generated from missing data.
- The worker can edit all generated fields, add optional fields, pause/recover a draft, review it and complete it without changes to earlier completed surveys.

## Team ownership
- Research agent: five-project assessment.
- Design/frontend agent: design system and interface.
- Engine agent: domain model, validators, patch engine and invariant tests.
- Data agent: synthetic fixtures, IndexedDB and controller state.
- Verification agent: independent functional/security/browser assessment.
- Optimization agent: performance and UX audit.
- Main agent: integration, API routes, PWA, verification coordination, GitHub and Vercel release.

## Deferred activation (intentionally not part of placeholder release)
- [ ] Grant the Vercel GitHub installation DARA repository access, then connect it for automatic Git deployments.
- [ ] Provision real authentication and household-scoped database access; verify row-level access.
- [ ] Connect Gnani streaming using a captured official response trace and reconnection tests.
- [ ] Connect Gemini structured extraction and benchmark Kannada/Hindi/English accuracy and p50/p95.
- [ ] Clinician-approved danger-sign rules and Gnani TTS with echo suppression.
- [ ] Device/privacy/security review before real personal health information is entered.

## Implementation notes

- React Hook Form was researched but not installed in the final app: the small fixed form uses stable controlled inputs and the shared patch engine directly. Dexie and Zod are reused dependencies.
- Vercel project `dara` created successfully. Automatic Git linking was rejected because the Vercel GitHub installation does not currently grant DARA access. Direct source deployment is the release path.
- The local Chromium runner is restricted by the execution environment. All five browser scenarios passed in GitHub Actions; deployed visual and functional verification also passed.

## Release checkpoint

- Public app: https://dara-sigma.vercel.app/
- Deployed implementation commit: `4318178e6c751b162ea7050fdf6ea5410662efee`. Later release-documentation updates do not change runtime application source.
- CI: 60 unit/API/persistence regressions and five Chromium workflows passed; type checking and production build passed.
- Details and exact deployment identity: `docs/RELEASE.md`.
