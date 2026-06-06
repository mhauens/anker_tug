import type { ConnectionState, GameState } from "../game/types";
import {
  depthTicksForLevel,
  formatMeters,
  visualDepthPercent,
  votePullForLevel,
} from "../game/balance";

interface HudProps {
  state: GameState;
  connection: ConnectionState;
}

export function Hud({ state, connection }: HudProps) {
  const hypePercent = state.hypeGoal
    ? Math.min(100, (state.hypeProgress / state.hypeGoal) * 100)
    : 0;
  const matchWinner =
    state.streamerWins === state.chatWins
      ? "UNENTSCHIEDEN"
      : state.streamerWins > state.chatWins
        ? "STREAMER GEWINNT"
        : "CHAT GEWINNT";
  const totalVotes = state.voteCounts.pull + state.voteCounts.lower;
  const pullPercent = totalVotes
    ? (state.voteCounts.pull / totalVotes) * 100
    : 50;
  const depthTicks = depthTicksForLevel(state.hypeLevel);
  const hypePointsLabel = state.hypeGoal
    ? `${state.hypeProgress.toLocaleString("de-DE")} / ${state.hypeGoal.toLocaleString("de-DE")} Punkte`
    : "Wartet auf Punkte";
  const awardLabel = state.lastAward
    ? `${state.lastAward.points} ${
        state.lastAward.points === 1 ? "Punkt" : "Punkte"
      } für ${state.lastAward.side === "streamer" ? "Kami" : "Chat"}`
    : null;
  const zoneStepClass = (step?: number) => {
    if (step === undefined) return "";
    if (step < state.skillCheck.completedHits) return " skill-zone--locked";
    if (step === state.skillCheck.activeStep) return " skill-zone--active";
    return " skill-zone--queued";
  };

  return (
    <div className="hud">
      <header className="top-bar">
        <div className="brand-block">
          <span className="eyebrow">Streamer vs. Chat</span>
          <strong>ANCHOR TUG</strong>
        </div>
        <div className="scoreboard">
          <span>STREAMER <strong>{state.streamerWins}</strong></span>
          <b>RUNDE {state.roundNumber}</b>
          <span>CHAT <strong>{state.chatWins}</strong></span>
        </div>
        <div className="hype-block">
          <div className="hype-copy">
            <span>Hype Train</span>
            <strong>LEVEL {state.hypeLevel}</strong>
          </div>
          <div className="hype-progress">
            <div className="hype-track">
              <i style={{ width: `${hypePercent}%` }} />
            </div>
            <small className="hype-points">{hypePointsLabel}</small>
          </div>
        </div>
        <div className={`connection connection--${connection}`}>
          <i /> {connection === "connected" ? "Twitch live" : connection}
        </div>
      </header>

      <aside className="depth-meter">
        <span>OBERFLAECHE 0 m</span>
        <div className="depth-meter__body">
          <div className="depth-track">
            <i
              style={{
                top: `${visualDepthPercent(state.anchorDepth, state.hypeLevel)}%`,
              }}
            />
          </div>
          <div className="depth-scale" aria-hidden="true">
            {depthTicks.map((tick) => (
              <b
                key={tick}
                style={{
                  top: `${visualDepthPercent(tick, state.hypeLevel)}%`,
                }}
              >
                <i />
                <em>{formatMeters(tick)}</em>
              </b>
            ))}
          </div>
        </div>
        <span>MEERESGRUND {formatMeters(depthTicks[depthTicks.length - 1] ?? 0)}</span>
      </aside>

      {state.phase === "countdown" && (
        <div
          className={`center-callout${
            state.chatSkipRounds > 1 ? " center-callout--skip" : ""
          }`}
        >
          {awardLabel ? (
            <>
              <span>{state.chatSkipRounds > 1 ? "Sub-Burst" : "Punktgewinn"}</span>
              <strong>{awardLabel}</strong>
              {state.chatSkipRounds > 1 && (
                <p>Chat ueberspringt {state.chatSkipRounds} Runden</p>
              )}
            </>
          ) : (
            <>
              <span>Hype Train</span>
              <strong>BEREIT IN {state.countdownSeconds || "0"}s</strong>
            </>
          )}
        </div>
      )}

      {state.phase === "idle" && (
        <div className="center-callout center-callout--idle">
          <span>Bereit zum Tauziehen</span>
          <strong>WARTET AUF HYPE TRAIN</strong>
        </div>
      )}

      {state.phase === "result" && (
        <div className="result-card result-scoreboard">
          <span>Hype Train beendet</span>
          <strong>{matchWinner}</strong>
          <div className="result-score">
            <div>
              <span>STREAMER</span>
              <b>{state.streamerWins}</b>
            </div>
            <i>:</i>
            <div>
              <span>CHAT</span>
              <b>{state.chatWins}</b>
            </div>
          </div>
          <p>{state.lastImpact}</p>
        </div>
      )}

      {state.phase === "playing" && (
        <section className="vote-panel">
          <div className="vote-heading">
            <span>Community-Voting</span>
            <strong>{state.voteSecondsRemaining}s</strong>
          </div>
          <div className="vote-commands">
            <b>!SENKEN <em>{state.voteCounts.lower}</em></b>
            <b>!ZIEHEN <em>{state.voteCounts.pull}</em></b>
          </div>
          <div className="vote-balance">
            <i className="vote-balance__lower" style={{ width: `${100 - pullPercent}%` }} />
            <i className="vote-balance__pull" style={{ width: `${pullPercent}%` }} />
            <span style={{ left: `${pullPercent}%` }} />
          </div>
          <small>Gewinner bewegt den Anker um {formatMeters(votePullForLevel(state.hypeLevel))}</small>
        </section>
      )}

      {state.phase === "playing" && state.skillCheck.active && (
        <section
          className={`skill-panel skill-panel--${state.skillCheck.variantId} skill-panel--${state.skillCheck.theme}`}
        >
          <div>
            <span>{state.skillCheck.variantLabel}</span>
            <strong>{state.skillCheck.instruction}</strong>
          </div>
          <div className="skill-track">
            {state.skillCheck.zones.map((zone, index) => (
              <i
                key={`${zone.result}-${index}`}
                className={`skill-zone skill-${zone.result}${zoneStepClass(zone.step)}`}
                style={{
                  left: `${(zone.center - zone.width / 2) * 100}%`,
                  width: `${zone.width * 100}%`,
                }}
              />
            ))}
            <i
              className="skill-marker"
              style={{ left: `${state.skillCheck.progress * 100}%` }}
            />
          </div>
        </section>
      )}

      <div className="impact-toast">{state.lastImpact ?? "Der Anker wartet"}</div>
    </div>
  );
}
