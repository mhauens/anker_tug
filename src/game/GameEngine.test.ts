import { describe, expect, it } from "vitest";
import {
  BALANCE,
  giftSubCountForTotal,
  giftSubPullForTotal,
  hypeTrainProgressForTotal,
  hypeTrainTotalPointsForProgress,
  naturalSinkForLevel,
  regularSubPullForLevel,
  roundDepthForLevel,
  skillStrengthForLevel,
  visualDepthPercent,
  votePullForLevel,
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
    expect(BALANCE.skillGoodSink).toBe(BALANCE.regularSubPull * 5);
    expect(BALANCE.skillGreatSink).toBe(BALANCE.regularSubPull * 10);
    expect(BALANCE.skillPerfectSink).toBe(BALANCE.regularSubPull * 20);
    expect(giftSubPullForTotal(2, 1, "3000")).toBeGreaterThan(
      BALANCE.skillPerfectSink,
    );
  });

  it("makes early levels shorter and their skillchecks proportionally weaker", () => {
    expect(roundDepthForLevel(1)).toBe(BALANCE.regularSubPull * 10);
    expect(roundDepthForLevel(6)).toBe(BALANCE.initialDepth);
    expect(skillStrengthForLevel(1)).toBe(0.2);
    expect(skillStrengthForLevel(6)).toBe(1);
  });

  it("keeps skillchecks demanding but fair across levels", () => {
    // Low levels stay tight (narrow base zone, brisk marker) so they are not
    // trivial; the gentle per-level width loss keeps high levels playable.
    expect(BALANCE.skillBaseDurationSeconds).toBeLessThan(2.5);
    expect(BALANCE.skillBaseGoodWidth).toBeLessThan(0.3);
    expect(BALANCE.skillMinimumGoodWidth).toBeLessThan(0.2);
    expect(BALANCE.skillMinimumGoodWidth).toBeGreaterThan(0.15);
    expect(BALANCE.skillSpeedPerLevel).toBeGreaterThan(0.05);
  });

  it("sinks the anchor faster on higher levels", () => {
    expect(naturalSinkForLevel(1)).toBeCloseTo(BALANCE.naturalSinkPerSecond);
    expect(naturalSinkForLevel(6)).toBeGreaterThan(naturalSinkForLevel(1));
    expect(naturalSinkForLevel(6)).toBeCloseTo(
      BALANCE.naturalSinkPerSecond * (1 + 5 * BALANCE.naturalSinkPerLevel),
    );
  });

  it("keeps subscriptions impactful at very high levels", () => {
    // Past the pull-goal cap the meters-per-sub plateau instead of collapsing.
    expect(regularSubPullForLevel(30)).toBeCloseTo(
      (BALANCE.tier1SubPoints / BALANCE.maxHypePullGoal) * roundDepthForLevel(30),
    );
    // Without the cap a level-30 sub would barely move the anchor.
    const uncapped =
      (BALANCE.tier1SubPoints / 82200) * roundDepthForLevel(30);
    expect(regularSubPullForLevel(30)).toBeGreaterThan(uncapped * 3);
    // A single large gift bomb frees the anchor at level 30, so the chat keeps
    // a real chance no matter how high the Hype Train has climbed.
    expect(giftSubPullForTotal(100, 30)).toBeGreaterThan(roundDepthForLevel(30));
  });

  it("scales community voting impact with the current hype level", () => {
    expect(votePullForLevel(1)).toBeCloseTo(
      roundDepthForLevel(1) * BALANCE.votePullDepthFraction,
    );
    expect(votePullForLevel(6)).toBeCloseTo(
      roundDepthForLevel(6) * BALANCE.votePullDepthFraction,
    );
    expect(votePullForLevel(6)).toBeGreaterThan(votePullForLevel(1));
    // Depth caps at level 6, so voting keeps the same real impact on high levels.
    expect(votePullForLevel(30)).toBe(votePullForLevel(6));
  });

  it("scales subs from Twitch Hype Train points", () => {
    expect(giftSubCountForTotal(1001)).toBe(1000);
    expect(regularSubPullForLevel(1)).toBeCloseTo((500 / 1600) * roundDepthForLevel(1));
    expect(regularSubPullForLevel(1, "2000")).toBeCloseTo(
      regularSubPullForLevel(1) * 2,
    );
    expect(regularSubPullForLevel(1, "3000")).toBeCloseTo(
      regularSubPullForLevel(1) * 5,
    );
    expect(giftSubPullForTotal(6) - giftSubPullForTotal(5)).toBeCloseTo(
      regularSubPullForLevel(1),
    );
    expect(giftSubPullForTotal(20) - giftSubPullForTotal(5)).toBeCloseTo(
      regularSubPullForLevel(1) * 15,
    );
    expect(giftSubPullForTotal(1001)).toBe(giftSubPullForTotal(1000));
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

  it("lets a winning pull vote out-muscle the natural sink within one window", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine); // level 1, no skillcheck hit
    const before = engine.getState().anchorDepth;

    engine.castVote("user-a", "pull");
    engine.castVote("user-b", "pull");
    engine.castVote("user-c", "pull");

    const ticksPerWindow = (BALANCE.voteWindowSeconds * 1000) / 250;
    for (let index = 0; index < ticksPerWindow; index += 1) {
      engine.tick(250, Date.now(), true);
    }

    // The vote must move the anchor upward on balance, not be eaten by sinking.
    expect(engine.getState().anchorDepth).toBeLessThan(before);
    expect(votePullForLevel(1)).toBeGreaterThan(
      BALANCE.naturalSinkPerSecond * BALANCE.voteWindowSeconds,
    );
  });

  it("keeps only the latest vote per user and resolves level-scaled pull after the vote window", () => {
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
      control.getState().anchorDepth - votePullForLevel(1),
    );
    expect(engine.getState().voteSecondsRemaining).toBe(BALANCE.voteWindowSeconds);
  });

  it("uses stronger community voting in high hype levels", () => {
    const engine = new GameEngine(() => 0);
    const control = new GameEngine(() => 0);
    startPlaying(engine, 6);
    startPlaying(control, 6);
    engine.castVote("user-a", "pull");
    for (let index = 0; index < 120; index += 1) {
      engine.tick(250, Date.now(), true);
      control.tick(250, Date.now(), true);
    }
    expect(engine.getState().anchorDepth).toBeCloseTo(
      control.getState().anchorDepth - votePullForLevel(6),
    );
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
    expect(appliedPull).toBeCloseTo(giftSubPullForTotal(200));
  });

  it("reports instant chat wins when a sub burst carries surplus pull into the next round", () => {
    const engine = new GameEngine(() => 0);
    engine.startRound({
      id: "burst-feedback",
      level: 1,
      progress: 0,
      goal: 500,
      expiresAt: future(),
    });
    engine.onGiftSubs(200);
    const state = engine.getState();
    expect(state.chatWins).toBeGreaterThan(1);
    expect(state.anchorDepth).toBeGreaterThan(0);
    expect(state.anchorDepth).toBeLessThan(roundDepthForLevel(1));
    expect(state.chatSkipRounds).toBe(state.chatWins);
    expect(state.lastAward).toEqual({ side: "chat", points: state.chatWins });
    expect(state.lastImpact).toContain(`+${state.chatWins} Chat-Punkte`);
  });

  it("clears the chat skip notice after the countdown ends", () => {
    const engine = new GameEngine(() => 0);
    engine.startRound({
      id: "skip-notice",
      level: 1,
      progress: 0,
      goal: 500,
      expiresAt: future(),
    });
    engine.onGiftSubs(200);
    expect(engine.getState().chatSkipRounds).toBeGreaterThan(1);
    for (let index = 0; index < 13; index += 1) engine.tick(250, Date.now(), true);
    expect(engine.getState().phase).toBe("playing");
    expect(engine.getState().chatSkipRounds).toBe(0);
    expect(engine.getState().lastAward).toBeNull();
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
    expect(appliedPull).toBeCloseTo(100 * regularSubPullForLevel(1));
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
    expect(engine.getState().chatWins).toBeGreaterThan(0);
    expect(engine.getState().roundNumber).toBe(engine.getState().chatWins + 1);
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

  it("pulls the anchor from official Hype Train progress", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);
    const before = engine.getState().anchorDepth;

    engine.onHypeProgress({
      id: "train-1",
      level: 1,
      total: 500,
      progress: 500,
      goal: 1600,
      expiresAt: future(),
    });

    expect(engine.getState().anchorDepth).toBeCloseTo(
      before - regularSubPullForLevel(1),
    );
    expect(engine.getState().hypeTotal).toBe(500);
    expect(engine.getState().hypeProgress).toBe(500);
  });

  it("counts official level-up progress before awarding a held level", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);
    engine.onRegularSub(false);

    expect(engine.getState().anchorDepth).toBeGreaterThan(0);

    engine.onHypeProgress({
      id: "train-1",
      level: 2,
      total: 1610,
      progress: 10,
      goal: 500,
      expiresAt: future(),
    });

    expect(engine.getState()).toMatchObject({
      phase: "countdown",
      hypeLevel: 2,
      hypeTotal: 1610,
      streamerWins: 0,
      chatWins: 1,
      roundNumber: 2,
      anchorDepth: roundDepthForLevel(2),
      lastAward: { side: "chat", points: 1 },
    });
  });

  it("derives Hype Train level and progress from a cumulative total", () => {
    expect(hypeTrainProgressForTotal(0)).toMatchObject({ level: 1, progress: 0 });
    expect(hypeTrainProgressForTotal(500)).toMatchObject({ level: 1, progress: 500 });
    expect(hypeTrainProgressForTotal(1600)).toMatchObject({ level: 2, progress: 0 });
    expect(hypeTrainProgressForTotal(1610)).toMatchObject({ level: 2, progress: 10 });
    expect(hypeTrainProgressForTotal(3400)).toMatchObject({ level: 3, progress: 0 });

    // Round-trips with hypeTrainTotalPointsForProgress.
    for (const [level, progress] of [[1, 0], [1, 499], [2, 10], [3, 250]]) {
      const total = hypeTrainTotalPointsForProgress(level, progress);
      expect(hypeTrainProgressForTotal(total)).toMatchObject({ level, progress });
    }
  });

  it("lets simulated subs drive official progress into a chat level-up", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);

    // Accumulate tier-1 sub points (500 each) the way the test mode does: feed
    // the growing total through the official Hype Train progress path.
    let total = engine.getState().hypeTotal;
    for (let index = 0; index < 4; index += 1) {
      total += BALANCE.tier1SubPoints;
      const { level, progress, goal } = hypeTrainProgressForTotal(total);
      engine.onHypeProgress({ id: "train-1", level, total, progress, goal, expiresAt: future() });
    }

    expect(engine.getState()).toMatchObject({
      hypeLevel: 2,
      chatWins: 1,
      streamerWins: 0,
      lastAward: { side: "chat", points: 1 },
    });
  });

  it("awards the chat one point per level when a sub bomb skips several at once", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);

    // A single huge bomb worth enough points to vault from level 1 to level 4.
    const total = hypeTrainTotalPointsForProgress(4, 50);
    const { level, progress, goal } = hypeTrainProgressForTotal(total);
    engine.onHypeProgress({ id: "train-1", level, total, progress, goal, expiresAt: future() });

    expect(engine.getState()).toMatchObject({
      hypeLevel: 4,
      chatWins: 3,
      streamerWins: 0,
      roundNumber: 4,
      lastAward: { side: "chat", points: 3 },
    });
  });

  it("awards the streamer on level-up when the anchor is still below the surface", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);

    // Let the anchor drift down well clear of the surface so that completing
    // the level's points alone cannot free it: the streamer held the level.
    for (let index = 0; index < 80; index += 1) engine.tick(250, Date.now(), true);
    expect(engine.getState().anchorDepth).toBeGreaterThan(roundDepthForLevel(1));

    engine.onHypeProgress({
      id: "train-1",
      level: 2,
      progress: 10,
      goal: 500,
      expiresAt: future(),
    });

    expect(engine.getState()).toMatchObject({
      phase: "countdown",
      hypeLevel: 2,
      streamerWins: 1,
      chatWins: 0,
      roundNumber: 2,
      anchorDepth: roundDepthForLevel(2),
      lastAward: { side: "streamer", points: 1 },
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

  it("does not pull the anchor upward when a skillcheck is missed", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);
    while (!engine.getState().skillCheck.active) {
      engine.tick(100, Date.now(), true);
    }
    const before = engine.getState().anchorDepth;
    engine.hitSkillCheck();
    expect(engine.getState().skillCheck.result).toBe("miss");
    expect(engine.getState().anchorDepth).toBe(before);
  });

  it("does not pull the anchor upward when a skillcheck times out", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine);
    while (!engine.getState().skillCheck.active) {
      engine.tick(100, Date.now(), true);
    }
    const before = engine.getState().anchorDepth;
    while (engine.getState().skillCheck.active) {
      engine.tick(100, Date.now(), true);
    }
    expect(engine.getState().skillCheck.result).toBe("miss");
    expect(engine.getState().anchorDepth).toBeGreaterThanOrEqual(before);
  });

  it("lets a perfect skillcheck recover after the largest gift wave", () => {
    const engine = new GameEngine(() => 0);
    startPlaying(engine, 6);
    engine.onGiftSubs(1000);
    const afterGiftWave = engine.getState().anchorDepth;
    while (!engine.getState().skillCheck.active) {
      engine.tick(100, Date.now(), true);
    }
    const target = engine.getState().skillCheck.targetCenter;
    while (engine.getState().skillCheck.progress < target) {
      engine.tick(20, Date.now(), true);
    }
    engine.hitSkillCheck();
    expect(engine.getState().anchorDepth).toBeGreaterThan(afterGiftWave);
  });
});
