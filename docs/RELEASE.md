# DARA 0.5 release

Released 13 November 2026.

- App: https://dara-sigma.vercel.app/
- Repository: https://github.com/SanskariXD/DARA
- Verified implementation commit: `f2371915c853cef339d65f5388af5fe1ab418bdf`.
- Production runtime deployment: `dpl_Agt7zh7SssDeCCwo74sQhtXyqGKH`, READY.
- Deployment URL: https://dara-hlj1y3i05-sanskaris-projects.vercel.app/
- Deployment method: Git integration from main, Next.js on Node 24.
- CI: https://github.com/SanskariXD/DARA/actions/runs/43461711999

## Changes

- Kept the explicitly introduced respondent separate from the family member currently being discussed. Ajay's first-person age, fever and breathing difficulty remain with Ajay after discussing Anisha; a new person's explicit introduction can correctly switch the speaker.
- Added evidence-backed recovery of incorrect machine-owned answers, with exact previous-value, source, revision and identity guards. Manual edits, focused fields and newer corrections remain protected. Identical wrong-person machine copies can be removed with audit history.
- Applied manual edits, live extraction and background checks through one latest-draft mutation path and ordered save queue. Genuine other-tab/reset conflicts remain protected. Completion checks for changes after the save queue drains and asks for review again when needed.
- Ran bounded conversation recovery during intake as well as review, preserving original speaker/topic anchors and retrying transient failures automatically. Resolved prompts disappear; ordinary notes are reviewed with the normal visit checkbox.
- Reused household identity and contact for New survey and Monsoon visits, with explicit confirmation of current family members and fresh health/notes.
- Offered Pregnancy follow-up only from confirmed pregnancy/postnatal history. Prior care is labelled, new counselling checks start empty, and confirmed pregnancy gets an editable next-visit suggestion 14 days after this visit. Manually selected or cleared dates are preserved.
- Added six-language copy for the follow-up and review changes while preserving original names, notes and source quotes.

## Verification

TypeScript, all **322 unit/API/domain/storage/integration tests**, the production build and **all 10 Chromium journeys** passed on the implementation commit above. Browser coverage includes the exact Ajay/Anisha conversation, fresh English and Kannada speaker introductions, protected focus/position, concurrent extraction/recheck/manual saves, immutable history, pregnancy and Monsoon follow-ups, all six languages, offline editing, reset isolation and automatic retry/final review. Phone/tablet checks cover 360, 390 and 768 pixels. Pregnancy, rainy-season, language and final-review screenshots were inspected; screenshots are not committed.

Eight bounded real Gemini requests produced four upstream 503 responses and four HTTP 200 responses. One response was safely rejected for invented member IDs. Successful English/Kannada introductions and a Kannada machine-repair response were replayed through the final decoder and repository save/reload; all 14 repair checks passed. This round does not claim successful live English health extraction or sustained provider availability. Details: [PROVIDERS.md](PROVIDERS.md).

Hosted checks confirmed version 0.5.0, homepage/assets/manifest/audio worklet HTTP 200, unauthenticated paid-route rejection (401), workspace unlock/session/logout and a Secure session cookie. The production dependency audit reports zero known vulnerabilities. Configured secrets are absent from published source and built client assets.

## Boundaries

Records remain in this browser/device's IndexedDB with export. This release does not add a shared database or individual worker accounts. Manual review is still required. Human-recorded noisy speech, sustained recording on target phones and native-speaker field validation remain outstanding. The 14-day date is an editable recordkeeping suggestion, not an individual clinical recommendation. Care-field scope is documented in [CARE-WORKFLOWS.md](CARE-WORKFLOWS.md).

Documentation-only commits after the verified implementation do not change the tested runtime source.
