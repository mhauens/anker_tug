import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { AnchorScene, GAME_HEIGHT, GAME_WIDTH } from "../game/AnchorScene";
import type { GameState } from "../game/types";

interface GameCanvasProps {
  state: GameState;
}

export function GameCanvas({ state }: GameCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<AnchorScene | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const anchorScene = new AnchorScene();
    scene.current = anchorScene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: "#041622",
      scene: anchorScene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: { antialias: true, pixelArt: false },
    });

    return () => {
      scene.current = null;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    scene.current?.setGameState(state);
  }, [state]);

  return <div className="game-canvas" ref={host} aria-hidden="true" />;
}
