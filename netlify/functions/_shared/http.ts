export const SESSION_COOKIE = "anchor_tug_session";
export const OAUTH_STATE_COOKIE = "anchor_tug_oauth_state";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function parseCookies(req: Request): Record<string, string> {
  const cookie = req.headers.get("cookie") ?? "";
  return Object.fromEntries(
    cookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [
          decodeURIComponent(part.slice(0, index)),
          decodeURIComponent(part.slice(index + 1)),
        ];
      }),
  );
}

export function makeCookie(
  req: Request,
  name: string,
  value: string,
  maxAge: number,
): string {
  const url = new URL(req.url);
  const secure = url.protocol === "https:";
  return [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearCookie(req: Request, name: string): string {
  return makeCookie(req, name, "", 0);
}

export function getSessionId(req: Request): string | null {
  return parseCookies(req)[SESSION_COOKIE] ?? null;
}

export function requireSameOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  if (origin !== new URL(req.url).origin) return json({ error: "Invalid origin" }, 403);
  return null;
}

export function methodNotAllowed(): Response {
  return json({ error: "Method not allowed" }, 405);
}
