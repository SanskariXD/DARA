# DARA 0.3 implementation contract

Next.js App Router, React, TypeScript, CSS, Lucide, Zod and Dexie. The active product uses `src/lib/survey.ts`, `src/lib/survey-db.ts`, `src/hooks/use-surveys.ts` and `src/components/dara-app.tsx`. Older `engine.ts`, `types.ts`, `db.ts` and their fixtures describe the historical first implementation; do not use them to implement current survey flows.

## Survey and storage

- New family-health and pregnancy surveys use template version 2. Completed v1 surveys are immutable; only old drafts migrate. Migration retains legacy values and source evidence.
- `Survey` contains a stable id, household id, template, revision, workspace generation, household answers, ordered stable member IDs, original transcripts, conflicts, uncertainties, notes and audit entries.
- A field has a stable id/scope/type/section and optional options, visibility, required, custom or legacy flags. Custom questions remain user-authored text.
- `SurveyTranscript.language` is `auto | en | kn | hi | te | ta | ml`; interface settings use the six explicit language codes. These settings never change recording's automatic detection.
- `editSurveyField`, `applySurveyExtraction`, `applySurveyReconciliation`, `reviewSurvey` and `completeSurvey` are the current domain entry points. Manual edits, including deliberately cleared values, are protected.
- `createSurveyRepository` seeds exactly five canonical fictional examples without replacing user records. Reset restores them atomically, preserves preferences and advances the generation so old writes cannot resurrect removed records.

## Person assignment and corrections

Provider envelopes bind survey id, original segment id/index and base revision. Member proposals need an explicit quoted identity/reference; each field carries exact source evidence. A supplied member id never overrides a quote that describes another member. Ambiguity is reviewable, not guessed. Relationship-derived sex is editable and cannot replace a protected or explicit conflicting value.

Corrections carry the field id, previous value and source proof. Newer supported corrections may change prior extracted values. Manual/focused answers remain protected and are offered for explicit review. Unified health history and household notes retain original quoted facts rather than model-written diagnoses.

## Background reconciliation

`POST /api/reconcile` accepts the current bounded survey snapshot and original target passages. It uses one model call per batch; exact limits and schema are in [PROVIDERS.md](PROVIDERS.md). The client covers the full conversation newest-first and applies only missing unprotected answers against the latest record. Roster, question-schema, transcript and generation changes invalidate the checkpoint. A partial, failed or offline check must not claim completion.

## Interface

The existing blue landing and lavender workspace remain. Health begins with compact per-person statuses. Detailed health fields appear for concerns or already recorded facts; silence means not discussed. Reported hypertension replaces required numeric BP, weight stays with family details, and pregnancy fields are conditional. All editable extra notes appear in one household notes field. Review points to the exact member/field and preserves source evidence.

Bundled dictionaries translate only application-authored labels, instructions and controlled errors at render time. Never translate names, evidence, transcripts, health history or custom question/choice labels through the UI dictionary. Completing a visit waits for recording and reconciliation; a recovered answer requires review again.

## Server and deployment

Provider keys and session signing credentials stay server-only. Paid routes require a signed workspace session and same-origin validation. Records remain device-local; no cloud synchronization or individual worker authorization is implied. [INTEGRATIONS.md](INTEGRATIONS.md) describes these boundaries. [RELEASE.md](RELEASE.md) records the tested/deployed source and exact verification evidence.
