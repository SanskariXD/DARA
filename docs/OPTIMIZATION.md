# DARA 0.3 performance and interaction review

Checked 13 November 2026. Provider observations are individual synthetic requests, not latency percentiles or field benchmarks.

## Current design

- Browser audio uses two ordered, overlapping stages for transcription and extraction. Queues are bounded, pending clips/text can be coalesced, and recording pauses under sustained backlog instead of silently dropping speech. Detected speech language travels with the transcript; mixed batches use automatic detection.
- Live extraction and missing-answer reconciliation can run concurrently. Each survey has at most one background reconciliation job; automatic starts are debounced and throttled to twenty seconds. Final review explicitly waits for a complete check.
- Reconciliation covers every original passage in newest-first batches of at most twelve passages and 16,000 target characters. The request has a separate 256,000-byte limit for UTF-8 Indic text. Optional earlier context is dropped before intact target passages; oversized batches split without truncating evidence.
- Conversation fingerprints reuse cached hashes for immutable transcript objects. Changing a question, member identity, source text or reset generation invalidates a completed check. A second pass occurs only when the first pass recovers roster details that can clarify later references.
- Data changes use the current survey snapshot, ordered revisions and transactional IndexedDB writes. Network requests stay outside storage transactions. Reset uses a generation barrier rather than trying to cancel database work unsafely.
- Six local dictionaries use React render-time lookup. There is no translation API or DOM text-replacement observer. System fonts and existing CSS keep interface updates offline and preserve user-entered content.
- Current visual design is retained. Long member headings truncate visually without changing accessible names, and workspace focus scrolling is immediate to keep incoming answers from shifting active fields.

## Verification and measurement

The bounded queues, complete batching, mutation protection, reset races and locale content preservation have deterministic tests; browser journeys check mobile overflow, focus stability and full flows. See [VERIFICATION.md](VERIFICATION.md) and [RELEASE.md](RELEASE.md) for exact final results.

Real synthetic provider observations are in [PROVIDERS.md](PROVIDERS.md). The final Kannada extraction, Hindi correction and reconciliation requests took 10.513, 10.063 and 5.313 seconds in the development workspace. The Gnani automatic-detection request took 10.261 seconds. These figures do not establish production p50/p95 or mobile end-to-end latency.

A complete target-device session remains the next performance measurement: record end-of-speech to accepted field update under actual connectivity, including longer conversations and backgrounding behavior. No review evidence or durable user answer is discarded to make the interface appear faster.
