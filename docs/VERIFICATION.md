# DARA 0.2 verification

Checked 13 November 2026. All test records and provider smoke inputs are synthetic.

## Scope

- Versioned blank surveys, automatic member creation, explicit identity attribution, custom questions, notes, evidence, active/manual field protection, safe count reductions, review and immutable completion.
- IndexedDB persistence, ordered revisions, stale writes, recovery export, and completed history. The new workspace starts empty and does not load the old synthetic fixture database.
- Signed private workspace sessions, same-origin requests, bounded input, exact WAV validation, provider schema/evidence validation, sanitized failures and server-only secrets.
- Recorder segmentation, overlapping ordered speech/extraction queues, batch caps, pressure-triggered pauses, retries, stop/drain and cancellation.
- Browser journeys: manual completion and blank repeat; phone/tablet layouts; reload/offline; delayed extraction/manual protection/count reduction; microphone denial.

## Findings resolved during independent review

| Finding | Resolution |
| --- | --- |
| Late extraction could apply a slot to a changed member layout. | Stable member IDs, revision/topology guard, and review of uncertain slot-only proposals. |
| Different name proposed for an already named slot. | Preserve the existing member and put the proposed attribution into review. |
| Recording navigation could attach late text to the wrong survey. | Bind recorder callback to its original survey; drain before navigation and keep the latest per-survey snapshot. |
| Completion could race pending recording. | Drain speech/extraction before review completion; block edits/navigation during completion. |
| Repeated start, pause/resume and late resume failures could corrupt capture state. | Explicit startup/resume locks, capture generations and runtime checks. |
| Slow providers could cause an unbounded processing backlog. | Separate ordered stages overlap STT/extraction, coalesce pending work within caps and pause capture while preserving queued speech. |
| Transcript storage failure could cause retry duplication. | Retain the original cached segment, resolve ingestion once, and offer an explicit recovery export before reload. |
| Model schema accepted locally but rejected by the live provider. | Compact wire schema verified with the real Gemini API; converted and validated against the full application contract. |

## Provider evidence

See [PROVIDERS.md](PROVIDERS.md) for official contracts and exact synthetic checks. Real spoken audio passed through Gnani, Gemini and the survey engine to create three people with matching ages and relationships. One name spelling differed in transcription and was retained for review. This establishes connectivity and one example, not multilingual field accuracy or latency percentiles.

## Release checks

The final test counts, GitHub Actions run and production deployment are recorded in [RELEASE.md](RELEASE.md) after verification completes. The production dependency audit currently reports zero known vulnerabilities.

## Limits

This is a working private workspace with real provider calls and device-local records. The shared access code is not individual worker identity or household authorization; it does not encrypt IndexedDB or JSON exports. There is no shared cloud backup. The interface is English, with English/Kannada/Hindi speech-language choices. Field validation with human speech, noisy environments, long sessions and low-end devices remains necessary. No diagnosis, official questionnaire approval, or clinical accuracy claim is made.

The earlier 0.1 release and its test evidence remain available in repository history at commit `4318178e6c751b162ea7050fdf6ea5410662efee`.
