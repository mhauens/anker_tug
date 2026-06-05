import type { Config } from "@netlify/functions";
import {
  clearCookie,
  getSessionId,
  json,
  methodNotAllowed,
  requireSameOrigin,
  SESSION_COOKIE,
} from "./_shared/http.js";
import { deleteSession, loadSession, revokeAccessToken } from "./_shared/twitch.js";

export default async (req: Request) => {
  if (req.method !== "POST") return methodNotAllowed();
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const sessionId = getSessionId(req);
  if (sessionId) {
    const session = await loadSession(sessionId).catch(() => null);
    if (session) await revokeAccessToken(session.accessToken).catch(() => undefined);
    await deleteSession(sessionId).catch(() => undefined);
  }
  const response = json({ authenticated: false });
  response.headers.append("Set-Cookie", clearCookie(req, SESSION_COOKIE));
  return response;
};

export const config: Config = { path: "/api/logout" };
