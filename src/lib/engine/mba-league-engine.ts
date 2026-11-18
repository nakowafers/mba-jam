import { ChecklistLineupAdapter } from '../adapter/lineup-mutation-adapter';
import {
  EvaluatePlayerLockInInput,
  applyMatchupLeverageToRoster,
  evaluatePlayerLockIn,
} from '../lineup/lock-in-advisor';
import { computeMbaPoints, computeSeasonMetrics } from '../scoring/mba-scoring';
import {
  computeLeaguePowerRankings,
  computePlayerDynastyValue,
  resolveDraftPickMatrix,
} from '../trades/dynasty-valuation';
import {
  DEFAULT_MBA_SCORING_SETTINGS,
  DraftPickMatrix,
  HydratedRoster,
  LineupMutationAdapter,
  MBA_LEAGUE_ID_2026,
  MBA_STARTER_SLOTS,
  Manager,
  ManagerStateStore,
  MatchupLeverageSummary,
  MbaLeagueSnapshot,
  MbaScoringSettings,
  PlayerDynastyValuation,
  PlayerDynastyValuationInput,
  PlayerLockInEvaluation,
  ProjectedPickTier,
  RosterPlayerSlot,
  RosterPowerRanking,
  RosterSlotCategory,
  SleeperGameStatEntry,
  SleeperGateway,
  SleeperLeagueBundle,
  SleeperPlayer,
  SleeperStatLine,
  StageLineupPayload,
  StagedLineupChecklist,
  StarterSlotType,
} from '../types/mba';

const manualOverrideGameCountByStore = new WeakMap<ManagerStateStore, Map<string, number>>();

function getStoreGameCountMap(store: ManagerStateStore): Map<string, number> {
  let map = manualOverrideGameCountByStore.get(store);
  if (!map) {
    map = new Map<string, number>();
    manualOverrideGameCountByStore.set(store, map);
  }
  return map;
}

export interface MbaLeagueEngineDeps {
  gateway: SleeperGateway;
  stateStore: ManagerStateStore;
  mutationAdapter?: LineupMutationAdapter;
}

export class MbaLeagueEngine {
  private readonly gateway: SleeperGateway;
  private readonly stateStore: ManagerStateStore;
  private readonly mutationAdapter: LineupMutationAdapter;
  private lastLeagueId: string = MBA_LEAGUE_ID_2026;
  private lastWeek: number = 5;

  constructor(deps: MbaLeagueEngineDeps) {
    this.gateway = deps.gateway;
    this.stateStore = deps.stateStore;
    this.mutationAdapter = deps.mutationAdapter ?? new ChecklistLineupAdapter();
  }

  /**
   * Computes exact MBA custom fantasy points for any raw statline.
   */
  public scoreStatLine(
    stats: SleeperStatLine | undefined | null,
    scoringOverride?: MbaScoringSettings
  ): number {
    return computeMbaPoints(stats, scoringOverride ?? DEFAULT_MBA_SCORING_SETTINGS);
  }

  /**
   * Evaluates a single player's weekly Lock-In state, schedule-aware Lock-In Threshold (E[max]),
   * and Effective Weekly Score.
   */
  public evaluatePlayerLockIn(input: EvaluatePlayerLockInInput): PlayerLockInEvaluation {
    return evaluatePlayerLockIn(input);
  }

  /**
   * Computes 0–100 MBA Dynasty Value for a player from their MBA FP/G, age curve, and 2-Center scarcity.
   */
  public evaluatePlayerDynastyValue(
    input: PlayerDynastyValuationInput
  ): PlayerDynastyValuation {
    return computePlayerDynastyValue(input);
  }

  /**
   * Resolves the 80-pick 2026–2029 Draft Pick Asset ownership matrix and Projected Pick Tiers.
   */
  public getDraftPickMatrix(snapshot: MbaLeagueSnapshot): DraftPickMatrix;
  public getDraftPickMatrix(): Promise<DraftPickMatrix>;
  public getDraftPickMatrix(
    snapshot?: MbaLeagueSnapshot
  ): DraftPickMatrix | Promise<DraftPickMatrix> {
    if (snapshot) {
      return resolveDraftPickMatrix({
        rosters: snapshot.rosters,
        tradedPicks: snapshot.tradedPicks,
        stateStore: this.stateStore,
      });
    }
    return this.getLeagueSnapshot().then((snap) =>
      resolveDraftPickMatrix({
        rosters: snap.rosters,
        tradedPicks: snap.tradedPicks,
        stateStore: this.stateStore,
      })
    );
  }

  /**
   * Evaluates League Power Rankings across all 10 MBA Rosters.
   */
  public evaluateLeaguePowerRankings(snapshot: MbaLeagueSnapshot): RosterPowerRanking[];
  public evaluateLeaguePowerRankings(): Promise<RosterPowerRanking[]>;
  public evaluateLeaguePowerRankings(
    snapshot?: MbaLeagueSnapshot
  ): RosterPowerRanking[] | Promise<RosterPowerRanking[]> {
    if (snapshot) {
      const pickMatrix = this.getDraftPickMatrix(snapshot);
      return computeLeaguePowerRankings({
        rosters: snapshot.rosters,
        pickMatrix,
      });
    }
    return this.getLeagueSnapshot().then((snap) => {
      const pickMatrix = this.getDraftPickMatrix(snap);
      return computeLeaguePowerRankings({
        rosters: snap.rosters,
        pickMatrix,
      });
    });
  }

  /**
   * Selects and persists the active Manager / Roster in ManagerStateStore (localStorage).
   */
  public selectActiveRoster(rosterId: number, leagueId?: string): void {
    this.stateStore.setActiveRosterId(rosterId, leagueId);
  }

  /**
   * Returns the currently persisted active Roster ID (or null if none saved yet).
   */
  public getStoredActiveRosterId(leagueId?: string): number | null {
    return this.stateStore.getActiveRosterId(leagueId);
  }

  /**
   * Returns the current manual Lock-In override for a player (or null if none).
   */
  public getPlayerManualLock(
    rosterId: number,
    playerId: string,
    options?: { leagueId?: string; week?: number }
  ): boolean | null {
    const leagueId = options?.leagueId ?? this.lastLeagueId;
    const week = options?.week ?? this.lastWeek;
    return this.stateStore.getManualLockOverride(leagueId, week, rosterId, playerId);
  }

  /**
   * Sets or clears a manual Lock-In override for a player in an open Lock-In Window.
   */
  public setPlayerManualLock(
    rosterId: number,
    playerId: string,
    locked: boolean | null,
    options?: { leagueId?: string; week?: number; completedGamesCount?: number }
  ): void {
    const leagueId = options?.leagueId ?? this.lastLeagueId;
    const week = options?.week ?? this.lastWeek;
    const key = `${leagueId}:${week}:${rosterId}:${playerId}`;
    const countMap = getStoreGameCountMap(this.stateStore);

    if (locked === null) {
      countMap.delete(key);
    } else if (typeof options?.completedGamesCount === 'number') {
      countMap.set(key, options.completedGamesCount);
    }

    this.stateStore.setManualLockOverride(leagueId, week, rosterId, playerId, locked);
  }

  /**
   * Toggles a manual Lock-In override for a player in an open Lock-In Window.
   */
  public togglePlayerManualLock(
    rosterId: number,
    playerId: string,
    options?: { leagueId?: string; week?: number; completedGamesCount?: number }
  ): boolean {
    const leagueId = options?.leagueId ?? this.lastLeagueId;
    const week = options?.week ?? this.lastWeek;
    const current = this.stateStore.getManualLockOverride(leagueId, week, rosterId, playerId);
    const next = current === true ? null : true;
    this.setPlayerManualLock(rosterId, playerId, next, {
      leagueId,
      week,
      completedGamesCount: options?.completedGamesCount,
    });
    return next === true;
  }

  /**
   * Sets or clears a manual Projected Pick Tier override for a Draft Pick Asset.
   */
  public setPickTierOverride(pickId: string, tier: ProjectedPickTier | null): void {
    this.stateStore.setPickTierOverride(pickId, tier);
  }

  /**
   * Returns any manual Projected Pick Tier override for a Draft Pick Asset.
   */
  public getPickTierOverride(pickId: string): ProjectedPickTier | null {
    return this.stateStore.getPickTierOverride(pickId);
  }

  /**
   * Stages lineup swaps and Lock-In actions via the pluggable LineupMutationAdapter seam.
   */
  public stageLineupChanges(payload: StageLineupPayload): StagedLineupChecklist {
    return this.mutationAdapter.stageLineupChanges(payload);
  }

  /**
   * Loads and hydrates the full MBA League Snapshot across all 10 Managers and Rosters.
   */
  public async getLeagueSnapshot(options?: {
    forceRefresh?: boolean;
    activeRosterId?: number;
  }): Promise<MbaLeagueSnapshot> {
    const bundle = await this.gateway.fetchLeagueBundle({
      forceRefresh: options?.forceRefresh,
    });
    return this.buildSnapshotFromBundle(bundle, options?.activeRosterId);
  }

  /**
   * Explicitly refreshes live league, Roster, and stat data from Sleeper ("Sync Latest Sleeper Data").
   */
  public async syncLatestData(activeRosterId?: number): Promise<MbaLeagueSnapshot> {
    return this.getLeagueSnapshot({ forceRefresh: true, activeRosterId });
  }

  /**
   * Builds a complete MbaLeagueSnapshot directly from a SleeperLeagueBundle.
   */
  public buildSnapshotFromBundle(
    bundle: SleeperLeagueBundle,
    explicitRosterId?: number
  ): MbaLeagueSnapshot {
    const leagueId = bundle.league.league_id;
    const currentWeek = bundle.nbaState.week || bundle.league.settings.leg || 1;
    const currentLeg = bundle.nbaState.leg || bundle.league.settings.leg || 1;

    this.lastLeagueId = leagueId;
    this.lastWeek = currentWeek;

    const scoringSettings: MbaScoringSettings = {
      ...DEFAULT_MBA_SCORING_SETTINGS,
      ...(bundle.league.scoring_settings ?? {}),
    };

    const userMap = new Map(bundle.users.map((u) => [u.user_id, u]));
    const matchupByRosterId = new Map(bundle.matchups.map((m) => [m.roster_id, m]));
    const countMap = getStoreGameCountMap(this.stateStore);

    // Index season stats by player_id
    const seasonStatByPlayerId = new Map<string, SleeperGameStatEntry>();
    for (const entry of bundle.seasonStats) {
      if (entry.player_id) {
        seasonStatByPlayerId.set(entry.player_id, entry);
      }
    }

    // Index weekly completed games and remaining projections by player_id
    const weeklyCompletedByPlayerId = new Map<string, SleeperGameStatEntry[]>();
    for (const entry of bundle.weeklyStats) {
      if (!entry.player_id) continue;
      const list = weeklyCompletedByPlayerId.get(entry.player_id) ?? [];
      list.push(entry);
      weeklyCompletedByPlayerId.set(entry.player_id, list);
    }

    const weeklyProjByPlayerId = new Map<string, SleeperGameStatEntry[]>();
    for (const entry of bundle.weeklyProjections) {
      if (!entry.player_id) continue;
      const list = weeklyProjByPlayerId.get(entry.player_id) ?? [];
      list.push(entry);
      weeklyProjByPlayerId.set(entry.player_id, list);
    }

    const sortedRosters = [...bundle.rosters].sort((a, b) => a.roster_id - b.roster_id);

    const managers: Manager[] = [];
    const hydratedRosters: HydratedRoster[] = [];

    for (const rawRoster of sortedRosters) {
      const user = userMap.get(rawRoster.owner_id);
      const displayName = user?.display_name || `Manager ${rawRoster.roster_id}`;
      const rawTeamName = user?.metadata?.team_name?.trim();
      const rosterName = rawTeamName && rawTeamName.length > 0 ? rawTeamName : `Team ${displayName}`;
      const avatarUrl =
        user?.metadata?.avatar ||
        (user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null);

      const manager: Manager = {
        userId: rawRoster.owner_id,
        rosterId: rawRoster.roster_id,
        displayName,
        rosterName,
        avatarUrl,
      };
      managers.push(manager);

      const matchup = matchupByRosterId.get(rawRoster.roster_id);
      const playersPoints = matchup?.players_points ?? {};

      const startersIds = rawRoster.starters ?? [];
      const reserveIds = rawRoster.reserve ?? [];
      const taxiIds = rawRoster.taxi ?? [];
      const allRosterPlayerIds = rawRoster.players ?? [];

      const nonBenchSet = new Set<string>([...startersIds, ...reserveIds, ...taxiIds]);
      const benchIds = allRosterPlayerIds.filter((pid) => !nonBenchSet.has(pid));

      const hydratePlayerSlot = (
        playerId: string,
        slotIndex: number,
        slotLabel: StarterSlotType | 'BN' | 'IR' | 'TAXI',
        category: RosterSlotCategory
      ): RosterPlayerSlot => {
        const pInfo: SleeperPlayer | undefined = bundle.players[playerId];
        const seasonEntry = seasonStatByPlayerId.get(playerId);
        const fallbackPlayer = seasonEntry?.player;

        const firstName = pInfo?.first_name ?? fallbackPlayer?.first_name ?? 'Unknown';
        const lastName = pInfo?.last_name ?? fallbackPlayer?.last_name ?? playerId;
        const fullName = pInfo?.full_name ?? `${firstName} ${lastName}`.trim();
        const nbaTeam = pInfo?.team ?? fallbackPlayer?.team ?? seasonEntry?.team ?? 'FA';
        const positions =
          pInfo?.fantasy_positions?.length
            ? pInfo.fantasy_positions
            : fallbackPlayer?.fantasy_positions?.length
              ? fallbackPlayer.fantasy_positions
              : pInfo?.position
                ? [pInfo.position]
                : ['UTIL'];

        const injuryStatus = pInfo?.injury_status ?? fallbackPlayer?.injury_status ?? null;
        const injuryNotes = pInfo?.injury_notes ?? fallbackPlayer?.injury_notes ?? null;
        const age = pInfo?.age ?? null;
        const yearsExp = pInfo?.years_exp ?? fallbackPlayer?.years_exp ?? null;

        const seasonMetrics = computeSeasonMetrics(seasonEntry?.stats, scoringSettings);
        const completedEntries = weeklyCompletedByPlayerId.get(playerId) ?? [];
        const projectionEntries = weeklyProjByPlayerId.get(playerId) ?? [];

        const currentWeekMatchupPoints =
          typeof playersPoints[playerId] === 'number'
            ? Math.round(playersPoints[playerId] * 100) / 100
            : 0;

        // Reconcile manual Lock-In override if a subsequent game in Sleeper has completed
        const overrideKey = `${leagueId}:${currentWeek}:${rawRoster.roster_id}:${playerId}`;
        let manualLockOverride = this.stateStore.getManualLockOverride(
          leagueId,
          currentWeek,
          rawRoster.roster_id,
          playerId
        );

        if (manualLockOverride !== null) {
          const recordedCount = countMap.get(overrideKey);
          if (recordedCount !== undefined && completedEntries.length > recordedCount) {
            this.stateStore.setManualLockOverride(
              leagueId,
              currentWeek,
              rawRoster.roster_id,
              playerId,
              null
            );
            countMap.delete(overrideKey);
            manualLockOverride = null;
          } else if (recordedCount === undefined) {
            countMap.set(overrideKey, completedEntries.length);
          }
        }

        const lockIn = evaluatePlayerLockIn({
          category,
          currentWeekMatchupPoints,
          seasonFpg: seasonMetrics.mbaFantasyPointsPerGame,
          completedEntries,
          projectionEntries,
          scoringSettings,
          manualLockOverride,
        });

        // If Sleeper has inferred a lock or completed the final game of the week, clear any stale manual override
        if (
          manualLockOverride !== null &&
          (lockIn.lockSource === 'INFERRED_SLEEPER' || lockIn.lockSource === 'FINAL_GAME_AUTO')
        ) {
          this.stateStore.setManualLockOverride(
            leagueId,
            currentWeek,
            rawRoster.roster_id,
            playerId,
            null
          );
          countMap.delete(overrideKey);
        }

        const latestCompletedGame = lockIn.completedGames.at(-1) ?? null;

        const projectedFpg =
          seasonMetrics.gamesPlayed < 10 && projectionEntries.length > 0
            ? projectionEntries.reduce(
                (sum, p) => sum + computeMbaPoints(p.stats, scoringSettings),
                0
              ) / projectionEntries.length
            : null;

        const { dynastyValue } = computePlayerDynastyValue({
          actualFpg: seasonMetrics.mbaFantasyPointsPerGame,
          gamesPlayed: seasonMetrics.gamesPlayed,
          projectedFpg,
          age,
          positions,
        });

        return {
          slotIndex,
          slotLabel,
          category,
          playerId,
          fullName,
          firstName,
          lastName,
          nbaTeam,
          positions,
          injuryStatus,
          injuryNotes,
          age,
          yearsExp,
          seasonMetrics,
          currentWeekMatchupPoints:
            lockIn.lockSource === 'MANUAL_OVERRIDE' && lockIn.lockedScore !== null
              ? lockIn.lockedScore
              : currentWeekMatchupPoints,
          currentWeekCompletedGamesCount: lockIn.completedGames.length,
          currentWeekRemainingGamesCount: lockIn.remainingGames.length,
          latestCompletedGamePoints: latestCompletedGame ? latestCompletedGame.mbaPoints : null,
          completedGames: lockIn.completedGames,
          remainingGames: lockIn.remainingGames,
          isLocked: lockIn.isLocked,
          isPinnedStarter: lockIn.isPinnedStarter,
          lockedScore: lockIn.lockedScore,
          isLockInWindowOpen: lockIn.isLockInWindowOpen,
          lockInThreshold: lockIn.lockInThreshold,
          effectiveWeeklyScore: lockIn.effectiveWeeklyScore,
          recommendation: lockIn.recommendation,
          leverageAnnotation: lockIn.leverageAnnotation,
          lockIn,
          dynastyValue,
        };
      };

      const starterSlots: RosterPlayerSlot[] = MBA_STARTER_SLOTS.map((slotType, idx) => {
        const pid = startersIds[idx] ?? '0';
        return hydratePlayerSlot(pid, idx, slotType, 'STARTER');
      });

      const benchSlots: RosterPlayerSlot[] = benchIds.map((pid, idx) =>
        hydratePlayerSlot(pid, idx, 'BN', 'BENCH')
      );

      const reserveSlots: RosterPlayerSlot[] = reserveIds.map((pid, idx) =>
        hydratePlayerSlot(pid, idx, 'IR', 'RESERVE')
      );

      const taxiSlots: RosterPlayerSlot[] = taxiIds.map((pid, idx) =>
        hydratePlayerSlot(pid, idx, 'TAXI', 'TAXI')
      );

      const fpts =
        (rawRoster.settings.fpts ?? 0) + (rawRoster.settings.fpts_decimal ?? 0) / 100;
      const fptsAgainst =
        (rawRoster.settings.fpts_against ?? 0) +
        (rawRoster.settings.fpts_against_decimal ?? 0) / 100;
      const ppts =
        (rawRoster.settings.ppts ?? 0) + (rawRoster.settings.ppts_decimal ?? 0) / 100;

      const starterTotalFpg =
        Math.round(
          starterSlots.reduce((sum, s) => sum + s.seasonMetrics.mbaFantasyPointsPerGame, 0) * 10
        ) / 10;

      const rawMatchupPoints = matchup ? Math.round(matchup.points * 100) / 100 : 0;
      const startersEffectiveSum = starterSlots.reduce(
        (sum, s) => sum + s.effectiveWeeklyScore,
        0
      );
      const startersRawPointsSum = starterSlots.reduce(
        (sum, s) => sum + (typeof playersPoints[s.playerId] === 'number' ? playersPoints[s.playerId] : 0),
        0
      );

      // If matchup.points was explicitly customized away from the default fixture placeholder (245.5) and differs from the sum of starter players_points, preserve that delta
      const manualMatchupOffset =
        rawMatchupPoints > 0 && Math.abs(rawMatchupPoints - 245.5) > 0.01
          ? rawMatchupPoints - startersRawPointsSum
          : 0;
      const currentWeekProjectedPoints =
        Math.round((startersEffectiveSum + manualMatchupOffset) * 100) / 100;

      hydratedRosters.push({
        rosterId: rawRoster.roster_id,
        manager,
        standing: {
          wins: rawRoster.settings.wins ?? 0,
          losses: rawRoster.settings.losses ?? 0,
          ties: rawRoster.settings.ties ?? 0,
          fpts: Math.round(fpts * 100) / 100,
          fptsAgainst: Math.round(fptsAgainst * 100) / 100,
          ppts: Math.round(ppts * 100) / 100,
        },
        starterSlots,
        benchSlots,
        reserveSlots,
        taxiSlots,
        allPlayers: [...starterSlots, ...benchSlots, ...reserveSlots, ...taxiSlots],
        ownedDraftPicks: [],
        currentWeekMatchupPoints: rawMatchupPoints,
        currentWeekProjectedPoints,
        currentWeekMatchupId: matchup?.matchup_id ?? null,
        starterTotalFpg,
      });
    }

    // Apply head-to-head Matchup Leverage across every paired matchup in the league
    const leverageByRosterId = new Map<number, MatchupLeverageSummary>();
    for (const roster of hydratedRosters) {
      const opponent = hydratedRosters.find(
        (other) =>
          other.rosterId !== roster.rosterId &&
          other.currentWeekMatchupId !== null &&
          other.currentWeekMatchupId === roster.currentWeekMatchupId
      );
      const leverage = applyMatchupLeverageToRoster(roster, opponent, currentWeek);
      if (leverage) {
        leverageByRosterId.set(roster.rosterId, leverage);
      }
    }

    const pickMatrix = resolveDraftPickMatrix({
      rosters: hydratedRosters,
      tradedPicks: bundle.tradedPicks ?? [],
      stateStore: this.stateStore,
    });

    for (const roster of hydratedRosters) {
      const row = pickMatrix.rows.find((r) => r.rosterId === roster.rosterId);
      roster.ownedDraftPicks = row ? row.allOwnedPicks : [];
    }

    const storedRosterId = this.stateStore.getActiveRosterId(leagueId);
    const desiredRosterId = explicitRosterId ?? storedRosterId ?? hydratedRosters[0]?.rosterId ?? 1;
    const activeRoster =
      hydratedRosters.find((r) => r.rosterId === desiredRosterId) ?? hydratedRosters[0];

    return {
      leagueId,
      leagueName: bundle.league.name || 'MBA',
      season: bundle.league.season || bundle.nbaState.season || '2026',
      currentWeek,
      currentLeg,
      scoringSettings,
      starterSlotTemplate: MBA_STARTER_SLOTS,
      managers,
      rosters: hydratedRosters,
      tradedPicks: bundle.tradedPicks ?? [],
      draftPickAssets: pickMatrix.allPicks,
      activeRosterId: activeRoster.rosterId,
      activeRoster,
      matchupLeverage: leverageByRosterId.get(activeRoster.rosterId) ?? null,
      syncedAt: new Date().toISOString(),
    };
  }
}
