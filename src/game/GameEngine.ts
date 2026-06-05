import {
  BALANCE,
  formatMeters,
  giftSubCountForTotal,
  giftSubPullForTotal,
  roundDepthForLevel,
  skillStrengthForLevel,
  votePullForLevel,
} from "./balance";
import type {
  GameState,
  HypeTrainSnapshot,
  SkillCheckState,
  VoteCommand,
} from "./types";

function emptyVotes(): Record<VoteCommand, number> {
  return { pull: 0, lower: 0 };
}

function emptySkillCheck(): SkillCheckState {
  return {
    active: false,
    progress: 0,
    targetCenter: 0.5,
    goodWidth: BALANCE.skillBaseGoodWidth,
    greatWidth:
      BALANCE.skillBaseGoodWidth * BALANCE.skillGreatWidthFactor,
    perfectWidth:
      BALANCE.skillBaseGoodWidth * BALANCE.skillPerfectWidthFactor,
    result: null,
  };
}

export function createInitialGameState(): GameState {
  return {
    phase: "idle",
    trainId: null,
    trainStartedAt: null,
    anchorDepth: BALANCE.initialDepth,
    hypeLevel: 1,
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
      this.state.streamerWins += gainedLevels;
      this.beginLevelRound(
        snapshot,
        `Level ${snapshot.level - 1} gehalten: Punkt fuer den Streamer`,
      );
      this.state.lastAward = { side: "streamer", points: gainedLevels };
      this.emit();
      return;
    }

    this.state.hypeProgress = Math.max(this.state.hypeProgress, snapshot.progress);
    if (snapshot.goal > 0) this.state.hypeGoal = snapshot.goal;
    if (Date.parse(snapshot.expiresAt) > Date.parse(this.state.expiresAt ?? "")) {
      this.state.expiresAt = snapshot.expiresAt;
    }
    this.emit();
  }

  onHypeEnd(trainId: string): void {
    if (this.state.trainId !== trainId || this.state.phase === "result") return;
    this.state.streamerWins += 1;
    this.finish("streamer", "Letzte Stufe gehalten: Punkt für den Streamer");
  }

  onRegularSub(isGift: boolean): void {
    if (!this.canApplyForces() || isGift) return;
    const wins = this.applyChatPull(BALANCE.regularSubPull);
    this.state.chatSkipRounds = wins > 1 ? wins : 0;
    this.state.lastAward = wins > 0 ? { side: "chat", points: wins } : null;
    this.state.lastImpact =
      wins > 0
        ? `Neuer Sub: ${formatMeters(BALANCE.regularSubPull)} hoch, +${wins} Chat-Punkt${wins === 1 ? "" : "e"}`
        : `Neuer Sub: ${formatMeters(BALANCE.regularSubPull)} hoch`;
    this.emit();
  }

  onGiftSubs(total: number): void {
    if (!this.canApplyForces()) return;
    const giftCount = giftSubCountForTotal(total);
    if (giftCount === 0) return;
    const pull = giftSubPullForTotal(giftCount);
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

    const distance = Math.abs(
      this.state.skillCheck.progress - this.state.skillCheck.targetCenter,
    );
    const perfect = distance <= this.state.skillCheck.perfectWidth / 2;
    const great = distance <= this.state.skillCheck.greatWidth / 2;
    const good = distance <= this.state.skillCheck.goodWidth / 2;
    const skillStrength = skillStrengthForLevel(this.state.hypeLevel);

    if (perfect) {
      this.applyDepth(BALANCE.skillPerfectSink * skillStrength);
      this.state.skillCheck.result = "perfect";
      this.state.lastImpact = "Perfektes Ankermanöver";
    } else if (great) {
      this.applyDepth(BALANCE.skillGreatSink * skillStrength);
      this.state.skillCheck.result = "great";
      this.state.lastImpact = "Sehr gutes Ankermanoever";
    } else if (good) {
      this.applyDepth(BALANCE.skillGoodSink * skillStrength);
      this.state.skillCheck.result = "good";
      this.state.lastImpact = "Gutes Ankermanöver";
    } else {
      this.state.skillCheck.result = "miss";
      this.state.lastImpact = "Manöver verfehlt: Der Anker bleibt stabil";
    }

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

    this.applyDepth(BALANCE.naturalSinkPerSecond * deltaSeconds);
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
    const duration = BALANCE.skillBaseDurationSeconds / speedMultiplier;
    this.state.skillCheck.progress = Math.min(1, this.skillElapsed / duration);

    if (this.state.skillCheck.progress >= 1) {
      this.state.skillCheck = {
        ...this.state.skillCheck,
        active: false,
        result: "miss",
      };
      this.state.lastImpact = "Skillcheck verpasst: Der Anker bleibt stabil";
      this.skillElapsed = 0;
      this.skillCooldownElapsed = 0;
    }
  }

  private beginSkillCheck(): void {
    const goodWidth = Math.max(
      BALANCE.skillMinimumGoodWidth,
      BALANCE.skillBaseGoodWidth -
        (this.state.hypeLevel - 1) * BALANCE.skillWidthLossPerLevel,
    );
    const margin = goodWidth / 2 + 0.08;
    this.state.skillCheck = {
      active: true,
      progress: 0,
      targetCenter: margin + this.random() * (1 - margin * 2),
      goodWidth,
      greatWidth: goodWidth * BALANCE.skillGreatWidthFactor,
      perfectWidth: goodWidth * BALANCE.skillPerfectWidthFactor,
      result: null,
    };
    this.skillElapsed = 0;
    this.skillCooldownElapsed = 0;
    this.state.lastImpact = "Skillcheck: Leertaste im Zielbereich";
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

  private beginLevelRound(snapshot: HypeTrainSnapshot, impact: string): void {
    this.state = {
      ...this.state,
      phase: "countdown",
      trainId: snapshot.id,
      trainStartedAt:
        snapshot.startedAt ??
        (this.state.trainId === snapshot.id ? this.state.trainStartedAt : null),
      anchorDepth: roundDepthForLevel(snapshot.level),
      hypeLevel: Math.max(1, snapshot.level),
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
