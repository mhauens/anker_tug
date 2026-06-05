import { describe, expect, it } from "vitest";
import { MessageLru } from "./MessageLru";

describe("MessageLru", () => {
  it("deduplicates IDs and evicts the oldest entry", () => {
    const lru = new MessageLru(2);
    expect(lru.hasOrAdd("a")).toBe(false);
    expect(lru.hasOrAdd("a")).toBe(true);
    lru.hasOrAdd("b");
    lru.hasOrAdd("c");
    expect(lru.hasOrAdd("a")).toBe(false);
  });
});
