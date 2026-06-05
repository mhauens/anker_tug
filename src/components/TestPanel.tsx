import { useRef } from "react";
import type { GameEngine } from "../game/GameEngine";
import type { GameState, VoteCommand } from "../game/types";

interface TestPanelProps {
  engine: GameEngine;
  state: GameState;
}

export function TestPanel({ engine, state }: TestPanelProps) {
  const voter = useRef(0);

  const vote = (command: VoteCommand) => {
    voter.current += 1;
    engine.castVote(`test-viewer-${voter.current}`, command);
  };

  const start = () => {
    engine.startRound({
      id: `test-${Date.now()}`,
      level: 1,
      progress: 120,
      goal: 500,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
  };

  return (
    <details className="test-panel">
      <summary><span>Testmodus</span></summary>
      <div className="test-panel__grid">
        <button onClick={start}>Runde starten</button>
        <button
          disabled={!state.trainId}
          onClick={() =>
            state.trainId &&
            engine.onHypeProgress({
              id: state.trainId,
              level: state.hypeLevel + 1,
              progress: 50,
              goal: Math.max(500, state.hypeGoal),
              expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
            })
          }
        >
          Level +1
        </button>
        <button onClick={() => engine.onRegularSub(false)}>Sub</button>
        {[5, 10, 20, 50, 100, 200].map((total) => (
          <button key={total} onClick={() => engine.onGiftSubs(total)}>
            {total} Gift-Subs
          </button>
        ))}
        <button onClick={() => vote("pull")}>Vote ziehen</button>
        <button onClick={() => vote("lower")}>Vote senken</button>
        <button onClick={() => engine.hitSkillCheck()}>Skillcheck</button>
        <button
          disabled={!state.trainId}
          onClick={() => state.trainId && engine.onHypeEnd(state.trainId)}
        >
          Runde beenden
        </button>
        <button onClick={() => engine.reset()}>Zuruecksetzen</button>
      </div>
    </details>
  );
}
