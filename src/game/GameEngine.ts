import {
  BALANCE,
  formatMeters,
  giftSubCountForTotal,
  giftSubPullForTotal,
  hypePointPullForLevel,
  hypeTrainTotalPointsForProgress,
  naturalSinkForLevel,
  roundDepthForLevel,
  regularSubPullForLevel,
  skillStrengthForLevel,
  votePullForLevel,
} from "./balance";
import type {
  GameState,
  HypeTrainSnapshot,
  SkillCheckResult,
  SkillCheckState,
  SkillCheckVariantId,
  SkillCheckZone,
  VoteCommand,
} from "./types";

interface SkillCheckVariant {
  id: SkillCheckVariantId;
  label: string;
  instruction: string;
  theme: string;
  minLevel: number;
  weight: number;
}

const SKILL_CHECK_VARIANTS: SkillCheckVariant[] = [
  {
    id: "steady",
    label: "RUHIGES MANOEVER",
    instruction: "LEERTASTE",
    theme: "classic",
    minLevel: 1,
    weight: 7,
  },
  {
    id: "countercurrent",
    label: "GEGENSTROM",
    instruction: "ABFANGEN",
    theme: "current",
    minLevel: 2,
    weight: 3,
  },
  {
    id: "splitCatch",
    label: "SIGNALBOJEN",
    instruction: "FENSTER",
    theme: "beacon",
    minLevel: 2,
    weight: 2,
  },
  {
    id: "tideTurn",
    label: "TIDENWENDE",
    instruction: "WENDEPUNKT",
    theme: "tide",
    minLevel: 3,
    weight: 2,
  },
  {
    id: "chainLock",
    label: "KETTENSCHLOSS",
    instruction: "KETTE 1/2",
    theme: "chain",
    minLevel: 3,
    weight: 2,
  },
];

const SKILL_RESULT_RANK: Record<Exclude<SkillCheckResult, "miss">, number> = {
  good: 1,
  great: 2,
  perfect: 3,
};

function emptyVotes(): Record<VoteCommand, number> {
  return { pull: 0, lower: 0 };
}

function emptySkillCheck(): SkillCheckState {
  const goodWidth = BALANCE.skillBaseGoodWidth;
  const targetCenter = 0.5;
  return {
    active: false,
    variantId: "steady",
    variantLabel: "RUHIGES MANOEVER",
    instruction: "LEERTASTE",
    theme: "classic",
    progress: 0,
    zones: standardSkillZones(targetCenter, goodWidth),
    requiredHits: 1,
    completedHits: 0,
    hitResults: [],
    activeStep: 0,
    result: null,
  };
}

function standardSkillZones(
  center: number,
  goodWidth: number,
): SkillCheckZone[] {
  return [
    { center, width: goodWidth, result: "good" },
    {
      center,
      width: goodWidth * BALANCE.skillGreatWidthFactor,
      result: "great",
    },
    {
      center,
      width: goodWidth * BALANCE.skillPerfectWidthFactor,
      result: "perfect",
    },
  ];
}

function normalizeSkillCheck(input: SkillCheckState): SkillCheckState {
  const legacy = input as Partial<SkillCheckState> & {
    targetCenter?: number;
    goodWidth?: number;
    greatWidth?: number;
    perfectWidth?: number;
  };
  const fallback = emptySkillCheck();
  const center = legacy.targetCenter ?? fallback.zones[0].center;
  const goodWidth = legacy.goodWidth ?? fallback.zones[0].width;
  const legacyZones: SkillCheckZone[] = [
    { center, width: goodWidth, result: "good" },
    {
      center,
      width: legacy.greatWidth ?? goodWidth * BALANCE.skillGreatWidthFactor,
      result: "great",
    },
    {
      center,
      width:
        legacy.perfectWidth ?? goodWidth * BALANCE.skillPerfectWidthFactor,
      result: "perfect",
    },
  ];

  return {
    ...fallback,
    ...structuredClone(input),
    variantId: input.variantId ?? fallback.variantId,
    variantLabel: input.variantLabel ?? fallback.variantLabel,
    instruction: input.instruction ?? fallback.instruction,
    theme: input.theme ?? fallback.theme,
    zones: input.zones?.length ? structuredClone(input.zones) : legacyZones,
    requiredHits: input.requiredHits ?? fallback.requiredHits,
    completedHits: input.completedHits ?? fallback.completedHits,
    hitResults: input.hitResults ? structuredClone(input.hitResults) : [],
    activeStep: input.activeStep ?? fallback.activeStep,
    result: input.result ?? null,
  };
}

function progressForVariant(
  variantId: SkillCheckVariantId,
  normalizedElapsed: number,
): number {
  const progress = Math.max(0, Math.min(1, normalizedElapsed));
  if (variantId === "countercurrent") return 1 - progress;
  if (variantId === "tideTurn") {
    return progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
  }
  return progress;
}

function bestSkillHit(
  progress: number,
  zones: SkillCheckZone[],
  activeStep?: number,
): Exclude<SkillCheckResult, "miss"> | null {
  let best: Exclude<SkillCheckResult, "miss"> | null = null;
  for (const zone of zones) {
    if (activeStep !== undefined && zone.step !== undefined && zone.step !== activeStep) {
      continue;
    }
    const distance = Math.abs(progress - zone.center);
    if (distance > zone.width / 2) continue;
    if (!best || SKILL_RESULT_RANK[zone.result] > SKILL_RESULT_RANK[best]) {
      best = zone.result;
    }
  }
  return best;
}

function weakestSkillResult(
  results: Exclude<SkillCheckResult, "miss">[],
): Exclude<SkillCheckResult, "miss"> {
  return results.reduce((weakest, result) => {
    return SKILL_RESULT_RANK[result] < SKILL_RESULT_RANK[weakest]
      ? result
      : weakest;
  }, results[0] ?? "good");
}

export function createInitialGameState(): GameState {
  return {
    phase: "idle",
    trainId: null,
    trainStartedAt: null,
    anchorDepth: BALANCE.initialDepth,
    hypeLevel: 1,
    hypeTotal: 0,
    hypeProgress: 0,
    hypeGoal: 0,
    expiresAt: null,
    currentPrompt: null,
    voteCounts: emptyVotes(),
    voteSecondsRemaining: BALANCE.voteWindowSeconds,
    roundNumber: 0,
    streamerWins: 0,
    chatWins: 0,
    chatSkipRounds: 0,
    lastAward: null,
    winner: null,
    countdownSeconds: BALANCE.countdownSeconds,
    skillCheck: emptySkillCheck(),
    lastImpact: null,
  };
}

export class GameEngine {
  private state: GameState;
  private readonly random: () => number;
  private listeners = new Set<(state: GameState) => void>();
  private votes = new Map<string, VoteCommand>();
  private voteElapsed = 0;
  private countdownElapsed = 0;
  private skillElapsed = 0;
  private skillCooldownElapsed = 0;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.state = createInitialGameState();
  }

  getState(): GameState {
    return structuredClone(this.state);
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  hydrate(state: GameState): void {
    this.state = {
      ...createInitialGameState(),
      ...structuredClone(state),
      roundNumber: state.roundNumber ?? 1,
      streamerWins: state.streamerWins ?? 0,
      chatWins: state.chatWins ?? 0,
      chatSkipRounds: state.chatSkipRounds ?? 0,
      lastAward: state.lastAward ?? null,
      skillCheck: normalizeSkillCheck(state.skillCheck),
    };
    this.votes.clear();
    this.voteElapsed = 0;
    this.skillElapsed = 0;
    this.skillCooldownElapsed = 0;
    this.emit();
  }

  reset(): void {
    this.state = createInitialGameState();
    this.votes.clear();
    this.voteElapsed = 0;
    this.countdownElapsed = 0;
    this.skillElapsed = 0;
    this.skillCooldownElapsed = 0;
    this.emit();
  }

  startRound(snapshot: HypeTrainSnapshot): void {
    this.state = createInitialGameState();
    this.beginLevelRound(snapshot, "Der Hype Train rollt an");
    this.emit();
  }

  onHypeProgress(snapshot: HypeTrainSnapshot): void {
    if (this.state.trainId !== snapshot.id) {
      const currentStartedAt = Date.parse(this.state.trainStartedAt ?? "");
      const incomingStartedAt = Date.parse(snapshot.startedAt ?? "");
      if (
        Number.isFinite(currentStartedAt) &&
        Number.isFinite(incomingStartedAt) &&
        incomingStartedAt <= currentStartedAt
      ) {
        return;
      }
      this.startRound(snapshot);
      return;
    }

    if (this.state.phase === "result") return;
    if (snapshot.level < this.state.hypeLevel) return;

    if (snapshot.level > this.state.hypeLevel) {
      const gainedLevels = snapshot.level - this.state.hypeLevel;
      // The points that completed the level pull the anchor up. If that pull is
      // enough to break the surface, the chat freed the anchor in time and wins
      // the point; otherwise the streamer held the level and takes it.
      const { points, pull } = this.hypeProgressDelta(snapshot);
      const reachedSurface =
        this.canApplyForces() && pull >= this.state.anchorDepth;

      // Each skipped level is its own round: a big sub bomb that vaults past
      // several levels and frees the anchor earns the chat a point per level,
      // mirroring how the streamer scores a point per level held.
      if (reachedSurface) {
        // Chat freed the anchor: award the point(s) and drop a fresh anchor from
        // the seabed for the next round.
        this.state.chatWins += gainedLevels;
        this.beginLevelRound(
          snapshot,
          `Hype Train +${Math.round(points)} Punkte: Anker frei${gainedLevels > 1 ? ` (${gainedLevels} Level)` : ""}`,
        );
        this.state.lastAward = { side: "chat", points: gainedLevels };
      } else {
        // Streamer held the level: award the point(s) but carry the anchor's
        // height (after this pull) into the deeper level instead of snapping
        // back to the seabed, so the tug-of-war stays continuous — especially on
        // the fast early levels where rounds would otherwise flash by.
        this.state.streamerWins += gainedLevels;
        const oldDepth = roundDepthForLevel(this.state.hypeLevel);
        const fraction =
          oldDepth > 0 ? Math.max(0, this.state.anchorDepth - pull) / oldDepth : 1;
        this.beginLevelRound(
          snapshot,
          `Level ${snapshot.level - 1} gehalten: Punkt fuer den Streamer`,
          fraction * roundDepthForLevel(snapshot.level),
        );
        this.state.lastAward = { side: "streamer", points: gainedLevels };
      }
      if (gainedLevels > 1) this.state.roundNumber += gainedLevels - 1;
      this.emit();
      return;
    }

    const progressPull = this.applyHypeProgressPull(snapshot);
    this.state.hypeTotal = Math.max(
      this.state.hypeTotal,
      snapshot.total ?? this.estimatedTotalPoints(snapshot),
    );
    this.state.hypeProgress = Math.max(this.state.hypeProgress, snapshot.progress);
    if (snapshot.goal > 0) this.state.hypeGoal = snapshot.goal;
    if (Date.parse(snapshot.expiresAt) > Date.parse(this.state.expiresAt ?? "")) {
      this.state.expiresAt = snapshot.expiresAt;
    }
    if (progressPull.wins > 0) {
      this.state.chatSkipRounds = progressPull.wins > 1 ? progressPull.wins : 0;
      this.state.lastAward = { side: "chat", points: progressPull.wins };
      this.state.lastImpact = `Hype Train +${Math.round(progressPull.points)} Punkte: ${formatMeters(progressPull.pull)} hoch, +${progressPull.wins} Chat-Punkt${progressPull.wins === 1 ? "" : "e"}`;
    } else if (progressPull.pull > 0) {
      this.state.lastImpact = `Hype Train +${Math.round(progressPull.points)} Punkte: ${formatMeters(progressPull.pull)} hoch`;
    }
    this.emit();
  }

  onHypeEnd(trainId: string): void {
    if (this.state.trainId !== trainId || this.state.phase === "result") return;
    this.state.streamerWins += 1;
    this.finish("streamer", "Letzte Stufe gehalten: Punkt für den Streamer");
  }

  onRegularSub(isGift: boolean, tier?: string): void {
    if (!this.canApplyForces() || isGift) return;
    const pull = regularSubPullForLevel(this.state.hypeLevel, tier);
    const wins = this.applyChatPull(pull);
    this.state.chatSkipRounds = wins > 1 ? wins : 0;
    this.state.lastAward = wins > 0 ? { side: "chat", points: wins } : null;
    this.state.lastImpact =
      wins > 0
        ? `Neuer Sub: ${formatMeters(pull)} hoch, +${wins} Chat-Punkt${wins === 1 ? "" : "e"}`
        : `Neuer Sub: ${formatMeters(pull)} hoch`;
    this.emit();
  }

  onGiftSubs(total: number, tier?: string): void {
    if (!this.canApplyForces()) return;
    const giftCount = giftSubCountForTotal(total);
    if (giftCount === 0) return;
    const pull = giftSubPullForTotal(giftCount, this.state.hypeLevel, tier);
    const wins = this.applyChatPull(pull);
    this.state.chatSkipRounds = wins > 1 ? wins : 0;
    this.state.lastAward = wins > 0 ? { side: "chat", points: wins } : null;
    this.state.lastImpact =
      wins > 0
        ? `${giftCount} Gift-Subs: ${formatMeters(pull)} hoch, +${wins} Chat-Punkt${wins === 1 ? "" : "e"}`
        : `${giftCount} Gift-Subs: ${formatMeters(pull)} hoch`;
    this.emit();
  }

  castVote(userId: string, command: VoteCommand): void {
    if (!this.canApplyForces()) return;
    this.votes.set(userId, command);
    this.updateVoteCounts();
    this.emit();
  }

  hitSkillCheck(): void {
    if (!this.canApplyForces() || !this.state.skillCheck.active) return;

    const result = bestSkillHit(
      this.state.skillCheck.progress,
      this.state.skillCheck.zones,
      this.state.skillCheck.activeStep,
    );
    const skillStrength = skillStrengthForLevel(this.state.hypeLevel);

    if (!result) {
      this.finishMissedSkillCheck("Manoever verfehlt");
      this.emit();
      return;
    }

    const hitResults = [...this.state.skillCheck.hitResults, result];
    if (hitResults.length < this.state.skillCheck.requiredHits) {
      const completedHits = hitResults.length;
      this.state.skillCheck = {
        ...this.state.skillCheck,
        completedHits,
        hitResults,
        activeStep: completedHits,
        instruction: `KETTE ${completedHits + 1}/${this.state.skillCheck.requiredHits}`,
        progress: progressForVariant(this.state.skillCheck.variantId, 0),
      };
      this.skillElapsed = 0;
      this.state.lastImpact = `Kettenschloss ${completedHits}/${this.state.skillCheck.requiredHits} verriegelt`;
      this.emit();
      return;
    }

    this.applySkillCheckResult(weakestSkillResult(hitResults), skillStrength);
    this.state.skillCheck.completedHits = hitResults.length;
    this.state.skillCheck.hitResults = hitResults;
    this.state.skillCheck.active = false;
    this.skillElapsed = 0;
    this.skillCooldownElapsed = 0;
    this.emit();
  }

  tick(deltaMs: number, nowMs = Date.now(), connected = true): void {
    if (
      (this.state.phase === "countdown" || this.state.phase === "playing") &&
      this.state.expiresAt &&
      nowMs >= Date.parse(this.state.expiresAt)
    ) {
      this.state.streamerWins += 1;
      this.finish("streamer", "Zeit abgelaufen: Punkt für den Streamer");
      return;
    }

    if (!connected || deltaMs <= 0) return;
    const deltaSeconds = Math.min(deltaMs / 1000, 0.25);

    if (this.state.phase === "countdown") {
      this.countdownElapsed += deltaSeconds;
      this.state.countdownSeconds = Math.max(
        0,
        Math.ceil(BALANCE.countdownSeconds - this.countdownElapsed),
      );
      if (this.countdownElapsed >= BALANCE.countdownSeconds) {
        this.state.phase = "playing";
        this.state.countdownSeconds = 0;
        this.state.chatSkipRounds = 0;
        this.state.lastAward = null;
        this.state.lastImpact = "Los! Chat gegen Anker";
      }
      this.emit();
      return;
    }

    if (this.state.phase !== "playing") return;

    this.applyDepth(naturalSinkForLevel(this.state.hypeLevel) * deltaSeconds);
    this.voteElapsed += deltaSeconds;

      if (this.voteElapsed >= BALANCE.voteWindowSeconds) {
      this.voteElapsed %= BALANCE.voteWindowSeconds;
      this.resolveVote();
    }
    this.state.voteSecondsRemaining = Math.max(
      0,
      Math.ceil(BALANCE.voteWindowSeconds - this.voteElapsed),
    );

    this.updateSkillCheck(deltaSeconds);
    this.emit();
  }

  private updateSkillCheck(deltaSeconds: number): void {
    if (!this.state.skillCheck.active) {
      this.skillCooldownElapsed += deltaSeconds;
      if (this.skillCooldownElapsed >= BALANCE.skillIntervalSeconds) {
        this.beginSkillCheck();
      }
      return;
    }

    this.skillElapsed += deltaSeconds;
    const speedMultiplier =
      1 + (this.state.hypeLevel - 1) * BALANCE.skillSpeedPerLevel;
    const duration =
      this.state.skillCheck.variantId === "tideTurn"
        ? (BALANCE.skillBaseDurationSeconds * 1.18) / speedMultiplier
        : BALANCE.skillBaseDurationSeconds / speedMultiplier;
    const elapsed = Math.min(1, this.skillElapsed / duration);
    this.state.skillCheck.progress = progressForVariant(
      this.state.skillCheck.variantId,
      elapsed,
    );

    if (elapsed >= 1) {
      this.finishMissedSkillCheck("Skillcheck verpasst");
    }
  }

  private beginSkillCheck(): void {
    const variant = this.selectSkillCheckVariant();
    const goodWidth = Math.max(
      BALANCE.skillMinimumGoodWidth,
      BALANCE.skillBaseGoodWidth -
        (this.state.hypeLevel - 1) * BALANCE.skillWidthLossPerLevel,
    );
    const zones = this.createSkillZones(variant.id, goodWidth);
    this.state.skillCheck = {
      active: true,
      variantId: variant.id,
      variantLabel: variant.label,
      instruction: variant.instruction,
      theme: variant.theme,
      progress: progressForVariant(variant.id, 0),
      zones,
      requiredHits: variant.id === "chainLock" ? 2 : 1,
      completedHits: 0,
      hitResults: [],
      activeStep: 0,
      result: null,
    };
    this.skillElapsed = 0;
    this.skillCooldownElapsed = 0;
    this.state.lastImpact = `${variant.label}: ${variant.instruction}`;
  }

  private selectSkillCheckVariant(): SkillCheckVariant {
    const available = SKILL_CHECK_VARIANTS.filter(
      (variant) => this.state.hypeLevel >= variant.minLevel,
    );
    const totalWeight = available.reduce(
      (sum, variant) => sum + variant.weight,
      0,
    );
    let pick = this.random() * totalWeight;
    for (const variant of available) {
      pick -= variant.weight;
      if (pick <= 0) return variant;
    }
    return available[available.length - 1] ?? SKILL_CHECK_VARIANTS[0];
  }

  private createSkillZones(
    variantId: SkillCheckVariantId,
    goodWidth: number,
  ): SkillCheckZone[] {
    if (variantId === "splitCatch") return this.createSplitCatchZones(goodWidth);
    if (variantId === "chainLock") return this.createChainLockZones(goodWidth);

    const center = this.randomCenter(goodWidth);
    return standardSkillZones(center, goodWidth);
  }

  private createSplitCatchZones(goodWidth: number): SkillCheckZone[] {
    const safeWidth = goodWidth * 0.78;
    const greatWidth = goodWidth * 0.58;
    const perfectWidth = goodWidth * BALANCE.skillPerfectWidthFactor;
    const safeCenter = this.randomInRange(
      safeWidth / 2 + 0.08,
      0.43 - safeWidth / 2,
    );
    const precisionCenter = this.randomInRange(
      0.57 + greatWidth / 2,
      1 - greatWidth / 2 - 0.08,
    );

    return [
      { center: safeCenter, width: safeWidth, result: "good" },
      { center: precisionCenter, width: greatWidth, result: "great" },
      { center: precisionCenter, width: perfectWidth, result: "perfect" },
    ];
  }

  private createChainLockZones(goodWidth: number): SkillCheckZone[] {
    const chainWidth = goodWidth * 0.82;
    const firstCenter = this.randomInRange(
      chainWidth / 2 + 0.08,
      0.44 - chainWidth / 2,
    );
    const secondCenter = this.randomInRange(
      0.56 + chainWidth / 2,
      1 - chainWidth / 2 - 0.08,
    );

    return [
      ...standardSkillZones(firstCenter, chainWidth).map((zone) => ({
        ...zone,
        step: 0,
      })),
      ...standardSkillZones(secondCenter, chainWidth).map((zone) => ({
        ...zone,
        step: 1,
      })),
    ];
  }

  private randomCenter(width: number): number {
    const margin = width / 2 + 0.08;
    return this.randomInRange(margin, 1 - margin);
  }

  private randomInRange(min: number, max: number): number {
    if (max <= min) return (min + max) / 2;
    return min + this.random() * (max - min);
  }

  private applySkillCheckResult(
    result: Exclude<SkillCheckResult, "miss">,
    skillStrength: number,
  ): void {
    if (result === "perfect") {
      this.applyDepth(BALANCE.skillPerfectSink * skillStrength);
      this.state.skillCheck.result = "perfect";
      this.state.lastImpact = "Perfektes Ankermanoever";
    } else if (result === "great") {
      this.applyDepth(BALANCE.skillGreatSink * skillStrength);
      this.state.skillCheck.result = "great";
      this.state.lastImpact = "Sehr gutes Ankermanoever";
    } else {
      this.applyDepth(BALANCE.skillGoodSink * skillStrength);
      this.state.skillCheck.result = "good";
      this.state.lastImpact = "Gutes Ankermanoever";
    }
  }

  private finishMissedSkillCheck(reason: string): void {
    const pull =
      BALANCE.skillMissPull * skillStrengthForLevel(this.state.hypeLevel);
    this.state.skillCheck = {
      ...this.state.skillCheck,
      active: false,
      result: "miss",
    };
    this.skillElapsed = 0;
    this.skillCooldownElapsed = 0;

    const wins = this.applyChatPull(pull);
    this.state.chatSkipRounds = wins > 1 ? wins : 0;
    this.state.lastAward = wins > 0 ? { side: "chat", points: wins } : null;
    this.state.lastImpact =
      wins > 0
        ? `${reason}: ${formatMeters(pull)} hoch, +${wins} Chat-Punkt${wins === 1 ? "" : "e"}`
        : `${reason}: Chat zieht ${formatMeters(pull)} hoch`;
  }

  private resolveVote(): void {
    const counts = this.state.voteCounts;
    if (counts.pull === counts.lower) {
      this.state.lastImpact = "Voting unentschieden: Der Anker bleibt stabil";
    } else if (counts.pull > counts.lower) {
      const pull = votePullForLevel(this.state.hypeLevel);
      const wins = this.applyChatPull(pull);
      this.state.chatSkipRounds = wins > 1 ? wins : 0;
      this.state.lastAward = wins > 0 ? { side: "chat", points: wins } : null;
      this.state.lastImpact =
        wins > 0
          ? `!ziehen gewinnt: ${formatMeters(pull)} hoch, +${wins} Chat-Punkt${wins === 1 ? "" : "e"}`
          : `!ziehen gewinnt: ${formatMeters(pull)} hoch`;
    } else {
      const pull = votePullForLevel(this.state.hypeLevel);
      this.applyDepth(pull);
      this.state.chatSkipRounds = 0;
      this.state.lastAward = null;
      this.state.lastImpact = `!senken gewinnt: Kami kontert ${formatMeters(pull)}`;
    }

    this.votes.clear();
    this.state.voteCounts = emptyVotes();
    this.state.voteSecondsRemaining = BALANCE.voteWindowSeconds;
  }

  private updateVoteCounts(): void {
    const counts = emptyVotes();
    for (const command of this.votes.values()) counts[command] += 1;
    this.state.voteCounts = counts;
  }

  private applyDepth(amount: number): void {
    this.state.anchorDepth = Math.max(
      0,
      Math.min(100, this.state.anchorDepth + amount),
    );
  }

  private hypeProgressDelta(snapshot: HypeTrainSnapshot): {
    points: number;
    pull: number;
  } {
    const incomingTotal = snapshot.total ?? this.estimatedTotalPoints(snapshot);
    const points = Math.max(0, incomingTotal - this.state.hypeTotal);
    return { points, pull: hypePointPullForLevel(points, this.state.hypeLevel) };
  }

  private applyHypeProgressPull(snapshot: HypeTrainSnapshot): {
    points: number;
    pull: number;
    wins: number;
  } {
    if (!this.canApplyForces()) return { points: 0, pull: 0, wins: 0 };
    const { points, pull } = this.hypeProgressDelta(snapshot);
    if (pull <= 0) return { points, pull: 0, wins: 0 };
    const wins = this.applyChatPull(pull);
    return { points, pull, wins };
  }

  private estimatedTotalPoints(snapshot: HypeTrainSnapshot): number {
    return hypeTrainTotalPointsForProgress(snapshot.level, snapshot.progress);
  }

  private applyChatPull(pull: number): number {
    let remaining = Math.max(0, pull);
    let wins = 0;
    while (remaining > 0 && this.canApplyForces()) {
      if (remaining < this.state.anchorDepth) {
        this.state.anchorDepth -= remaining;
        return wins;
      }

      remaining -= this.state.anchorDepth;
      this.state.anchorDepth = 0;
      this.checkChatWin();
      wins += 1;
    }
    return wins;
  }

  private canApplyForces(): boolean {
    return this.state.phase === "countdown" || this.state.phase === "playing";
  }

  private checkChatWin(): void {
    if (this.state.anchorDepth > 0) return;
    this.state.chatWins += 1;
    this.beginLevelRound(
      {
        id: this.state.trainId ?? "",
        level: this.state.hypeLevel,
        progress: this.state.hypeProgress,
        goal: this.state.hypeGoal,
        expiresAt: this.state.expiresAt ?? "",
      },
      "Der Anker ist frei: Punkt für den Chat",
    );
  }

  private beginLevelRound(
    snapshot: HypeTrainSnapshot,
    impact: string,
    startDepth?: number,
  ): void {
    this.state = {
      ...this.state,
      phase: "countdown",
      trainId: snapshot.id,
      trainStartedAt:
        snapshot.startedAt ??
        (this.state.trainId === snapshot.id ? this.state.trainStartedAt : null),
      anchorDepth: startDepth ?? roundDepthForLevel(snapshot.level),
      hypeLevel: Math.max(1, snapshot.level),
      hypeTotal: snapshot.total ?? this.estimatedTotalPoints(snapshot),
      hypeProgress: snapshot.progress,
      hypeGoal: snapshot.goal,
      expiresAt: snapshot.expiresAt,
      currentPrompt: "pull",
      voteCounts: emptyVotes(),
      voteSecondsRemaining: BALANCE.voteWindowSeconds,
      roundNumber: this.state.roundNumber + 1,
      winner: null,
      countdownSeconds: BALANCE.countdownSeconds,
      skillCheck: emptySkillCheck(),
      chatSkipRounds: 0,
      lastAward: null,
      lastImpact: impact,
    };
    this.votes.clear();
    this.voteElapsed = 0;
    this.countdownElapsed = 0;
    this.skillElapsed = 0;
    this.skillCooldownElapsed = 0;
  }

  private finish(winner: "streamer" | "chat", impact: string): void {
    this.state.phase = "result";
    this.state.winner = winner;
    this.state.skillCheck.active = false;
    this.state.lastImpact = impact;
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}
