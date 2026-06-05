import { describe, expect, it } from "vitest";
import {
  BALANCE,
  roundDepthForLevel,
  skillStrengthForLevel,
  visualDepthPercent,
} from "./balance";
import { GameEngine } from "./GameEngine";

const future = () => new Date(Date.now() + 60_000).toISOString();

function startPlaying(engine: GameEngine, level = 1): void {
  engine.startRound({ id: "train-1", level, progress: 0, goal: 500, expiresAt: future() });
  for (let index = 0; index < 13; index += 1) engine.tick(250, Date.now(), true);
  expect(engine.getState().phase).toBe("playing");
}

describe("GameEngine", () => {
  it("starts every level visually near the seabed", () => {
    for (let level = 1; level <= 6; level += 1) {
      expect(visualDepthPercent(roundDepthForLevel(level), level)).toBe(88);
    }
    expect(visualDepthPercent(0, 1)).toBe(0);
  });

  it("keeps skillchecks balanced against regular subscriptions", () => {
    expect(BALANCE.skillGoodSink).toBe(BALANCE.regularSubPull * 15);
    expect(BALANCE.skillGreatSink).toBe(BALANCE.regularSubPull * 25);
    expect(BALANCE.skillPerfectSink).toBe(BALANCE.regularSubPull * 40);
    expect(BALANCE.skillPerfectSink).toBe(BALANCE.giftSubPullMaximum);
  });

  it("makes early levels shorter and their skillchecks proportionally weaker", () => {
    expect(roundDepthForLevel(1)).toBe(BALANCE.regularSubPull * 10);
    expect(roundDepthForLevel(6)).toBe(BALANCE.initialDepth);
    expect(skillStrengthForLevel(1)).toBe(0.2);
    expect(skillStrengthForLevel(6)).toBe(1);
  });

  it("keeps large gift tiers visibly distinct", () => {
    const pullFor = (total: number) =>
      Math.min(
        Math.sqrt(total) * BALANCE.giftSubPullSquareRoot,
        BALANCE.giftSubPullMaximum,
      );
    expect(pullFor(100) - pullFor(20)).toBeGreaterThan(9);
    expect(pullFor(200) - pullFor(100)).toBeGreaterThan(5);
  });

  it("applies natural sinking while connected", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);
    const before = engine.getState().anchorDepth;
    engine.tick(250, Date.now(), true);
    expect(engine.getState().anchorDepth).toBeCloseTo(
      before + BALANCE.naturalSinkPerSecond * 0.25,
    );
  });

  it("pauses forces while disconnected but still respects the official timer", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);
    const before = engine.getState().anchorDepth;
    engine.tick(250, Date.now(), false);
    expect(engine.getState().anchorDepth).toBe(before);
    engine.tick(250, Date.now() + 120_000, false);
    expect(engine.getState().winner).toBe("streamer");
  });

  it("keeps only the latest vote per user and resolves pull after 30 seconds", () => {
    const engine = new GameEngine(() => 0);
    const control = new GameEngine(() => 0);
    startPlaying(engine);
    startPlaying(control);
    engine.castVote("user-a", "lower");
    engine.castVote("user-a", "pull");
    engine.castVote("user-b", "pull");
    expect(engine.getState().voteCounts).toEqual({ pull: 2, lower: 0 });
    for (let index = 0; index < 120; index += 1) {
      engine.tick(250, Date.now(), true);
      control.tick(250, Date.now(), true);
    }
    expect(engine.getState().anchorDepth).toBeCloseTo(
      control.getState().anchorDepth - BALANCE.regularSubPull,
    );
    expect(engine.getState().voteSecondsRemaining).toBe(BALANCE.voteWindowSeconds);
  });

  it("lets a large gift wave win an early-level round", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);
    const before = engine.getState().anchorDepth;
    engine.onRegularSub(true);
    expect(engine.getState().anchorDepth).toBe(before);
    engine.onGiftSubs(200);
    const state = engine.getState();
    const appliedPull =
      before +
      (state.chatWins - 1) * roundDepthForLevel(1) +
      (roundDepthForLevel(1) - state.anchorDepth);
    expect(state.chatWins).toBeGreaterThan(1);
    expect(state.phase).toBe("countdown");
    expect(appliedPull).toBeCloseTo(BALANCE.giftSubPullMaximum);
  });

  it("lets repeated regular subs win and restart early-level rounds", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);
    const startingDepth = engine.getState().anchorDepth;
    for (let index = 0; index < 100; index += 1) engine.onRegularSub(false);
    const state = engine.getState();
    const appliedPull =
      startingDepth +
      (state.chatWins - 1) * roundDepthForLevel(1) +
      (roundDepthForLevel(1) - state.anchorDepth);
    expect(state.chatWins).toBeGreaterThan(0);
    expect(state.phase).toBe("countdown");
    expect(state.roundNumber).toBe(state.chatWins + 1);
    expect(appliedPull).toBeCloseTo(100 * BALANCE.regularSubPull);
  });

  it("processes subscription bursts during countdown without dropping events", () => {
    const engine = new GameEngine(() => 0);
    engine.startRound({
      id: "burst-train",
      level: 6,
      progress: 0,
      goal: 5000,
      expiresAt: future(),
    });
    for (let index = 0; index < 100; index += 1) {
      engine.onRegularSub(false);
    }
    expect(engine.getState().phase).toBe("countdown");
    expect(engine.getState().anchorDepth).toBeCloseTo(
      roundDepthForLevel(6) - 100 * BALANCE.regularSubPull,
    );
  });

  it("processes a thousand rapid subscription events without losing the match", () => {
    const engine = new GameEngine(() => 0);
    engine.startRound({
      id: "large-burst",
      level: 6,
      progress: 0,
      goal: 50_000,
      expiresAt: future(),
    });
    for (let index = 0; index < 1000; index += 1) {
      engine.onRegularSub(false);
    }
    expect(engine.getState().chatWins).toBeGreaterThan(5);
    expect(engine.getState().roundNumber).toBe(engine.getState().chatWins + 1);
  });

  it("awards the streamer on level-up and starts the next round", () => {
    const engine = new GameEngine(() => 0.5);
    engine.onHypeProgress({ id: "late-begin", level: 2, progress: 10, goal: 100, expiresAt: future() });
    expect(engine.getState().phase).toBe("countdown");
    startPlaying(engine);
    engine.onHypeProgress({ id: "train-1", level: 3, progress: 20, goal: 500, expiresAt: future() });
    expect(engine.getState()).toMatchObject({
      phase: "countdown",
      hypeLevel: 3,
      streamerWins: 2,
      chatWins: 0,
      roundNumber: 2,
      anchorDepth: roundDepthForLevel(3),
    });
  });

  it("does not regress when Twitch delivers Hype Train events out of order", () => {
    const engine = new GameEngine(() => 0);
    const startedAt = "2026-06-05T12:00:00Z";
    engine.onHypeProgress({
      id: "train-ordered",
      startedAt,
      level: 3,
      progress: 300,
      goal: 500,
      expiresAt: future(),
    });
    engine.onHypeProgress({
      id: "train-ordered",
      startedAt,
      level: 2,
      progress: 90,
      goal: 200,
      expiresAt: future(),
    });
    engine.onHypeProgress({
      id: "train-ordered",
      startedAt,
      level: 3,
      progress: 250,
      goal: 500,
      expiresAt: future(),
    });
    expect(engine.getState()).toMatchObject({
      trainId: "train-ordered",
      hypeLevel: 3,
      hypeProgress: 300,
      hypeGoal: 500,
    });
  });

  it("ignores delayed events from an older Hype Train", () => {
    const engine = new GameEngine(() => 0);
    engine.onHypeProgress({
      id: "new-train",
      startedAt: "2026-06-05T13:00:00Z",
      level: 2,
      progress: 20,
      goal: 100,
      expiresAt: future(),
    });
    engine.onHypeProgress({
      id: "old-train",
      startedAt: "2026-06-05T12:00:00Z",
      level: 6,
      progress: 900,
      goal: 1000,
      expiresAt: future(),
    });
    expect(engine.getState().trainId).toBe("new-train");
  });

  it("awards the chat at the surface and restarts the same level", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);
    while (engine.getState().chatWins === 0) engine.onRegularSub(false);
    expect(engine.getState()).toMatchObject({
      phase: "countdown",
      hypeLevel: 1,
      streamerWins: 0,
      chatWins: 1,
      roundNumber: 2,
    });
    expect(engine.getState().anchorDepth).toBeLessThan(roundDepthForLevel(1));
  });

  it("awards the final held level when the Hype Train ends", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);
    engine.onHypeEnd("train-1");
    expect(engine.getState()).toMatchObject({
      phase: "result",
      winner: "streamer",
      streamerWins: 1,
      chatWins: 0,
    });
  });

  it("creates a level-scaled skillcheck and applies a perfect hit", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);
    while (!engine.getState().skillCheck.active) {
      engine.tick(100, Date.now(), true);
    }
    const active = engine.getState().skillCheck;
    expect(active.active).toBe(true);
    while (engine.getState().skillCheck.progress < active.targetCenter) {
      engine.tick(20, Date.now(), true);
    }
    const before = engine.getState().anchorDepth;
    engine.hitSkillCheck();
    expect(engine.getState().skillCheck.result).toBe("perfect");
    expect(engine.getState().anchorDepth).toBeGreaterThan(before);
  });

  it("lets a perfect skillcheck counter the largest gift wave", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine, 6);
    engine.onGiftSubs(200);
    const afterGiftWave = engine.getState().anchorDepth;
    while (!engine.getState().skillCheck.active) {
      engine.tick(100, Date.now(), true);
    }
    const target = engine.getState().skillCheck.targetCenter;
    while (engine.getState().skillCheck.progress < target) {
      engine.tick(20, Date.now(), true);
    }
    engine.hitSkillCheck();
    expect(engine.getState().anchorDepth).toBeGreaterThan(
      afterGiftWave + BALANCE.giftSubPullMaximum,
    );
  });
});
