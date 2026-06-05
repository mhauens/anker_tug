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
      payload: { event: { is_gift: true } },
    });
    expect(event).toEqual({ kind: "regular-sub", isGift: true });
  });

  it("preserves the full size of large gift bursts", () => {
    const event = mapEventSubNotification({
      metadata: {
        message_id: "gift-200",
        message_type: "notification",
        message_timestamp: new Date().toISOString(),
        subscription_type: "channel.subscription.gift",
      },
      payload: { event: { total: 200 } },
    });
    expect(event).toEqual({ kind: "gift-subs", total: 200 });
  });

  it("maps announced resubscriptions as one regular subscription", () => {
    const event = mapEventSubNotification({
      metadata: {
        message_id: "resub-1",
        message_type: "notification",
        message_timestamp: new Date().toISOString(),
        subscription_type: "channel.subscription.message",
      },
      payload: { event: { cumulative_months: 12 } },
    });
    expect(event).toEqual({ kind: "regular-sub", isGift: false });
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
      },
    });
  });
});
