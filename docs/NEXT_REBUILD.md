# Next rebuild: template-driven family health survey

This specification is implemented in DARA 0.2 alongside live speech/extraction and the reference-led interface redesign.

## Worker flow

1. The worker selects a household and chooses **Start a fresh survey** or **Repeat survey**. The new survey uses a blank answer set. It must not prefill health answers from an earlier survey. Keep only the household context needed to identify the family and select the survey.
2. DARA opens the selected version of the Family Health Survey template. The worker can add a field manually when the conversation covers information outside the default questions. The worker chooses whether it belongs to the household or each member, gives it a label and supported input type, and can make it optional or required.
3. The worker asks how many people are in the family. When the count is explicitly stated, automatically create that many empty member sections using the template’s repeatable person fields. Show the count as editable; ambiguous counts and corrections that would discard answered sections require review.
4. As the conversation continues, the speech transcript and extraction model propose values for the matching member and template field. For example, a person’s name, their relationship to the household, and their age should populate the same member section when the conversation supports that mapping.
5. Keep additional relevant information in the survey’s notes when it does not fit a template field. Include the supporting transcript passage and member attribution when clear. If the speaker or meaning is uncertain, mark it for review rather than guessing.
6. Before saving as complete, the worker reviews the family count, member identities, missing required fields, uncertain matches, conflicts, and notes. Completed surveys are read-only; a requested repeat creates a new survey linked to the same household.

## Template behavior

The template should define stable field IDs and labels, field type and validation, required versus optional status, repeatable member groups, conditional visibility rules, units, and ordering. Store the template ID and version on every survey so old completed surveys remain understandable if a template changes. Manually added fields also need stable survey-scoped IDs and validation metadata so they can be edited, saved and considered by extraction. Design the first Family Health Survey around the approved questionnaire; do not invent clinical fields or guidance.

The household count controls the number of member sections, but should not silently create guessed identities. When the count changes after answers have been entered, explain the effect and preserve captured answers for retained sections; any section that would be removed must be reviewed explicitly before removal. A section may be added manually when needed.

## Extraction and review rules

- The conversation provides proposed answers, not authority to change a completed survey.
- Every extracted value keeps the exact source segment, field, member attribution and extraction status.
- Never infer a name, age, relationship, sex, diagnosis or other answer from missing data. Mark ambiguous wording or member attribution for review.
- Focused or manually edited fields remain protected. A competing suggestion becomes a visible conflict for the worker to resolve.
- Corrections to family size must not leave hidden extra members or silently delete answered sections.
- Notes preserve relevant information that has no suitable template field, with source evidence and attribution when known.
- A repeat survey creates a new draft and does not overwrite the prior completed survey.

## Build and verification checklist

- [ ] Obtain clinical/program approval for an official ASHA questionnaire. The current template captures reported household information and is not labelled an approved government form.
- [x] Add versioned template types and a repeatable member group to the shared contract and persistence schema.
- [x] Add safe count handling, dynamic member creation, manual optional fields, and review interactions.
- [x] Include survey-scoped custom field IDs in extraction and review contracts without allowing a model to create arbitrary fields.
- [x] Extend extraction contracts to accept only known template field IDs and members in the active survey.
- [x] Test fresh and repeated blank surveys, count changes, exact member attribution, uncertain attribution, notes with evidence, conflicts, reload recovery and completed-survey immutability.
- [x] Verify keyboard, semantic labels, 360px phones, tablet and desktop layouts before production deployment. Full assistive-technology testing remains part of field validation.

