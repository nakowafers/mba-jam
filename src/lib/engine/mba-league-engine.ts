import { ChecklistLineupAdapter } from '../adapter/lineup-mutation-adapter';
import { computeMbaPoints, computeSeasonMetrics } from '../scoring/mba-scoring';
import {
  DEFAULT_MBA_SCORING_SETTINGS,
  HydratedRoster,
  LineupMutationAdapter,
  MBA_STARTER_SLOTS,
  Manager,
  ManagerStateStore,
  MbaLeagueSnapshot,
  MbaScoringSettings,
  RosterPlayerSlot,
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

export interface MbaLeagueEngineDeps {
  gateway: SleeperGateway;
  stateStore: ManagerStateStore;
  mutationAdapter?: LineupMutationAdapter;
}

export class MbaLeagueEngine {
  private readonly gateway: SleeperGateway;
  private readonly stateStore: ManagerStateStore;
  private readonly mutationAdapter: LineupMutationAdapter;

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
    const scoringSettings: MbaScoringSettings = {
      ...DEFAULT_MBA_SCORING_SETTINGS,
      ...(bundle.league.scoring_settings ?? {}),
    };

    const userMap = new Map(bundle.users.map((u) => [u.user_id, u]));
    const matchupByRosterId = new Map(bundle.matchups.map((m) => [m.roster_id, m]));

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
        const completedGames = weeklyCompletedByPlayerId.get(playerId) ?? [];
        const sortedCompleted = [...completedGames].sort((a, b) =>
          (a.date ?? '').localeCompare(b.date ?? '')
        );
        const latestGame = sortedCompleted.at(-1);
        const latestCompletedGamePoints = latestGame
          ? computeMbaPoints(latestGame.stats, scoringSettings)
          : null;

        const completedDates = new Set(sortedCompleted.map((g) => g.date).filter(Boolean));
        const remainingProjs = (weeklyProjByPlayerId.get(playerId) ?? []).filter(
          (proj) => !proj.date || !completedDates.has(proj.date)
        );

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
            typeof playersPoints[playerId] === 'number'
              ? Math.round(playersPoints[playerId] * 100) / 100
              : 0,
          currentWeekCompletedGamesCount: sortedCompleted.length,
          currentWeekRemainingGamesCount: remainingProjs.length,
          latestCompletedGamePoints,
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
        currentWeekMatchupPoints: matchup ? Math.round(matchup.points * 100) / 100 : 0,
        currentWeekMatchupId: matchup?.matchup_id ?? null,
        starterTotalFpg,
      });
    }

    const storedRosterId = this.stateStore.getActiveRosterId(bundle.league.league_id);
    const desiredRosterId = explicitRosterId ?? storedRosterId ?? hydratedRosters[0]?.rosterId ?? 1;
    const activeRoster =
      hydratedRosters.find((r) => r.rosterId === desiredRosterId) ?? hydratedRosters[0];

    return {
      leagueId: bundle.league.league_id,
      leagueName: bundle.league.name || 'MBA',
      season: bundle.league.season || bundle.nbaState.season || '2026',
      currentWeek: bundle.nbaState.week || bundle.league.settings.leg || 1,
      currentLeg: bundle.nbaState.leg || bundle.league.settings.leg || 1,
      scoringSettings,
      starterSlotTemplate: MBA_STARTER_SLOTS,
      managers,
      rosters: hydratedRosters,
      activeRosterId: activeRoster.rosterId,
      activeRoster,
      syncedAt: new Date().toISOString(),
    };
  }
}
