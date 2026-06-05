const REGULAR_SUB_PULL = 0.6;
// Subscription contribution values per Twitch EventSub: a subscription
// contribution reports `total` as 500 / 1000 / 2500 for tier 1 / 2 / 3.
// https://dev.twitch.tv/docs/eventsub/eventsub-reference (Hype Train events)
const TIER_1_SUB_POINTS = 500;
const TIER_2_SUB_POINTS = 1000;
const TIER_3_SUB_POINTS = 2500;
const MAXIMUM_GIFT_SUBS = 1000;
// Fallback estimate for per-level point goals only. Twitch does NOT publish a
// fixed goal table — `goal` is set dynamically per channel and delivered in the
// Hype Train payload. These values are used solely when an event omits `total`
// (see estimatedTotalPoints); prefer the live `goal`/`total` from the payload.
const HYPE_TRAIN_LEVEL_GOALS = [
  1600, 1800, 2100, 2300, 3000, 3700, 4700, 5900, 7200, 8800, 10600, 12600,
  14700, 17100, 19700, 22400, 25400, 28600, 32000, 35500, 39300, 43300, 47400,
  51800, 56400, 61200, 66100, 71300, 76700, 82200, 88000,
];

export const BALANCE = {
  initialDepth: 85,
  roundDepthByLevel: [6, 14, 28, 48, 70, 85],
  skillStrengthByLevel: [0.2, 0.35, 0.55, 0.75, 0.9, 1],
  // The automatic sink is the streamer's *passive* helper, so keep it gentle:
  // the streamer is meant to hold the line actively via skillchecks, while the
  // chat (who spends real money) should stay in control of the anchor. It must
  // also stay below a winning vote's pull over one window, otherwise the sink
  // silently cancels the community vote (see votePullDepthFraction).
  naturalSinkPerSecond: 0.06,
  naturalSinkPerLevel: 0.25,
  countdownSeconds: 3,
  voteWindowSeconds: 10,
  skillIntervalSeconds: 6,
  skillBaseDurationSeconds: 2.35,
  skillSpeedPerLevel: 0.06,
  skillBaseGoodWidth: 0.27,
  skillWidthLossPerLevel: 0.014,
  skillMinimumGoodWidth: 0.18,
  skillGreatWidthFactor: 0.36,
  skillPerfectWidthFactor: 0.11,
  skillGoodSink: REGULAR_SUB_PULL * 5,
  skillGreatSink: REGULAR_SUB_PULL * 10,
  skillPerfectSink: REGULAR_SUB_PULL * 20,
  skillMissPull: 0.8,
  regularSubPull: REGULAR_SUB_PULL,
  tier1SubPoints: TIER_1_SUB_POINTS,
  tier2SubPoints: TIER_2_SUB_POINTS,
  tier3SubPoints: TIER_3_SUB_POINTS,
  hypeTrainLevelGoals: HYPE_TRAIN_LEVEL_GOALS,
  // Cap the goal used to convert points into anchor meters. The official Hype
  // Train goal climbs past 80k while the anchor depth caps at level 6, so
  // without this cap each sub would move the anchor almost nothing at high
  // levels. Capping keeps subscriptions impactful (and the chat in the game)
  // no matter how high the Hype Train climbs. ~40 tier-1 subs free the anchor.
  maxHypePullGoal: 20000,
  // Fraction of the round depth that a winning community vote moves the anchor.
  // Must clearly exceed the sink accumulated over one vote window so "!ziehen"
  // makes real upward progress: at level 1 that is 0.25*6 = 1.5 m per vote vs a
  // 0.06*10 = 0.6 m sink per 10 s window.
  votePullDepthFraction: 0.25,
  giftSubMaximumCount: MAXIMUM_GIFT_SUBS,
} as const;

export function hypeTrainGoalForLevel(level: number): number {
  const index = Math.max(0, Math.min(BALANCE.hypeTrainLevelGoals.length - 1, level - 1));
  return BALANCE.hypeTrainLevelGoals[index];
}

export function hypeTrainTotalPointsForProgress(level: number, progress: number): number {
  const completedLevels = Math.max(0, Math.floor(level) - 1);
  let total = Math.max(0, progress);
  for (let index = 0; index < completedLevels; index += 1) {
    total += BALANCE.hypeTrainLevelGoals[index] ?? hypeTrainGoalForLevel(index + 1);
  }
  return total;
}

// Inverse of hypeTrainTotalPointsForProgress: derive the level, in-level
// progress, and next goal from a cumulative point total. Used to translate
// simulated subscriptions into the official Hype Train progress that drives the
// anchor, exactly as Twitch would deliver it.
export function hypeTrainProgressForTotal(total: number): {
  level: number;
  progress: number;
  goal: number;
} {
  let remaining = Math.max(0, total);
  let level = 1;
  while (
    level < BALANCE.hypeTrainLevelGoals.length &&
    remaining >= BALANCE.hypeTrainLevelGoals[level - 1]
  ) {
    remaining -= BALANCE.hypeTrainLevelGoals[level - 1];
    level += 1;
  }
  return { level, progress: remaining, goal: hypeTrainGoalForLevel(level) };
}

export function subPointsForTier(tier?: string): number {
  if (tier === "3000") return BALANCE.tier3SubPoints;
  if (tier === "2000") return BALANCE.tier2SubPoints;
  return BALANCE.tier1SubPoints;
}

export function hypePointPullForLevel(points: number, level: number): number {
  // Cap the goal so meters-per-point stop collapsing once the anchor depth has
  // capped but the official Hype Train goal keeps climbing (see maxHypePullGoal).
  const goal = Math.min(hypeTrainGoalForLevel(level), BALANCE.maxHypePullGoal);
  if (goal <= 0) return 0;
  return (Math.max(0, points) / goal) * roundDepthForLevel(level);
}

export function regularSubPullForLevel(level: number, tier?: string): number {
  return hypePointPullForLevel(subPointsForTier(tier), level);
}

export function giftSubCountForTotal(total: number): number {
  return Math.min(BALANCE.giftSubMaximumCount, Math.max(0, Math.floor(total)));
}

export function giftSubPullForTotal(total: number, level = 1, tier?: string): number {
  const giftCount = giftSubCountForTotal(total);
  if (giftCount === 0) return 0;
  return hypePointPullForLevel(giftCount * subPointsForTier(tier), level);
}

export function roundDepthForLevel(level: number): number {
  const index = Math.max(0, Math.min(BALANCE.roundDepthByLevel.length - 1, level - 1));
  return BALANCE.roundDepthByLevel[index];
}

// The anchor sinks faster on higher levels so the much deeper rounds do not feel
// sluggish. Level 1 keeps the base rate; each further level adds a fixed share.
export function naturalSinkForLevel(level: number): number {
  const steps = Math.max(0, level - 1);
  return BALANCE.naturalSinkPerSecond * (1 + steps * BALANCE.naturalSinkPerLevel);
}

export function formatMeters(meters: number): string {
  return `${meters.toLocaleString("de-DE", {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(meters) ? 0 : 1,
  })} m`;
}

export function depthTicksForLevel(level: number): number[] {
  const depth = roundDepthForLevel(level);
  const step = [1, 2, 5, 10, 20].find((candidate) => {
    return Math.ceil(depth / candidate) <= 8;
  }) ?? 20;
  const ticks: number[] = [];
  for (let tick = 0; tick < depth; tick += step) ticks.push(tick);
  if (ticks[ticks.length - 1] !== depth) ticks.push(depth);
  return ticks;
}

export function visualDepthPercent(depth: number, level: number): number {
  const roundDepth = roundDepthForLevel(level);
  if (roundDepth <= 0) return 0;
  return Math.max(0, Math.min(100, (depth / roundDepth) * 88));
}

export function skillStrengthForLevel(level: number): number {
  const index = Math.max(
    0,
    Math.min(BALANCE.skillStrengthByLevel.length - 1, level - 1),
  );
  return BALANCE.skillStrengthByLevel[index];
}

// A winning community vote moves the anchor by a fixed share of the round
// depth, so "!ziehen" keeps real impact at every level instead of fading to
// nothing once the depth (and Hype Train goal) climb. Depth caps at level 6,
// so the vote impact plateaus there and stays relevant on the high levels.
export function votePullForLevel(level: number): number {
  return roundDepthForLevel(level) * BALANCE.votePullDepthFraction;
}
