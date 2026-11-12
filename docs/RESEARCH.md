# Phase 1 — existing projects and reuse decisions

**DARA — Digital Assisted Recordkeeping for ASHA Workers**
Research checked: **13 November 2026 (India)**. GitHub counts are a snapshot, not a quality score. Last push dates below are UTC. These are five maintained projects with useful, inspectable implementations; none is a verified drop-in implementation of DARA's complete passive speech-to-register workflow.

## Five-project comparison

| Project | Type and maturity signal | License / last push | Useful contribution to DARA | Decision |
| --- | --- | --- | --- | --- |
| [Community Health Toolkit Core](https://github.com/medic/cht-core) | Community-health application framework; **564 stars**, 434 forks; repository created 2011 | AGPL-3.0 / 2026-11-05 | Health-worker roles, household/contact hierarchy, mobile-first offline workflows, longitudinal records, follow-up tasks | Study workflow and data-model patterns; do not fork its whole deployment stack for this Vercel prototype |
| [ODK Central](https://github.com/getodk/central) | Established field-data platform's server and release repository; **233 stars**; ecosystem spans separate client/backend repositories | Apache-2.0 / 2026-11-06 | Form versions, submissions, persistent entities, review states, permissions, explicit conflict management | Adopt entity-versus-visit separation and review/version concepts; reserve API integration for a later interoperability requirement |
| [JSON Forms](https://github.com/eclipsesource/jsonforms) | Schema-driven form framework for React, Angular and Vue; **2,757 stars** | MIT / 2026-11-11 | Separation of data schema from presentation, validation and conditional rules, renderer extensions | Adopt schema-driven definitions; do not add a full renderer framework for a small, deliberately designed questionnaire |
| [React Hook Form](https://github.com/react-hook-form/react-hook-form) | Focused React form library; **44,917 stars**, 2,527 forks | MIT / 2026-11-11 | Field-level updates, scoped subscriptions, validation integration, custom visual components | Strong candidate for the form layer; use narrow subscriptions and targeted updates instead of replacing the entire form |
| [Dexie.js](https://github.com/dexie/Dexie.js) | IndexedDB wrapper; **14,686 stars**, 724 forks; repository created 2014 | Apache-2.0 / 2026-11-09 | Typed browser storage, transactions, indexed queries, React integration, migration support | Strong candidate for offline household/visit drafts; local persistence is separate from a future authenticated sync backend |

All five repositories were non-archived at inspection. CHT and ODK have fewer stars than general-purpose JavaScript libraries because they serve a narrower domain. Their relevant workflows and maintained documentation are more meaningful here than popularity alone.

## What each project teaches us

### 1. Community Health Toolkit: start with the worker's household workflow

CHT is the closest domain match: a community worker handles people, places, reports and follow-up work across intermittent connectivity. Its README describes health-system roles, localization, responsive mobile use, and Docker/Kubernetes hosting. This is a valuable product reference, but importing its complete stack would make a focused Vercel build more involved.

**DARA application:** keep households, members and visits distinct; place pending follow-ups alongside the household; make drafts recoverable. Borrow the workflow concepts without copying AGPL code into a differently licensed project. Its README also excludes Safari from supported browsers, so its compatibility claims cannot be inherited by DARA.

Sources: [README](https://github.com/medic/cht-core/blob/master/README.md), [CHT architecture](https://docs.communityhealthtoolkit.org/technical-overview/architecture/), [metadata snapshot endpoint](https://api.github.com/repos/medic/cht-core).

### 2. ODK Central: a visit is not the household itself

ODK separates form definitions, submitted encounters, and persistent entities. Its documentation covers subsequent updates to entities and conflicts when updates race. This directly fits repeat ASHA visits: a new visit can load prior household data while retaining its own record and provenance.

**DARA application:** use stable household/member IDs, schema versions, draft/completed visit states and an explicit review step. Do not silently resolve incompatible edits. Central is packaged as a multi-service Docker Compose system; it is a potential future integration, not a frontend package to install in this build.

Sources: [README](https://github.com/getodk/central/blob/master/README.md), [ODK Central concepts and features](https://docs.getodk.org/central-intro/), [metadata](https://api.github.com/repos/getodk/central).

### 3. JSON Forms: one data contract, independent presentation

JSON Forms distinguishes the data schema from the UI schema. That allows field types, required values and layout to evolve separately. DARA needs the same separation: extraction should refer to stable field keys, while the interface can use appropriate controls and translations.

**DARA application:** define field metadata centrally, then use it for validation, extraction instructions and review. A renderer framework is valuable for hundreds of configurable forms; a small fixed questionnaire can retain a lighter custom renderer. Do not install JSON Forms and another full form framework merely to claim reuse.

Sources: [README](https://github.com/eclipsesource/jsonforms/blob/master/README.md), [official architecture introduction](https://jsonforms.io/docs/), [metadata](https://api.github.com/repos/eclipsesource/jsonforms).

### 4. React Hook Form: change the answer without disturbing the worker

The official API documents targeted `setValue` calls and scoped `useFormState` subscriptions. These are particularly relevant when incoming extraction changes one field while the worker edits another. Its field-array documentation warns that some update operations remount controls.

**DARA application:** apply accepted patches to the affected field, retain stable component keys, and avoid whole-form resets during recording. Track manual ownership separately: a library's dirty state alone is not a complete conflict policy. Never move focus or scroll position in response to routine extraction. Measure rendering behavior in the actual app; library popularity does not prove DARA's latency.

Sources: [README](https://github.com/react-hook-form/react-hook-form/blob/master/README.md), [`setValue`](https://react-hook-form.com/docs/useform/setvalue), [`useFormState`](https://react-hook-form.com/docs/useformstate), [metadata](https://api.github.com/repos/react-hook-form/react-hook-form).

### 5. Dexie.js: durable drafts without a network dependency

Dexie wraps the browser's IndexedDB and provides transactions and indexed queries. A visit draft and its associated changes can be stored atomically. Its transaction documentation warns against awaiting unrelated asynchronous work inside a database transaction.

**DARA application:** run extraction outside storage transactions, then commit accepted changes and provenance together. Report save failures honestly, handle unavailable storage, and support draft recovery. Browser storage is not automatic encryption, backup or cross-device synchronization. Dexie Cloud is a separate service, excluded while external integrations remain placeholders. Avoid legacy `dexie-observable` and `dexie-syncable`; the current README marks them unmaintained.

Sources: [README](https://github.com/dexie/Dexie.js/blob/master/README.md), [transaction API](https://dexie.org/docs/Dexie/Dexie.transaction()), [metadata](https://api.github.com/repos/dexie/Dexie.js).

## Reuse strategy for this build

The fastest defensible route is **a small application built from focused libraries and established workflow patterns**, rather than merging five products.

| Responsibility | Implementation direction | Why it stays small |
| --- | --- | --- |
| Household and repeat visits | Stable entities plus separate visit records, informed by CHT and ODK | Avoids overwriting history and repeated redesign |
| Questionnaire | Shared typed field definitions and deterministic validation | Same field keys across UI, patches, review and future Gemini adapter |
| Form interaction | Targeted state changes and isolated controls; React Hook Form where it simplifies the implementation | Reduces remounts and whole-form updates |
| Draft storage | IndexedDB, preferably Dexie for transaction/migration handling | No request needed to save a local edit |
| Speech/extraction | Provider interfaces plus explicit synthetic replay mode | Tests the pipeline without credentials or pretending demo output is live AI |
| Review | Required/invalid/conflicting values derived from current state | No extra model call for completeness checks |

## DARA-specific behavior still requires original work

These projects do **not** provide the exact Gnani-to-Gemini integration, subject attribution, revision ordering, protected manual edits, alert deduplication or safe audio interruption policy needed here. Those remain explicit implementation and test responsibilities.

Each accepted patch should identify the visit, member, field, source segment and source order. Validate field allowlists and value types; deduplicate repeated segments; reject stale changes; preserve verbatim evidence for symptom notes. Manual edits must remain authoritative until the worker explicitly accepts a suggested replacement. A recording session must not change form order or scroll position.

Clinical alerts must be described as demo logic until reviewed protocols and live provider behavior are validated. A high star count is not evidence of medical accuracy, latency or privacy compliance.

## Deliberate exclusions

- The old [enketo/enketo-core](https://github.com/enketo/enketo-core) repository is archived (79 stars; last push 2023-11-29), so it was not selected as an active dependency. Do not accidentally build on that retired repository when evaluating current ODK web-form work.
- No vector database, multi-agent runtime, conversational question generator, model fine-tuning or heavyweight voice framework is needed for this passive workflow.
- No exact real-world speed claim is made. Measure end-of-speech to accepted field update after Gnani/Gemini are configured; separately measure local patch application, draft writes, focus stability and response to network failure now.

## Phase 1 completion criteria

- [x] Five maintained GitHub projects examined using repository metadata and their own documentation.
- [x] Popularity, license, activity and concrete relevance recorded.
- [x] Complete platforms distinguished from reusable libraries.
- [x] Reuse decisions and excluded complexity documented.
- [x] Missing DARA-specific behavior identified for implementation and verification.
