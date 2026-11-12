# Integrations and activation

This deployment is an intentionally credential-free **synthetic demo**, as requested. No microphone audio, patient records or transcript text is sent to Gnani, Gemini, Supabase or any other third party. Browser drafts use this origin's IndexedDB. A public demo session is **not authentication**. Do not use genuine household or medical information in it.

## What runs now

- Next.js Node route handlers deployed with the frontend.
- `GET /api/health`: version and explicit capability status, no credentials.
- `POST /api/demo/extract`: whitelisted sample fixture → structured patch. It accepts only synthetic household/segment identifiers and revision metadata. User-provided transcript/patch values are rejected.
- Zod and deterministic engine validation, member matching, evidence checks, field ordering and manual edit protection.
- Browser local drafts and completion history, with review before completion.
- PWA app shell and offline manual entry. API responses and user records are never cached by the service worker.

## Placeholders

`POST /api/extract`, `/api/speech/session`, `/api/speech/tts`, `/api/auth/session`, `/api/sync` return HTTP 503 with `INTEGRATION_NOT_CONFIGURED`. They do not create fake credentials, store records in ephemeral server memory, or fall back to a paid provider. The boundary deliberately remains closed even if a key appears in the environment. Adding a key alone is not sufficient to enable an authenticated production workflow.

Copy `.env.example` to `.env.local` for local development. In Vercel, set values in Project Settings → Environment Variables. Never use `NEXT_PUBLIC_` for provider keys or service-role credentials. `.env.local`, `.env`, and `.vercel` are excluded from Git. Blank names in `.env.example` are the only committed environment template.

| Environment name | Purpose |
| --- | --- |
| `DARA_MODE` | `demo` for this release. No live mode is implemented. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Future server-side structured extraction adapter |
| `GNANI_API_KEY`, `GNANI_STT_WS_URL` | Future server-side audio relay/session |
| `GNANI_TTS_API_URL`, `GNANI_TTS_VOICE` | Future reviewed audio notices |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Future authentication and household-scoped database adapter; not provisioned |
| `DARA_CLINICAL_POLICY_VERSION` | Future clinician-reviewed alert policy version |

## Future live data path

1. Authenticate worker; authorize household and visit on the server. Establish durable visit revision/idempotency storage. Add request quotas and abuse controls before enabling paid providers.
2. Browser microphone permission is requested only on an explicit listening action. Send 16 kHz mono PCM only after verifying the current Gnani SDK contract. Keep keys on the server; never return them to the browser.
3. A WebSocket relay uses bounded audio queues, connection/session IDs and exponential reconnect. Preserve transcript sequence across reconnect and flush/stop on visit end. Verify final/interim, segment ID and timestamp behavior against an actual Gnani trace. Do not infer a speaker switch from a newline.
4. Feed finalized segments to a bounded extraction queue. The code's `buildExtractionContext` demonstrates the prompt/field/context contract, not a verified Gemini configuration. Select and benchmark an actually available model in the user's project rather than hard-coding a past recommendation.
5. Gemini returns the Zod patch shape. Parse strictly, validate evidence and member attribution, and apply to the server's authorized current visit. Client-supplied state or member IDs are not authorization. The current fixture engine uses an explicit attributed member per segment; multi-person live segments need a reviewed attribution/uncertainty contract before activation.
6. Send accepted field patches to the browser. Keep rendering and capture independent. Preserve active editing and defer competing proposals to review. Never reset the full form for a new segment.
7. Save remotely with optimistic revision checks and household access policies; reconcile local drafts explicitly. Completed visit revisions remain immutable.
8. Only reviewed, versioned clinical rules can trigger an audible alert. Preserve the family's exact report. Deduplicate alerts; suppress the app's own speech from extraction. The demo's persistent fever/difficulty observations are review prompts, not validated clinical triage.

## Deployment considerations

Vercel's current docs describe WebSockets via `upgradeWebSocket` in `@vercel/functions` 3.10.0+ with `ws`, including Next.js support. Live sessions still require reconnection when a function reaches its duration limit. The present release has no WebSocket relay because speech APIs are intentionally placeholders. Verify the account's actual function duration and region during live activation.

Sources checked 13 November 2026: [WebSockets](https://vercel.com/docs/functions/websockets), [Vercel Functions API](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package), [function duration](https://vercel.com/docs/functions/configuring-functions/duration). Use the installed Next.js version's docs in `node_modules/next/dist/docs` when changing route handlers.

## Required validation before real data

Live provider consent/data handling, real authentication/access checks, household assignment isolation, encrypted transport/storage policy, clinical protocol review, device data removal and shared-device behavior, real network interruptions, Kannada/Hindi/English extraction accuracy, low-end device recording, and measured end-of-speech p50/p95. No current demo result is a medical accuracy or live speech latency claim.
