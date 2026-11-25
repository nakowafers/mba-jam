// Canonical MBA Jam Domain & Sleeper API Types
// Strictly adheres to GLOSSARY.md and ADR-0001 / ADR-0002

export const MBA_LEAGUE_ID_2026 = '1344293979830640640';
export const MBA_LEAGUE_ID_2025 = '1212393765696700416';

export type StarterSlotType = 'PG' | 'SG' | 'G' | 'SF' | 'PF' | 'F' | 'C' | 'UTIL';

export const MBA_STARTER_SLOTS: readonly StarterSlotType[] = [
  'PG',
  'SG',
  'G',
  'SF',
  'PF',
  'F',
  'C',
  'C',
  'UTIL',
  'UTIL',
] as const;

export type RosterSlotCategory = 'STARTER' | 'BENCH' | 'RESERVE' | 'TAXI';

export interface MbaScoringSettings {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tpm: number;
  to: number;
  tf: number;
  ff: number;
  dd: number;
  td: number;
  bonus_pt_40p: number;
  bonus_pt_50p: number;
  [key: string]: number;
}

export const DEFAULT_MBA_SCORING_SETTINGS: MbaScoringSettings = {
  pts: 0.5,
  reb: 1.0,
  ast: 1.0,
  stl: 2.0,
  blk: 2.0,
  tpm: 0.5,
  to: -1.0,
  tf: -2.0,
  ff: -2.0,
  dd: 1.0,
  td: 2.0,
  bonus_pt_40p: 2.0,
  bonus_pt_50p: 2.0,
};

// Raw Sleeper API Shapes
export interface SleeperNbaState {
  week: number;
  leg: number;
  season: string;
  season_type: string;
  display_week?: number;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  sport: string;
  season: string;
  previous_league_id: string | null;
  status: string;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: {
    num_teams: number;
    draft_rounds: number;
    reserve_slots: number;
    taxi_slots: number;
    game_mode: number;
    leg: number;
    [key: string]: number | undefined;
  };
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  metadata?: {
    team_name?: string;
    avatar?: string;
    [key: string]: string | undefined;
  } | null;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
    ppts?: number;
    ppts_decimal?: number;
  };
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number;
  points: number;
  starters: string[];
  starters_points: number[];
  players: string[];
  players_points: Record<string, number>;
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  roster_id: number; // Original Roster ID
  owner_id: number; // Current owning Roster ID
  previous_owner_id: number;
}

export interface SleeperTransaction {
  transaction_id: string;
  type: 'trade' | 'waiver' | 'free_agent' | 'commissioner';
  status: string;
  created: number;
  leg: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks: SleeperTradedPick[];
  season?: '2026' | '2025' | string;
  league_id?: string;
}

export interface SleeperPlayer {
  player_id: string;
  full_name?: string;
  first_name: string;
  last_name: string;
  age?: number | null;
  years_exp?: number | null;
  position: string | null;
  fantasy_positions: string[] | null;
  team: string | null;
  injury_status: string | null;
  injury_notes?: string | null;
  active?: boolean;
}

export interface SleeperStatLine {
  gp?: number;
  pts?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  tpm?: number;
  to?: number;
  tf?: number;
  ff?: number;
  dd?: number;
  td?: number;
  bonus_pt_40p?: number;
  bonus_pt_50p?: number;
  min?: number;
  [key: string]: number | undefined;
}

export interface SleeperGameStatEntry {
  player_id: string;
  date: string | null;
  opponent: string | null;
  game_id: string;
  season: string;
  week: number | null;
  team: string | null;
  stats: SleeperStatLine;
  player?: {
    first_name?: string;
    last_name?: string;
    position?: string | null;
    fantasy_positions?: string[] | null;
    team?: string | null;
    injury_status?: string | null;
    injury_notes?: string | null;
    years_exp?: number | null;
  };
}

// Canonical Domain Entities (GLOSSARY.md)

export interface Manager {
  userId: string;
  rosterId: number;
  displayName: string;
  rosterName: string;
  avatarUrl: string | null;
}

export type LockInAvgSource = 'SLEEPER_LOCKED' | 'FALLBACK_FPG';

export interface PlayerSeasonMetrics {
  gamesPlayed: number;
  totalMbaPoints: number;
  mbaFantasyPointsPerGame: number;
  averageLockInPoints: number;
  lockInWeeksCount: number;
  totalLockInPoints: number;
  lockInAvgSource: LockInAvgSource;
  ptsPerGame: number;
  rebPerGame: number;
  astPerGame: number;
  stlPerGame: number;
  blkPerGame: number;
  tpmPerGame: number;
  toPerGame: number;
}

export interface CompletedWeeklyGame {
  gameId: string;
  date: string;
  opponent: string;
  mbaPoints: number;
  stats: SleeperStatLine;
  isLockedGame: boolean;
}

export interface ScheduledWeeklyGame {
  gameId: string;
  date: string;
  opponent: string;
  projectedMbaPoints: number;
  stats: SleeperStatLine;
}

export type LockSourceType = 'INFERRED_SLEEPER' | 'MANUAL_OVERRIDE' | 'FINAL_GAME_AUTO' | null;

export type LockInRecommendationBadge =
  | 'SMASH LOCK'
  | 'LEAN LOCK'
  | 'ROLL THE DICE'
  | 'LOCKED';

export type MatchupLeverageAnnotation =
  | 'Protect Lead — Floor Lock'
  | 'Chase Upside — Roll for Ceiling'
  | null;

export interface PlayerLockInEvaluation {
  isLocked: boolean;
  isPinnedStarter: boolean;
  lockSource: LockSourceType;
  lockedScore: number | null;
  lockedGame: CompletedWeeklyGame | null;
  isLockInWindowOpen: boolean;
  canToggleManualLock: boolean;
  lockableLatestGame: CompletedWeeklyGame | null;
  completedGames: CompletedWeeklyGame[];
  remainingGames: ScheduledWeeklyGame[];
  remainingGamesMean: number;
  remainingGamesMultiplier: number;
  lockInThreshold: number;
  effectiveWeeklyScore: number;
  recommendation: LockInRecommendationBadge;
  leverageAnnotation: MatchupLeverageAnnotation;
}

export interface MatchupLeverageSummary {
  matchupId: number;
  week: number;
  activeRosterId: number;
  activeRosterName: string;
  activeManagerName: string;
  opponentRosterId: number;
  opponentRosterName: string;
  opponentManagerName: string;
  activeCurrentScore: number;
  opponentCurrentScore: number;
  currentDifferential: number;
  activeProjectedScore: number;
  opponentProjectedScore: number;
  projectedDifferential: number;
  posture: 'PROTECT_LEAD' | 'CHASE_UPSIDE' | 'BALANCED';
  postureLabel: string;
  summaryText: string;
}

export type DynastyValueSource =
  | 'ACTUAL_ESTABLISHED'
  | 'SMALL_SAMPLE_BLENDED'
  | 'BASELINE_ESTIMATE';

export interface RosterPlayerSlot {
  slotIndex: number;
  slotLabel: StarterSlotType | 'BN' | 'IR' | 'TAXI';
  category: RosterSlotCategory;
  playerId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  nbaTeam: string;
  positions: string[];
  injuryStatus: string | null;
  injuryNotes: string | null;
  age: number | null;
  yearsExp: number | null;
  seasonMetrics: PlayerSeasonMetrics;
  currentWeekMatchupPoints: number;
  currentWeekCompletedGamesCount: number;
  currentWeekRemainingGamesCount: number;
  latestCompletedGamePoints: number | null;
  completedGames: CompletedWeeklyGame[];
  remainingGames: ScheduledWeeklyGame[];
  isLocked: boolean;
  isPinnedStarter: boolean;
  lockedScore: number | null;
  isLockInWindowOpen: boolean;
  lockInThreshold: number;
  effectiveWeeklyScore: number;
  recommendation: LockInRecommendationBadge;
  leverageAnnotation: MatchupLeverageAnnotation;
  lockIn: PlayerLockInEvaluation;
  dynastyValue: number;
  dynastyValueSource?: DynastyValueSource;
  dynastyValueBasisNote?: string | null;
}

export interface PlayerDynastyValuationInput {
  actualFpg: number;
  gamesPlayed?: number;
  projectedFpg?: number | null;
  seasonProjectedFpg?: number | null;
  priorSeasonFpg?: number | null;
  priorSeasonGamesPlayed?: number;
  age: number | null;
  positions: string[];
}

export interface PlayerDynastyValuation {
  blendedFpg: number;
  ageMultiplier: number;
  scarcityMultiplier: number;
  dynastyValue: number;
  dynastyValueSource: DynastyValueSource;
  dynastyValueBasisNote: string | null;
}

export interface RosterStanding {
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fptsAgainst: number;
  ppts: number;
}

export interface HydratedRoster {
  rosterId: number;
  manager: Manager;
  standing: RosterStanding;
  starterSlots: RosterPlayerSlot[]; // Always 10 slots matching MBA_STARTER_SLOTS
  benchSlots: RosterPlayerSlot[];
  reserveSlots: RosterPlayerSlot[];
  taxiSlots: RosterPlayerSlot[];
  allPlayers: RosterPlayerSlot[];
  ownedDraftPicks: DraftPickAsset[];
  currentWeekMatchupPoints: number;
  currentWeekProjectedPoints: number;
  currentWeekMatchupId: number | null;
  starterTotalFpg: number;
  starterTotalAvgLockIn: number;
  averageWeeklyMatchupPoints: number | null;
  lineupOptimization: RosterLineupOptimization;
  stagedChecklist: StagedLineupChecklist;
}

export interface MbaLeagueSnapshot {
  leagueId: string;
  leagueName: string;
  season: string;
  currentWeek: number;
  currentLeg: number;
  completedWeeksCount: number;
  scoringSettings: MbaScoringSettings;
  starterSlotTemplate: readonly StarterSlotType[];
  managers: Manager[];
  rosters: HydratedRoster[];
  playerCatalog?: Record<string, RosterPlayerSlot>;
  tradedPicks: SleeperTradedPick[];
  draftPickAssets: DraftPickAsset[];
  transactions: SleeperTransaction[];
  historicalTrades: GradedHistoricalTrade[];
  activeRosterId: number;
  activeRoster: HydratedRoster;
  matchupLeverage: MatchupLeverageSummary | null;
  lineupOptimization: RosterLineupOptimization;
  stagedChecklist: StagedLineupChecklist;
  syncedAt: string;
}

export type DraftPickSeason = '2026' | '2027' | '2028' | '2029';

export const MBA_DRAFT_PICK_SEASONS: readonly DraftPickSeason[] = [
  '2026',
  '2027',
  '2028',
  '2029',
] as const;

export type ProjectedPickTier = 'Early' | 'Mid' | 'Late';

export interface DraftPickAsset {
  id: string;
  season: DraftPickSeason;
  round: 1 | 2;
  originalRosterId: number;
  originalRosterName: string;
  currentOwnerRosterId: number;
  currentOwnerRosterName: string;
  isTraded: boolean;
  viaAnnotation: string | null;
  displayLabel: string;
  projectedSlot: number;
  projectedTier: ProjectedPickTier;
  hasManualTierOverride: boolean;
  dynastyValue: number;
}

export interface DraftPickMatrixRow {
  rosterId: number;
  rosterName: string;
  managerDisplayName: string;
  totalPickCapital: number;
  firstRoundCount: number;
  secondRoundCount: number;
  picksBySeason: Record<DraftPickSeason, DraftPickAsset[]>;
  allOwnedPicks: DraftPickAsset[];
}

export interface DraftPickMatrix {
  seasons: readonly DraftPickSeason[];
  allPicks: DraftPickAsset[];
  byOwnerRosterId: Record<number, Record<DraftPickSeason, DraftPickAsset[]>>;
  rows: DraftPickMatrixRow[];
}

export type RosterArchetype =
  | 'Title Favorite'
  | 'Young Juggernaut'
  | 'Reloading'
  | 'Asset-Rich Rebuilder';

export interface RosterPowerRanking {
  rosterId: number;
  rosterName: string;
  managerDisplayName: string;
  wins: number;
  losses: number;
  ppts: number;
  fpts: number;
  overallRank: number;
  overallDynastyPower: number;
  contenderScore: number;
  starterTotalAvgLockIn: number;
  starterTotalFpg: number;
  contenderRank: number;
  dynastyCoreScore: number;
  dynastyCoreRank: number;
  youngCoreValue: number;
  youngCoreRank: number;
  under25PlayerCount: number;
  draftPickCapital: number;
  draftPickRank: number;
  ownedFirstRoundPicksCount: number;
  ownedSecondRoundPicksCount: number;
  archetype: RosterArchetype;
}

// Pluggable Seams

export interface SleeperLeagueBundle {
  nbaState: SleeperNbaState;
  league: SleeperLeague;
  users: SleeperUser[];
  rosters: SleeperRoster[];
  matchups: SleeperMatchup[];
  historicalMatchups?: Record<number, SleeperMatchup[]>;
  tradedPicks: SleeperTradedPick[];
  transactions?: SleeperTransaction[];
  players: Record<string, SleeperPlayer>;
  seasonStats: SleeperGameStatEntry[];
  previousSeasonStats?: SleeperGameStatEntry[];
  seasonProjections?: SleeperGameStatEntry[];
  weeklyStats: SleeperGameStatEntry[];
  weeklyProjections: SleeperGameStatEntry[];
}

export interface SleeperGateway {
  fetchLeagueBundle(options?: { forceRefresh?: boolean; leg?: number }): Promise<SleeperLeagueBundle>;
  fetchTransactions?(leagueId: string, leg: number): Promise<SleeperTransaction[]>;
}

export interface ManagerStateStore {
  getActiveRosterId(leagueId?: string): number | null;
  setActiveRosterId(rosterId: number, leagueId?: string): void;
  getManualLockOverride(leagueId: string, week: number, rosterId: number, playerId: string): boolean | null;
  setManualLockOverride(leagueId: string, week: number, rosterId: number, playerId: string, locked: boolean | null): void;
  getPickTierOverride(pickId: string): ProjectedPickTier | null;
  setPickTierOverride(pickId: string, tier: ProjectedPickTier | null): void;
}

export interface OptimizedStarterSlotAssignment extends RosterPlayerSlot {
  slotIndex: number;
  slotLabel: StarterSlotType;
  previousSlotLabel: StarterSlotType | 'BN' | 'IR' | 'TAXI';
  previousSlotIndex: number;
  isMoved: boolean;
  optimizerEffectiveScore: number;
}

export interface SwapAndLockAlert {
  id: string;
  benchPlayerId: string;
  benchPlayerName: string;
  benchPlayerPositions: string[];
  benchPlayerTeam: string;
  lockableScore: number;
  latestCompletedGamePoints: number;
  gameOpponent: string | null;
  gameDate: string | null;
  targetSlotIndex: number;
  targetSlotLabel: StarterSlotType;
  displacedPlayerId: string;
  displacedPlayerName: string;
  displacedEffectiveScore: number;
  deltaPoints: number;
  netLineupDeltaPoints: number;
  headline: string;
  detail: string;
}

export type RosterEligibilityWarningType = 'INJURED_STARTER' | 'HEALTHY_ON_IR';

export interface RosterEligibilityWarning {
  id: string;
  type: RosterEligibilityWarningType;
  severity: 'ERROR' | 'WARNING';
  playerId: string;
  playerName: string;
  slotLabel: StarterSlotType | 'BN' | 'IR' | 'TAXI';
  injuryStatus: string | null;
  hasOpenIrSlot: boolean;
  message: string;
  recommendedAction: string;
}

export interface RosterLineupOptimization {
  rosterId: number;
  week: number;
  currentStarters: OptimizedStarterSlotAssignment[];
  currentTotalScore: number;
  actionableOptimalStarters: OptimizedStarterSlotAssignment[];
  actionableTotalScore: number;
  actionableDeltaScore: number;
  hypotheticalOptimalStarters: OptimizedStarterSlotAssignment[];
  hypotheticalTotalScore: number;
  hypotheticalDeltaScore: number;
  recommendedSwaps: StagedSlotSwap[];
  recommendedLockActions: StagedLockAction[];
  swapAndLockAlerts: SwapAndLockAlert[];
  eligibilityWarnings: RosterEligibilityWarning[];
  warnings: RosterEligibilityWarning[];
  stagedChecklist: StagedLineupChecklist;
}

export interface StagedSlotSwap {
  fromSlot: string;
  toSlot: string;
  playerInId: string;
  playerInName: string;
  playerOutId?: string;
  playerOutName?: string;
  deltaPoints?: number;
  reason: string;
}

export interface StagedLockAction {
  playerId: string;
  playerName: string;
  gameScore: number;
  opponent: string | null;
  date: string | null;
  recommendation: string;
}

export interface StageLineupPayload {
  leagueId: string;
  rosterId: number;
  week: number;
  slotSwaps: StagedSlotSwap[];
  lockActions: StagedLockAction[];
  irMoves?: StagedSlotSwap[];
}

export interface StagedLineupChecklist {
  leagueId: string;
  rosterId: number;
  week: number;
  sleeperDeepLink: string;
  steps: Array<{
    id: string;
    type: 'SWAP' | 'LOCK' | 'IR';
    title: string;
    detail: string;
  }>;
}

export interface LineupMutationAdapter {
  readonly mode?: 'CHECKLIST' | 'SLEEPER_GRAPHQL';
  stageLineupChanges(payload: StageLineupPayload): StagedLineupChecklist;
}

// Dynasty Trade Evaluation & Quick Trade Text Parser Types (ADR-0002 & GLOSSARY.md)

export type TradeLetterGrade =
  | 'A+'
  | 'A'
  | 'A-'
  | 'B+'
  | 'B'
  | 'B-'
  | 'C+'
  | 'C'
  | 'C-'
  | 'D'
  | 'F'
  | 'N/A';

export interface TradeParticipantProposal {
  rosterId: number;
  outgoingPlayerIds?: string[];
  incomingPlayerIds?: string[];
  outgoingPickIds?: string[];
  incomingPickIds?: string[];
}

export type TradeEvaluationMode = 'LIVE' | 'HISTORICAL';

export interface TradeProposal {
  participants: TradeParticipantProposal[];
  pickTierOverrides?: Record<string, ProjectedPickTier>;
  evaluationMode?: TradeEvaluationMode;
}

export interface ReplacementCutAsset {
  playerId: string;
  fullName: string;
  positions: string[];
  age: number | null;
  fpg: number;
  dynastyValue: number;
  slotLabel: string;
}

export interface FlippedAssetMetadata {
  isFlippedAsset?: boolean;
  flippedInTransactionId?: string | null;
  flippedTimestamp?: number | null;
  flippedToRosterId?: number | null;
  flippedToRosterName?: string | null;
  flippedSeason?: string | null;
  flippedLeg?: number | null;
  flippedSummary?: string | null;
}

export interface EvaluatedTradePlayerAsset extends FlippedAssetMetadata {
  playerId: string;
  fullName: string;
  nbaTeam: string;
  positions: string[];
  age: number | null;
  fpg: number;
  avgLockIn: number;
  dynastyValue: number;
  dynastyValueSource?: DynastyValueSource;
  dynastyValueBasisNote?: string | null;
  consolidationPremium: number;
  fromRosterId: number;
  toRosterId: number;
}

export type EvaluatedDraftPickSeason = DraftPickSeason | '2025';

export interface EvaluatedTradePickAsset extends FlippedAssetMetadata {
  pickId: string;
  season: EvaluatedDraftPickSeason;
  round: 1 | 2;
  originalRosterId: number;
  originalRosterName: string;
  displayLabel: string;
  projectedSlot: number;
  projectedTier: ProjectedPickTier;
  hasManualTierOverride: boolean;
  dynastyValue: number;
  consolidationPremium: number;
  fromRosterId: number;
  toRosterId: number;
}

export interface OptimalStarterAssignmentSlot {
  slotIndex: number;
  slotLabel: StarterSlotType;
  playerId: string;
  fullName: string;
  positions: string[];
  fpg: number;
  avgLockIn: number;
}

export interface TradeParticipantEvaluation {
  rosterId: number;
  rosterName: string;
  managerDisplayName: string;
  incomingPlayers: EvaluatedTradePlayerAsset[];
  outgoingPlayers: EvaluatedTradePlayerAsset[];
  incomingPicks: EvaluatedTradePickAsset[];
  outgoingPicks: EvaluatedTradePickAsset[];
  rawIncomingDynastyValue: number;
  rawOutgoingDynastyValue: number;
  rawDynastyDelta: number;
  consolidationPremium: number;
  outgoingConsolidationPremium: number;
  replacementCutAssets: ReplacementCutAsset[];
  replacementCutPenalty: number;
  adjustedIncomingDynastyValue: number;
  adjustedOutgoingDynastyValue: number;
  adjustedDynastyDelta: number;
  preTradeOptimalStarterFpg: number;
  postTradeOptimalStarterFpg: number;
  starting10DeltaFppg: number;
  preTradeOptimalStarterAvgLockIn: number;
  postTradeOptimalStarterAvgLockIn: number;
  starting10DeltaAvgLockIn: number;
  preTradeOptimalStarters: OptimalStarterAssignmentSlot[];
  postTradeOptimalStarters: OptimalStarterAssignmentSlot[];
  preTradeAverageAge: number;
  postTradeAverageAge: number;
  averageAgeDelta: number;
  preTradeCenterCount: number;
  postTradeCenterCount: number;
  centerDepthDelta: number;
  centerImpactSummary: string;
  letterGrade: TradeLetterGrade;
  compositeGradeScore: number;
  isWinner: boolean;
  takeaways: string[];
}

export type TradeFairnessLabel =
  | 'Balanced Trade'
  | 'Slight Edge'
  | 'Lopsided Trade'
  | 'Fleecing Alert'
  | 'Settlement Transfer';

export interface TradeEvaluationResult {
  participants: TradeParticipantEvaluation[];
  fairnessScore: number;
  fairnessLabel: TradeFairnessLabel;
  winnerRosterId: number | null;
  winnerRosterName: string | null;
  isSettlementTransfer: boolean;
  netAdjustedSpread: number;
  summaryHeadline: string;
  appliedPickTierOverrides: Record<string, ProjectedPickTier>;
}

export interface ParsedTradeTextResult extends TradeProposal {
  proposal: TradeProposal;
  matchedRosters: Array<{ rosterId: number; rosterName: string; managerDisplayName: string }>;
  unmatchedTokens: string[];
}

export type HistoricalTradeSeasonFilter = '2026' | '2025' | 'ALL';

export interface HistoricalTradeFilterOptions {
  season?: HistoricalTradeSeasonFilter;
  rosterId?: number | null;
  /** Defaults to true. When false, Settlement Transfers are omitted (Flipped Asset links are still computed on the full history). */
  includeSettlements?: boolean;
}

export type RequiredFlippedAssetFields = {
  [K in keyof FlippedAssetMetadata]-?: NonNullable<FlippedAssetMetadata[K]>;
};

export interface FlippedAssetChainRecord extends RequiredFlippedAssetFields {
  assetType: 'PLAYER' | 'PICK';
  assetId: string;
  assetLabel: string;
  acquiredByRosterId: number;
  acquiredByRosterName: string;
  acquiredInTransactionId: string;
  acquiredTimestamp: number;
  isFlippedAsset: true;
}

export interface GradedHistoricalTrade {
  transactionId: string;
  leagueId: string;
  season: '2026' | '2025' | string;
  leg: number;
  created: number;
  formattedDate: string;
  rosterIds: number[];
  proposal: TradeProposal;
  evaluation: TradeEvaluationResult;
  participants: TradeParticipantEvaluation[];
  winnerRosterId: number | null;
  winnerRosterName: string | null;
  fairnessScore: number;
  fairnessLabel: TradeFairnessLabel;
  isSettlementTransfer: boolean;
  netAdjustedSpread: number;
  summaryHeadline: string;
  flippedAssets: FlippedAssetChainRecord[];
  hasFlippedAssets: boolean;
}


