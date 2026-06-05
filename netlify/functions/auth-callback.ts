import type { Config } from "@netlify/functions";
import {
  clearCookie,
  makeCookie,
  OAUTH_STATE_COOKIE,
  parseCookies,
  SESSION_COOKIE,
} from "./_shared/http.js";
import {
  assertAllowedUser,
  createSessionId,
  createStoredSession,
  exchangeAuthorizationCode,
  saveSession,
  validateAccessToken,
} from "./_shared/twitch.js";

function redirectWithError(req: Request, message: string): Response {
  const target = new URL("/", req.url);
  target.searchParams.set("auth_error", message);
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      "Set-Cookie": clearCookie(req, OAUTH_STATE_COOKIE),
    },
  });
}

export default async (req: Request) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = parseCookies(req)[OAUTH_STATE_COOKIE];

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError(req, "invalid_oauth_state");
  }

  try {
    const token = await exchangeAuthorizationCode(code);
    const validation = await validateAccessToken(token.access_token);
    try {
      assertAllowedUser(validation.user_id);
    } catch {
      return redirectWithError(req, "twitch_user_not_allowed");
    }

    const sessionId = createSessionId();
    await saveSession(sessionId, createStoredSession(token, validation));
    return new Response(null, {
      status: 302,
      headers: [
        ["Location", new URL("/", req.url).toString()],
        ["Cache-Control", "no-store"],
        ["Set-Cookie", makeCookie(req, SESSION_COOKIE, sessionId, 30 * 24 * 60 * 60)],
        ["Set-Cookie", clearCookie(req, OAUTH_STATE_COOKIE)],
      ],
    });
  } catch (error) {
    console.error("OAuth callback failed", error);
    return redirectWithError(req, "twitch_oauth_failed");
  }
};

export const config: Config = { path: "/api/auth/callback" };
