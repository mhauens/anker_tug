export type GamePhase = "idle" | "countdown" | "playing" | "result";
export type VoteCommand = "pull" | "lower";
export type Winner = "streamer" | "chat" | null;
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";
export type AwardSide = "streamer" | "chat";

export interface SkillCheckState {
  active: boolean;
  progress: number;
  targetCenter: number;
  goodWidth: number;
  greatWidth: number;
  perfectWidth: number;
  result: "good" | "great" | "perfect" | "miss" | null;
}

export interface GameState {
  phase: GamePhase;
  trainId: string | null;
  trainStartedAt: string | null;
  anchorDepth: number;
  hypeLevel: number;
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
  progress: number;
  goal: number;
  expiresAt: string;
}
