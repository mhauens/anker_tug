import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { GameCanvas } from "./components/GameCanvas";
import { Hud } from "./components/Hud";
import { TestPanel } from "./components/TestPanel";
import { GameEngine } from "./game/GameEngine";
import type {
  ConnectionState,
  GameState,
  HypeTrainSnapshot,
} from "./game/types";
import { EventSubClient } from "./twitch/EventSubClient";
import type { MappedTwitchEvent } from "./twitch/eventMapping";
import { readJson } from "./api";

interface PublicSession {
  authenticated: boolean;
  user?: { id: string; login: string; displayName: string };
  maintenanceAfter?: number;
}

const STORAGE_KEY = "anchor-tug-game-state-v1";
const demoMode = import.meta.env.VITE_DEMO_MODE === "true";

function getOAuthError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("auth_error") ?? params.get("error");
  if (!code) return null;
  const description = params.get("error_description");
  return `Twitch-Anmeldung fehlgeschlagen: ${description ?? code}`;
}

function applyTwitchEvent(engine: GameEngine, event: MappedTwitchEvent): void {
  switch (event.kind) {
    case "hype-begin":
    case "hype-progress":
      engine.onHypeProgress(event.snapshot);
      break;
    case "hype-end":
      engine.onHypeEnd(event.trainId);
      break;
    case "chat-vote":
      engine.castVote(event.userId, event.command);
      break;
    case "regular-sub":
      engine.onRegularSub(event.isGift);
      break;
    case "gift-subs":
      engine.onGiftSubs(event.total);
      break;
    case "ignored":
      break;
  }
}

export default function App() {
  const engine = useMemo(() => new GameEngine(), []);
  const [gameState, setGameState] = useState<GameState>(engine.getState());
  const [session, setSession] = useState<PublicSession | null>(null);
  const [connection, setConnection] = useState<ConnectionState>(
    demoMode ? "connected" : "disconnected",
  );
  const [error, setError] = useState<string | null>(() => {
    return getOAuthError();
  });
  const eventSub = useRef<EventSubClient | null>(null);
  const demoStarted = useRef(false);

  useEffect(() => engine.subscribe(setGameState), [engine]);

  useEffect(() => {
    const oauthError = getOAuthError();
    if (oauthError && window.opener && window.opener !== window) {
      window.opener.postMessage(
        { type: "anchor-tug-oauth-error", message: oauthError },
        window.location.origin,
      );
      window.close();
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "anchor-tug-oauth-error") return;
      setError(String(event.data.message));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (demoMode) {
      setSession({
        authenticated: true,
        user: { id: "demo", login: "demo", displayName: "Demo Streamer" },
      });
      if (
        !demoStarted.current &&
        new URLSearchParams(window.location.search).get("autostart") === "1"
      ) {
        demoStarted.current = true;
        engine.startRound({
          id: "visual-demo",
          level: 3,
          progress: 320,
          goal: 500,
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        });
        for (let index = 0; index < 8; index += 1) {
          engine.castVote(`visual-viewer-${index}`, index < 6 ? "pull" : "lower");
        }
      }
      return;
    }

    void fetch("/api/session", { credentials: "same-origin" })
      .then(async (response) => {
        if (response.status === 401) return { authenticated: false };
        if (!response.ok) throw new Error("Session konnte nicht geladen werden.");
        return readJson<PublicSession>(response, "/api/session");
      })
      .then(setSession)
      .catch((reason: unknown) => {
        setSession({ authenticated: false });
        setError(reason instanceof Error ? reason.message : "Unbekannter Sessionfehler");
      });
  }, [engine]);

  useEffect(() => {
    if (!session?.authenticated || demoMode || !session.maintenanceAfter) return;
    const delay = Math.max(1_000, session.maintenanceAfter - Date.now());
    const timer = window.setTimeout(() => {
      void fetch("/api/session", { credentials: "same-origin" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Twitch-Sitzung ist abgelaufen.");
          return readJson<PublicSession>(response, "/api/session");
        })
        .then(setSession)
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "Tokenwartung fehlgeschlagen");
          setSession({ authenticated: false });
        });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [session]);

  useEffect(() => {
    if (!session?.authenticated || demoMode) return;

    let initialized = false;
    let disposed = false;
    const pendingEvents: MappedTwitchEvent[] = [];
    const client = new EventSubClient({
      onConnection: setConnection,
      onError: setError,
      onEvent: (event) => {
        if (disposed) return;
        if (!initialized) {
          pendingEvents.push(event);
          return;
        }
        applyTwitchEvent(engine, event);
      },
    });
    eventSub.current = client;
    client.connect();

    void fetch("/api/hype/status", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Hype-Train-Status konnte nicht geladen werden.");
        return readJson<{ current: HypeTrainSnapshot | null }>(
          response,
          "/api/hype/status",
        );
      })
      .then(({ current }) => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (current && saved) {
          const parsed = JSON.parse(saved) as GameState;
          if (parsed.trainId === current.id && parsed.phase !== "result") {
            engine.hydrate({
              ...parsed,
              hypeLevel: current.level,
              hypeProgress: current.progress,
              hypeGoal: current.goal,
              expiresAt: current.expiresAt,
            });
          } else {
            engine.startRound(current);
          }
        } else if (current) {
          engine.startRound(current);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Hype-Statusfehler"),
      )
      .finally(() => {
        if (disposed) return;
        initialized = true;
        for (const event of pendingEvents) applyTwitchEvent(engine, event);
        pendingEvents.length = 0;
      });

    return () => {
      disposed = true;
      client.disconnect();
      eventSub.current = null;
    };
  }, [engine, session?.authenticated]);

  useEffect(() => {
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      engine.tick(now - previous, Date.now(), connection === "connected");
      previous = now;
    }, 50);
    return () => window.clearInterval(timer);
  }, [connection, engine]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = engine.getState();
      if (current.phase === "playing" || current.phase === "countdown") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      } else if (current.phase === "idle") {
        localStorage.removeItem(STORAGE_KEY);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [engine]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        engine.hitSkillCheck();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine]);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    window.location.reload();
  };

  const beginTwitchLogin = (event: MouseEvent<HTMLAnchorElement>) => {
    if (import.meta.env.DEV && window.location.port !== "8888") {
      event.preventDefault();
      setError(
        "Der Twitch-Login benötigt Netlify Functions. Starte `pnpm netlify:dev` und öffne http://localhost:8888.",
      );
      return;
    }

    event.preventDefault();
    const popup = window.open(
      "/api/auth/login",
      "anchor-tug-twitch-login",
      "popup=yes,width=520,height=760,resizable=yes,scrollbars=yes",
    );
    if (!popup) {
      setError("Das Twitch-Loginfenster wurde blockiert. Erlaube Pop-ups für localhost.");
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        return;
      }
      if (Date.now() - startedAt > 5 * 60_000) {
        window.clearInterval(timer);
        return;
      }

      void fetch("/api/session", { credentials: "same-origin" }).then(async (response) => {
        if (response.status === 401) return;
        if (!response.ok) return;
        const authenticatedSession = await readJson<PublicSession>(response, "/api/session");
        if (!authenticatedSession.authenticated) return;
        window.clearInterval(timer);
        popup.close();
        setError(null);
        setSession(authenticatedSession);
      });
    }, 1_000);
  };

  if (!session) {
    return <main className="splash"><strong>ANCHOR TUG</strong><span>Verbindung wird vorbereitet...</span></main>;
  }

  if (!session.authenticated) {
    return (
      <main className="login-page">
        <section className="login-card">
          <span className="eyebrow">Streamer vs. Chat</span>
          <h1>ANCHOR<br />TUG</h1>
          <p>Halte deinen Anker am Meeresgrund, waehrend der Twitch-Chat ihn mit jedem Kommando und Sub an die Oberflaeche zieht.</p>
          {error && <p className="error-message">{error}</p>}
          <a
            className="twitch-button"
            href="/api/auth/login"
            onClick={beginTwitchLogin}
          >
            Mit Twitch verbinden
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="stage">
        <GameCanvas state={gameState} />
        <Hud state={gameState} connection={connection} />
        <TestPanel engine={engine} state={gameState} />
        <div className="control-strip">
          <div>
            <span>Verbunden als</span>
            <strong>{session.user?.displayName}</strong>
          </div>
          {error && <p className="error-message">{error}</p>}
          {!demoMode && <button className="logout-button" onClick={logout}>Trennen</button>}
        </div>
      </div>
    </main>
  );
}
