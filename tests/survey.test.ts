import { describe, expect, it } from 'vitest';
import {
  addCustomSurveyField, addSurveyMember, addSurveyTranscript, applySurveyExtraction,
  completeSurvey, createSurvey, editSurveyField, isSurveyFieldVisible, makeExtractionContext,
  removeSurveyMember, resolveSurveyConflict, resolveSurveyUncertainty, reviewSurvey,
  reviewSurveyNote, surveyExtractionSchema, surveySchema,
  type Survey, type SurveyExtractionEnvelope, type SurveyExtractionResult, type SurveyTranscript,
} from '../src/lib/survey';

const DATE = '2026-11-13T06:00:00.000Z';
const fresh = () => createSurvey({ householdId: 'home-1' }, DATE, 'survey-1');
const source = (index: number, text: string): SurveyTranscript => ({ id: `seg-${index}`, index, text, timestamp: DATE, language: 'en', source: 'gnani' });
function envelope(survey: Survey, segment: SurveyTranscript, result: Partial<SurveyExtractionResult>): SurveyExtractionEnvelope {
  return { surveyId: survey.id, segmentId: segment.id, segmentIndex: segment.index, baseRevision: survey.revision,
    result: { familySize: null, members: [], notes: [], ...result } };
}
function extract(survey: Survey, index: number, text: string, result: Partial<SurveyExtractionResult>, protectedKeys: string[] = []) {
  const segment = source(index, text);
  const withSource = addSurveyTranscript(survey, segment, DATE);
  return applySurveyExtraction(withSource, envelope(withSource, segment, result), protectedKeys, DATE);
}
function identified() {
  let survey = editSurveyField(fresh(), null, 'familySize', 1, DATE);
  survey = editSurveyField(survey, survey.members[0].id, 'name', 'Anjali', DATE);
  return editSurveyField(survey, survey.members[0].id, 'age', '26', DATE);
}

describe('blank versioned family survey', () => {
  it('starts without seeded identities, health answers, or member sections', () => {
    const survey = fresh();
    expect(survey.household.values).toEqual({});
    expect(survey.members).toEqual([]);
    expect(survey.templateId).toBe('family-health');
    expect(survey.templateVersion).toBe(1);
    expect(surveySchema.safeParse(survey).success).toBe(true);
    expect(reviewSurvey(survey).some(issue => issue.fieldId === 'familySize')).toBe(true);
  });
  it('makes a repeated survey blank without changing the completed original', () => {
    const original = completeSurvey(identified(), DATE);
    const repeated = createSurvey({ householdId: original.householdId, repeatOf: original.id }, DATE, 'survey-2');
    expect(repeated.repeatOf).toBe(original.id);
    expect(repeated.members).toEqual([]);
    expect(repeated.household.values).toEqual({});
    expect(original.members[0].values.name).toBe('Anjali');
  });
  it('snapshot validator rejects duplicate members and unknown answers', () => {
    const survey = identified();
    expect(surveySchema.safeParse({ ...survey, members: [...survey.members, survey.members[0]] }).success).toBe(false);
    expect(surveySchema.safeParse({ ...survey, household: { values: { randomField: 'yes' }, meta: {} } }).success).toBe(false);
    expect(surveySchema.safeParse({ ...survey, status: 'completed' }).success).toBe(false);
    expect(surveySchema.safeParse({ ...survey, fields: survey.fields.filter(field => field.id !== 'name') }).success).toBe(false);
  });
});

describe('automatic family sections', () => {
  it('automatically creates N empty stable sections from extracted family size', () => {
    const survey = extract(fresh(), 0, 'There are four people in our family.', { familySize: 4, familySizeEvidence: 'four people in our family' });
    expect(survey.members).toHaveLength(4);
    expect(new Set(survey.members.map(member => member.id)).size).toBe(4);
    expect(survey.members.every(member => Object.keys(member.values).length === 0)).toBe(true);
    const expanded = extract(survey, 1, 'Actually, five people.', { familySize: 5, familySizeEvidence: 'five people' });
    expect(expanded.members.slice(0, 4).map(member => member.id)).toEqual(survey.members.map(member => member.id));
  });
  it('can create family sections and fill explicit slots in the same response', () => {
    const text = 'We are two. My name is Anjali and I am 26. My husband Ravi is 30.';
    const survey = extract(fresh(), 0, text, { familySize: 2, familySizeEvidence: 'We are two.', members: [
      { slot: 1, name: 'Anjali', age: 26, evidence: 'My name is Anjali and I am 26.' },
      { slot: 2, name: 'Ravi', age: 30, relation: 'Husband', evidence: 'My husband Ravi is 30.' },
    ] });
    expect(survey.members.map(member => member.values.name)).toEqual(['Anjali', 'Ravi']);
    expect(reviewSurvey(survey)).toEqual([]);
  });
  it('drops only empty overflow sections after a count correction', () => {
    let survey = editSurveyField(fresh(), null, 'familySize', 4);
    survey = editSurveyField(survey, survey.members[3].id, 'name', 'Retain me');
    const retainedId = survey.members[3].id;
    survey = editSurveyField(survey, null, 'familySize', 2);
    expect(survey.members).toHaveLength(3);
    expect(survey.members.some(member => member.id === retainedId)).toBe(true);
    expect(reviewSurvey(survey).some(issue => issue.kind === 'count')).toBe(true);
  });
  it('preserves an otherwise blank member who has an attributed note', () => {
    let survey = editSurveyField(fresh(), null, 'familySize', 2);
    const memberId = survey.members[1].id;
    survey = extract(survey, 0, 'She needs transport.', { notes: [{ memberId, text: 'Transport', evidence: 'She needs transport.' }] });
    survey = editSurveyField(survey, null, 'familySize', 1);
    expect(survey.members).toHaveLength(2);
    expect(() => removeSurveyMember(survey, memberId)).toThrow('Confirm removal');
    expect(reviewSurvey(survey).some(issue => issue.kind === 'count')).toBe(true);
  });
  it('requires explicit removal confirmation for an answered member', () => {
    let survey = identified();
    const id = survey.members[0].id;
    expect(() => removeSurveyMember(survey, id)).toThrow('Confirm removal');
    survey = removeSurveyMember(survey, id, true);
    expect(survey.members).toHaveLength(0);
    expect(survey.household.values.familySize).toBe(0);
    expect(reviewSurvey(survey).length).toBeGreaterThan(0);
  });
  it('manual addition and removal keep count aligned and never reuse removed member IDs', () => {
    let survey = addSurveyMember(fresh());
    const originalId = survey.members[0].id;
    survey = removeSurveyMember(survey, originalId);
    survey = addSurveyMember(survey);
    expect(survey.members[0].id).not.toBe(originalId);
    expect(survey.household.values.familySize).toBe(1);
  });
  it('rejects unsupported family counts and extraction without count evidence', () => {
    expect(surveyExtractionSchema.safeParse({ familySize: 300, members: [], notes: [] }).success).toBe(false);
    const survey = extract(fresh(), 0, 'We are four people.', { familySize: 4 });
    expect(survey.members).toHaveLength(0);
    expect(survey.uncertainties).toHaveLength(1);
  });
});

describe('source attribution, ordering and ownership', () => {
  it('will not guess between several blank member sections without an identifier', () => {
    const survey = extract(editSurveyField(fresh(), null, 'familySize', 2), 0, 'Her name is Kavya.', { members: [{ name: 'Kavya', evidence: 'Her name is Kavya.' }] });
    expect(survey.members.every(member => !member.values.name)).toBe(true);
    expect(survey.uncertainties).toHaveLength(1);
  });
  it('supports exact unique known-name matching and refuses an explicit unknown member ID', () => {
    let survey = extract(identified(), 0, 'Anjali has a fever.', { members: [{ name: 'Anjali', symptoms: 'fever', evidence: 'Anjali has a fever.' }] });
    expect(survey.members[0].values.symptoms).toBe('Anjali has a fever.');
    survey = extract(survey, 1, 'Anjali is 28.', { members: [{ memberId: 'not-known', name: 'Anjali', age: 28, evidence: 'Anjali is 28.' }] });
    expect(survey.members[0].values.age).toBe('26');
    expect(survey.uncertainties).toHaveLength(1);
  });
  it('does not repurpose an extracted identity using a slot with a different name', () => {
    const initialText = 'We are two. Anjali is 26. Ravi is 30.';
    const initial = extract(fresh(), 0, initialText, { familySize: 2, familySizeEvidence: 'We are two.', members: [
      { slot: 1, name: 'Anjali', age: 26, evidence: 'Anjali is 26.' },
      { slot: 2, name: 'Ravi', age: 30, evidence: 'Ravi is 30.' },
    ] });
    const survey = addCustomSurveyField(initial, { label: 'Occupation', scope: 'member', type: 'text' });
    const fieldId = survey.fields.at(-1)!.id;
    const evidence = 'Savitri is 55, has fever, and is a teacher.';
    const result = extract(survey, 1, evidence, { members: [{ slot: 2, name: 'Savitri', age: 55, symptoms: 'fever', evidence,
      customFields: [{ fieldId, value: 'Teacher', evidence }],
    }] });
    expect(survey.members[1].meta.name.source).toBe('extracted');
    expect(result.members[1]).toEqual(survey.members[1]);
    expect(result.members[0]).toEqual(survey.members[0]);
    expect(result.uncertainties).toHaveLength(1);
    expect(result.uncertainties[0].memberId).toBe(survey.members[1].id);
    expect(result.uncertainties[0].message).toContain('different name');
    expect(result.uncertainties[0].evidence).toBe(evidence);
  });
  it('continues applying same-name slot proposals to the established member', () => {
    const survey = extract(fresh(), 0, 'One person. Anjali is 26.', { familySize: 1, familySizeEvidence: 'One person.',
      members: [{ slot: 1, name: 'Anjali', age: 26, evidence: 'Anjali is 26.' }],
    });
    const result = extract(survey, 1, 'Anjali is actually 28.', { members: [{ slot: 1, name: 'Anjali', age: 28, evidence: 'Anjali is actually 28.' }] });
    expect(result.members[0].values.name).toBe('Anjali');
    expect(result.members[0].values.age).toBe(28);
    expect(result.uncertainties).toHaveLength(0);
  });
  it('allows explicit member-ID name corrections while preserving manual ownership', () => {
    const survey = extract(fresh(), 0, 'One person. Anjali is 26.', { familySize: 1, familySizeEvidence: 'One person.',
      members: [{ slot: 1, name: 'Anjali', age: 26, evidence: 'Anjali is 26.' }],
    });
    const memberId = survey.members[0].id;
    const corrected = extract(survey, 1, 'My full name is Anjali Devi.', { members: [{ memberId, name: 'Anjali Devi', evidence: 'My full name is Anjali Devi.' }] });
    expect(corrected.members[0].values.name).toBe('Anjali Devi');
    expect(corrected.uncertainties).toHaveLength(0);
    const manual = editSurveyField(corrected, memberId, 'name', 'Anjali D.');
    const protectedResult = extract(manual, 2, 'Please write Anjali Devi.', { members: [{ memberId, name: 'Anjali Devi', evidence: 'Please write Anjali Devi.' }] });
    expect(protectedResult.members[0].values.name).toBe('Anjali D.');
    expect(protectedResult.conflicts.filter((conflict) => !conflict.resolved)).toHaveLength(1);
    expect(protectedResult.uncertainties).toHaveLength(0);
  });
  it('does not remap a delayed slot after a member was removed', () => {
    let survey = editSurveyField(fresh(), null, 'familySize', 3);
    const segment = source(0, 'Alice is 31.');
    survey = addSurveyTranscript(survey, segment);
    const request = envelope(survey, segment, { members: [{ slot: 2, name: 'Alice', age: 31, evidence: 'Alice is 31.' }] });
    survey = removeSurveyMember(survey, survey.members[0].id);
    const result = applySurveyExtraction(survey, request);
    expect(result.members.every(member => !member.values.name)).toBe(true);
    expect(result.uncertainties[0].message).toContain('sections changed');
  });
  it('still accepts a stable member ID after another section is removed', () => {
    let survey = editSurveyField(fresh(), null, 'familySize', 3);
    const target = survey.members[1].id;
    const segment = source(0, 'Alice is 31.');
    survey = addSurveyTranscript(survey, segment);
    const request = envelope(survey, segment, { members: [{ memberId: target, name: 'Alice', age: 31, evidence: 'Alice is 31.' }] });
    survey = removeSurveyMember(survey, survey.members[0].id);
    const result = applySurveyExtraction(survey, request);
    expect(result.members.find(member => member.id === target)?.values.name).toBe('Alice');
  });
  it('keeps uncertain attribution and unsupported quotes out of member values', () => {
    let survey = editSurveyField(fresh(), null, 'familySize', 1);
    survey = extract(survey, 0, 'Maybe it was her husband.', { members: [{ slot: 1, age: 40, uncertain: true, evidence: 'Maybe it was her husband.' }] });
    survey = extract(survey, 1, 'Some unrelated statement.', { members: [{ slot: 1, age: 42, evidence: 'He is 42.' }] });
    expect(survey.members[0].values.age).toBeUndefined();
    expect(survey.uncertainties).toHaveLength(2);
  });
  it('retains exact symptom wording instead of a model-generated diagnosis', () => {
    const quote = 'My husband has been having fever since a week.';
    const survey = extract(editSurveyField(fresh(), null, 'familySize', 1), 0, quote, { members: [{ slot: 1, symptoms: 'Malaria diagnosis', evidence: quote }] });
    expect(survey.members[0].values.symptoms).toBe(quote);
    expect(survey.members[0].meta.symptoms.evidence).toBe(quote);
    expect(survey.members[0].meta.symptoms.segmentId).toBe('seg-0');
  });
  it('protects both manual and currently focused fields', () => {
    let survey = identified();
    const memberId = survey.members[0].id;
    survey = extract(survey, 0, 'Actually, age 28 and phone 9999912345.', { members: [{ memberId, age: 28, phone: '9999912345', evidence: 'Actually, age 28 and phone 9999912345.' }] }, [`${memberId}.phone`]);
    expect(survey.members[0].values.age).toBe('26');
    expect(survey.members[0].values.phone).toBeUndefined();
    expect(survey.conflicts.filter(conflict => !conflict.resolved)).toHaveLength(2);
    survey = resolveSurveyConflict(survey, survey.conflicts[0].id, 'accept');
    expect(survey.members[0].values.age).toBe(28);
    expect(survey.members[0].meta.age.manuallyProtected).toBe(true);
  });
  it('ignores null proposals and treats equivalent formatted manual values as agreement', () => {
    let survey = identified();
    survey = editSurveyField(survey, survey.members[0].id, 'phone', '99999 12345');
    survey = extract(survey, 0, 'Anjali is 26, phone 9999912345.', { members: [{ slot: 1, name: null, age: 26, phone: '9999912345', evidence: 'Anjali is 26, phone 9999912345.' }] });
    expect(survey.members[0].values.name).toBe('Anjali');
    expect(survey.members[0].values.phone).toBe('99999 12345');
    expect(survey.conflicts).toHaveLength(0);
  });
  it('handles out-of-order responses per field without discarding unrelated older facts', () => {
    let survey = editSurveyField(fresh(), null, 'familySize', 1);
    const old = source(0, 'Age 26 and phone 9999912345.'); const newer = source(1, 'Actually, age 28.');
    survey = addSurveyTranscript(addSurveyTranscript(survey, old), newer);
    const first = envelope(survey, old, { members: [{ slot: 1, age: 26, phone: '9999912345', evidence: old.text }] });
    const second = envelope(survey, newer, { members: [{ slot: 1, age: 28, evidence: newer.text }] });
    const result = applySurveyExtraction(applySurveyExtraction(survey, second), first);
    expect(result.members[0].values.age).toBe(28);
    expect(result.members[0].values.phone).toBe('9999912345');
  });
  it('deduplicates replayed segments and rejects wrong survey/source/revision', () => {
    const segment = source(0, 'One family member.'); const survey = addSurveyTranscript(fresh(), segment);
    const request = envelope(survey, segment, { familySize: 1, familySizeEvidence: segment.text });
    const applied = applySurveyExtraction(survey, request);
    expect(applySurveyExtraction(applied, request)).toBe(applied);
    expect(addSurveyTranscript(survey, segment)).toBe(survey);
    expect(applySurveyExtraction(survey, { ...request, surveyId: 'other' })).toBe(survey);
    expect(applySurveyExtraction(survey, { ...request, baseRevision: 999 })).toBe(survey);
    expect(applySurveyExtraction(survey, { ...request, segmentIndex: 3 })).toBe(survey);
    expect(applied.audit).toHaveLength(1);
  });
});

describe('custom fields, notes and review', () => {
  it('adds stable scoped custom fields and evaluates their required status', () => {
    let survey = identified();
    survey = addCustomSurveyField(survey, { label: 'Drinking water source', scope: 'household', type: 'text', required: true });
    const field = survey.fields.at(-1)!;
    expect(field.id).toMatch(/^custom-/);
    expect(reviewSurvey(survey).some(issue => issue.fieldId === field.id)).toBe(true);
    survey = editSurveyField(survey, null, field.id, 'Borewell');
    expect(reviewSurvey(survey)).toEqual([]);
    expect(() => addCustomSurveyField(survey, { label: 'Drinking water source', scope: 'household', type: 'text' })).toThrow('already exists');
    expect(() => addCustomSurveyField(survey, { label: 'Choice', scope: 'member', type: 'select' })).toThrow();
  });
  it('accepts known custom fields and keeps arbitrary model-created keys out', () => {
    let survey = addCustomSurveyField(identified(), { label: 'Work', scope: 'member', type: 'text' });
    const field = survey.fields.at(-1)!;
    survey = extract(survey, 0, 'I am a teacher.', { members: [{ slot: 1, evidence: 'I am a teacher.', customFields: [
      { fieldId: field.id, value: 'Teacher', evidence: 'I am a teacher.' },
      { fieldId: 'invented-field', value: 'Anything', evidence: 'I am a teacher.' },
    ] }] });
    expect(survey.members[0].values[field.id]).toBe('Teacher');
    expect(survey.members[0].values['invented-field']).toBeUndefined();
    expect(survey.uncertainties).toHaveLength(1);
  });
  it('preserves unsupported information as evidence-backed reviewable notes', () => {
    let survey = extract(identified(), 0, 'We need help with transport.', { notes: [{ text: 'Generated summary', evidence: 'We need help with transport.' }] });
    expect(survey.notes[0].text).toBe('We need help with transport.');
    expect(reviewSurvey(survey).some(issue => issue.id === survey.notes[0].id)).toBe(true);
    survey = reviewSurveyNote(survey, survey.notes[0].id);
    expect(reviewSurvey(survey)).toEqual([]);
    expect(completeSurvey(survey).status).toBe('completed');
  });
  it('keeps unknown-member notes unassigned and requires uncertainty review', () => {
    let survey = extract(identified(), 0, 'Someone needs transport.', { notes: [{ text: 'Transport', evidence: 'Someone needs transport.', memberId: 'unknown' }] });
    expect(survey.notes[0].memberId).toBeNull();
    expect(survey.uncertainties).toHaveLength(1);
    survey = resolveSurveyUncertainty(survey, survey.uncertainties[0].id);
    survey = reviewSurveyNote(survey, survey.notes[0].id);
    expect(reviewSurvey(survey)).toEqual([]);
  });
  it('does not lose manual typing spaces or decimal intermediates', () => {
    let survey = identified();
    for (const value of ['37', '37.', '37.0', '37.05']) {
      survey = editSurveyField(survey, survey.members[0].id, 'temperature', value);
      expect(survey.members[0].values.temperature).toBe(value);
    }
    survey = editSurveyField(survey, survey.members[0].id, 'name', 'Anjali ');
    expect(survey.members[0].values.name).toBe('Anjali ');
    expect(reviewSurvey(survey)).toEqual([]);
  });
  it('requires visible conditional answers and catches clinical-field inconsistencies without diagnosis', () => {
    let survey = identified(); const id = survey.members[0].id;
    const weeks = survey.fields.find(field => field.id === 'pregnancyWeeks')!;
    expect(isSurveyFieldVisible(weeks, survey.members[0])).toBe(false);
    survey = editSurveyField(survey, id, 'pregnancyStatus', 'yes');
    expect(reviewSurvey(survey).some(issue => issue.fieldId === 'pregnancyWeeks')).toBe(true);
    survey = editSurveyField(survey, id, 'pregnancyWeeks', 20);
    survey = editSurveyField(survey, id, 'pregnancyStatus', 'no');
    expect(reviewSurvey(survey).some(issue => issue.id.includes('contradiction'))).toBe(true);
  });
  it('completed surveys reject all delayed mutations', () => {
    const survey = completeSurvey(identified());
    expect(editSurveyField(survey, null, 'familySize', 8)).toBe(survey);
    expect(addSurveyMember(survey)).toBe(survey);
    expect(removeSurveyMember(survey, survey.members[0].id, true)).toBe(survey);
    expect(addCustomSurveyField(survey, { label: 'New', scope: 'member', type: 'text' })).toBe(survey);
    expect(addSurveyTranscript(survey, source(0, 'New answer'))).toBe(survey);
    expect(applySurveyExtraction(survey, envelope(survey, source(0, 'One.'), { familySize: 1, familySizeEvidence: 'One.' }))).toBe(survey);
    expect(completeSurvey(survey)).toBe(survey);
    expect(surveySchema.safeParse(survey).success).toBe(true);
  });
  it('sends only compact relevant context to extraction', () => {
    let survey = identified();
    for (let i = 0; i < 12; i++) survey = addSurveyTranscript(survey, source(i, `Transcript ${i}`));
    const context = makeExtractionContext(survey, survey.transcripts[11]);
    expect(context.recentTranscript).toHaveLength(8);
    expect(context).not.toHaveProperty('audit');
    expect(context.members[0].memberId).toBe(survey.members[0].id);
    expect(context.members[0].slot).toBe(1);
  });
});
