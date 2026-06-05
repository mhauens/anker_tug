import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "./crypto.js";

describe("token encryption", () => {
  it("round-trips JSON with AES-256-GCM", () => {
    const key = randomBytes(32).toString("base64");
    const envelope = encryptJson({ token: "secret", count: 3 }, key);
    expect(envelope.ciphertext).not.toContain("secret");
    expect(decryptJson(envelope, key)).toEqual({ token: "secret", count: 3 });
  });

  it("rejects malformed keys", () => {
    expect(() => encryptJson({ token: "secret" }, "bad-key")).toThrow(/32 bytes/);
  });
});
