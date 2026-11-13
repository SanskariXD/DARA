# Live provider connections — DARA 0.4

Verified on 13 November 2026. The server connects to Gnani for speech recognition and Google Gemini for structured extraction. No provider key is returned to the browser. Survey records remain on this device; these connections do not add cloud record storage or individual staff accounts.

## Configuration

Set server environment variables `GNANI_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `DARA_ACCESS_CODE`, and `DARA_SESSION_SECRET`. The verified default model is `gemini-3.5-flash-lite`. Use the ignored local environment file for development and the hosting provider's encrypted environment settings for deployment. Never prefix keys with `NEXT_PUBLIC_`.

`GET /api/health` reports whether values are configured, with `configurationOnly: true`. It does not consume paid requests and does not claim a configured credential is valid. Rotate the session secret to invalidate every signed workspace session. A workspace access code is a shared access gate, not individual staff identity or role-based authorization.

## Speech contract

The browser calls `POST /api/speech/transcribe` with one multipart `audio_file`. The optional `language` field defaults to `auto`; explicit hints `en`, `kn`, `hi`, `te`, `ta`, and `ml` remain accepted. Interface language is independent of speech detection. The server accepts a complete mono, 16-bit PCM WAV at 16 kHz, from 0.1 to 30 seconds, within a 1 MiB upload limit. Malformed headers, unsupported encoding, extra fields and provider-truncated transcripts are rejected.

The response is `{ text, language, detectedLanguageCode }`. `language` is one of the six codes or `auto` when the provider supplies no recognized tag. The raw bounded provider tag is retained separately; a language hint is never presented as an observed language.

The adapter calls `https://api.vachana.ai/stt/v3` with `X-API-Key-ID`, `model=prisma-v3.0`, `language_code=indic-auto` by default, and `format=transcribe`. It sends fixed household-visit topic and health terminology hints; these influence recognition, not form answers. WAV clips use segmented REST requests. Canonical protocol: [Gnani Speech-to-Text REST](https://docs.gnani.ai/api/STT/speech-to-text).

[Prisma v3 documentation](https://docs.gnani.ai/api/STT/models/prisma-v3) explicitly supports automatic detection and mixed-language speech across ten languages, including all six requested by DARA. `transcribe` preserves English words in Latin script and writes numbers as digits. The returned detection tag comes from the transcript script, not per-word audio labels; it can be absent for digits-only text. Auto detection is not a guarantee of recognition accuracy.

## Extraction contract

The UI uses `extractSurvey(survey, segment)` from `src/lib/survey-extraction-client.ts`. It sends `{ survey, segment }` to `POST /api/extract`. The snapshot contains current fields, members, answer ownership, the source passage and up to six previous passages. It omits the growing audit, review conflicts, and notes. Request bodies are limited to 50,000 bytes; the server's model context is separately capped at 48,000 characters. Completed surveys, mismatched source passages, duplicate processed passages and unknown JSON properties are rejected before provider work.

The adapter uses `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `x-goog-api-key`, JSON response MIME type and a compact response JSON schema. For the verified 3.5 Flash-Lite model, `thinkingConfig.thinkingLevel` is explicitly `MINIMAL`; Google documents that this is already its default. This setting does not promise a particular response time. Other model overrides retain their own defaults.

The compact wire response uses sparse field arrays with IDs, string values and individual exact source quotes. Version 2 member proposals also carry attribution proof: `{ kind, reference, evidence, segmentId }`. The server validates original quote provenance; the engine verifies identity again for each field, so a broad passage containing several names cannot justify assigning one person's answer to another.

Existing extracted values change only with explicit correction metadata matching the previous value and an exact corrective quote. Manual answers, focused fields and manually cleared blanks remain protected. `fieldEvidence` retains each quote. A repeated unchanged family count without new evidence is discarded; an unsupported changed count is rejected. If the model concatenates distant quotations, an enclosing original passage is recovered only from independently verified unique field quotes. No synthetic transcript is created.

The prompt distinguishes reported BP conditions from numeric BP measurements, specific negative symptoms from an overall report of no concerns, and reported fever from a measured temperature. Unified `healthHistory` preserves exact factual quotes; optional fever duration, temperature and breathing details use only active template fields and explicit evidence. Version 3 requires an explicit temperature unit; a bare report such as “temperature 103” remains in the original history with a request to confirm its unit. Legacy fields remain readable but are excluded from extraction destinations. These rules reduce known failure modes; they do not certify semantic accuracy.

Pregnancy and rainy-season templates use their own active fields. Reported injection counts do not imply a named vaccine or counselling. A checklist can be marked discussed only from a field-specific completed action, actual advice or genuine topic enquiry; patient mentions, meta-questions and future promises do not establish that the topic was discussed. Household notes accept factual original quotes without requiring a person assignment. The model receives the template ID and version, and the engine independently checks every proposal.

The ordinary route returns `{ surveyId, segmentId, segmentIndex, baseRevision, result }`. Model output never directly replaces a record.

## Reviewing the full conversation

`POST /api/reconcile` accepts `{ survey, segments }`: a compact survey snapshot, 1–12 exact original target segments, at most 16,000 target text characters, and at most two earlier context passages. The JSON body limit is 256,000 bytes to accommodate duplicated native-script text; model context is capped at 70,000 characters. Source IDs, indices, text and metadata must match the supplied originals. Completed surveys and fabricated or duplicated passages are rejected.

One model request inspects the batch. It must acknowledge every target ID and return original per-segment proposals. The response is `{ surveyId, baseRevision, checkedSegmentIds, envelopes }`; every envelope uses `mode: 'reconcile'`. The server removes proposals for nonblank, manually protected or newer-source values. Version 3 permits a narrow additive exception for distinct original quotes in machine-generated `healthHistory` and `householdNotes`, using the same eligibility helper as the engine. The engine repeats checks against the latest full browser record, including manually cleared blanks, corrections and audit history omitted from the compact request. Reconciliation never replaces an existing narrative or restores an older retracted fact.

The client must cover all original segments in newest-first batches and show progress or partial failure. One successful batch is not proof of a complete-history review. A second bounded pass can resolve earlier missing answers after roster identities become available. Reconciliation has the same session/origin gate, provider deadline and error handling as live extraction.

Primary references: [Gemini model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [generateContent reference](https://ai.google.dev/api/generate-content), [thinking configuration](https://ai.google.dev/gemini-api/docs/thinking).

## Access and failure handling

All three paid routes require a signed workspace session and a same-origin request before reading bodies or calling providers. The session cookie is HttpOnly and SameSite Strict. Login and provider routes have per-instance rate limits; these are not a distributed billing quota. Enforce provider-side budgets and use a distributed limiter before opening the service to many workers.

Upstream requests have 25-second deadlines, no automatic retry, fixed hosts, no redirects and no caching. Responses are capped at 128 KiB. HTTP errors, incomplete responses, unsupported model fields and invalid evidence fail closed with a generic actionable message. Upstream response bodies and credentials are not reflected or logged. Existing records remain untouched when extraction fails. The browser has a 35-second extraction deadline. Transcript errors remain visible and editable; evidence validation cannot prove speech recognition or clinical correctness.

## Verification evidence

All live requests used invented people and synthetic audio; no patient record was used. Credentials were read directly from the ignored environment file and were never included in test output.

| Check                                                          | Observed result                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real Gemini authentication and minimal JSON request            | HTTP 200                                                                                                                                                                                                           |
| Real Gnani authentication with a one-second silent WAV         | HTTP 200, successful transcript response                                                                                                                                                                           |
| Three-person text → structured response → deterministic engine | Family size 3; Anjali 28, Ravi 32 (husband), Meera 5 (daughter); zero uncertainties                                                                                                                                |
| Synthetic spoken WAV → Gnani → Gemini → engine                 | Three members and correct ages/relations; STT spelled Meera as Mira, which was preserved for human review                                                                                                          |
| API boundary suite                                             | 30 tests passed: authentication, same-origin, strict input, body caps, WAV validation, provider errors, evidence and field validation, secret handling, signed-session expiry/tampering and logout cookie clearing |

The spoken test used an 8.48-second, 16 kHz mono WAV generated with Gnani Timbre solely as test input. Speech recognition took 8.285 seconds and extraction took 9.644 seconds in the development environment. Four other extraction samples took 8.305, 9.461, 1.133 and 10.320 seconds with small inputs. These are individual observations, not a percentile, cold-start diagnosis, mobile benchmark or sustained throughput guarantee. They justify bounded recording queues and visible processing state. Deployment latency must be measured separately.

The account model list included Gemini 2.5 Flash-Lite, but an actual inference request returned HTTP 404; it was not adopted. Google currently [limits 2.5 Flash-Lite access to prior active users](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite). Listing a model alone is insufficient evidence of inference access.

Noisy field audio, Kannada/Hindi recognition quality, long multi-person sessions, and human-recorded mobile microphones still require field validation. Manual review remains part of completing every survey. Synthetic audio generation followed the official [Gnani TTS reference](https://docs.gnani.ai/api/TTS/tts-inference); TTS is not exposed as an application endpoint.

## DARA 0.3 live findings

Six Gemini requests and one Gnani autodetection request were used for the new synthetic probes. No key or patient data was printed. Initial failures were inspected and corrected, rather than counted as passes: an earlier engine build rejected valid attribution; a Hindi response repeated an unchanged count without evidence and joined separate source quotes. Offline replay verified the fixes before the last two requests.

| Probe                                    | Final observed application result                                                                                                                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gnani automatic detection                | Existing 8.48-second invented English audio returned HTTP 200, `en-IN`, a complete transcript, and no truncation.                                                                                                                                                       |
| Kannada family health                    | Ravi/father: `hypertension=yes`, `healthStatus=concerns`, exact BP quote. Sita/mother: `healthStatus=no-concerns`, exact overall no-problems quote. Meera/daughter: `healthStatus=concerns`, exact breathing-difficulty quote. No cross-person assignment.              |
| Hindi correction                         | Ravi's extracted age changed 60→62 with explicit correction proof. His hypertension and concern status stayed intact while his no-fever quote was appended. Meera's history retained the literal self-correction from two to three fever days. No invented temperature. |
| Full three-original reconciliation batch | Recovered Sita's previously missed age 58 from the earliest passage. Ravi stayed 62; all existing histories and manual values stayed unchanged. Final record had zero conflicts and zero uncertainties.                                                                 |

Final synthetic values: household size 3; Ravi (father, male), age 62, concerns, hypertension yes; Sita (mother, female), age 58, no concerns; Meera (daughter, female), age unreported, concerns. Sex values came from existing canonical relationships, not speech or names. Exact native-script histories were retained in their respective members. No unstated phone, weight, pregnancy status or temperature was filled.

The final Kannada, Hindi and reconciliation calls took 10.513, 10.063 and 5.313 seconds respectively in this workspace. Automatic transcription took 10.261 seconds. These are individual observations, not deployment or percentile benchmarks. The live Hindi probe preceded restoration of optional `feverDays`, `temperature` and `breathingDifficulty` fields in the v2 template: it verified duration in the exact history quote and a numeric age correction. The restored duration-field correction is covered separately by an offline adapter/engine contract test, not claimed as a new live measurement.

A separate hosted `/api/reconcile` smoke returned HTTP 200 for one original synthetic passage and its response applied successfully: Sita’s missing age became 58, Ravi’s corrected age stayed 62 and Meera’s unstated age stayed blank. Unauthenticated access returned 401; the HTTPS session cookie was Secure and logout succeeded. This was one additional hosted Gemini request after the six development probes.

## DARA 0.4 live findings

Five synthetic Gemini requests covered four scenarios. The first English request received an upstream non-success response (`PROVIDER_REJECTED`); its exact upstream HTTP status was not captured. A single retry returned HTTP 200. This was not a decoder failure or an automatic production retry. All four successful responses were saved, decoded again with the final compiled engine, applied and saved/reloaded through the actual repository using fake IndexedDB. Offline replay made no provider calls.

| Scenario | Final persisted result |
| --- | --- |
| English fresh introductions and household note | Family size 2; Anjali age 28 with exact fever history and `feverDays=3`; Ravi age 32, husband; original water-supply note saved. No conflicts or uncertainties. |
| Kannada husband alias and following pronoun | `ಯಜಮಾನರಿಗೆ` mapped to the known husband Ravi; `feverDays=7`; exact history retained `temperature 103`. Numeric temperature stayed blank, with an explicit unknown-unit uncertainty. Wife Anjali stayed unchanged. Original household water note saved. |
| Pregnancy facts and direct worker discussion | Five months pregnant; MCP card present; one injection with its type left unspecified; next visit “20 December” at the village PHC. MCP enquiry and nutrition advice marked discussed. Future injection discussion and the patient's appointment report did not mark their counselling checkboxes done. |
| Kannada rainy-season facts and advice | Standing water recorded with a bucket location, direct water-removal advice marked discussed, and the original blocked-drain household note saved. Future mosquito discussion and a family no-fever report did not mark counselling done. |

The real pregnancy response exposed a deterministic false negative for speaker-prefixed `ASHA:` enquiries/advice. Normalizing recognized worker labels and accepting the direct “Include…” instruction fixed both checkboxes; the same captured response then passed without another paid request. The model also incorrectly proposed antenatal counselling from a patient appointment report: the engine rejected it and retained a review uncertainty. An unassigned family-wide no-fever proposal remained for review rather than being attached to a particular member.

These are text-extraction and repository persistence checks, not proof of field speech accuracy. They did not re-test Gnani audio recognition, actual device IndexedDB, noisy Kannada recordings, or mobile microphones. Those still require human-recorded field validation and worker review.
