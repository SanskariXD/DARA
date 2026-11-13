import { z } from "zod";
import {
  assertSameOrigin,
  clearSessionCookie,
  hasWorkspaceSession,
  unlockWorkspace,
} from "../../../../lib/server/access";
import { handleError, noStore, readJson } from "../../../../lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return Response.json(
    { authenticated: hasWorkspaceSession(request) },
    { headers: noStore },
  );
}
export async function POST(request: Request) {
  try {
    const { code } = await readJson(
      request,
      z.object({ code: z.string().min(1).max(256) }).strict(),
      1024,
    );
    return Response.json(
      { authenticated: true },
      { headers: { ...noStore, "Set-Cookie": unlockWorkspace(request, code) } },
    );
  } catch (error) {
    return handleError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    return Response.json(
      { authenticated: false },
      { headers: { ...noStore, "Set-Cookie": clearSessionCookie() } },
    );
  } catch (error) {
    return handleError(error);
  }
}
