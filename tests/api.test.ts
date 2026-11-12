import { describe, it, expect } from "vitest";
import { POST } from "../src/app/api/demo/extract/route";
import { POST as liveExtraction } from "../src/app/api/extract/route";
import { GET as health } from "../src/app/api/health/route";
const input = {
  visitId: "visit-test",
  householdId: "h001",
  segmentId: "visit-test-sample-1",
  segmentIndex: 0,
  baseRevision: 0,
};
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://dara.example/api/demo/extract", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
describe("demo extraction HTTP boundary", () => {
  it("returns a schema-valid named synthetic patch with no-store", async () => {
    const res = await POST(request(input));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.mode).toBe("demo");
    expect(data.patch.changes[0].memberId).toBe("h001-m01");
  });
  it("rejects unknown houses and segments", async () => {
    expect(
      (await POST(request({ ...input, householdId: "private-house" }))).status,
    ).toBe(404);
    expect((await POST(request({ ...input, segmentId: "wrong" }))).status).toBe(
      404,
    );
  });
  it("does not accept caller-supplied transcripts or patch values", async () => {
    expect(
      (await POST(request({ ...input, transcript: "sensitive data" }))).status,
    ).toBe(400);
  });
  it("rejects malformed and oversized requests", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request("a".repeat(9000)))).status).toBe(413);
  });
  it("rejects cross-origin browser requests", async () => {
    expect(
      (await POST(request(input, { origin: "https://elsewhere.example" })))
        .status,
    ).toBe(403);
  });
  it("returns explicit unconfigured status for live extraction even if keys exist", async () => {
    const res = await liveExtraction();
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("INTEGRATION_NOT_CONFIGURED");
  });
  it("health reports demo and never reveals credentials", async () => {
    const res = health();
    const data = await res.json();
    expect(data.mode).toBe("demo");
    expect(JSON.stringify(data)).not.toContain("API_KEY");
  });
});
