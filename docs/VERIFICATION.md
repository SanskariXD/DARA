# DARA 0.5 verification

Checked 13 November 2026 with fictional records. Release identity and final CI result: [RELEASE.md](RELEASE.md).

## Regressions and invariants

- CI exposed a second-speaker regression: a fresh Kannada self-introduction after an English respondent was rejected. A source-validated temporary identity lookup now recognizes that explicit speaker switch before committing the name; existing identities remain protected. The exact decoder/engine sequence has a regression test.
- Fresh multi-segment Ajay/Anisha input passes the real provider decoder, domain engine and repository save/reload: discussing the wife does not change the durable respondent for first-person age, fever or breathing difficulty.
- Unsupported wife-as-male proposals are rejected. A full-history repair can fix an existing machine-owned age/relationship and remove identical wrongly assigned machine health copies. Manual, focused, newer and unrelated values remain protected.
- Manual input, live extraction and full-history checking share one latest-draft mutation authority and ordered persistence queue. True external-tab, completed-record and reset-generation guards remain strict.
- Reconciliation runs during intake, uses bounded debouncing and retry, retains original respondent/topic anchors, and performs a bounded second sweep after machine repairs. Its checkpoint includes answers and provenance as well as schema, roster and passages.
- Completion rechecks the latest revision after provider work and after the save queue drains. Any recovered change requires review again before immutable completion.
- New general and Monsoon visits reuse only identity/contact, require household-member confirmation and start health/notes fresh. Pregnancy follow-up requires confirmed history; carried care is labelled, counselling checks are fresh, and a 14-day date suggestion preserves manually chosen or cleared dates.
- Obsolete attribution/conflict prompts retire after resolution. Routine recorded notes are reviewed with the ordinary visit checkbox; actionable questions remain explicit.

## Evidence

Local verification passed TypeScript, **322 tests across 21 files**, and the production build. The production dependency audit found zero known vulnerabilities. Configured credentials were absent from tracked source and built client assets.

All ten Chromium journeys passed in [CI run 43461711999](https://github.com/SanskariXD/DARA/actions/runs/43461711999), including exact multi-segment input, overlapping extraction/check/manual saves, pregnancy history and repeat identity verification. Kannada/Malayalam mobile layouts, pregnancy follow-up, rainy care and final-review screenshots were inspected; no visual blocker remained. Exact-source and deployment identities are recorded in [RELEASE.md](RELEASE.md).

Eight bounded live synthetic requests produced four upstream 503 responses and four HTTP 200 responses, one of which was safely rejected for invented IDs. Successful English/Kannada introductions and a Kannada repair were replayed through the final decoder and repository. All 14 Kannada repair assertions passed; zero conflicts/uncertainties remained in that repaired fixture. This round does not establish successful live English health extraction or provider uptime. See [PROVIDERS.md](PROVIDERS.md).

Real-device noisy speech, sustained recording and native-speaker field review remain separate validation. Records remain browser/device-local with export, not a shared database.

---

# Historical 0.4 verification

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

| Finding                                                                                        | Resolution                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broad model quotations could contain different people's answers.                               | Validate each field's precise source quotation against the intended person's explicit reference.                                                                                  |
| Valid live output could contain a repeated count without evidence or concatenated quotations.  | Discard only unsupported unchanged counts; recover an original enclosing passage only from individually verified unique field quotations. Per-field attribution remains enforced. |
| Saying someone has no fever could replace an existing overall concern.                         | Prompt distinguishes a specific negative from an explicit overall no-concerns report; conflicting answers remain reviewable.                                                      |
| Old conversation backfill could undo newer edits.                                              | Fill only missing, unprotected values against the latest survey, original segment index and revision.                                                                             |
| Custom questions or changed member identities could invalidate a completed conversation check. | Fingerprints include the complete field schema and roster; changes during a pass leave the check incomplete and trigger a fresh pass.                                             |
| Delayed provider responses or old tabs could recreate cleared records.                         | Abort active checks, invalidate UI work and enforce an atomic workspace-generation check at storage writes.                                                                       |
| Failed captured audio could be retried after clearing entries.                                 | Explicit reset discards and aborts the recorder queue; normal stop still preserves it for retry. Stale session callbacks cannot release a new recording.                          |
| Long Malayalam step labels ran into adjacent labels on narrow phones.                          | Constrain each label to its own column, allow wrapping and check text-line bounds in all six languages.                                                                           |
| Missing prompts were hidden during checking but the heading claimed completion.                | Pending-check wording stays visible until the check completes or the worker explicitly reviews manually.                                                                          |
| Generated and migrated notes appeared in multiple places.                                      | Consolidate the editable content in household notes; preserve original source/history internally.                                                                                 |
| Indic text can exceed byte limits despite meeting the character limit.                         | Separate a 256,000-byte request limit from the 16,000 target-character cap, preserve exact passages and split larger batches.                                                     |

## Verification evidence

Final verification passed: **206 tests across 13 files**, TypeScript, production build and **10 browser journeys** in [run 43424538682](https://github.com/SanskariXD/DARA/actions/runs/43424538682). Exact deployment identity is recorded in [RELEASE.md](RELEASE.md). Live synthetic provider outcomes and source documentation are in [PROVIDERS.md](PROVIDERS.md). Deterministic browser tests mock paid providers; only separately documented provider probes make real calls.

## Remaining validation

Records remain in this browser/device's IndexedDB with JSON export, not a shared cloud database. The private access code protects paid APIs; it is not individual worker identity or encryption of local records. No claim of official questionnaire approval or clinical accuracy is made. Real human speech in noisy environments, long sessions on lower-end phones, and review of the five translated interfaces by native-speaking ASHA workers remain field-validation work. Synthetic probes establish specific working cases, not an accuracy percentage.

Earlier release evidence remains in Git history.
