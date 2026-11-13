import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildProviderExtractionContext,
  decodeProviderWire,
  extractSurveyFacts,
  retainMissingProposals,
} from "../src/lib/server/live-providers";
import {
  addSurveyTranscript,
  createSurvey,
  editSurveyField,
  type SurveyTranscript,
} from "../src/lib/survey";

const originals: SurveyTranscript[] = [
  {
    id: "intro",
    index: 0,
    language: "en",
    source: "manual",
    timestamp: "2026-11-13T18:00:00.000Z",
    text: "My name is Ajay. I am the husband and will tell you about my wife. My wife's name is Anisha. My wife is 20 years old.",
  },
  {
    id: "self-health",
    index: 1,
    language: "en",
    source: "manual",
    timestamp: "2026-11-13T18:00:10.000Z",
    text: "My age is 21. I have fever for a week. I have difficulty breathing also.",
  },
];
function draft() {
  let survey = editSurveyField(
    createSurvey({ householdId: "synthetic-discourse" }),
    null,
    "familySize",
    2,
  );
  for (const [index, name, relation] of [
    [0, "Ajay", "self"],
    [1, "Anisha", "wife"],
  ] as const) {
    survey = editSurveyField(survey, survey.members[index].id, "name", name);
    survey = editSurveyField(
      survey,
      survey.members[index].id,
      "relation",
      relation,
    );
  }
  for (const segment of originals)
    survey = addSurveyTranscript(survey, segment);
  return survey;
}
function repairWire(memberId: string) {
  return {
    familySize: null,
    familySizeEvidence: null,
    familySizeCorrection: null,
    members: [
      {
        memberId,
        slot: 1,
        fields: [{ fieldId: "age", value: "21", evidence: "My age is 21." }],
        evidence: "My age is 21.",
        uncertain: false,
        attribution: {
          kind: "context",
          reference: "Ajay",
          evidence: "My name is Ajay.",
          segmentId: "intro",
        },
        corrections: [
          {
            fieldId: "age",
            kind: "reconciliation",
            previousValue: 20,
            evidence: "My age is 21.",
          },
        ],
      },
    ],
    householdFields: [],
    notes: [],
    uncertainties: [],
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("respondent context and provider repair boundary", () => {
  it("constrains generated IDs to actual members and null for new introductions", async () => {
    vi.stubEnv("GEMINI_API_KEY", "synthetic-test-key");
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    familySize: null,
                    familySizeEvidence: null,
                    familySizeCorrection: null,
                    members: [],
                    householdFields: [],
                    notes: [],
                    uncertainties: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const empty = addSurveyTranscript(
      createSurvey({ householdId: "synthetic-empty" }),
      originals[0],
    );
    await extractSurveyFacts(empty, originals[0]);
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(
      first.generationConfig.responseJsonSchema.properties.members.items
        .properties.memberId.enum,
    ).toEqual([null]);
    const known = draft();
    await extractSurveyFacts(known, originals[1]);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(
      second.generationConfig.responseJsonSchema.properties.members.items
        .properties.memberId.enum,
    ).toEqual([...known.members.map((member) => member.id), null]);
  });
  it("exposes a self-introduced respondent separately from the wife most recently discussed", () => {
    const survey = draft();
    const context = buildProviderExtractionContext(survey, originals[1]);
    expect(context.discourse.respondentMemberId).toBe(survey.members[0].id);
    expect(context.discourse.respondentAnchor?.reference).toBe("Ajay");
    expect(context.discourse.respondentAnchor?.segmentId).toBe("intro");
    expect(context.discourse.discussedMemberId).toBe(survey.members[1].id);
  });
  it("retains a supported machine repair but excludes manual and newer-source values", () => {
    const survey = draft();
    const member = survey.members[0];
    member.values.age = 20;
    member.meta.age = {
      source: "extracted",
      revision: survey.revision,
      segmentIndex: 1,
      segmentId: originals[1].id,
      evidence: "My age is 21.",
      manuallyProtected: false,
    };
    const result = decodeProviderWire(
      repairWire(member.id),
      survey,
      originals[1],
    );
    expect(
      retainMissingProposals(result, survey, originals[1]).members[0]
        .corrections?.[0].kind,
    ).toBe("reconciliation");
    member.meta.age.manuallyProtected = true;
    expect(
      retainMissingProposals(result, survey, originals[1]).members,
    ).toHaveLength(0);
    member.meta.age.manuallyProtected = false;
    member.meta.age.segmentIndex = 2;
    expect(
      retainMissingProposals(result, survey, originals[1]).members,
    ).toHaveLength(0);
  });
  it("does not retain a repair whose previous value no longer matches", () => {
    const survey = draft();
    const member = survey.members[0];
    member.values.age = 22;
    member.meta.age = {
      source: "extracted",
      revision: survey.revision,
      segmentIndex: 1,
      manuallyProtected: false,
    };
    const result = decodeProviderWire(
      repairWire(member.id),
      survey,
      originals[1],
    );
    expect(
      retainMissingProposals(result, survey, originals[1]).members,
    ).toHaveLength(0);
  });
  it("normalizes a numeric prior value encoded as text without accepting a malformed number", () => {
    const survey = draft();
    const member = survey.members[0];
    member.values.age = 20;
    member.meta.age = {
      source: "extracted",
      revision: survey.revision,
      segmentIndex: 1,
      manuallyProtected: false,
    };
    const wire = repairWire(member.id) as unknown as {
      members: { corrections: { previousValue: unknown }[] }[];
    };
    wire.members[0].corrections[0].previousValue = "20";
    const result = decodeProviderWire(wire, survey, originals[1]);
    expect(
      retainMissingProposals(result, survey, originals[1]).members[0]
        .corrections?.[0].previousValue,
    ).toBe(20);
    wire.members[0].corrections[0].previousValue = "20 years";
    expect(() => decodeProviderWire(wire, survey, originals[1])).toThrow();
  });
  it("rejects background repair metadata in the live extraction path", async () => {
    const survey = draft();
    const member = survey.members[0];
    member.values.age = 20;
    vi.stubEnv("GEMINI_API_KEY", "synthetic-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [{ text: JSON.stringify(repairWire(member.id)) }],
              },
            },
          ],
        }),
      ),
    );
    await expect(
      extractSurveyFacts(survey, originals[1]),
    ).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
  });
});
