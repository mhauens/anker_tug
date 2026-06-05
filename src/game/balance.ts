const REGULAR_SUB_PULL = 0.6;
const MAXIMUM_GIFT_SUBS = 1000;
const MAXIMUM_GIFT_SUB_PULL =
  MAXIMUM_GIFT_SUBS * REGULAR_SUB_PULL + Math.sqrt(MAXIMUM_GIFT_SUBS) * 0.8;

export const BALANCE = {
  initialDepth: 85,
  roundDepthByLevel: [6, 14, 28, 48, 70, 85],
  skillStrengthByLevel: [0.2, 0.35, 0.55, 0.75, 0.9, 1],
  naturalSinkPerSecond: 0.18,
  countdownSeconds: 3,
  voteWindowSeconds: 30,
  skillIntervalSeconds: 6,
  skillBaseDurationSeconds: 2.25,
  skillSpeedPerLevel: 0.1,
  skillBaseGoodWidth: 0.29,
  skillWidthLossPerLevel: 0.032,
  skillMinimumGoodWidth: 0.14,
  skillGreatWidthFactor: 0.36,
  skillPerfectWidthFactor: 0.11,
  skillGoodSink: REGULAR_SUB_PULL * 5,
  skillGreatSink: REGULAR_SUB_PULL * 10,
  skillPerfectSink: REGULAR_SUB_PULL * 20,
  skillMissPull: 0.8,
  regularSubPull: REGULAR_SUB_PULL,
  votePullSubsByLevel: [1, 2, 3, 4, 5, 6],
  giftSubPullBonusSquareRoot: 0.8,
  giftSubMaximumCount: MAXIMUM_GIFT_SUBS,
  giftSubPullMaximum: MAXIMUM_GIFT_SUB_PULL,
  levelUpPull: 1.5,
} as const;

export function giftSubCountForTotal(total: number): number {
  return Math.min(BALANCE.giftSubMaximumCount, Math.max(0, Math.floor(total)));
}

export function giftSubPullForTotal(total: number): number {
  const giftCount = giftSubCountForTotal(total);
  if (giftCount === 0) return 0;
  return Math.min(
    giftCount * BALANCE.regularSubPull +
      Math.sqrt(giftCount) * BALANCE.giftSubPullBonusSquareRoot,
    BALANCE.giftSubPullMaximum,
  );
}

export function roundDepthForLevel(level: number): number {
  const index = Math.max(0, Math.min(BALANCE.roundDepthByLevel.length - 1, level - 1));
  return BALANCE.roundDepthByLevel[index];
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

export function votePullForLevel(level: number): number {
  const index = Math.max(
    0,
    Math.min(BALANCE.votePullSubsByLevel.length - 1, level - 1),
  );
  return BALANCE.regularSubPull * BALANCE.votePullSubsByLevel[index];
}
