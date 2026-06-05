import type { Config } from "@netlify/functions";
import { getSessionId, json, methodNotAllowed } from "./_shared/http.js";
import { getValidSession, twitchApi } from "./_shared/twitch.js";

interface TwitchHypeStatus {
  data: Array<{
    current: null | {
      id: string;
      level: number;
      progress: number;
      goal: number;
      expires_at: string;
      started_at: string;
    };
  }>;
}

export default async (req: Request) => {
  if (req.method !== "GET") return methodNotAllowed();
  const sessionId = getSessionId(req);
  if (!sessionId) return json({ error: "Not authenticated" }, 401);

  try {
    const session = await getValidSession(sessionId);
    const response = await twitchApi<TwitchHypeStatus>(
      session,
      `/hypetrain/status?broadcaster_id=${encodeURIComponent(session.user.id)}`,
    );
    const current = response.data[0]?.current;
    return json({
      current: current
        ? {
            id: current.id,
            startedAt: current.started_at,
            level: current.level,
            progress: current.progress,
            goal: current.goal,
            expiresAt: current.expires_at,
          }
        : null,
    });
  } catch (error) {
    console.error("Hype status failed", error);
    return json({ error: "Hype Train status failed" }, 502);
  }
};

export const config: Config = { path: "/api/hype/status" };
