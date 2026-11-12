import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createWorkspaceRepository } from "../src/lib/db";
import { DEMO_HOUSEHOLDS } from "../src/data/households";
import { getDemoSegments } from "../src/data/demo";
import {
  addTranscriptSegment,
  applyPatch,
  createVisit,
  editField,
} from "../src/lib/engine";
import type { ExtractionPatch } from "../src/lib/types";

const first = DEMO_HOUSEHOLDS[0];
describe("independent integration regressions", () => {
  it("can persist a finalized segment before its asynchronous extraction completes", async () => {
    const repo = createWorkspaceRepository(
      `verification-${crypto.randomUUID()}`,
    );
    try {
      await repo.loadWorkspace();
      const visit = createVisit(first);
      await repo.saveVisit(visit);
      const withTranscript = addTranscriptSegment(
        visit,
        getDemoSegments(visit.id, first)[0].segment,
      );
      await expect(repo.saveVisit(withTranscript)).resolves.toBeUndefined();
      expect((await repo.loadWorkspace()).visits[0].transcripts).toHaveLength(
        1,
      );
    } finally {
      repo.close();
    }
  });
  it("preserves a manual edit made while a provider request is outstanding", () => {
    let visit = createVisit(first);
    const step = getDemoSegments(visit.id, first)[2];
    visit = addTranscriptSegment(visit, step.segment);
    const pending: ExtractionPatch = {
      visitId: visit.id,
      segmentId: step.segment.id,
      segmentIndex: step.segment.index,
      baseRevision: visit.revision,
      changes: step.changes,
    };
    visit = editField(visit, step.segment.memberId, "weight", 62);
    const patched = applyPatch(visit, pending);
    expect(patched.members[step.segment.memberId].values.weight).toBe(62);
    expect(patched.conflicts.filter((c) => !c.resolved)).toHaveLength(1);
  });
  it("keeps the husband report off the primary member record", () => {
    let visit = createVisit(first);
    const step = getDemoSegments(visit.id, first)[4];
    visit = addTranscriptSegment(visit, step.segment);
    const patch: ExtractionPatch = {
      visitId: visit.id,
      segmentId: step.segment.id,
      segmentIndex: step.segment.index,
      baseRevision: visit.revision,
      changes: step.changes,
    };
    const patched = applyPatch(visit, patch);
    expect(
      patched.members[first.members[0].id].values.feverDays,
    ).toBeUndefined();
    expect(patched.members[step.segment.memberId].values.feverDays).toBe(7);
    expect(patched.members[step.segment.memberId].values.symptoms).toContain(
      step.segment.text,
    );
    expect(applyPatch(patched, patch)).toBe(patched);
  });
});
