import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedEnvelope {
  version: 1;
  iv: string;
  ciphertext: string;
  tag: string;
}

function parseKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be exactly 32 bytes encoded as base64");
  }
  return key;
}

export function encryptJson(value: unknown, encodedKey: string): EncryptedEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", parseKey(encodedKey), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptJson<T>(
  envelope: EncryptedEnvelope,
  encodedKey: string,
): T {
  if (envelope.version !== 1) throw new Error("Unsupported encrypted payload version");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    parseKey(encodedKey),
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
