export type GamePhase = "idle" | "countdown" | "playing" | "result";
export type VoteCommand = "pull" | "lower";
export type Winner = "streamer" | "chat" | null;
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";
export type AwardSide = "streamer" | "chat";
export type SkillCheckResult = "good" | "great" | "perfect" | "miss";
export type SkillCheckVariantId =
  | "steady"
  | "countercurrent"
  | "tideTurn"
  | "splitCatch"
  | "chainLock";

export interface SkillCheckZone {
  center: number;
  width: number;
  result: Exclude<SkillCheckResult, "miss">;
  step?: number;
}

export interface SkillCheckState {
  active: boolean;
  variantId: SkillCheckVariantId;
  variantLabel: string;
  instruction: string;
  theme: string;
  progress: number;
  zones: SkillCheckZone[];
  requiredHits: number;
  completedHits: number;
  hitResults: Exclude<SkillCheckResult, "miss">[];
  activeStep: number;
  result: SkillCheckResult | null;
}

export interface GameState {
  phase: GamePhase;
  trainId: string | null;
  trainStartedAt: string | null;
  anchorDepth: number;
  hypeLevel: number;
  hypeTotal: number;
  hypeProgress: number;
  hypeGoal: number;
  expiresAt: string | null;
  currentPrompt: VoteCommand | null;
  voteCounts: Record<VoteCommand, number>;
  voteSecondsRemaining: number;
  roundNumber: number;
  streamerWins: number;
  chatWins: number;
  chatSkipRounds: number;
  lastAward: { side: AwardSide; points: number } | null;
  winner: Winner;
  countdownSeconds: number;
  skillCheck: SkillCheckState;
  lastImpact: string | null;
}

export interface HypeTrainSnapshot {
  id: string;
  startedAt?: string;
  level: number;
  total?: number;
  progress: number;
  goal: number;
  expiresAt: string;
}
