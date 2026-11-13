# Release record

DARA 0.1.0 — 13 November 2026 (India).

- Public app: https://dara-sigma.vercel.app/
- Repository: https://github.com/SanskariXD/DARA
- Deployed implementation: `043b07e9770e3252e1f01eacaa4a082a29147ff8`
- Verification: [GitHub Actions run 43318473529](https://github.com/SanskariXD/DARA/actions/runs/43318473529)
- Vercel team: `Sanskari's projects` (`sanskaris-projects`)
- Vercel project: `dara` (`prj_jTIgFE5HlXN7bEAZQaKwoVOem81F`)
- Production deployment: `dpl_Hbe7X3f2ZDsqWdJs78j9MNgGE1AB`
- Deployment URL: https://dara-e8mzvrvu7-sanskaris-projects.vercel.app/
- Deployment method: direct source upload, Node.js 24, Next.js 16.4.6, functions in Mumbai (`bom1`).
- External services: intentionally unconfigured; synthetic demo and manual records only.
- Automatic Git deployments: pending Vercel GitHub installation access for this repository.

## Verification

60 unit, API, persistence and independent regression tests passed. All five Chromium workflows passed, including manual entry/completion/history, asynchronous sample updates with manual protection and correct member attribution, mobile household creation, offline reload and browser Back. Type checking and production build passed. The production dependency audit reported zero known vulnerabilities at this checkpoint.

Hosted browser checks additionally exercised invalid-phone blocking, sequential decimal entry, source evidence, reviewed conflict resolution, completed read-only records after reload, new household entry, saved preferences and explicit unconfigured recording. The active field position, focus and caret remained stable during sample updates.

Any subsequent documentation, screenshot and responsive-test commit does not change the runtime application deployed above. The expanded responsive checks cover 360px, 390px and 768px; their final result is available in the repository's Actions history.

## Intentional limits

Live speech, external LLM extraction, real sign-in, shared database, cloud synchronization and clinical audio rules remain explicit placeholders. `.env.example` has blank configuration values; `.env.local` is ignored. Filling keys alone does not activate unfinished adapters. Read `docs/INTEGRATIONS.md` before that next phase.

Records are local to a browser origin/device; JSON export is available. This release is for synthetic demonstration, not real patient information. The interface is English; language preferences prepare future speech integration and do not claim translated questionnaires.

## Automatic deployment setup

Vercel rejected the repository link because its GitHub installation cannot access DARA. The authorized direct source deployment completed the release without that dependency. To enable future automatic builds, grant DARA access in the Vercel GitHub installation and connect this repository to the existing `dara` project. No access token or provider key was committed.
