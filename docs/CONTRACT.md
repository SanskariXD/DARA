# Shared implementation contract

Project root: `/workspace/scratch/ceac26c17669/DARA`.
Next.js App Router, React 19, TypeScript, CSS, Lucide icons, Zod, Dexie, React Hook Form.

## Domain types (`src/lib/types.ts`)
- `FieldId`: `name | age | phone | pregnancyStatus | pregnancyWeeks | temperature | feverDays | breathingDifficulty | systolic | diastolic | weight | symptoms | notes`.
- `FieldValue`: string | number | boolean | null.
- `Member`: `{ id, name, relation, age, sex: 'female'|'male'|'other', phone?: string, conditions: string[] }`.
- `Household`: `{id, code, familyName, address, area, members: Member[], lastVisit: string|null, nextVisit: string|null, status:'due'|'upcoming'|'visited', color: string}`.
- `TranscriptSegment`: `{id, index, text, timestamp, memberId, language:'en'|'kn'|'hi', source:'demo'|'manual'|'gnani'}`.
- `PatchChange`: `{memberId, field:FieldId, value:FieldValue, evidence:string, operation:'set'|'append'}`.
- `ExtractionPatch`: `{visitId, segmentId, segmentIndex, baseRevision, changes:PatchChange[]}`.
- `FieldMeta`: `{source:'existing'|'manual'|'extracted', revision:number, segmentIndex:number, evidence?:string, manuallyProtected:boolean}`.
- `MemberRecord`: `{values:Partial<Record<FieldId,FieldValue>>, meta:Partial<Record<FieldId,FieldMeta>>}`.
- `Conflict`: `{id, memberId, field, currentValue, proposedValue, evidence, reason, resolved:boolean}`.
- `VisitAlert`: `{id,memberId,kind:'follow-up'|'review',message,evidence,acknowledged:boolean}`. Demo observations, not emergency diagnosis; no unreviewed auto spoken alerts.
- `AuditEntry`: `{id,timestamp,memberId,field,previousValue,value,source:'manual'|'extracted'|'resolution',evidence?:string}`.
- `Visit`: `{id,householdId,status:'draft'|'completed',startedAt,updatedAt,completedAt:string|null,revision:number,members:Record<string,MemberRecord>,transcripts:TranscriptSegment[],processedSegmentIds:string[],alerts:VisitAlert[],conflicts:Conflict[],audit:AuditEntry[]}`.
- `ReviewIssue`: `{id,memberId,field?:FieldId,kind:'missing'|'invalid'|'conflict'|'follow-up',message}`.
- `Settings`: `{workerName:string,area:string,language:'en'|'kn'|'hi',textSize:'default'|'large',audioAlerts:boolean}`.

## Engine exports (`src/lib/engine.ts`)
All immutable and deterministic except optional supplied timestamp default.
- `createVisit(household:Household): Visit` seeds name/age/phone only; no new clinical facts.
- `applyPatch(visit:Visit,patch:ExtractionPatch,protectedFields?:string[]):Visit`. protected keys `${memberId}.${field}`. Validate evidence against matching transcript. Do not process missing segment or mismatched visit/member. Old per-field segment index rejected. Preserve manual locks; conflicts unique. Completed visit unchanged.
- `editField(visit,memberId,field,value):Visit` manual input may be invalid (review catches) but locks field and audits.
- `resolveConflict(visit,conflictId,choice:'keep'|'accept'):Visit`.
- `acknowledgeAlert(visit,alertId):Visit`.
- `reviewVisit(visit):ReviewIssue[]` Require name+age for members; symptoms answer for at least primary member (front-end may keep all member questions optional beyond identity). Existing phone optional, if entered validate 10 digits. Positive pregnancy requires weeks before finalizing. Conflicts and unacknowledged alerts are review blockers.
- `completeVisit(visit):Visit` throws on blocking issues; records timestamp and immutable completed state.
- `FIELD_DEFINITIONS` array: `{id,label,section:'profile'|'health'|'maternal'|'notes',type:'text'|'number'|'select'|'textarea',unit?:string,options?:{value:string,label:string}[]}` exported from `src/lib/schema.ts`.

## Data exports
- `src/data/households.ts`: `DEMO_HOUSEHOLDS:Household[]` 8 plausible Bengaluru rural synthetic families; first family Lakshmi Devi, husband Ramesh, child Ananya. `DEFAULT_SETTINGS`.
- `src/data/demo.ts`: `getDemoSegments(visitId,household): {segment:TranscriptSegment,changes:PatchChange[]}[]` explicit prerecorded text fixtures, not fake microphone transcription. Includes multi-field answers, correction, husband persistent-fever follow-up, maternal field, normal notes. Corrections ordered; no dangerous auto diagnosis.
- `src/lib/db.ts`: browser-only Dexie repository exports `loadWorkspace():Promise<{households,visits,settings}>`, `saveHousehold`, `saveVisit`, `saveSettings`, `clearWorkspace`, `exportWorkspace`. Atomic writes, preserve drafts, surface errors. Clear data only explicit action.
- `src/hooks/use-workspace.ts`: `useWorkspace()` returns `{ready,error,households,visits,settings,saveHousehold,saveVisit,saveSettings,resetDemo,exportData}`. Save operations update local React state and persist ordered operations with error reporting. Frontend handles visit interaction using engine, saveVisit. No backend/cloud claims.

## Frontend
Agent owns `src/components/dara-app.tsx`, subcomponents and `src/app/globals.css`. Export default `DaraApp`. Root provides layout.tsx/page.tsx. Read domain files before integration and reconcile compile errors. Use the browser direct engine for responsiveness; demo extraction POST endpoint when online with deterministic local fixture fallback on offline only. Root will supply API helper `src/lib/extraction-client.ts`: `extractDemo(visit,segment,changes):Promise<ExtractionPatch>` sends whitelisted fixture event (no live provider) OR frontend may simply call exported async `demoExtraction` with small genuine async scheduling. Decide with root. Use explicit sample recording button "Try sample conversation" and separate "Start recording" showing connection-required information. No request microphone permission when service is not connected.
