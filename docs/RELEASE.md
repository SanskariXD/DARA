# DARA 0.2 release

Released 13 November 2026.

- Public app: https://dara-sigma.vercel.app/
- Repository: https://github.com/SanskariXD/DARA
- Tested and deployed implementation: `bc5ed0cbea0357000ba8e39d50a73a2c760412ac`
- [Passing GitHub Actions run 43384196699](https://github.com/SanskariXD/DARA/actions/runs/43384196699)
- Vercel project: `dara` (`prj_jTIgFE5HlXN7bEAZQaKwoVOem81F`)
- Production deployment: `dpl_F3rvwbKT2FeCN8Jyph4k5GT4gEm6`
- Deployment URL: https://dara-rocjpay0a-sanskaris-projects.vercel.app/
- Node 24, Next.js 16.4.6, Mumbai functions; direct source deployment.

## Delivered

Blue introduction and lavender workspace based on the supplied visual references; phone/tablet/desktop layouts; empty household register; fresh and repeated blank family-health surveys; automatic member sections from an explicit family count; names/ages/relationships with evidence and conservative attribution; custom fields and relevant notes; manual/focused-edit protection; review and immutable completed history; local drafts, recovery export and offline manual entry.

Real Gnani speech transcription and Gemini structured extraction are active. Browser audio uses bounded complete WAV segments. Two ordered processing stages overlap speech and extraction, coalesce pending work and pause capture on backlog. Errors preserve captured work where possible, and incomplete audio-flush acknowledgements explicitly warn that the last words need checking.

## Verification

All **135 automated tests across eight files**, TypeScript, the production build and **five Chromium journeys** passed. Browser journeys cover manual/custom-field completion and blank repeat, responsive layouts at 360/390/768 px, offline draft recovery, automatic three-member creation/manual and focused protection, and microphone denial. Strict focus position and scroll assertions remain enabled.

The first rebuild browser run passed three scenarios and found a custom-select test locator mismatch and a 236 px focus-scroll movement. The locator now matches the actual accessible combobox name; smooth scrolling is restricted to the public introduction, so workspace focus settles immediately. The complete next run passed.

The public production page was inspected visually. Hosted authentication issued a Secure signed cookie, real extraction returned three synthetic members, the live speech endpoint returned a valid transcript response, and logout cleared the session. Earlier synthetic spoken-audio end-to-end evidence is recorded in [PROVIDERS.md](PROVIDERS.md). Source and built browser assets passed scans against the actual configured credentials. The production dependency audit reported zero known vulnerabilities.

Representative screenshots: [Introduction](rebuild-intro.jpg), [empty mobile register](rebuild-households.png), [mobile family form](rebuild-family.png). Names in verification screenshots are test-only records; the deployed workspace starts empty.

The documentation/evidence commit following this implementation changes no runtime code.

## Current limits

Records remain in the current browser/device’s IndexedDB, with JSON export; no shared cloud backup or application-level record encryption is configured. The shared private access code protects paid provider calls, not individual worker identity or household permissions. Credentials are server-only sensitive environment variables and are absent from Git. The private workspace code is delivered separately to the owner.

The questionnaire is not represented as an approved government form. The interface is English with English/Kannada/Hindi speech choices. Noisy human speech, long mobile sessions, multilingual accuracy and clinical/program validation require field testing. Review remains required before completion.

Vercel’s GitHub installation still lacks access to this repository. Direct deployment is complete; automatic future Git deployments require granting that installation repository access and connecting it to the existing project.
