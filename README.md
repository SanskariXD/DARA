# DARA

**Digital Assisted Recordkeeping for ASHA Workers**

A mobile-first household register with a quiet interface, recoverable local drafts, evidence-backed field updates and explicit review. Built for Anjan Shetty's ASHA workflow.

> This release is a synthetic demo. Live Gnani, Gemini, authentication, database sync and clinical audio services are placeholders by request. It does not process microphone audio or call an AI provider. Do not enter real patient information.

## Use the app

**[Open DARA](https://dara-sigma.vercel.app/)** · [Verification workflow](https://github.com/SanskariXD/DARA/actions)

1. Open the demo workspace and select a household.
2. Start a visit. Existing member details are already available.
3. Edit any field, or choose **Try sample conversation** to replay predefined transcript events through the HTTP extraction boundary.
4. Watch only the affected fields change. Your manual edits are retained; competing suggestions go to review.
5. Review missing answers, conflicts and reported observations, then finish the visit.
6. Find the saved record under Visits. Drafts survive reload on the same browser/device. Export a JSON backup from Settings.

The sample demonstrates a corrected weight, member-specific fever report, pregnancy information and exact transcript evidence. It is a fixture replay, not a simulation presented as live transcription or AI. New households support manual visits; sample extraction is restricted to seeded households.

## Run locally

Requirements: Node.js 22+ (Vercel project uses Node 24), npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. No API keys are needed.

```bash
npm run typecheck
npm test
npm run build
npm start
npm run test:e2e
```

The production build generates the offline service worker after Next.js creates its assets. Test installation/offline mode against `npm start` or the deployed HTTPS app; development mode intentionally does not register a service worker.

## Architecture

- **Next.js / React / TypeScript**: one frontend and Node API deployment.
- **Shared field schema + Zod**: validate API shapes and values.
- **Immutable patch engine**: visit/member validation, evidence checks, duplicate suppression, per-field sequence order, explicit manual ownership and conflict review.
- **Dexie / IndexedDB**: queued transactional local saves and stale-write detection. No ephemeral server-memory database and no claim of cloud sync.
- **PWA**: manifest, installable icons and a versioned static app shell. API responses and household records are excluded from service-worker caching.
- **System typography / semantic CSS**: no external font download or animation framework.

The backend's sample endpoint accepts only sample household/segment identifiers. Live endpoints return `503 INTEGRATION_NOT_CONFIGURED`. Secrets remain server-side environment placeholders. See [integration activation](docs/INTEGRATIONS.md).

## Project documents

- [Phase plan and tracked TODOs](PLAN.md)
- [Five-project research and reuse decisions](docs/RESEARCH.md)
- [Product and design system](docs/DESIGN.md)
- [Shared data contract](docs/CONTRACT.md)
- [Provider integration and production requirements](docs/INTEGRATIONS.md)
- [Verification record](docs/VERIFICATION.md)
- [Optimization record](docs/OPTIMIZATION.md)
- [Release record](docs/RELEASE.md)

## Important boundaries

This is not an official ASHA questionnaire, clinical decision tool or authenticated patient-record service. Field bounds catch implausible data entry; they are not clinical normal ranges. Observation prompts preserve reports for worker review and do not diagnose or issue automated emergency instructions. The questionnaire and referral rules require local clinical review before real use.

Records remain in this browser origin, without cloud backup or application-level encryption. Clearing browser data removes them. Exporting creates a JSON file on the user's device. Demo entry is not authentication. Browser/PWA background recording is not implemented or promised.

## GitHub and Vercel

Source belongs in [SanskariXD/DARA](https://github.com/SanskariXD/DARA). The Vercel project is `dara` in `Sanskari's projects`. The connected Vercel account could not link this GitHub repository because the Vercel GitHub installation does not currently grant the required access. The public production app was deployed directly from the verified source. Enable repository access in Vercel's GitHub integration and connect DARA to get automatic future deploys. No token is stored in the repository.

## License

MIT — see [LICENSE](LICENSE). Third-party dependencies retain their own licenses. CHT/ODK/JSON Forms were architectural references; no AGPL application code was copied.
