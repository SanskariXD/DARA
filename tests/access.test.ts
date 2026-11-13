import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, DELETE } from "../src/app/api/auth/session/route";
import {
  requireWorkspaceSession,
  hasWorkspaceSession,
} from "../src/lib/server/access";
const request = (body?: unknown, headers: Record<string, string> = {}) =>
  new Request("https://dara.test/api/auth/session", {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      origin: "https://dara.test",
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  vi.stubEnv("DARA_ACCESS_CODE", "unit-test-private-code");
  vi.stubEnv("DARA_SESSION_SECRET", "unit-test-signing-key-not-production");
});
afterEach(() => vi.unstubAllEnvs());
describe("private workspace access", () => {
  it("requires access and signs an HttpOnly same-site cookie", async () => {
    expect((await (await GET(request())).json()).authenticated).toBe(false);
    const res = await POST(request({ code: "unit-test-private-code" }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toContain("unit-test-private-code");
    expect(hasWorkspaceSession(request(undefined, { cookie }))).toBe(true);
  });
  it("rejects wrong codes and foreign browser origins", async () => {
    expect((await POST(request({ code: "wrong" }))).status).toBe(401);
    expect(
      (
        await POST(
          request(
            { code: "unit-test-private-code" },
            { origin: "https://elsewhere.test" },
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("rejects tampering and never allows anonymous provider use", async () => {
    expect(() => requireWorkspaceSession(request())).toThrow();
    const cookie = (
      await POST(request({ code: "unit-test-private-code" }))
    ).headers.get("set-cookie")!;
    expect(
      hasWorkspaceSession(
        request(undefined, {
          cookie: cookie.replace("dara_session=", "dara_session=x"),
        }),
      ),
    ).toBe(false);
  });
  it("invalidates sessions when the signing secret changes", async () => {
    const cookie = (
      await POST(request({ code: "unit-test-private-code" }))
    ).headers.get("set-cookie")!;
    vi.stubEnv("DARA_SESSION_SECRET", "replacement-key");
    expect(hasWorkspaceSession(request(undefined, { cookie }))).toBe(false);
  });
  it("expires logout cookie and refuses cross-origin logout", async () => {
    expect((await DELETE(request())).headers.get("set-cookie")).toContain(
      "Max-Age=0",
    );
    expect(
      (await DELETE(request(undefined, { origin: "https://elsewhere.test" })))
        .status,
    ).toBe(403);
  });
  it("fails closed when workspace credentials are missing", async () => {
    vi.stubEnv("DARA_ACCESS_CODE", "");
    expect(
      (await POST(request({ code: "unit-test-private-code" }))).status,
    ).toBe(503);
    expect(hasWorkspaceSession(request())).toBe(false);
  });
});
