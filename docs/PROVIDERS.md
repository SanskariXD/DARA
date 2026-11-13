# Live provider connections

Verified on 13 November 2026. The server connects to Gnani for speech recognition and Google Gemini for structured extraction. No provider key is returned to the browser. Survey records remain on this device; these connections do not add cloud record storage or individual staff accounts.

## Configuration

Set server environment variables `GNANI_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `DARA_ACCESS_CODE`, and `DARA_SESSION_SECRET`. The verified default model is `gemini-3.5-flash-lite`. Use the ignored local environment file for development and the hosting provider's encrypted environment settings for deployment. Never prefix keys with `NEXT_PUBLIC_`.

`GET /api/health` reports whether values are configured, with `configurationOnly: true`. It does not consume paid requests and does not claim a configured credential is valid. Rotate the session secret to invalidate every signed workspace session. A workspace access code is a shared access gate, not individual staff identity or role-based authorization.

## Speech contract

The browser calls `POST /api/speech/transcribe` with multipart fields `audio_file` and `language` (`en`, `kn`, or `hi`). The server accepts one complete mono, 16-bit PCM WAV at 16 kHz, between 0.1 and 30 seconds, and rejects malformed headers, unsupported encoding, extra fields, and uploads over 1 MiB. It returns `{ text, language }`.

The adapter calls `https://api.vachana.ai/stt/v3` with `X-API-Key-ID`, explicitly selects `prisma-v3.0`, and sends `audio_file`, `language_code` (`en-IN`, `kn-IN`, or `hi-IN`), and `format=transcribe`. The documented REST limit is 30 seconds. DARA uses complete WAV utterances rather than incomplete browser container fragments. This is segmented REST transcription, not Gnani WebSocket streaming. Canonical documentation: [Gnani Speech-to-Text REST](https://docs.gnani.ai/api/STT/speech-to-text).

## Extraction contract

The UI uses `extractSurvey(survey, segment)` from `src/lib/survey-extraction-client.ts`. It sends `{ survey, segment }` to `POST /api/extract`. The snapshot contains current fields, members, answer ownership, the source passage and up to six previous passages. It omits the growing audit, review conflicts, and notes. Request bodies are limited to 50,000 bytes; the server's model context is separately capped at 48,000 characters. Completed surveys, mismatched source passages, duplicate processed passages and unknown JSON properties are rejected before provider work.

The adapter uses `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `x-goog-api-key`, JSON response MIME type and a compact response JSON schema. For the verified 3.5 Flash-Lite model, `thinkingConfig.thinkingLevel` is explicitly `MINIMAL`; Google documents that this is already its default. This setting does not promise a particular response time. Other model overrides retain their own defaults.

The wire response uses sparse field arrays with field IDs, string values and exact source evidence. A large direct translation of the application Zod schema was rejected by the real API; the compact schema passed live tests. The server converts number fields, rejects unknown fields/member IDs, verifies evidence against the current passage, then checks the full application extraction schema. It returns `{ surveyId, segmentId, segmentIndex, baseRevision, result }`. The deterministic client engine applies proposals to the latest survey, protects manual answers, resolves identity conservatively, and retains conflicts for review. Model output never directly replaces a record.

Primary references: [Gemini model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [generateContent reference](https://ai.google.dev/api/generate-content), [thinking configuration](https://ai.google.dev/gemini-api/docs/thinking).

## Access and failure handling

Both paid routes require a signed workspace session and a same-origin request before reading bodies or calling providers. The session cookie is HttpOnly and SameSite Strict. Login and provider routes have per-instance rate limits; these are not a distributed billing quota. Enforce provider-side budgets and use a distributed limiter before opening the service to many workers.

Upstream requests have 25-second deadlines, no automatic retry, fixed hosts, no redirects and no caching. Responses are capped at 128 KiB. HTTP errors, incomplete responses, unsupported model fields and invalid evidence fail closed with a generic actionable message. Upstream response bodies and credentials are not reflected or logged. Existing records remain untouched when extraction fails. The browser has a 35-second extraction deadline. Transcript errors remain visible and editable; evidence validation cannot prove speech recognition or clinical correctness.

## Verification evidence

All live requests used invented people and synthetic audio; no patient record was used. Credentials were read directly from the ignored environment file and were never included in test output.

| Check                                                          | Observed result                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real Gemini authentication and minimal JSON request            | HTTP 200                                                                                                                                                                                                           |
| Real Gnani authentication with a one-second silent WAV         | HTTP 200, successful transcript response                                                                                                                                                                           |
| Three-person text → structured response → deterministic engine | Family size 3; Anjali 28, Ravi 32 (husband), Meera 5 (daughter); zero uncertainties                                                                                                                                |
| Synthetic spoken WAV → Gnani → Gemini → engine                 | Three members and correct ages/relations; STT spelled Meera as Mira, which was preserved for human review                                                                                                          |
| API boundary suite                                             | 19 tests passed: authentication, same-origin, strict input, body caps, WAV validation, provider errors, evidence and field validation, secret handling, signed-session expiry/tampering and logout cookie clearing |

The spoken test used an 8.48-second, 16 kHz mono WAV generated with Gnani Timbre solely as test input. Speech recognition took 8.285 seconds and extraction took 9.644 seconds in the development environment. Four other extraction samples took 8.305, 9.461, 1.133 and 10.320 seconds with small inputs. These are individual observations, not a percentile, cold-start diagnosis, mobile benchmark or sustained throughput guarantee. They justify bounded recording queues and visible processing state. Deployment latency must be measured separately.

The account model list included Gemini 2.5 Flash-Lite, but an actual inference request returned HTTP 404; it was not adopted. Google currently [limits 2.5 Flash-Lite access to prior active users](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite). Listing a model alone is insufficient evidence of inference access.

Noisy field audio, Kannada/Hindi recognition quality, long multi-person sessions, and human-recorded mobile microphones still require field validation. Manual review remains part of completing every survey. Synthetic audio generation followed the official [Gnani TTS reference](https://docs.gnani.ai/api/TTS/tts-inference); TTS is not exposed as an application endpoint.
