export async function readJson<T>(response: Response, endpoint: string): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    const body = await response.text();
    const receivedHtml = /^\s*<!doctype html/i.test(body) || /^\s*<html/i.test(body);
    const detail = receivedHtml
      ? "Die Anfrage wurde von der Oberfläche statt von einer Netlify Function beantwortet. Starte die App mit `pnpm netlify:dev` oder aktiviere VITE_DEMO_MODE für die reine Vite-Vorschau."
      : `JSON erwartet, aber ${contentType || "ein unbekannter Inhaltstyp"} erhalten.`;

    throw new Error(`${endpoint}: ${detail}`);
  }

  return (await response.json()) as T;
}
