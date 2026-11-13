# DARA 0.4 verification

Checked 13 November 2026 with fictional records. Release identity and final CI result: [RELEASE.md](RELEASE.md).

## Regressions resolved

- Fresh named members and repeated introductions now retain health proposals through decode, application, save and reload.
- Kannada spouse aliases and pronoun continuity are checked against the current person; a stale name anchor cannot bypass a newer speaker/person reference.
- Household notes combine direct fields and note projections in one passage. Partial extracted narratives can recover additional quotes; manual, unknown-provenance and corrected answers stay protected.
- Counselling accepts actual speaker-prefixed enquiries/advice and rejects patient facts, meta-questions, denials and future promises. Captured real synthetic Gemini output is replayed in independent integration tests.
- A 100-field legacy draft migrates with all custom answers retained. Storage validates migration output before replacing a valid record.
- Untouched examples upgrade; edited examples and completed real records are preserved. Reset retains its generation guards.
- Background checks retry transient errors automatically, stop after bounded failures, resume on reconnect and no longer require a second acknowledgement to complete a valid reviewed record.
- Browser verification caught a 55px focused-input shift caused by a success banner. The redundant banner was removed; the original strict focus/position test is retained.

Mobile pregnancy, rainy-season and review screenshots were inspected at 390px. Text and controls remain readable without horizontal clipping. No screenshot artifacts are committed to the repository.

The four current live probes test structured extraction and persistence. They do not establish noisy microphone recognition accuracy; full speech/device validation remains separate.

---

# Historical 0.3 verification

Checked 13 November 2026. All test records and provider probes are fictional.

## Scope

- Five canonical examples (two pregnancy visits and three general visits), non-destructive seeding, draft migration, immutable completed history, confirmed reset and stale-write rejection across tabs.
- Relationship options and guarded sex defaults; compact health states; one reported symptoms/history field, conditional concern details, reported hypertension and pregnancy; one household notes area.
- Exact transcript evidence and person attribution for each field; explicit corrections; manually cleared and focused answer protection; no diagnosis, invented measurements or healthy defaults from silence.
- Automatic speech language detection independent of the six locally bundled interface languages; original names, transcripts, custom questions and free-text answers are never translated by the UI dictionary.
- Full-history reconciliation in bounded, newest-first batches. Original segment IDs/evidence are retained, existing answers are protected and manual review is required if the check cannot finish.
- Signed workspace sessions, server-only provider credentials, request limits and sanitised failures. Reconciliation is protected by the same private session as live extraction.

## Findings resolved during review

| Finding | Resolution |
| --- | --- |
| Broad model quotations could contain different people's answers. | Validate each field's precise source quotation against the intended person's explicit reference. |
| Valid live output could contain a repeated count without evidence or concatenated quotations. | Discard only unsupported unchanged counts; recover an original enclosing passage only from individually verified unique field quotations. Per-field attribution remains enforced. |
| Saying someone has no fever could replace an existing overall concern. | Prompt distinguishes a specific negative from an explicit overall no-concerns report; conflicting answers remain reviewable. |
| Old conversation backfill could undo newer edits. | Fill only missing, unprotected values against the latest survey, original segment index and revision. |
| Custom questions or changed member identities could invalidate a completed conversation check. | Fingerprints include the complete field schema and roster; changes during a pass leave the check incomplete and trigger a fresh pass. |
| Delayed provider responses or old tabs could recreate cleared records. | Abort active checks, invalidate UI work and enforce an atomic workspace-generation check at storage writes. |
| Failed captured audio could be retried after clearing entries. | Explicit reset discards and aborts the recorder queue; normal stop still preserves it for retry. Stale session callbacks cannot release a new recording. |
| Long Malayalam step labels ran into adjacent labels on narrow phones. | Constrain each label to its own column, allow wrapping and check text-line bounds in all six languages. |
| Missing prompts were hidden during checking but the heading claimed completion. | Pending-check wording stays visible until the check completes or the worker explicitly reviews manually. |
| Generated and migrated notes appeared in multiple places. | Consolidate the editable content in household notes; preserve original source/history internally. |
| Indic text can exceed byte limits despite meeting the character limit. | Separate a 256,000-byte request limit from the 16,000 target-character cap, preserve exact passages and split larger batches. |

## Verification evidence

Final verification passed: **206 tests across 13 files**, TypeScript, production build and **10 browser journeys** in [run 43424538682](https://github.com/SanskariXD/DARA/actions/runs/43424538682). Exact deployment identity is recorded in [RELEASE.md](RELEASE.md). Live synthetic provider outcomes and source documentation are in [PROVIDERS.md](PROVIDERS.md). Deterministic browser tests mock paid providers; only separately documented provider probes make real calls.

## Remaining validation

Records remain in this browser/device's IndexedDB with JSON export, not a shared cloud database. The private access code protects paid APIs; it is not individual worker identity or encryption of local records. No claim of official questionnaire approval or clinical accuracy is made. Real human speech in noisy environments, long sessions on lower-end phones, and review of the five translated interfaces by native-speaking ASHA workers remain field-validation work. Synthetic probes establish specific working cases, not an accuracy percentage.

Earlier release evidence remains in Git history.
