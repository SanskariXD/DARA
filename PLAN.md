# DARA implementation plan

Digital Assisted Recordkeeping for ASHA Workers

Owner: Anjan Shetty • Repository: https://github.com/SanskariXD/DARA
Started: 13 November 2026 (Asia/Kolkata)

## Refined brief
Build an installable, responsive household register for ASHA workers. A worker selects a household, sees its members and previous visits, opens a visit and keeps asking the visible questions naturally. Finalized Gnani transcripts will be sent to Gemini for structured, evidence-backed field changes. A deterministic engine validates and applies these changes without moving the screen or overwriting manual edits. At review, show missing data, uncertain/conflicting answers and reported concerns. Preserve the speaker's original report and the correct household member. Only reviewed clinical rules may authorize future spoken alerts.

Current release: **0.3 multilingual survey refinement**, deployed at https://dara-sigma.vercel.app/. Five fictional examples, six local interface languages, automatic speech detection, precise person attribution/corrections, focused health forms, full-conversation recovery and confirmed reset are implemented and verified. Records remain device-local. Earlier phases below are historical.

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

This rebuild is implemented alongside the reference-led redesign and live provider connections; release verification is complete. The full interaction and acceptance notes are in [`docs/NEXT_REBUILD.md`](docs/NEXT_REBUILD.md).

- [x] Add a versioned survey-template registry, starting with a Family Health Survey template and its required, optional, repeatable and conditional fields.
- [x] Let the worker start a fresh survey for a household whose survey answers are missing, or intentionally start the survey again. Begin with unanswered template fields rather than carrying old clinical answers forward.
- [x] Allow the worker to add household-level or per-member survey fields manually, with a label, supported input type and optional/required setting.
- [x] Ask household size in the conversation; when the conversation explicitly states the count, automatically create that many empty member sections from the template.
- [x] Map later answers such as each person’s name, relationship and age to the right member and template field; preserve evidence, identify uncertainty and protect manual edits.
- [x] Keep additional relevant information in notes with its transcript evidence and member attribution where clear; put unclear attribution into review rather than guessing.
- [x] Review count, member identities, missing required answers, conflicts and notes before completing the survey; keep completed surveys immutable and allow a requested repeat as a new survey.
- [x] Add unit, persistence, API-contract, browser and 360px/tablet/desktop regression coverage before deployment.

### Acceptance for the next rebuild

- A new or repeated survey starts with a blank answer set while retaining only household context needed to select the family and start the visit.
- A spoken family size of three creates exactly three editable member sections automatically; corrections update the count safely without losing already reviewed entries silently.
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

## Remaining production infrastructure and validation
- [x] Verify automatic Git deployments: production commit `62a4cc7` deployed through the Git integration on 13 November 2026.
- [ ] Provision real authentication and household-scoped database access; verify row-level access.
- [x] Connect Gnani speech transcription through bounded WAV requests and verify a synthetic audio trace. Streaming WebSockets are not required for this implementation.
- [x] Connect Gemini structured extraction and verify a synthetic multi-person survey.
- [ ] Benchmark Kannada/Hindi/English accuracy and latency across representative devices and networks.
- [ ] Clinician-approved danger-sign rules and Gnani TTS with echo suppression.
- [ ] Device/privacy/security review before real personal health information is entered.

## Implementation notes

- React Hook Form was researched but not installed in the final app: the small fixed form uses stable controlled inputs and the shared patch engine directly. Dexie and Zod are reused dependencies.
- Vercel project `dara` created successfully. Initial Git linking was unavailable; direct source deployment was used for early releases. Git-triggered production deployment is now verified.
- The local Chromium runner is restricted by the execution environment. All five browser scenarios passed in GitHub Actions; deployed visual and functional verification also passed.

## Previous release checkpoint (0.1)

- Public app: https://dara-sigma.vercel.app/
- Deployed implementation commit: `4318178e6c751b162ea7050fdf6ea5410662efee`. Later release-documentation updates do not change runtime application source.
- CI: 60 unit/API/persistence regressions and five Chromium workflows passed; type checking and production build passed.
- Details and exact deployment identity: `docs/RELEASE.md`.

## Rebuild 0.2 — Reference design and live speech

- [x] Analyze the supplied blue intro and lavender mobile UI references.
- [x] Implement blank versioned family surveys, automatic member sections, custom fields, notes, manual protection and review.
- [x] Add real Gnani WAV transcription and Gemini extraction adapters with server-side credentials.
- [x] Add private workspace access for paid provider calls and bounded request validation.
- [x] Integrate the full responsive interface and recording flow.
- [x] Verify spoken audio through the real providers, alongside deterministic regression coverage.
- [x] Review phone/tablet/desktop screenshots and resolve functional findings.
- [x] Push verified source and deploy the rebuild.

## Previous release checkpoint (0.2)

- Implementation: `bc5ed0cbea0357000ba8e39d50a73a2c760412ac`.
- [CI run 43384196699](https://github.com/SanskariXD/DARA/actions/runs/43384196699): all 135 tests, TypeScript, production build and five Chromium journeys passed.
- Production deployment `dpl_F3rvwbKT2FeCN8Jyph4k5GT4gEm6` is READY at https://dara-sigma.vercel.app/.
- Hosted authenticated extraction created three synthetic members; hosted speech transcription returned a valid response.
- Shared database, individual worker accounts, official questionnaire approval and field accuracy validation remain the next infrastructure/validation work.


## Release 0.3 — Family attribution, simpler surveys and local languages

User feedback: working voice workflow needs more reliable person-specific mapping and corrections, multilingual health extraction, focused health forms, example records, reset, and full interface localization.

- [x] Verify Gnani automatic language detection and mixed-language support against current official documentation and a synthetic request.
- [x] Add five clearly identifiable example households: two pregnancy-related surveys and three general household surveys. Seed without replacing existing records.
- [x] Add a relationship dropdown, editable sex autofill for unambiguous relationships, and explicit conflicts instead of overwriting a recorded sex.
- [x] Use a compact health overview with not-discussed / no-concerns-reported / concerns-reported states. Silence must never imply that someone is healthy.
- [x] Combine symptoms and medical/surgical history; ask about reported hypertension; show pregnancy and expanded health fields only where relevant; keep weight with family details.
- [x] Use one household notes area while preserving old member notes during migration.
- [x] Require supported attribution and evidence for person-specific updates, interpret multilingual health expressions, and accept explicit corrections with audit history.
- [x] Recheck the entire saved conversation in bounded background batches, fill missing unprotected answers, and prevent stale backfill from undoing newer corrections.
- [x] Improve final review with member summaries, specific missing-question links, and honest incomplete/offline-check states.
- [x] Bundle English, Kannada, Hindi, Telugu, Tamil and Malayalam interface dictionaries locally; keep spoken-language detection separate.
- [x] Add a confirmed clear-user-entries action that restores examples and preserves preferences; guard concurrent and delayed writes.
- [x] Verify unit/integration/API/browser/mobile/offline/reset and language workflows, inspect visual evidence, then push and deploy.

Privacy and validation boundaries remain as documented in docs/INTEGRATIONS.md. This release changes recordkeeping behavior, not clinical diagnosis or official screening requirements. All fixture/provider verification uses invented records.

## Previous release checkpoint (0.3)

- Runtime: `249c91d5253bab7ebf2db11cca699be50a868a72`.
- [CI run 43424538682](https://github.com/SanskariXD/DARA/actions/runs/43424538682): 206 tests, TypeScript, production build and 10 browser journeys passed.
- Production deployment: `dpl_AVuDD9Vx9z1ENSTZdq5kJ1W77nVJ`; same public address and private workspace code.
- Source and client-bundle secret scans passed. Hosted reconciliation recovered only the expected synthetic missing answer.
- Release details and verification record: [docs/RELEASE.md](docs/RELEASE.md).


## Release 0.4 — Reliable health capture and care visits

- [x] Reproduce fresh-person health rejection through provider decoding, domain application and persistence.
- [x] Repair introduction/name attribution and Kannada spouse references while preserving ambiguous-person protection.
- [x] Verify household notes and missing narrative recovery without overwriting manual corrections.
- [x] Replace prominent check gates with automatic background review and small missing-answer feedback.
- [x] Keep one household phone; move weight to expanded health.
- [x] Add pregnancy/postnatal care details and evidence-backed counselling checklists.
- [x] Add rainy-season visits with reusable family identities, fresh health/environment answers and prevention checklist.
- [x] Upgrade untouched examples safely, including two pregnancy visits and a four-person rainy visit.
- [x] Translate new controls in all six interface languages.
- [x] Verify real synthetic provider calls, regression tests, browser flows and responsive screenshots.
- [x] Publish source, confirm Git-triggered production deployment and check hosted behavior.

Clinical field rationale and source links: [docs/CARE-WORKFLOWS.md](docs/CARE-WORKFLOWS.md).

## Current release checkpoint (0.4)

- Runtime: `bc25652869955d7f660f11e1f64b5797b26a9c97`.
- [CI run 43447296578](https://github.com/SanskariXD/DARA/actions/runs/43447296578): 275 tests, TypeScript, production build and all 10 browser journeys passed.
- Production deployment `dpl_CSADQuVEQRm8PYa78Cwe4boqBGGh` is READY at the unchanged public address, through Git integration.
- Four live synthetic extraction scenarios passed current-engine application and repository save/reload; mobile screenshots and hosted authentication/assets were checked.
- [Release record](docs/RELEASE.md) documents the final behavior and remaining field-validation boundaries.
