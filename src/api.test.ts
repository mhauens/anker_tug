import { describe, expect, it } from "vitest";
import { readJson } from "./api";

describe("readJson", () => {
  it("returns a JSON response", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

    await expect(readJson<{ ok: boolean }>(response, "/api/test")).resolves.toEqual({
      ok: true,
    });
  });

  it("explains when an API route falls through to the frontend", async () => {
    const response = new Response("<!doctype html><html></html>", {
      headers: { "Content-Type": "text/html" },
    });

    await expect(readJson(response, "/api/session")).rejects.toThrow(
      "/api/session: Die Anfrage wurde von der Oberfläche statt von einer Netlify Function beantwortet",
    );
  });
});
