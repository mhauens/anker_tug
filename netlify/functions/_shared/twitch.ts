import { randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";
import type { EncryptedEnvelope } from "./crypto.js";
import { decryptJson, encryptJson } from "./crypto.js";
import { twitchConfig } from "./env.js";

const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
const TOKEN_VALIDATION_INTERVAL_MS = 60 * 60_000;
const SESSION_STORE = "anchor-tug-sessions";

export interface TwitchUser {
  id: string;
  login: string;
  displayName: string;
}

export interface StoredSession {
  user: TwitchUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  validatedAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
}

interface ValidationResponse {
  client_id: string;
  login: string;
  user_id: string;
  scopes: string[];
  expires_in: number;
}

export class AuthenticationError extends Error {}

export class TwitchApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(message);
  }
}

function store() {
  return getStore({ name: SESSION_STORE, consistency: "strong" });
}

async function parseTwitchResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new AuthenticationError(body.message ?? `Twitch returned ${response.status}`);
  }
  return body;
}

export async function exchangeAuthorizationCode(code: string): Promise<TokenResponse> {
  const config = twitchConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  return parseTwitchResponse<TokenResponse>(
    await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body }),
  );
}

export async function validateAccessToken(accessToken: string): Promise<ValidationResponse> {
  return parseTwitchResponse<ValidationResponse>(
    await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${accessToken}` },
    }),
  );
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const config = twitchConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return parseTwitchResponse<TokenResponse>(
    await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body }),
  );
}

export function createStoredSession(
  token: TokenResponse,
  validation: ValidationResponse,
): StoredSession {
  return {
    user: {
      id: validation.user_id,
      login: validation.login,
      displayName: validation.login,
    },
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    scopes: token.scope,
    validatedAt: Date.now(),
  };
}

export function assertAllowedUser(userId: string): void {
  const allowedUserId = twitchConfig().allowedUserId;
  if (allowedUserId && userId !== allowedUserId) {
    throw new AuthenticationError("Twitch user is not allowed");
  }
}

export async function saveSession(
  sessionId: string,
  session: StoredSession,
): Promise<void> {
  const encrypted = encryptJson(session, twitchConfig().encryptionKey);
  await store().setJSON(`sessions/${sessionId}`, encrypted);
}

export async function loadSession(sessionId: string): Promise<StoredSession | null> {
  const encrypted = await store().get(`sessions/${sessionId}`, { type: "json" });
  if (!encrypted) return null;
  return decryptJson<StoredSession>(
    encrypted as EncryptedEnvelope,
    twitchConfig().encryptionKey,
  );
}

export async function deleteSession(sessionId: string): Promise<void> {
  await store().delete(`sessions/${sessionId}`);
}

export async function getValidSession(sessionId: string): Promise<StoredSession> {
  let session = await loadSession(sessionId);
  if (!session) throw new AuthenticationError("Session not found");
  const config = twitchConfig();

  if (session.expiresAt - Date.now() <= TOKEN_REFRESH_MARGIN_MS) {
    const refreshed = await refreshAccessToken(session.refreshToken);
    session = {
      ...session,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      scopes: refreshed.scope,
      validatedAt: 0,
    };
  }

  if (Date.now() - session.validatedAt >= TOKEN_VALIDATION_INTERVAL_MS) {
    let validation: ValidationResponse;
    try {
      validation = await validateAccessToken(session.accessToken);
    } catch {
      const refreshed = await refreshAccessToken(session.refreshToken);
      session = {
        ...session,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: Date.now() + refreshed.expires_in * 1000,
        scopes: refreshed.scope,
      };
      validation = await validateAccessToken(session.accessToken);
    }
    if (validation.user_id !== config.allowedUserId) assertAllowedUser(validation.user_id);
    session.validatedAt = Date.now();
  }

  await saveSession(sessionId, session);
  return session;
}

export function createSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export async function revokeAccessToken(accessToken: string): Promise<void> {
  const { clientId } = twitchConfig();
  const body = new URLSearchParams({ client_id: clientId, token: accessToken });
  await fetch("https://id.twitch.tv/oauth2/revoke", { method: "POST", body });
}

export function publicSession(session: StoredSession) {
  return {
    authenticated: true,
    user: session.user,
    maintenanceAfter: Math.max(
      Date.now() + 30_000,
      Math.min(
        session.validatedAt + TOKEN_VALIDATION_INTERVAL_MS,
        session.expiresAt - TOKEN_REFRESH_MARGIN_MS,
      ),
    ),
  } as const;
}

export async function twitchApi<T>(
  session: StoredSession,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://api.twitch.tv/helix${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Client-Id": twitchConfig().clientId,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new TwitchApiError(
      body.message ?? `Twitch API returned ${response.status}`,
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
    );
  }
  return (await response.json()) as T;
}
