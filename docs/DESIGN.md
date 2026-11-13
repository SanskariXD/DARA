# DARA interface and experience

Version 0.2 · 13 November 2026

DARA — Digital Assisted Recordkeeping for ASHA Workers.

## Direction

DARA has two connected visual environments. The public introduction is airy and blue, with a centered headline and a large CSS-rendered phone preview of a blank visit form. The working application uses a pale lavender canvas, white rounded surfaces, restrained purple actions, and progressive survey sections.

This direction follows the six supplied references: the first establishes the spacious blue introduction and prominent phone composition; the remaining references establish lavender questionnaires, white input groups, pill navigation, rounded sheets, and a calm record history. The application does not copy their medical claims, Korean copy, product imagery, or fabricated health measurements.

The working interface gives priority to the current household and question. A recording session must not move the worker's focus, advance the survey, reorder fields, or overwrite a manual answer.

## Visual system

| Role                     | Value                  | Use                                             |
| ------------------------ | ---------------------- | ----------------------------------------------- |
| Application canvas       | `#F3EFFA`              | Main workspace background                       |
| Content surface          | `#FFFFFF`              | Household cards, answers, history, review       |
| Tinted surface           | `#FAF8FE`              | Secondary controls and read-only values         |
| Primary text             | `#33294D`              | Titles and content                              |
| Secondary copy           | `#6D5B7D`              | Functional supporting text on lavender surfaces |
| Primary action           | `#9C83D9`              | Recording, continue, save, and finish buttons   |
| Primary button text      | `#2C1C49`              | Accessible dark text on purple                  |
| Purple text              | `#654B99`              | Secondary actions and selected controls         |
| Purple grouping          | `#EAE2F6`              | Selected pills and related input groups         |
| Green state              | `#346C55` on `#E7F3EC` | Completed visit labels                          |
| Amber state              | `#86541E` on `#FBEFDE` | Items needing review                            |
| Error state              | `#A02F45` on `#FBE9ED` | Validation and persistence errors               |
| Introduction blue        | `#31A9E8`              | Main introduction action                        |
| Introduction action text | `#063451`              | Dark blue text on the blue action               |

Measured WCAG luminance ratios: primary button text against purple is **4.86:1**; secondary copy against the canvas is **5.38:1**, and against the darker lavender grouping `#E9DFF4` is **4.74:1**. These are specific token measurements, not a claim that every rendered element has completed an independent accessibility audit.

Use the platform system font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. No downloaded font or Space Grotesk is used. Type hierarchy is based on size and weight, with normal body weights and restrained tracking. Working form values are 18px, supporting copy is generally 13–15px, labels are 14px, and primary actions are 15px. Small uppercase eyebrows and reduced-scale phone-preview text are decorative hierarchy rather than the place for required instructions.

Application surfaces use roughly 24–32px radii; controls use pill shapes or rounded input edges. Mobile sheets have a rounded top and a grabber. There are no AI sparkles, simulated waveforms, glowing status indicators, or decorative metric dashboards. Gradual blue atmosphere is restricted to the introduction; the form uses flat lavender and white surfaces.

The stylesheet follows the light appearance shown in the references. It includes increased-contrast, reduced-motion, reduced-transparency, and print rules. It does not currently provide a separate dark appearance.

## Responsive structure

| Width           | Behavior                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Above 1200px    | 220px persistent sidebar; main content up to 1280px; a survey can show a narrow explanatory rail                           |
| 1100–1200px     | 200px sidebar, tighter page gutters, narrower survey rail                                                                  |
| 840–1099px      | Sidebar remains; survey rail is removed; the recording toolbar uses two rows                                               |
| 620–839px       | Sidebar becomes labelled bottom pill navigation; two-column answer layouts can remain where space permits                  |
| 619px and below | Single-column answers and household cards; bottom sheets; compact section navigation; recorder above the bottom navigation |
| 370px and below | Additional gutter and control adjustments for narrow phones                                                                |

Top-level destinations are Households, Visits, and Settings. Navigation does not contain recording or save actions. On mobile the bottom navigation floats above the safe area. Recording controls occupy a separate bar above it. Visit pages reserve space for this bar, and responsive `scroll-padding` / `scroll-margin` rules account for fixed controls when a field receives focus.

The primary interaction remains the same at every width. Desktop support adds space, not different capabilities.

## Introduction and workspace access

The introduction includes real anchor links to “How it works” and “Your workspace,” an “Open workspace” action, and a CSS phone showing unanswered household questions. Its preview does not contain invented household identities, clinical measurements, or diagnostic outcomes.

Opening the workspace checks a server session. If needed, a sheet asks for the workspace access code. This protects provider-backed features; it is not represented as individual worker authentication or encryption of local records. An already opened browser session can access its device-local records while offline. Expired provider access offers an unlock action without discarding the current form.

## Household register

The register starts empty. There are no preloaded families, artificial counts, or example visit histories.

“Add household” opens a sheet with:

- Optional household name or familiar label.
- House number.
- Address.
- Optional area.

At least a name, house number, or address is required. No primary family member is required just to add a house. A provided house number is checked against existing households. When no name is entered, the house number or address supplies the visible label.

Household cards show actual saved details and actual visit status. Search matches name, house number, address, or area. The household detail view presents saved visits and actions to start a fresh visit, continue a draft, or create a blank repeat visit from a completed record.

A household without visits can be removed after confirmation. Households with visit records are protected from deletion by the repository.

## Progressive visit

The questionnaire is divided into five explicit steps:

| Step      | Contents                                                                            |
| --------- | ----------------------------------------------------------------------------------- |
| Household | Family size and household questions                                                 |
| Family    | A separate identity section for each person                                         |
| Health    | A member picker with that person's observations and measurements                    |
| Notes     | Worker notes and observations retained from the conversation                        |
| Review    | Missing information, conflicts, uncertain interpretations, and the collected record |

The worker controls step navigation. Extraction never changes the active step or active person.

Fresh and repeat surveys begin with blank answers. Repeat surveys are separate records with a reference to the earlier visit; earlier answers are not silently carried forward. Household identity remains visible above the questionnaire.

Recording family size creates blank member sections. Each member section has a stable ID and an accessible heading. Workers can add a member manually. Removing a section with answers requires confirmation. A count reduction does not silently delete answered people; the resulting mismatch is exposed during review.

Name and age are required for each family member. Other requirements come from the questionnaire, conditional fields, and questions the worker explicitly marks required. Health fields are not prefilled with assumed normal values.

## Answers and custom questions

Each answer uses a visible label, a generous input region, and a reserved feedback/source area. Input values preserve raw typing, including spaces and decimal intermediates. Phone and numeric fields use appropriate input modes. Select questions provide defined choices, including unknown/not-stated options where the schema supports them.

A manual answer becomes protected. If later conversation suggests a different value, DARA retains the worker's answer and presents the suggestion in Review. The worker can keep the manual value or accept the conversation value. An input being actively edited receives the same protection.

Source evidence is available beside extracted values. Source controls reserve space before extraction so ordinary updates do not shift later questions. Opening evidence is an explicit user action and may expand the field.

“Add a question” supports a short answer, long answer, number, or list of choices. Questions can apply to the household or each member and can be marked required. The field definition belongs to that survey and is supplied to the extraction service alongside the existing questionnaire.

## Recording and conversation

“Start recording” opens a consent sheet the first time for that visit. The sheet explains that audio is sent to the connected speech service and conversation text is sent to the connected AI service. The worker confirms that the family has agreed before microphone access is requested.

Recording controls expose Start, Pause, Resume, and Stop as applicable. The status uses text rather than an animated activity decoration. Manual form editing remains available while recording and extraction operate asynchronously.

The recorder captures its target survey ID when recording starts. Transcript callbacks read the newest state for that original survey, and delayed extraction results are committed to the same survey. Navigating away or opening another survey waits for recording to drain. This prevents an old household's final passage from entering a newly opened record.

The Conversation sheet contains the original transcript, identified as recorded speech or manually added text. Workers can add conversation text and use the same extraction endpoint. When extraction fails, the transcript remains saved, an error is shown, and the passage can be retried. A failed model update is not shown as a successfully filled form.

No diagnostic instruction or emergency severity is invented by this interface. Original reported observations and uncertainties are preserved for review.

## Review and completion

Review exposes required missing values, invalid entries, count mismatches, conflicting updates, and uncertainties as actionable items. It also presents extracted observations and the collected household/member answers.

The worker must check “I have reviewed this visit” before finishing. New survey changes invalidate that confirmation. Finishing is unavailable while recording or extraction remains pending or blocking review issues remain.

Completion locks editing while the persistence operation is pending. The UI only moves to the saved outcome after the completed record is persisted successfully. A completed survey is read-only. A new visit is created instead of reopening the completed record for silent edits.

The success screen provides “View visit,” “Back to households,” and a blank repeat-visit action.

## Persistence and failure states

Households, surveys, and preferences are saved in IndexedDB in the current browser. The UI says “Saved on this device” only after the corresponding write succeeds. It does not claim cloud synchronization or shared storage.

- Offline status explains that saved records can still be edited. Provider-backed recording requires a connection.
- Persistence errors remain visible. Current in-memory edits are retained and export remains the recovery path.
- Conflicting writes from another browser tab are rejected instead of silently replacing a newer record.
- Export downloads household and survey data as a backup.
- Settings explain local storage, browser-data removal, and the need to keep backups.
- Installation is user initiated, with browser/platform instructions when an install prompt is unavailable.

## Verification expectations

Meaningful browser checks cover an empty register; adding a household without pre-entered members; automatic creation of three member sections; raw name and decimal entry; required custom questions; manual-answer protection; review and completion; blank repeat visits; persisted drafts after reload; offline reopening; microphone-denied feedback; and responsive layouts at phone/tablet widths.

Additional release inspection should check screenshot composition, keyboard focus above fixed controls, wrapping of long names and addresses, visible errors, and original household attribution for delayed speech/extraction. Device microphone behavior and speech accuracy must be evaluated on the intended phones and languages; a browser UI pass alone does not establish those qualities.

## Source principles and limits

The implementation applies the previously reviewed Apple Human Interface Guidelines principles for hierarchy, adaptable layout, labelled navigation, clear data entry, accessible feedback, and user control. It translates them to web semantics, system fonts, CSS, and native browser inputs rather than imitating native Apple components or branding.

The exact palette, layout, radius, copy, phone composition, and survey sequence are DARA design decisions derived from the supplied references. This document describes the current implementation and its intended verification, not a claim of Apple certification or clinical validation.
