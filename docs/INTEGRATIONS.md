# Integrations in DARA 0.3

DARA connects browser recording to Gnani speech recognition and sends transcript passages with relevant survey context to Google Gemini for suggested answers. A deterministic engine checks and applies those suggestions. Households, survey drafts, transcripts and completed records are stored in IndexedDB on the current device. There is no cloud record database, automatic backup or cross-device synchronization.

Detailed provider protocols, limits and observed synthetic test results are in [PROVIDERS.md](./PROVIDERS.md).

## Available routes

| Route                         | Behavior                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`             | Reports version and configuration presence; `configurationOnly: true` distinguishes this from a live provider check. No paid request is made. |
| `GET /api/auth/session`       | Reports whether the browser has a valid workspace session.                                                                                    |
| `POST /api/auth/session`      | Checks the private workspace access code and sets a signed session cookie.                                                                    |
| `DELETE /api/auth/session`    | Clears the browser's session cookie. It does not erase local records.                                                                         |
| `POST /api/speech/transcribe` | Requires a valid session, validates bounded PCM WAV audio, sends it to Gnani, and returns transcript text and language.                       |
| `POST /api/extract`           | Requires a valid session, validates a bounded survey snapshot and source passage, calls Gemini, and returns a validated extraction envelope.  |

`POST /api/reconcile` uses the same private session and provider boundary as extraction. It reviews up to twelve original passages per request, with a 16,000-character target limit and a 256,000-byte JSON limit. The client covers the full saved conversation in newest-first batches and the engine applies only missing, unprotected answers. Failed or partial checks are shown explicitly before completion.

Provider failures return actionable errors without revealing upstream bodies or keys. Existing answers remain intact. There is no sample-data substitution for failed live requests. The application exposes no speech playback, WebSocket relay or cloud synchronization endpoint.

## Access and keys

The workspace uses a shared private access code. It does not provide individual staff accounts, household assignments, roles or server-side record authorization. The signed cookie expires after eight hours and is HttpOnly, SameSite Strict, and Secure over HTTPS. Paid routes check the session and request origin before processing uploads. Login attempts and paid requests have per-instance rate limits; these are not a distributed spending quota.

The code gate protects the provider routes. It does not encrypt IndexedDB, create separate local records for each worker, or protect saved records from another person using the same unlocked browser profile. Logging out removes the session cookie but leaves records on the device. Rotate the signing secret to invalidate all outstanding signed sessions.

| Environment variable  | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `GNANI_API_KEY`       | Server credential for Gnani speech recognition           |
| `GEMINI_API_KEY`      | Server credential for Gemini extraction                  |
| `GEMINI_MODEL`        | Verified model: `gemini-3.5-flash-lite`                  |
| `DARA_ACCESS_CODE`    | Shared private workspace code                            |
| `DARA_SESSION_SECRET` | Independent random secret for signing workspace sessions |

Copy the committed `.env.example` template to `.env.local` for development. Set deployed values through Vercel Environment Variables. Local environment files are ignored by Git. Never commit real values or give provider keys a `NEXT_PUBLIC_` prefix. The browser receives neither provider keys nor the session signing secret.

## Data flow and permission

1. Before recording, the interface explains that audio and conversation text go to connected services. The worker confirms that the family agreed, then the browser requests microphone permission. This confirmation is kept for the current survey in memory; it is not a durable consent register.
2. The AudioWorklet captures microphone audio. The recorder creates complete mono 16 kHz PCM WAV clips. Separate ordered stages send audio to speech recognition and process returned transcript text; bounded queues can pause capture when earlier work falls behind. Pending audio is memory-only and can be lost if the page closes.
3. The server forwards each accepted clip and selected language to Gnani. Transcription supports English, Kannada and Hindi. This implementation uses segmented REST requests rather than continuous WebSocket transcription.
4. Transcript passages are added to the local survey. The extraction request includes the current template, current household/member answers and their ownership metadata, the source passage, and up to six earlier passages. Gemini sees this bounded context to identify fields and people. Pasting conversation text and requesting extraction also sends text and context to Gemini.
5. The server checks structured output, allowed fields, member references and exact evidence. The client engine applies it to the latest survey, protects manual edits, and keeps conflicting or uncertain proposals for review. Completed surveys remain read-only; subsequent work uses a new survey.

Explain both third-party processing and device-local storage before collecting household information. Browser microphone permission is not permission to disclose a family's information to providers. The recording checkbox records the worker's acknowledgement only; it does not establish a complete consent or organizational data-handling policy. Provider retention, processing terms, account settings and any required agreements must be reviewed by the workspace owner. DARA does not control or claim to delete provider-side data.

## Local records and offline behavior

IndexedDB stores households, drafts, completed surveys, transcripts, review information, audit entries and settings. Writes use transactions and revision checks to detect stale updates from another tab. Storage errors are surfaced instead of silently replacing unreadable data. No application-level encryption is implemented for these records or exported JSON files.

The service worker caches the application shell, not API responses or records. After the shell has loaded successfully, manual editing of locally available records can continue offline. Gnani and Gemini require a network connection. Transcript passages already saved in a draft remain available for review; raw audio is not durably saved for later upload.

Exports are downloaded copies of local data, not an automatic cloud backup. Keep exported files according to the same access and retention policy as the records themselves. Clearing browser site data, deleting a browser profile or losing the device can remove the only saved copy. Deleting a household removes its local surveys; it does not remove previous downloads or copies held by external services.

## Verification boundary

Live credentials and the speech-to-form path were exercised using invented people and synthetic audio. API, engine and storage tests cover validation, evidence, manual edit protection, access checks and local persistence behavior. These checks do not establish medical accuracy, noisy-field recognition quality, multilingual field performance, a sustained throughput target or suitability for shared-device patient deployments. Review every completed survey. Individual identity, household access policies, encrypted record storage and remote backup remain separate future capabilities.

## Interface language and examples

English, Kannada, Hindi, Telugu, Tamil and Malayalam interface dictionaries ship with the application and work offline. Changing the interface language does not change speech recognition: recording requests automatic Indic/English detection. Transcripts, names, health histories and custom field labels retain their original text.

Five fictional example households are seeded once without replacing existing records. A confirmed reset removes personal households/visits and restores those examples, preserving preferences. IndexedDB transactions and workspace-generation checks reject queued writes from a pre-reset tab or provider response. This reset is local to the current device.
