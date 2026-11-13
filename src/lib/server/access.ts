import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http";
const COOKIE = "dara_session";
const TTL = 8 * 60 * 60;
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host) url.host = host;
  if (origin && origin !== url.origin)
    throw new HttpError(403, "Open this action from your DARA workspace.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "Open this action from your DARA workspace.");
}
function signature(value: string) {
  return createHmac("sha256", process.env.DARA_SESSION_SECRET || "")
    .update(value)
    .digest("base64url");
}
function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function hasWorkspaceSession(request: Request) {
  if (!process.env.DARA_SESSION_SECRET || !process.env.DARA_ACCESS_CODE)
    return false;
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  if (!token) return false;
  const [expires, nonce, mac, ...extra] = token.split(".");
  return (
    extra.length === 0 &&
    !!nonce &&
    !!mac &&
    Number(expires) > Date.now() / 1000 &&
    equal(mac, signature(`${expires}.${nonce}`))
  );
}
// This per-instance limiter reduces accidental bursts; access control is the signed session.
// It is not represented as a distributed usage quota.
const attempts = new Map<string, { count: number; until: number }>();
function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (attempts.size > 2000)
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  const item = attempts.get(key);
  if (!item || item.until < now) {
    attempts.set(key, { count: 1, until: now + windowMs });
    return;
  }
  if (++item.count > max)
    throw new HttpError(429, "Too many requests. Wait a moment and try again.");
}
export function requireWorkspaceSession(request: Request) {
  assertSameOrigin(request);
  if (!hasWorkspaceSession(request))
    throw new HttpError(
      401,
      "Unlock your workspace to use recording and transcription.",
    );
  limit(request.headers.get("cookie") || "", 90, 60000);
}
export function unlockWorkspace(request: Request, code: string) {
  assertSameOrigin(request);
  limit(
    `login:${request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "local"}`,
    10,
    60000,
  );
  const expected = process.env.DARA_ACCESS_CODE;
  if (!expected || !process.env.DARA_SESSION_SECRET)
    throw new HttpError(503, "Workspace access is not configured.");
  if (!equal(code.trim(), expected))
    throw new HttpError(401, "That access code is not correct.");
  const value = `${Math.floor(Date.now() / 1000) + TTL}.${randomBytes(16).toString("hex")}`;
  return `${COOKIE}=${value}.${signature(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function clearSessionCookie() {
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}
