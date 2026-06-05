import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertAllowedUser,
  createStoredSession,
  exchangeAuthorizationCode,
  publicSession,
  refreshAccessToken,
  validateAccessToken,
} from "./twitch.js";

const env: Record<string, string> = {
  TWITCH_CLIENT_ID: "client-id",
  TWITCH_CLIENT_SECRET: "client-secret",
  TWITCH_REDIRECT_URI: "http://localhost:8888/api/auth/callback",
  TWITCH_ALLOWED_USER_ID: "allowed-user",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

describe("Twitch OAuth helpers", () => {
  beforeEach(() => {
    Object.assign(globalThis, {
      Netlify: { env: { get: (name: string) => env[name] } },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("exchanges and refreshes tokens with server-only credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
          scope: ["user:read:chat"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await exchangeAuthorizationCode("code");
    await refreshAccessToken("old-refresh");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("client_secret=client-secret");
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain("refresh_token=old-refresh");
  });

  it("validates OAuth tokens and enforces the configured broadcaster", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          client_id: "client-id",
          login: "streamer",
          user_id: "allowed-user",
          scopes: ["user:read:chat"],
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const validation = await validateAccessToken("access");
    expect(() => assertAllowedUser(validation.user_id)).not.toThrow();
    expect(() => assertAllowedUser("someone-else")).toThrow(/not allowed/);
  });

  it("allows any Twitch user when no broadcaster allowlist is configured", () => {
    const allowedUserId = env.TWITCH_ALLOWED_USER_ID;
    env.TWITCH_ALLOWED_USER_ID = "";
    expect(() => assertAllowedUser("any-user")).not.toThrow();
    env.TWITCH_ALLOWED_USER_ID = allowedUserId;
  });

  it("never exposes OAuth tokens in the public session", () => {
    const stored = createStoredSession(
      { access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: [] },
      {
        client_id: "client-id",
        login: "streamer",
        user_id: "allowed-user",
        scopes: [],
        expires_in: 3600,
      },
    );
    const serialized = JSON.stringify(publicSession(stored));
    expect(serialized).not.toContain("access");
    expect(serialized).not.toContain("refresh");
    expect(serialized).toContain("streamer");
    expect(publicSession(stored).maintenanceAfter).toBeTypeOf("number");
  });
});
