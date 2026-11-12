# DARA — product and interface specification

Digital Assisted Recordkeeping for ASHA Workers.

## Design thesis

A calm household register that keeps the worker's attention on the family. The defining interaction is a form whose values quietly become complete while its layout, focus, and the worker's own edits remain stable. The interface should feel as carefully resolved as a system application, without imitating Apple branding or adding visual AI conventions.

This is a web/PWA design for Android, iOS, tablets, and desktop. Apple's principles inform legibility, hierarchy, control, grouping, and feedback; native iOS-only conventions are translated to semantic HTML, CSS tokens, ARIA, and browser navigation.

## Visual system

Use a system font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Do not download SF Pro or any web font. No Space Grotesk, decorative display face, thin text, gradients, neon, glowing outlines, AI sparkles, animated dots, waveforms, or decorative charts.

| Role | Light | Dark | Contrast on content surface (light / dark) |
| --- | --- | --- | --- |
| Canvas | `#F5F7FA` | `#12171E` | — |
| Content surface | `#FFFFFF` | `#1B212A` | — |
| Primary text | `#1D2532` | `#F4F6F9` | 15.41 / 14.95 |
| Secondary text | `#5D6778` | `#AAB4C2` | 5.71 / 7.72 |
| Action blue | `#175CD3` | `#8AB4FF` | 5.99 / 7.75 |
| Follow-up amber | `#8B5107` | `#E7B76D` | 6.41 / 8.78 |
| Confirmed green | `#23664E` | `#7AC9A9` | 6.81 / 8.29 |
| Error red | `#B42332` | `#FF939D` | 6.51 / 7.64 |

Contrast figures are computed WCAG luminance ratios against the content surface. Blue is interactive; amber means a review or follow-up; red means an error/urgent concern. Never communicate status with color alone. Use light tints behind concise status labels. Borders `#E3E8EF` / `#343E4A` are separators, not the sole way to identify interactive controls. Inputs receive a stronger boundary and visible focus outline.

Dark mode follows `prefers-color-scheme`; do not add a redundant appearance switch. Respect `prefers-contrast: more`, `prefers-reduced-motion`, and `prefers-reduced-transparency` with stronger separators, no animation, and solid navigation surfaces respectively.

### Type, spacing, and shape

| Token | Value and use |
| --- | --- |
| Page heading | 34px/1.15, 650 weight, -0.03em tracking; 30px compact |
| Section heading | 20px/1.3, 600 |
| Body / field value | 17px/1.5 compact, 16px/1.5 regular |
| Label / navigation | 14px/1.35, 500–600 |
| Secondary metadata | 13px/1.4, 400–500; never important instructions |
| Data | `font-variant-numeric: tabular-nums` for counts, dates, IDs |
| Spacing | 4, 8, 12, 16, 20, 24, 32, 40, 48px |
| Main content width | 1120px directory; 920px family; 1240px visit with transcript rail |
| Page gutter | 20px compact; 32–48px regular |
| Controls | Minimum 44px tap target; primary actions and inputs 48px |
| Radius | 10px inputs; 12px buttons and selected nav; 18px grouped surfaces; 24px dialogs |
| Shadow | Only dialog/floating toolbar: `0 12px 40px rgba(29,37,50,.08)` |
| Icons | One outline icon family, 20px, 1.7px stroke; label every icon-only action |

Use `rem` for text, intrinsic heights, wrapping, and max widths. No fixed-height text containers. Labels remain visible when fields contain text. Long Kannada/Hindi strings must wrap without clipping. Use the local platform font's fallback for these scripts.

## Navigation and responsive layout

The household directory is the landing destination. There is no decorative welcome dashboard or grid of large metric cards.

| Width | Layout |
| --- | --- |
| Below 760px | Four labelled bottom tabs: Households, Visits, Follow-ups, Settings. Single content column. Detail navigation has a clear Back action. Recording toolbar sits above bottom tabs with safe-area padding. |
| 760–1099px | 208px sidebar + content. Single main form column; transcript is a collapsible secondary region. |
| 1100px and above | 224px sidebar + content. Visit may add a 300px contextual rail. Main content remains readable rather than stretching inputs across the display. |

All functionality remains available across breakpoints. Use links for navigation and buttons for actions. Mobile tabs never become Record/Save buttons. Preserve the selected top-level tab during family/visit subroutes. Browser Back behaves predictably. Scrolling position is preserved when returning to a list. A subtle translucent layer is allowed only on the floating navigation/recording toolbar, never on form content.

## Screens and exact interaction intent

### 1. Entry

Small DARA wordmark, a restrained register/house symbol, title "Your visits. Clearly recorded.", and the full project expansion as supporting text. The primary button is "Open demo workspace". Explain immediately: "Explore with sample households. Your changes stay on this device." A real sign-in entry may be shown with an honest unconfigured state; never imply demo access is authenticated.

No password or OTP form that pretends to authenticate. No permission prompt on launch. Only ask microphone access when the real provider is configured and the user explicitly starts listening.

### 2. Households

Header: "Households", small locality/assignment context, and "Add household" action. One compact line can summarize total households and visits due, derived from actual state. Search is prominently labelled "Search name, house number, or area". A segmented filter gives All / Due / Follow-up. Each selection must really filter results.

Use a well-spaced register list, not unrelated floating cards. Columns on desktop: family / house and locality / members / last visit / next action. On mobile each row contains a small house-number tile, household name, locality and member count, with a clear chevron. Show a specific status ("Visit due", "Follow-up", "Draft") only when true. Avoid colorful status proliferation.

List example: Lakshmi & Ramesh · H-014 · Shanti Nagar · 4 members. Synthetic status is stated at workspace level, not on every row.

Adding a household uses a focused dialog: household name, house number, area, contact (optional). Validate inline and explain duplicates. Cancel must leave data unchanged. A newly added family is immediately searchable.

Empty search state: "No households match your search" with "Clear search". Empty filter state names that filter. No decorative illustration is needed.

### 3. Household record

Back to Households, house ID, family name, address/locality, and an explicit primary action "Start visit" or "Continue draft". A single overview surface contains the member roster. Each member has name, relationship, age (if known), and relevant existing observation, without invented medical conclusions. Below: latest visit summary and visits history. An existing follow-up appears as a compact amber note with its date and subject.

Member selection matters: make the active person obvious in the visit, and never show the wife's symptom on the husband's record. Unknown subject remains for review.

### 4. Visit form

Sticky compact header: household identity, "Draft saved" text (only after successful persistence), and "Review visit". Existing household information loads immediately. Group the questionnaire into visible sections such as Visit details, Family & contact, Health observations, and Follow-up. Keep the same section and field order throughout the visit. Do not auto-collapse sections, auto-scroll, reorder, or move focus when extraction results arrive.

All fields remain manually editable. Choice fields use native selects/radios; date inputs use native date controls; age/measurement fields use appropriate input modes and units. Notes use a textarea. Do not use placeholder text as the only label. Required fields are identified before submission. A manual edit is protected and identified by a small "Edited by you" label; a proposed competing value becomes review material rather than silently replacing it.

Recording control: a prominent, clearly labelled action with a microphone icon. In placeholder mode it is "Try sample conversation". While the fixture runs, show "Sample conversation" and Pause / Resume, not "Live". A separate concise note states that connected speech services are not active. No animated equalizer, pulsating status dot, or fake audio stream.

The demo must demonstrate multi-field extraction, correction of an earlier value, a household member's exact symptom statement, and a review concern. Transcript sentences appear in order in a secondary panel. On compact screens the panel is optional and closed initially so the form remains the main task. A "View conversation" button reveals it. Labels describe fixture behavior without leaking architecture jargon.

Routine changes update value and a short evidence label without animation. Optional evidence disclosure shows the source sentence and who/what it refers to. Reserve a fixed-height line for status so field updates do not cause layout shifts. Keep input component keys stable, and never replace an active input DOM node.

### 5. Review and finish

Title "Review visit"; derived summary "X completed · Y need attention". Show missing required values and conflicting edits as specific actionable rows with "Edit". Show original symptom wording with household member attribution. Do not convert fever duration into an emergency diagnosis. A warning is labelled "Needs follow-up" unless a reviewed danger rule warrants urgency.

Use a checkbox "I have reviewed this visit" before "Finish visit". Required invalid values and unresolved conflicts block finishing, with an explanation. Optional missing values do not block. A completed visit becomes read-only history with its completion date. "Return to form" keeps the draft. Completion confirmation is a simple check icon, "Visit saved", household identity, and actions "View visit" / "Back to households".

### 6. Visits and follow-ups

Visits: two restrained tabs Drafts / Completed, real date/grouping and household identity; open a record, resume drafts. No fabricated reports. Follow-ups: clear subject and reported concern, due date if provided, and a reversible "Mark done" action. State must persist and visibly update.

### 7. Settings

Grouped rows for workspace/demo explanation, language selection (only claim translated UI where implemented), installation instructions, data storage, and reset sample data. Provider setup belongs in a developer section or documentation; do not put API-key forms in a worker flow. Reset needs a dialog explaining which local drafts will be removed and a Cancel action. Installation prompt is user initiated and gracefully falls back to platform instructions.

## Feedback, reliability, and safety UX

- Offline: compact persistent text banner "Offline. You can continue editing on this device." Never call a draft synced when it is only locally saved.
- Storage failure: retain in-memory changes, show actionable error, never claim saved. Offer retry or export when implemented.
- Listening disconnect: keep form usable and preserve entered values. Reconnecting text is sufficient.
- Live configuration unavailable: explain before recording begins; do not request a mic then show a dead control.
- Critical audio alert is a future provider integration. Demo displays the preapproved sample alert; any audio playback is explicitly sample/user controlled. Never let app speech become a new clinical fact.
- Error and conflict messages remain until addressed, not timed disappearing toasts.
- No automatic form submission or unannounced record deletion.

## Accessibility and acceptance checks

- Labels, names, roles, state and error associations for every control; `aria-current` on navigation; form `aria-describedby` for help/errors.
- Keyboard reaches every action. Dialog traps focus, Escape closes, and focus returns to opener. Native `dialog` is preferred.
- Visible 2–3px blue focus ring with offset. Hover is supplementary; all actions work by touch.
- No horizontal overflow at 320px; verify 390px, 768px, and 1440px. Test 200% text zoom.
- Main target size 44px minimum, comfortably separated. Body 16–17px; do not hide essential facts in 11px labels.
- Colour contrast checked using actual tokens; status has text/icon as well as colour.
- Reduced motion disables optional transitions. No flashing or perpetual animation.
- Offline reload after first visit, resume draft, correction ordering, manual-edit protection, and a storage failure must be exercised.
- No console errors, misleading controls, dead primary actions, or backend terminology in the main worker journey.

## Source basis and implementation judgment

Consulted Apple HIG references: Accessibility (Vision, Mobility, Cognitive); Layout (Visual hierarchy, Adaptability); Typography (Ensuring legibility, Conveying hierarchy); Color (Best practices); Designing for iOS (Best practices); Tab bars (Best practices); Sidebars (Best practices); Entering data (Best practices); Text fields (Best practices); Lists and tables (Content, Style); Feedback (Best practices); plus cross-platform translation.

Representative source principles: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) says to group related items and preserve functionality across size changes; [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) distinguishes navigation from actions; [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) recommends integrating status near the item it describes; [Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data) favors clear labels, choices, and timely validation.

All exact palette values, dimensions, breakpoints, DARA copy, and screen arrangements above are project design decisions, not claims of mandated Apple specifications. The deliberately quiet register is the product's point of view. Removing decorative metrics, badges, and effects gives household identity and reliable data entry priority.
