import type { Config } from "@netlify/functions";
import { getSessionId, json, methodNotAllowed } from "./_shared/http.js";
import { getValidSession, publicSession } from "./_shared/twitch.js";

export default async (req: Request) => {
  if (req.method !== "GET") return methodNotAllowed();
  const sessionId = getSessionId(req);
  if (!sessionId) return json({ authenticated: false }, 401);
  try {
    return json(publicSession(await getValidSession(sessionId)));
  } catch (error) {
    console.error("Session validation failed", error);
    return json({ authenticated: false }, 401);
  }
};

export const config: Config = { path: "/api/session" };
