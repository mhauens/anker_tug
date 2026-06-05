import Phaser from "phaser";
import type { GameState } from "./types";
import { visualDepthPercent } from "./balance";
import anchorAsset from "../assets/anker.webp";
import backgroundAsset from "../assets/background.webp";

export const GAME_WIDTH = 1600;
export const GAME_HEIGHT = 900;

export class AnchorScene extends Phaser.Scene {
  private state: GameState | null = null;
  private chain!: Phaser.GameObjects.Graphics;
  private anchor!: Phaser.GameObjects.Image;
  private bubbles: Phaser.GameObjects.Arc[] = [];
  private depthGlow!: Phaser.GameObjects.Arc;

  constructor() {
    super("anchor-tug");
  }

  preload(): void {
    this.load.image("anchor", anchorAsset);
    this.load.image("ocean-background", backgroundAsset);
  }

  create(): void {
    this.drawOcean();
    this.chain = this.add.graphics();
    this.anchor = this.createAnchor();
    this.depthGlow = this.add.circle(GAME_WIDTH / 2, 700, 110, 0x52d8ff, 0.08);
    this.depthGlow.setBlendMode(Phaser.BlendModes.ADD);

    for (let index = 0; index < 32; index += 1) {
      const bubble = this.add.circle(
        Phaser.Math.Between(80, GAME_WIDTH - 80),
        Phaser.Math.Between(130, GAME_HEIGHT),
        Phaser.Math.Between(3, 10),
        0xc9f5ff,
        Phaser.Math.FloatBetween(0.12, 0.4),
      );
      this.bubbles.push(bubble);
    }
  }

  update(_time: number, delta: number): void {
    const speed = delta * 0.035;
    for (const bubble of this.bubbles) {
      bubble.y -= speed * (0.5 + bubble.radius / 8);
      bubble.x += Math.sin((bubble.y + bubble.x) * 0.01) * 0.2;
      if (bubble.y < 110) {
        bubble.y = GAME_HEIGHT + 20;
        bubble.x = Phaser.Math.Between(80, GAME_WIDTH - 80);
      }
    }

    if (!this.state) return;
    const visualDepth = visualDepthPercent(
      this.state.anchorDepth,
      this.state.hypeLevel,
    );
    const anchorY = Phaser.Math.Linear(190, 640, visualDepth / 100);
    this.anchor.y = Phaser.Math.Linear(this.anchor.y, anchorY, 0.12);
    this.anchor.rotation = Math.sin(this.time.now * 0.002) * 0.035;
    this.depthGlow.setPosition(this.anchor.x, this.anchor.y + 95);

    this.chain.clear();
    this.chain.lineStyle(16, 0x20384c, 0.95);
    this.chain.beginPath();
    this.chain.moveTo(GAME_WIDTH / 2, 80);
    const sway = Math.sin(this.time.now * 0.0017) * 24;
    this.chain.lineTo(GAME_WIDTH / 2 + sway, this.anchor.y / 2);
    this.chain.lineTo(this.anchor.x, this.anchor.y - 174);
    this.chain.strokePath();
    this.chain.lineStyle(4, 0x78b7ca, 0.4);
    this.chain.strokeCircle(GAME_WIDTH / 2, 83, 17);
  }

  setGameState(state: GameState): void {
    this.state = state;
  }

  private drawOcean(): void {
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "ocean-background")
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x02111d,
      0.18,
    );
  }

  private createAnchor(): Phaser.GameObjects.Image {
    const anchor = this.add.image(GAME_WIDTH / 2, 640, "anchor");
    anchor.setDisplaySize(248, 360);
    return anchor;
  }
}
