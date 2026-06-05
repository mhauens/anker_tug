const REGULAR_SUB_PULL = 0.6;

export const BALANCE = {
  initialDepth: 85,
  roundDepthByLevel: [6, 14, 28, 48, 70, 85],
  skillStrengthByLevel: [0.2, 0.35, 0.55, 0.75, 0.9, 1],
  naturalSinkPerSecond: 0.18,
  countdownSeconds: 3,
  voteWindowSeconds: 30,
  skillIntervalSeconds: 6,
  skillBaseDurationSeconds: 2.4,
  skillSpeedPerLevel: 0.08,
  skillBaseGoodWidth: 0.32,
  skillWidthLossPerLevel: 0.03,
  skillMinimumGoodWidth: 0.16,
  skillGreatWidthFactor: 0.38,
  skillPerfectWidthFactor: 0.12,
  skillGoodSink: REGULAR_SUB_PULL * 15,
  skillGreatSink: REGULAR_SUB_PULL * 25,
  skillPerfectSink: REGULAR_SUB_PULL * 40,
  skillMissPull: 0.8,
  regularSubPull: REGULAR_SUB_PULL,
  giftSubPullSquareRoot: 1.8,
  giftSubPullMaximum: 24,
  levelUpPull: 1.5,
} as const;

export function roundDepthForLevel(level: number): number {
  const index = Math.max(0, Math.min(BALANCE.roundDepthByLevel.length - 1, level - 1));
  return BALANCE.roundDepthByLevel[index];
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
