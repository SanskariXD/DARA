# DARA

**Digital Assisted Recordkeeping for ASHA Workers**

[Open DARA](https://dara-sigma.vercel.app/) · [Build checks](https://github.com/SanskariXD/DARA/actions)

DARA is an installable household register with fresh family-health surveys, editable template fields, voice transcription, and evidence-backed form updates. The introduction uses an airy blue layout; the workspace uses lavender surfaces, rounded forms, clear survey steps and bottom sheets.

## Use the workspace

1. Open the workspace using the private access code supplied by its owner.
2. Open one of five clearly marked fictional examples, or add your own household. Start a fresh family-health or pregnancy survey; new visits begin blank.
3. Enter the family size, or record the conversation. A stated count creates that many blank member sections automatically. Add a member or a custom household/member field manually when necessary.
4. DARA sends short WAV speech segments to Gnani, then finalized text to Gemini for structured field proposals. Names, ages, relationships and other answers go to the corresponding member when supported by the conversation. Symptoms, existing conditions and operations stay together in the person’s health history. Extra household information goes into one household note.
5. Manual edits stay protected. Health cards expand for reported concerns; an unasked health question remains “Not discussed”. A background check searches earlier conversation passages for missed answers before final review. Check uncertain attribution, competing suggestions and required answers before completing the visit.
6. A repeat survey starts blank and preserves the earlier completed record. Settings offers a backup export and a confirmed reset that removes personal entries and restores the five original examples.

The **Conversation** sheet shows the original text. Text can also be entered manually and submitted to the same extraction path, or retried after a connection failure.

## What is connected

- Gnani Vach REST STT, Prisma v3.0: 16 kHz mono PCM WAV and automatic Indic/English language detection, including mixed-language speech.
- Locally bundled interface translations: English, Kannada, Hindi, Telugu, Tamil and Malayalam. The interface language does not restrict speech.
- Gemini structured extraction with a validated schema, field allowlists, explicit person references and verbatim transcript evidence. Separate fill-only conversation reconciliation checks earlier passages without changing manual edits or newer answers.
- Private workspace access through a signed HttpOnly cookie. Provider credentials remain on the server.
- IndexedDB draft/history storage on the current device and browser origin; offline manual entry and an installable PWA shell.

Records are not automatically backed up to a shared cloud database. The access code protects server API use; it is not individual worker account management or encryption of local records. Audio is captured only after microphone permission and recording consent. Browser background recording is not guaranteed; keep the app open while recording. The template is not represented as an official ASHA questionnaire or a clinical diagnosis system.

## Development

Use Node.js 22+ (deployment uses Node24):

```bash
npm ci
cp .env.example .env.local
# Set private workspace credentials and provider keys in .env.local.
npm run dev
```

```bash
npm run typecheck
npm test
npm run build
npm start
npm run test:e2e
```

CI uses its own synthetic workspace code and mocked provider responses for browser checks. It does not use production API keys. Tests never require real household information. Provider smoke checks are separately documented.

## Project documents

- [Plan and next phases](PLAN.md)
- [Family survey specification](docs/NEXT_REBUILD.md)
- [Provider contracts and verification](docs/PROVIDERS.md)
- [Five-project research](docs/RESEARCH.md)
- [Release record](docs/RELEASE.md)

## Deployment

The Vercel project is `dara` in `Sanskari's projects`. Source is deployed directly because Vercel's GitHub installation does not currently grant DARA repository access. Enable that access and connect the repository to get automatic future deployments. Real credentials belong in encrypted/sensitive environment variables; `.env.local` is ignored.

## License

MIT. Third-party dependencies retain their licenses. CHT/ODK/JSON Forms were architectural references; no AGPL application code was copied.
