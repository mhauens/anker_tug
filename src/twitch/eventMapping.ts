import type { HypeTrainSnapshot, VoteCommand } from "../game/types";

export interface EventSubMetadata {
  message_id: string;
  message_type: string;
  message_timestamp: string;
  subscription_type?: string;
}

export interface EventSubEnvelope {
  metadata: EventSubMetadata;
  payload: {
    session?: {
      id: string;
      reconnect_url: string | null;
      keepalive_timeout_seconds: number | null;
    };
    event?: Record<string, unknown>;
    subscription?: Record<string, unknown>;
  };
}

export type MappedTwitchEvent =
  | { kind: "hype-begin" | "hype-progress"; snapshot: HypeTrainSnapshot }
  | { kind: "hype-end"; trainId: string }
  | { kind: "chat-vote"; userId: string; command: VoteCommand }
  | { kind: "regular-sub"; isGift: boolean }
  | { kind: "gift-subs"; total: number }
  | { kind: "ignored" };

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapHype(event: Record<string, unknown>): HypeTrainSnapshot {
  return {
    id: asString(event.id),
    startedAt: asString(event.started_at),
    level: Math.max(1, asNumber(event.level)),
    progress: asNumber(event.progress),
    goal: asNumber(event.goal),
    expiresAt: asString(event.expires_at),
  };
}

export function parseVote(text: string): VoteCommand | null {
  const command = text.trim().toLocaleLowerCase("de-DE").split(/\s+/)[0];
  if (command === "!ziehen") return "pull";
  if (command === "!senken") return "lower";
  return null;
}

export function mapEventSubNotification(
  envelope: EventSubEnvelope,
): MappedTwitchEvent {
  const type = envelope.metadata.subscription_type;
  const event = envelope.payload.event ?? {};

  switch (type) {
    case "channel.hype_train.begin":
      return { kind: "hype-begin", snapshot: mapHype(event) };
    case "channel.hype_train.progress":
      return { kind: "hype-progress", snapshot: mapHype(event) };
    case "channel.hype_train.end":
      return { kind: "hype-end", trainId: asString(event.id) };
    case "channel.chat.message": {
      const message = event.message as Record<string, unknown> | undefined;
      const command = parseVote(asString(message?.text));
      return command
        ? {
            kind: "chat-vote",
            userId: asString(event.chatter_user_id),
            command,
          }
        : { kind: "ignored" };
    }
    case "channel.subscribe":
      return { kind: "regular-sub", isGift: event.is_gift === true };
    case "channel.subscription.message":
      return { kind: "regular-sub", isGift: false };
    case "channel.subscription.gift":
      return { kind: "gift-subs", total: asNumber(event.total) };
    default:
      return { kind: "ignored" };
  }
}
