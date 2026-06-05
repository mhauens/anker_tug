import { describe, expect, it } from "vitest";
import { mapEventSubNotification, parseVote } from "./eventMapping";

describe("Twitch event mapping", () => {
  it("parses only supported chat commands", () => {
    expect(parseVote(" !SeNkEn ")).toBe("lower");
    expect(parseVote("!ziehen jetzt")).toBe("pull");
    expect(parseVote("hello")).toBeNull();
  });

  it("maps subscriptions without losing the gift flag", () => {
    const event = mapEventSubNotification({
      metadata: {
        message_id: "1",
        message_type: "notification",
        message_timestamp: new Date().toISOString(),
        subscription_type: "channel.subscribe",
      },
      payload: { event: { is_gift: true, tier: "2000" } },
    });
    expect(event).toEqual({ kind: "regular-sub", isGift: true, tier: "2000" });
  });

  it("preserves the full size of the largest gift burst", () => {
    const event = mapEventSubNotification({
      metadata: {
        message_id: "gift-1000",
        message_type: "notification",
        message_timestamp: new Date().toISOString(),
        subscription_type: "channel.subscription.gift",
      },
      payload: { event: { total: 1000, tier: "3000" } },
    });
    expect(event).toEqual({ kind: "gift-subs", total: 1000, tier: "3000" });
  });

  it("maps announced resubscriptions as one regular subscription", () => {
    const event = mapEventSubNotification({
      metadata: {
        message_id: "resub-1",
        message_type: "notification",
        message_timestamp: new Date().toISOString(),
        subscription_type: "channel.subscription.message",
      },
      payload: { event: { cumulative_months: 12, tier: "1000" } },
    });
    expect(event).toEqual({ kind: "regular-sub", isGift: false, tier: "1000" });
  });

  it("normalizes a Hype Train progress payload", () => {
    const event = mapEventSubNotification({
      metadata: {
        message_id: "2",
        message_type: "notification",
        message_timestamp: new Date().toISOString(),
        subscription_type: "channel.hype_train.progress",
      },
      payload: {
        event: {
          id: "train",
          started_at: "2026-06-05T11:55:00Z",
          level: 4,
          total: 6200,
          progress: 250,
          goal: 500,
          expires_at: "2026-06-05T12:00:00Z",
        },
      },
    });
    expect(event).toMatchObject({
      kind: "hype-progress",
      snapshot: {
        id: "train",
        startedAt: "2026-06-05T11:55:00Z",
        level: 4,
        total: 6200,
      },
    });
  });
});
