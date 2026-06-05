import type { Config } from "@netlify/functions";
import {
  getSessionId,
  json,
  methodNotAllowed,
  requireSameOrigin,
} from "./_shared/http.js";
import {
  getValidSession,
  twitchApi,
  TwitchApiError,
  type StoredSession,
} from "./_shared/twitch.js";

const SUBSCRIPTIONS = [
  ["channel.hype_train.begin", "2"],
  ["channel.hype_train.progress", "2"],
  ["channel.hype_train.end", "2"],
  ["channel.chat.message", "1"],
  ["channel.subscribe", "1"],
  ["channel.subscription.message", "1"],
  ["channel.subscription.gift", "1"],
] as const;

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function createSubscription(
  session: StoredSession,
  websocketSessionId: string,
  type: (typeof SUBSCRIPTIONS)[number][0],
  version: (typeof SUBSCRIPTIONS)[number][1],
): Promise<void> {
  const condition = type === "channel.chat.message"
    ? { broadcaster_user_id: session.user.id, user_id: session.user.id }
    : { broadcaster_user_id: session.user.id };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await twitchApi(session, "/eventsub/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          type,
          version,
          condition,
          transport: { method: "websocket", session_id: websocketSessionId },
        }),
      });
      return;
    } catch (error) {
      if (!(error instanceof TwitchApiError)) throw error;
      const retryable = error.status === 429 || error.status >= 500;
      if (!retryable || attempt === 2) throw error;
      await sleep(Math.min(error.retryAfterMs ?? 250 * 2 ** attempt, 1_500));
    }
  }
}

export default async (req: Request) => {
  if (req.method !== "POST") return methodNotAllowed();
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const sessionId = getSessionId(req);
  if (!sessionId) return json({ error: "Not authenticated" }, 401);

  const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
  if (!body.sessionId || !/^[A-Za-z0-9_-]{10,256}$/.test(body.sessionId)) {
    return json({ error: "Invalid EventSub session ID" }, 400);
  }

  try {
    const session = await getValidSession(sessionId);
    await Promise.all(
      SUBSCRIPTIONS.map(([type, version]) =>
        createSubscription(session, body.sessionId!, type, version),
      ),
    );
    return json({ subscribed: true, count: SUBSCRIPTIONS.length }, 201);
  } catch (error) {
    console.error("EventSub subscription failed", error);
    return json({ error: "EventSub subscriptions failed" }, 502);
  }
};

export const config: Config = { path: "/api/eventsub/subscribe" };
