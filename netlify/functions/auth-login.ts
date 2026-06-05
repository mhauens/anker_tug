import { randomBytes } from "node:crypto";
import type { Config } from "@netlify/functions";
import { twitchLoginConfig } from "./_shared/env.js";
import { makeCookie, OAUTH_STATE_COOKIE } from "./_shared/http.js";

export default async (req: Request) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const config = twitchLoginConfig();
  const state = randomBytes(24).toString("base64url");
  const authorize = new URL("https://id.twitch.tv/oauth2/authorize");
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: [
      "channel:read:hype_train",
      "channel:read:subscriptions",
      "user:read:chat",
    ].join(" "),
    state,
  }).toString();

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": makeCookie(req, OAUTH_STATE_COOKIE, state, 600),
      "Cache-Control": "no-store",
    },
  });
};

export const config: Config = { path: "/api/auth/login" };
