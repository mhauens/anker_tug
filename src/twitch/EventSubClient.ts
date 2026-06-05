import type { ConnectionState } from "../game/types";
import { readJson } from "../api";
import {
  mapEventSubNotification,
  type EventSubEnvelope,
  type MappedTwitchEvent,
} from "./eventMapping";
import { MessageLru } from "./MessageLru";

interface EventSubClientOptions {
  onConnection: (state: ConnectionState) => void;
  onEvent: (event: MappedTwitchEvent) => void;
  onError: (message: string) => void;
}

const DEFAULT_URL = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";

export class EventSubClient {
  private socket: WebSocket | null = null;
  private handoffSocket: WebSocket | null = null;
  private stopped = false;
  private retry = 0;
  private reconnectTimer: number | null = null;
  private watchdogTimer: number | null = null;
  private keepaliveTimeoutMs = 35_000;
  private messageQueue: Promise<void> = Promise.resolve();
  private readonly seen = new MessageLru(10_000);

  constructor(private readonly options: EventSubClientOptions) {}

  connect(): void {
    this.stopped = false;
    this.open(DEFAULT_URL, false);
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    if (this.watchdogTimer) window.clearTimeout(this.watchdogTimer);
    this.socket?.close(1000, "Client shutdown");
    if (this.handoffSocket && this.handoffSocket !== this.socket) {
      this.handoffSocket.close(1000, "Client shutdown");
    }
    this.socket = null;
    this.handoffSocket = null;
    this.options.onConnection("disconnected");
  }

  private open(url: string, handoff: boolean): void {
    this.options.onConnection(handoff ? "reconnecting" : "connecting");
    const next = new WebSocket(url);
    if (handoff) this.handoffSocket = next;

    next.addEventListener("message", (event) => {
      this.messageQueue = this.messageQueue
        .then(() => this.handleMessage(next, event.data, handoff))
        .catch((reason: unknown) => {
          this.options.onError(
            reason instanceof Error
              ? `EventSub-Nachricht fehlgeschlagen: ${reason.message}`
              : "EventSub-Nachricht konnte nicht verarbeitet werden.",
          );
        });
    });
    next.addEventListener("close", () => {
      if (this.stopped) return;
      if (next === this.handoffSocket) {
        this.handoffSocket = null;
        const old = this.socket;
        this.socket = null;
        if (old && old !== next) old.close(4000, "Reconnect handoff failed");
        this.scheduleReconnect();
        return;
      }
      if (next !== this.socket) return;
      this.socket = null;
      if (this.handoffSocket) return;
      this.scheduleReconnect();
    });
    next.addEventListener("error", () => {
      this.options.onError("Twitch EventSub WebSocket meldet einen Fehler.");
    });

    if (!handoff) this.socket = next;
  }

  private async handleMessage(
    source: WebSocket,
    raw: string,
    handoff: boolean,
  ): Promise<void> {
    let envelope: EventSubEnvelope;
    try {
      envelope = JSON.parse(raw) as EventSubEnvelope;
    } catch {
      this.options.onError("Ungültige Twitch-Nachricht empfangen.");
      return;
    }

    const { metadata, payload } = envelope;
    if (source === this.socket) this.armWatchdog(source);
    if (metadata.message_type === "session_welcome") {
      const old = this.socket;
      this.socket = source;
      if (source === this.handoffSocket) this.handoffSocket = null;
      this.retry = 0;
      const keepaliveSeconds = payload.session?.keepalive_timeout_seconds;
      if (typeof keepaliveSeconds === "number" && keepaliveSeconds > 0) {
        this.keepaliveTimeoutMs = (keepaliveSeconds + 5) * 1000;
        this.armWatchdog(source);
      }
      if (handoff) {
        this.options.onConnection("connected");
        if (old && old !== source) old.close(1000, "Reconnect handoff complete");
      } else {
        const sessionId = payload.session?.id;
        if (!sessionId) {
          source.close(4000, "Welcome missing session ID");
          return;
        }
        const response = await fetch("/api/eventsub/subscribe", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (!response.ok) {
          const body = await readJson<{ error?: string }>(
            response,
            "/api/eventsub/subscribe",
          ).catch((reason: unknown) => ({
            error: reason instanceof Error ? reason.message : undefined,
          }));
          this.options.onError(body.error ?? "EventSub-Abos konnten nicht erstellt werden.");
          source.close(4000, "Subscription failed");
          return;
        }
        this.options.onConnection("connected");
      }
      return;
    }

    if (metadata.message_type === "session_reconnect") {
      const reconnectUrl = payload.session?.reconnect_url;
      if (reconnectUrl && !this.handoffSocket) this.open(reconnectUrl, true);
      return;
    }

    if (metadata.message_type === "revocation") {
      this.options.onError("Twitch hat ein EventSub-Abo widerrufen.");
      return;
    }

    if (metadata.message_type !== "notification") return;
    if (this.seen.hasOrAdd(metadata.message_id)) return;
    this.options.onEvent(mapEventSubNotification(envelope));
  }

  private scheduleReconnect(): void {
    this.options.onConnection("reconnecting");
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    const delay = Math.min(30_000, 1000 * 2 ** this.retry++);
    this.reconnectTimer = window.setTimeout(() => this.open(DEFAULT_URL, false), delay);
  }

  private armWatchdog(source: WebSocket): void {
    if (this.watchdogTimer) window.clearTimeout(this.watchdogTimer);
    this.watchdogTimer = window.setTimeout(() => {
      if (this.stopped || source !== this.socket) return;
      this.options.onError("Twitch EventSub war zu lange still. Verbindung wird erneuert.");
      source.close(4000, "Keepalive timeout");
    }, this.keepaliveTimeoutMs);
  }
}
