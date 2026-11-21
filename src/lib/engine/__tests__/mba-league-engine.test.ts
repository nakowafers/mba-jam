import { describe, it, expect } from 'vitest';
import { MbaLeagueEngine } from '../mba-league-engine';
import { createDeterministicMbaFixtures } from '../fixtures/mba-fixtures';
import { InMemorySleeperGateway } from '../../gateway/in-memory-sleeper-gateway';
import { InMemoryManagerStateStore } from '../../store/manager-state-store';
import {
  SleeperGraphQLNotConfiguredError,
  SleeperGraphQLWriteAdapter,
} from '../../adapter/lineup-mutation-adapter';
import { computeLockInRecommendation } from '../../lineup/lock-in-advisor';

describe('MbaLeagueEngine — Custom MBA Scoring & Roster Hydration Seam', () => {
  it('computes exact MBA custom fantasy points from raw statlines including DD, TD, 40p/50p bonuses, and negative TO/TF/FF penalties', () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    // Worked example 1:
    // 52 PTS (52 * 0.5 = 26.0)
    // 12 REB (12 * 1.0 = 12.0)
    // 10 AST (10 * 1.0 = 10.0)
    // 3 STL (3 * 2.0 = 6.0)
    // 2 BLK (2 * 2.0 = 4.0)
    // 6 3PM (6 * 0.5 = 3.0)
    // 4 TO (4 * -1.0 = -4.0)
    // 1 TF (1 * -2.0 = -2.0)
    // 1 FF (1 * -2.0 = -2.0)
    // 1 DD (1 * 1.0 = 1.0)
    // 1 TD (1 * 2.0 = 2.0)
    // 1 bonus_pt_40p (1 * 2.0 = 2.0)
    // 1 bonus_pt_50p (1 * 2.0 = 2.0)
    // Total = 26 + 12 + 10 + 6 + 4 + 3 - 4 - 2 - 2 + 1 + 2 + 2 + 2 = 60.0
    const explosionScore = engine.scoreStatLine({
      pts: 52,
      reb: 12,
      ast: 10,
      stl: 3,
      blk: 2,
      tpm: 6,
      to: 4,
      tf: 1,
      ff: 1,
      dd: 1,
      td: 1,
      bonus_pt_40p: 1,
      bonus_pt_50p: 1,
    });
    expect(explosionScore).toBe(60.0);

    // Worked example 2: Standard double-double without 40p/50p/TD
    // 20 PTS (10.0), 13 REB (13.0), 6 AST (6.0), 1 STL (2.0), 3 BLK (6.0), 0 3PM (0), 1 TO (-1.0), 1 DD (+1.0)
    // Total = 10 + 13 + 6 + 2 + 6 - 1 + 1 = 37.0
    const standardScore = engine.scoreStatLine({
      pts: 20,
      reb: 13,
      ast: 6,
      stl: 1,
      blk: 3,
      tpm: 0,
      to: 1,
      dd: 1,
    });
    expect(standardScore).toBe(37.0);
  });

  it('hydrates all 10 MBA Managers and Rosters with exact 10 Starter Slots (PG, SG, G, SF, PF, F, C, C, UTIL, UTIL), Bench, Reserve (IR), and Taxi slots', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();

    expect(snapshot.leagueId).toBe('1344293979830640640');
    expect(snapshot.leagueName).toBe('MBA');
    expect(snapshot.managers).toHaveLength(10);
    expect(snapshot.rosters).toHaveLength(10);

    // Roster #9 has an empty team_name in Sleeper metadata and should fall back cleanly
    const roster9 = snapshot.rosters.find((r) => r.rosterId === 9)!;
    expect(roster9.manager.displayName).toBe('nakowafers');
    expect(roster9.manager.rosterName).toBe('Team nakowafers');

    // Roster #1 should hydrate 10 Starter Slots in exact MBA order
    const roster1 = snapshot.activeRoster;
    expect(roster1.rosterId).toBe(1);
    expect(roster1.manager.rosterName).toBe('Ashley ketchcum');
    expect(roster1.starterSlots.map((s) => s.slotLabel)).toEqual([
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
    ]);

    // Verify Nikola Jokic (player 1511) in the second C slot (index 7) has 43.8 MBA FP/G
    const jokicSlot = roster1.starterSlots[7];
    expect(jokicSlot.slotLabel).toBe('C');
    expect(jokicSlot.fullName).toBe('Nikola Jokic');
    expect(jokicSlot.nbaTeam).toBe('DEN');
    expect(jokicSlot.positions).toEqual(['C']);
    expect(jokicSlot.seasonMetrics.totalMbaPoints).toBe(438.0);
    expect(jokicSlot.seasonMetrics.mbaFantasyPointsPerGame).toBe(43.8);

    // Bench slots exclude starters, reserve (IR), and taxi players
    expect(roster1.benchSlots).toHaveLength(5);
    expect(roster1.benchSlots.every((s) => s.slotLabel === 'BN' && s.category === 'BENCH')).toBe(true);
    expect(roster1.benchSlots.map((s) => s.fullName)).toContain('Alperen Sengun');

    // Reserve (IR) slots include Chet Holmgren and Ja Morant with injury badges
    expect(roster1.reserveSlots).toHaveLength(2);
    expect(roster1.reserveSlots.map((s) => s.slotLabel)).toEqual(['IR', 'IR']);
    expect(roster1.reserveSlots[0].fullName).toBe('Chet Holmgren');
    expect(roster1.reserveSlots[0].injuryStatus).toBe('Out');

    // Taxi slots include 3 young players
    expect(roster1.taxiSlots).toHaveLength(3);
    expect(roster1.taxiSlots.map((s) => s.slotLabel)).toEqual(['TAXI', 'TAXI', 'TAXI']);
    expect(roster1.taxiSlots.map((s) => s.fullName)).toContain('Alexandre Sarr');
  });

  it('persists selected Manager / Roster across reloads via ManagerStateStore and refreshes data on Sync Latest Sleeper Data', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    // Select Roster #10 (Reefer Chiefers)
    engine.selectActiveRoster(10);
    expect(engine.getStoredActiveRosterId()).toBe(10);

    // Simulate page reload with a fresh engine instance sharing the same ManagerStateStore
    const reloadedEngine = new MbaLeagueEngine({ gateway, stateStore });
    const snapshot = await reloadedEngine.getLeagueSnapshot();
    expect(snapshot.activeRosterId).toBe(10);
    expect(snapshot.activeRoster.manager.rosterName).toBe('Reefer Chiefers');
    expect(snapshot.activeRoster.manager.displayName).toBe('Nightmare42022');

    // Simulate live Sleeper update and click "Sync Latest Sleeper Data"
    gateway.updateBundle((bundle) => {
      bundle.nbaState.week = 6;
      bundle.nbaState.leg = 6;
      const r10 = bundle.rosters.find((r) => r.roster_id === 10)!;
      r10.settings.wins = 3;
    });

    const syncedSnapshot = await reloadedEngine.syncLatestData();
    expect(syncedSnapshot.currentWeek).toBe(6);
    expect(syncedSnapshot.activeRosterId).toBe(10);
    expect(syncedSnapshot.activeRoster.standing.wins).toBe(3);
    expect(gateway.fetchCount).toBe(2);
  });

  it('aggregates per-game weekly completed games and remaining scheduled projections for each Roster player', async () => {
    const fixtures = createDeterministicMbaFixtures();
    fixtures.weeklyStats = [
      {
        player_id: '2301', // Shai Gilgeous-Alexander
        date: '2026-11-16',
        opponent: 'DAL',
        game_id: 'g1',
        season: '2026',
        week: 5,
        team: 'OKC',
        stats: { pts: 34, reb: 6, ast: 8, stl: 2, blk: 1, tpm: 2, to: 2, dd: 0 }, // 17 + 6 + 8 + 4 + 2 + 1 - 2 = 36.0
      },
    ];
    fixtures.weeklyProjections = [
      {
        player_id: '2301',
        date: '2026-11-16', // Completed date should be filtered out from remaining games
        opponent: 'DAL',
        game_id: 'g1',
        season: '2026',
        week: 5,
        team: 'OKC',
        stats: { pts: 30, reb: 5, ast: 6 },
      },
      {
        player_id: '2301',
        date: '2026-11-19',
        opponent: 'SAS',
        game_id: 'g2',
        season: '2026',
        week: 5,
        team: 'OKC',
        stats: { pts: 31, reb: 5, ast: 6 },
      },
      {
        player_id: '2301',
        date: '2026-11-21',
        opponent: 'POR',
        game_id: 'g3',
        season: '2026',
        week: 5,
        team: 'OKC',
        stats: { pts: 32, reb: 5, ast: 6 },
      },
    ];

    const gateway = new InMemorySleeperGateway(fixtures);
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();
    const sgaSlot = snapshot.activeRoster.starterSlots[0];

    expect(sgaSlot.fullName).toBe('Shai Gilgeous-Alexander');
    expect(sgaSlot.currentWeekCompletedGamesCount).toBe(1);
    expect(sgaSlot.currentWeekRemainingGamesCount).toBe(2);
    expect(sgaSlot.latestCompletedGamePoints).toBe(36.0);
  });
});

describe('MbaLeagueEngine — Weekly Lock-In Inference, Thresholds & Matchup Leverage Seam', () => {
  it('infers a Locked Score and marks a Starter Slot as a Pinned Starter when players_points remains frozen on an earlier game after a newer game completes', async () => {
    const fixtures = createDeterministicMbaFixtures();
    // Player 2301 (Shai Gilgeous-Alexander, PG Starter on Roster #1):
    // Game 1 (2026-11-16 vs DAL): 48.0 MBA FP (40 pts = 20, 8 reb = 8, 10 ast = 10, 2 stl = 4, 1 blk = 2, 2 tpm = 1, 1 to = -1, 1 dd = 1, 1 td = 0, 1 bonus_pt_40p = 2 -> 20+8+10+4+2+1-1+1+2 = 47.0; let's make it 2 to = -2, 42 pts = 21 -> 47.0, or exact 48.0: 40 pts (20) + 10 reb (10) + 8 ast (8) + 2 stl (4) + 1 blk (2) + 2 tpm (1) + 0 to (0) + 1 dd (1) + 1 bonus_pt_40p (2) = 48.0)
    // Game 2 (2026-11-18 vs SAS): 29.0 MBA FP (24 pts (12) + 5 reb (5) + 6 ast (6) + 2 stl (4) + 1 blk (2) = 29.0)
    // Sleeper matchup players_points['2301'] is still 48.0 -> Game 1 is an inferred Locked Score!
    fixtures.weeklyStats = [
      {
        player_id: '2301',
        date: '2026-11-16',
        opponent: 'DAL',
        game_id: 'g_sga_1',
        season: '2026',
        week: 5,
        team: 'OKC',
        stats: { pts: 40, reb: 10, ast: 8, stl: 2, blk: 1, tpm: 2, to: 0, dd: 1, bonus_pt_40p: 1 }, // 48.0
      },
      {
        player_id: '2301',
        date: '2026-11-18',
        opponent: 'SAS',
        game_id: 'g_sga_2',
        season: '2026',
        week: 5,
        team: 'OKC',
        stats: { pts: 24, reb: 5, ast: 6, stl: 2, blk: 1, tpm: 0, to: 0 }, // 29.0
      },
    ];
    fixtures.weeklyProjections = [
      {
        player_id: '2301',
        date: '2026-11-21',
        opponent: 'POR',
        game_id: 'g_sga_3',
        season: '2026',
        week: 5,
        team: 'OKC',
        stats: { pts: 32, reb: 6, ast: 7, stl: 2, blk: 1, tpm: 2, to: 2 },
      },
    ];

    const r1Matchup = fixtures.matchups.find((m) => m.roster_id === 1)!;
    r1Matchup.players_points['2301'] = 48.0;

    const gateway = new InMemorySleeperGateway(fixtures);
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();
    const sgaSlot = snapshot.activeRoster.starterSlots[0];

    expect(sgaSlot.isLocked).toBe(true);
    expect(sgaSlot.isPinnedStarter).toBe(true);
    expect(sgaSlot.lockedScore).toBe(48.0);
    expect(sgaSlot.lockIn.lockSource).toBe('INFERRED_SLEEPER');
    expect(sgaSlot.lockIn.lockedGame?.date).toBe('2026-11-16');
    expect(sgaSlot.lockIn.lockedGame?.opponent).toBe('DAL');
    expect(sgaSlot.lockIn.recommendation).toBe('LOCKED');
    expect(sgaSlot.effectiveWeeklyScore).toBe(48.0);
  });

  it('scales Lock-In Threshold (E[max]) by k = 3 (1.22x), k = 2 (1.13x), k = 1 (1.00x) remaining games, computes Effective Weekly Score, and auto-locks at k = 0', async () => {
    const fixtures = createDeterministicMbaFixtures();
    // Configure 4 starters on Roster #1 with a projected mean of 40.0 MBA FP per remaining game
    // (40.0 MBA FP = 40 pts (20) + 10 reb (10) + 10 ast (10) = 40.0)
    const projGame = (pid: string, date: string, opponent: string, gameId: string) => ({
      player_id: pid,
      date,
      opponent,
      game_id: gameId,
      season: '2026',
      week: 5,
      team: 'NBA',
      stats: { pts: 40, reb: 10, ast: 10 }, // 40.0 MBA FP
    });

    // Player 1648 (Devin Booker): 1 completed game (42.0 FP) and k = 3 remaining games (mean 40.0)
    // Threshold = 40.0 * 1.22 = 48.80 -> Effective Weekly Score = max(42.0, 48.8) = 48.80 -> ROLL THE DICE
    // Player 1967 (Tyrese Haliburton): 1 completed game (47.0 FP) and k = 2 remaining games (mean 40.0)
    // Threshold = 40.0 * 1.13 = 45.20 -> Effective Weekly Score = max(47.0, 45.2) = 47.00 -> LEAN LOCK
    // Player 2304 (Jayson Tatum): 1 completed game (50.0 FP) and k = 1 remaining game (mean 40.0)
    // Threshold = 40.0 * 1.00 = 40.00 -> Effective Weekly Score = max(50.0, 40.0) = 50.00 -> SMASH LOCK
    // Player 1988 (Paolo Banchero): 1 completed game (38.0 FP) and k = 0 remaining games
    // Threshold = 0 -> Final game auto-locked at 38.00 -> LOCKED
    fixtures.weeklyStats = [
      {
        player_id: '1648',
        date: '2026-11-16',
        opponent: 'LAL',
        game_id: 'g_book_1',
        season: '2026',
        week: 5,
        team: 'PHX',
        stats: { pts: 44, reb: 10, ast: 10 }, // 22 + 10 + 10 = 42.0
      },
      {
        player_id: '1967',
        date: '2026-11-16',
        opponent: 'MIA',
        game_id: 'g_hali_1',
        season: '2026',
        week: 5,
        team: 'IND',
        stats: { pts: 54, reb: 10, ast: 10 }, // 27 + 10 + 10 = 47.0
      },
      {
        player_id: '2304',
        date: '2026-11-16',
        opponent: 'NYK',
        game_id: 'g_tatum_1',
        season: '2026',
        week: 5,
        team: 'BOS',
        stats: { pts: 60, reb: 10, ast: 10 }, // 30 + 10 + 10 = 50.0
      },
      {
        player_id: '1988',
        date: '2026-11-22',
        opponent: 'CHA',
        game_id: 'g_paolo_1',
        season: '2026',
        week: 5,
        team: 'ORL',
        stats: { pts: 36, reb: 10, ast: 10 }, // 18 + 10 + 10 = 38.0
      },
    ];

    fixtures.weeklyProjections = [
      projGame('1648', '2026-11-18', 'DEN', 'p_book_2'),
      projGame('1648', '2026-11-20', 'SAC', 'p_book_3'),
      projGame('1648', '2026-11-22', 'GSW', 'p_book_4'),
      projGame('1967', '2026-11-19', 'ORL', 'p_hali_2'),
      projGame('1967', '2026-11-21', 'MIL', 'p_hali_3'),
      projGame('2304', '2026-11-20', 'CLE', 'p_tatum_2'),
    ];

    const gateway = new InMemorySleeperGateway(fixtures);
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();
    const booker = snapshot.activeRoster.starterSlots.find((s) => s.playerId === '1648')!;
    const hali = snapshot.activeRoster.starterSlots.find((s) => s.playerId === '1967')!;
    const tatum = snapshot.activeRoster.starterSlots.find((s) => s.playerId === '2304')!;
    const paolo = snapshot.activeRoster.starterSlots.find((s) => s.playerId === '1988')!;

    // k = 3 -> 1.22x * 40.0 = 48.8
    expect(booker.currentWeekRemainingGamesCount).toBe(3);
    expect(booker.lockInThreshold).toBe(48.8);
    expect(booker.effectiveWeeklyScore).toBe(48.8);
    expect(booker.recommendation).toBe('ROLL THE DICE');
    expect(booker.completedGames).toHaveLength(1);
    expect(booker.completedGames[0]).toMatchObject({ date: '2026-11-16', opponent: 'LAL', mbaPoints: 42.0 });
    expect(booker.remainingGames.map((g) => `${g.date}:${g.opponent}`)).toEqual([
      '2026-11-18:DEN',
      '2026-11-20:SAC',
      '2026-11-22:GSW',
    ]);

    // k = 2 -> 1.13x * 40.0 = 45.2
    expect(hali.currentWeekRemainingGamesCount).toBe(2);
    expect(hali.lockInThreshold).toBe(45.2);
    expect(hali.effectiveWeeklyScore).toBe(47.0);
    expect(hali.recommendation).toBe('LEAN LOCK');

    // k = 1 -> 1.00x * 40.0 = 40.0
    expect(tatum.currentWeekRemainingGamesCount).toBe(1);
    expect(tatum.lockInThreshold).toBe(40.0);
    expect(tatum.effectiveWeeklyScore).toBe(50.0);
    expect(tatum.recommendation).toBe('SMASH LOCK');

    // k = 0 -> auto-locked final game at 38.0
    expect(paolo.currentWeekRemainingGamesCount).toBe(0);
    expect(paolo.isLocked).toBe(true);
    expect(paolo.lockIn.lockSource).toBe('FINAL_GAME_AUTO');
    expect(paolo.lockedScore).toBe(38.0);
    expect(paolo.effectiveWeeklyScore).toBe(38.0);
    expect(paolo.recommendation).toBe('LOCKED');

    // Direct engine seam evaluation check
    const directEval = engine.evaluatePlayerLockIn({
      category: 'STARTER',
      currentWeekMatchupPoints: 46.0,
      seasonFpg: 40.0,
      completedEntries: fixtures.weeklyStats.filter((s) => s.player_id === '1648'),
      projectionEntries: fixtures.weeklyProjections.filter((s) => s.player_id === '1648'),
      scoringSettings: snapshot.scoringSettings,
      manualLockOverride: null,
    });
    expect(directEval.lockInThreshold).toBe(48.8);
    expect(directEval.effectiveWeeklyScore).toBe(48.8);
  });

  it('allows a Manager to manually toggle Locked in an open Lock-In Window via ManagerStateStore and automatically reconciles once a subsequent game in Sleeper completes', async () => {
    const fixtures = createDeterministicMbaFixtures();
    fixtures.nbaState.week = 6;
    fixtures.nbaState.leg = 6;

    // Player 1846 (Victor Wembanyama, C Starter on Roster #1)
    // Game 1 completed on 2026-11-23: 44.0 MBA FP (36 pts = 18, 12 reb = 12, 4 ast = 4, 1 stl = 2, 3 blk = 6, 2 tpm = 1, 0 to = 0, 1 dd = 1 -> 44.0)
    // Game 2 scheduled on 2026-11-26: projected 45.0 MBA FP (threshold = 45.0 for k = 1)
    fixtures.weeklyStats = [
      {
        player_id: '1846',
        date: '2026-11-23',
        opponent: 'UTA',
        game_id: 'g_wemby_1',
        season: '2026',
        week: 6,
        team: 'SAS',
        stats: { pts: 36, reb: 12, ast: 4, stl: 1, blk: 3, tpm: 2, to: 0, dd: 1 }, // 44.0
      },
    ];
    fixtures.weeklyProjections = [
      {
        player_id: '1846',
        date: '2026-11-26',
        opponent: 'DEN',
        game_id: 'g_wemby_2',
        season: '2026',
        week: 6,
        team: 'SAS',
        stats: { pts: 38, reb: 13, ast: 4, stl: 1, blk: 3, tpm: 2, to: 0, dd: 1 }, // 19 + 13 + 4 + 2 + 6 + 1 + 1 = 46.0
      },
    ];

    const r1Matchup = fixtures.matchups.find((m) => m.roster_id === 1)!;
    r1Matchup.players_points['1846'] = 44.0;

    const gateway = new InMemorySleeperGateway(fixtures);
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    // Initial snapshot: Wemby is in an open Lock-In Window, not yet locked
    const initialSnapshot = await engine.getLeagueSnapshot();
    const wembyInitial = initialSnapshot.activeRoster.starterSlots.find((s) => s.playerId === '1846')!;
    expect(wembyInitial.isLockInWindowOpen).toBe(true);
    expect(wembyInitial.isLocked).toBe(false);
    expect(wembyInitial.isPinnedStarter).toBe(false);
    expect(wembyInitial.effectiveWeeklyScore).toBe(46.0); // max(44.0, 46.0)

    // Manager toggles manual lock ON during open Lock-In Window
    const nowLocked = engine.togglePlayerManualLock(1, '1846');
    expect(nowLocked).toBe(true);
    expect(engine.getPlayerManualLock(1, '1846')).toBe(true);
    expect(stateStore.getManualLockOverride('1344293979830640640', 6, 1, '1846')).toBe(true);

    const lockedSnapshot = await engine.getLeagueSnapshot();
    const wembyLocked = lockedSnapshot.activeRoster.starterSlots.find((s) => s.playerId === '1846')!;
    expect(wembyLocked.isLocked).toBe(true);
    expect(wembyLocked.isPinnedStarter).toBe(true);
    expect(wembyLocked.lockIn.lockSource).toBe('MANUAL_OVERRIDE');
    expect(wembyLocked.lockedScore).toBe(44.0);
    expect(wembyLocked.effectiveWeeklyScore).toBe(44.0);
    expect(wembyLocked.recommendation).toBe('LOCKED');

    // Now Game 2 completes in Sleeper on 2026-11-26 (scoring 31.0 FP), while Sleeper's players_points['1846'] stays at 44.0
    gateway.updateBundle((bundle) => {
      bundle.weeklyStats.push({
        player_id: '1846',
        date: '2026-11-26',
        opponent: 'DEN',
        game_id: 'g_wemby_2',
        season: '2026',
        week: 6,
        team: 'SAS',
        stats: { pts: 24, reb: 10, ast: 3, stl: 1, blk: 2, tpm: 0, to: 1, dd: 1 }, // 12 + 10 + 3 + 2 + 4 - 1 + 1 = 31.0
      });
    });

    const reconciledSnapshot = await engine.syncLatestData();
    const wembyReconciled = reconciledSnapshot.activeRoster.starterSlots.find((s) => s.playerId === '1846')!;

    // Manual override in ManagerStateStore is automatically cleared/reconciled and replaced by INFERRED_SLEEPER
    expect(stateStore.getManualLockOverride('1344293979830640640', 6, 1, '1846')).toBeNull();
    expect(engine.getPlayerManualLock(1, '1846')).toBeNull();
    expect(wembyReconciled.isLocked).toBe(true);
    expect(wembyReconciled.lockIn.lockSource).toBe('INFERRED_SLEEPER');
    expect(wembyReconciled.lockedScore).toBe(44.0);
  });

  it('computes head-to-head Matchup Leverage against the Week N opponent Roster and shifts borderline Lock-In calls between Protect Lead and Chase Upside', async () => {
    const fixtures = createDeterministicMbaFixtures();
    // Player 2580 (Anthony Edwards, UTIL Starter on Roster #1):
    // Remaining game k = 1 with projected 40.0 MBA FP -> Lock-In Threshold = 40.0
    // Scenario A (Protect Lead): Completed Game 1 = 38.0 MBA FP (0.95x of 40.0 threshold, inside [0.93x, 1.12x) borderline floor-lock band)
    fixtures.weeklyStats = [
      {
        player_id: '2580',
        date: '2026-11-17',
        opponent: 'SAC',
        game_id: 'g_ant_1',
        season: '2026',
        week: 5,
        team: 'MIN',
        stats: { pts: 36, reb: 10, ast: 10 }, // 18 + 10 + 10 = 38.0 (0.95x threshold)
      },
    ];
    fixtures.weeklyProjections = [
      {
        player_id: '2580',
        date: '2026-11-20',
        opponent: 'MEM',
        game_id: 'g_ant_2',
        season: '2026',
        week: 5,
        team: 'MIN',
        stats: { pts: 40, reb: 10, ast: 10 }, // 20 + 10 + 10 = 40.0 threshold
      },
    ];

    // Give Roster #1 a comfortable projected lead (> +25 FP) over its Week 5 opponent (Roster #2, matchup_id = 1)
    const r1Matchup = fixtures.matchups.find((m) => m.roster_id === 1)!;
    const r2Matchup = fixtures.matchups.find((m) => m.roster_id === 2)!;
    r1Matchup.points = 340.0;
    r2Matchup.points = 265.0;

    const gateway = new InMemorySleeperGateway(fixtures);
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const leadSnapshot = await engine.getLeagueSnapshot();
    expect(leadSnapshot.matchupLeverage).not.toBeNull();
    expect(leadSnapshot.matchupLeverage!.opponentRosterId).toBe(2);
    expect(leadSnapshot.matchupLeverage!.opponentRosterName).toBe('Basketball Stinks');
    expect(leadSnapshot.matchupLeverage!.projectedDifferential).toBeGreaterThan(25);
    expect(leadSnapshot.matchupLeverage!.posture).toBe('PROTECT_LEAD');
    expect(leadSnapshot.matchupLeverage!.postureLabel).toBe('Protect Lead — Floor Lock');

    const antLeading = leadSnapshot.activeRoster.starterSlots.find((s) => s.playerId === '2580')!;
    expect(antLeading.lockInThreshold).toBe(40.0);
    expect(antLeading.latestCompletedGamePoints).toBe(38.0);
    expect(antLeading.recommendation).toBe('LEAN LOCK');
    expect(antLeading.leverageAnnotation).toBe('Protect Lead — Floor Lock');

    // Scenario B (Chase Upside): Completed Game 1 = 42.0 MBA FP (1.05x of 40.0 threshold, inside <= 1.08x borderline ceiling-chase band)
    // Roster #1 trails Roster #2 by > 25 FP
    gateway.updateBundle((bundle) => {
      bundle.weeklyStats[0].stats = { pts: 44, reb: 10, ast: 10 }; // 22 + 10 + 10 = 42.0 (1.05x threshold)
      const m1 = bundle.matchups.find((m) => m.roster_id === 1)!;
      const m2 = bundle.matchups.find((m) => m.roster_id === 2)!;
      m1.points = 240.0;
      m2.points = 325.0;
    });

    const trailSnapshot = await engine.syncLatestData();
    expect(trailSnapshot.matchupLeverage!.projectedDifferential).toBeLessThan(-25);
    expect(trailSnapshot.matchupLeverage!.posture).toBe('CHASE_UPSIDE');
    expect(trailSnapshot.matchupLeverage!.postureLabel).toBe('Chase Upside — Roll for Ceiling');

    const antTrailing = trailSnapshot.activeRoster.starterSlots.find((s) => s.playerId === '2580')!;
    expect(antTrailing.lockInThreshold).toBe(40.0);
    expect(antTrailing.latestCompletedGamePoints).toBe(42.0);
    expect(antTrailing.recommendation).toBe('ROLL THE DICE');
    expect(antTrailing.leverageAnnotation).toBe('Chase Upside — Roll for Ceiling');

    // Verify Protect Lead boundaries:
    // - 0.92x (36.8 / 40.0) stays ROLL THE DICE without floor-lock label
    // - 1.15x (46.0 / 40.0) is an unconditional SMASH LOCK without borderline floor-lock label
    const belowFloor = computeLockInRecommendation({
      isLocked: false,
      latestScore: 36.8,
      lockInThreshold: 40.0,
      remainingGamesCount: 1,
      projectedDifferential: 35.0,
    });
    expect(belowFloor.recommendation).toBe('ROLL THE DICE');
    expect(belowFloor.leverageAnnotation).toBeNull();

    const unconditionalSmash = computeLockInRecommendation({
      isLocked: false,
      latestScore: 46.0,
      lockInThreshold: 40.0,
      remainingGamesCount: 1,
      projectedDifferential: 35.0,
    });
    expect(unconditionalSmash.recommendation).toBe('SMASH LOCK');
    expect(unconditionalSmash.leverageAnnotation).toBeNull();
  });

  it('hydrates rich default weekly schedules, inferred Locked Scores, and open Lock-In Windows from deterministic MBA fixtures', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();
    const roster1 = snapshot.activeRoster;

    // Nikola Jokic (1511) has an inferred Locked Score in the default fixtures
    const jokic = roster1.starterSlots.find((s) => s.playerId === '1511')!;
    expect(jokic.isLocked).toBe(true);
    expect(jokic.isPinnedStarter).toBe(true);
    expect(jokic.lockIn.lockSource).toBe('INFERRED_SLEEPER');
    expect(jokic.completedGames.length).toBeGreaterThanOrEqual(2);

    // Shai Gilgeous-Alexander (2301) is in an open Lock-In Window with remaining games
    const sga = roster1.starterSlots.find((s) => s.playerId === '2301')!;
    expect(sga.isLockInWindowOpen).toBe(true);
    expect(sga.completedGames.length).toBeGreaterThanOrEqual(1);
    expect(sga.remainingGames.length).toBeGreaterThanOrEqual(1);
    expect(sga.lockInThreshold).toBeGreaterThan(0);

    // Matchup Leverage summary is populated for Roster #1 vs Roster #2
    expect(snapshot.matchupLeverage).not.toBeNull();
    expect(snapshot.matchupLeverage?.activeRosterId).toBe(1);
    expect(snapshot.matchupLeverage?.opponentRosterId).toBe(2);
  });
});

describe('MbaLeagueEngine — Dynasty Valuation, 2026–2029 Draft Pick Assets & Power Rankings Seam', () => {
  it('computes 0–100 Player Dynasty Value combining custom MBA FP/G, Dynasty Age Curve (1.22x at 21–24, 1.00x at 26–27, 0.65x–0.85x at 29+), and 1.12x 2-Center scarcity boost', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    // Worked Example 1: Age 26 Wing (1.00x age, 1.00x non-C) with 30.0 FP/G -> 30.0 * 1.00 * 1.00 * 2 = 60.0
    const primeWing = engine.evaluatePlayerDynastyValue({
      actualFpg: 30.0,
      gamesPlayed: 10,
      projectedFpg: null,
      age: 26,
      positions: ['SF'],
    });
    expect(primeWing.ageMultiplier).toBe(1.0);
    expect(primeWing.scarcityMultiplier).toBe(1.0);
    expect(primeWing.dynastyValue).toBe(60.0);

    // Worked Example 2: Age 23 Wing (1.22x age peak, 1.00x non-C) with 30.0 FP/G -> 30.0 * 1.22 * 1.00 * 2 = 73.2
    const youngWing = engine.evaluatePlayerDynastyValue({
      actualFpg: 30.0,
      gamesPlayed: 10,
      projectedFpg: null,
      age: 23,
      positions: ['PF', 'SF'],
    });
    expect(youngWing.ageMultiplier).toBe(1.22);
    expect(youngWing.scarcityMultiplier).toBe(1.0);
    expect(youngWing.dynastyValue).toBe(73.2);

    // Worked Example 3: Age 23 Center (1.22x age peak, 1.12x Center scarcity) with 30.0 FP/G -> 30.0 * 1.22 * 1.12 * 2 = 82.0
    const youngCenter = engine.evaluatePlayerDynastyValue({
      actualFpg: 30.0,
      gamesPlayed: 10,
      projectedFpg: null,
      age: 23,
      positions: ['C', 'PF'],
    });
    expect(youngCenter.ageMultiplier).toBe(1.22);
    expect(youngCenter.scarcityMultiplier).toBe(1.12);
    expect(youngCenter.dynastyValue).toBe(82.0);

    // Worked Example 4: Age 31 Guard (0.72x age taper, 1.00x non-C) with 30.0 FP/G -> 30.0 * 0.72 * 1.00 * 2 = 43.2
    const vetGuard = engine.evaluatePlayerDynastyValue({
      actualFpg: 30.0,
      gamesPlayed: 10,
      projectedFpg: null,
      age: 31,
      positions: ['PG'],
    });
    expect(vetGuard.ageMultiplier).toBe(0.72);
    expect(vetGuard.dynastyValue).toBe(43.2);

    // Verify snapshot hydrates dynastyValue on every player slot blending 2026 actual + weekly projected FP/G regardless of gamesPlayed >= 10
    // (e.g. Nikola Jokic: gp=10, 43.8 actual FP/G + 43.0 projected FP/G -> 43.6 blended FP/G, age 31 (0.72x), C (1.12x) -> 70.3)
    const snapshot = await engine.getLeagueSnapshot();
    const jokicSlot = snapshot.activeRoster.starterSlots[7];
    expect(jokicSlot.fullName).toBe('Nikola Jokic');
    expect(jokicSlot.seasonMetrics.gamesPlayed).toBe(10);
    expect(jokicSlot.dynastyValue).toBe(70.3);
    expect(snapshot.rosters.every((r) => r.allPlayers.every((p) => p.dynastyValue >= 0 && p.dynastyValue <= 100))).toBe(true);
  });

  it('resolves all 80 future Draft Pick Assets (2026–2029, Rounds 1–2) across 10 Original Rosters from /traded_picks and calculates Projected Pick Tiers', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const matrix = await engine.getDraftPickMatrix();

    // 10 Rosters * 4 seasons (2026..2029) * 2 rounds (1..2) = 80 total Draft Pick Assets
    expect(matrix.allPicks).toHaveLength(80);
    expect(matrix.rows).toHaveLength(10);

    // Every season (2026, 2027, 2028, 2029) and round (1, 2) has exactly 10 picks
    for (const season of ['2026', '2027', '2028', '2029'] as const) {
      for (const round of [1, 2] as const) {
        const slice = matrix.allPicks.filter((p) => p.season === season && p.round === round);
        expect(slice).toHaveLength(10);
      }
    }

    // Verify 2028 1st via Roster #10 is owned by Roster #1 (Ashley ketchcum) and preserves Original Roster #10 attribution
    const pick2028R1Via10 = matrix.allPicks.find(
      (p) => p.season === '2028' && p.round === 1 && p.originalRosterId === 10
    )!;
    expect(pick2028R1Via10).toBeDefined();
    expect(pick2028R1Via10.currentOwnerRosterId).toBe(1);
    expect(pick2028R1Via10.isTraded).toBe(true);
    expect(pick2028R1Via10.displayLabel).toContain('2028 1st via Roster #10');

    // Verify 2026–2027 Projected Pick Tiers derive from inverse Max Points For (ppts):
    // Roster #3 (ppts: 907, lowest) -> Slot 1 (Early)
    // Roster #6 (ppts: 986, 2nd lowest) -> Slot 2 (Early)
    // Roster #9 (ppts: 999, 3rd lowest) -> Slot 3 (Early)
    // Roster #2 (ppts: 1023, 4th lowest) -> Slot 4 (Mid)
    // Roster #4 (ppts: 1391, highest) -> Slot 10 (Late)
    const pick2026R1Orig3 = matrix.allPicks.find(
      (p) => p.season === '2026' && p.round === 1 && p.originalRosterId === 3
    )!;
    expect(pick2026R1Orig3.projectedSlot).toBe(1);
    expect(pick2026R1Orig3.projectedTier).toBe('Early');
    expect(pick2026R1Orig3.currentOwnerRosterId).toBe(5); // Traded to Roster #5

    const pick2026R1Orig2 = matrix.allPicks.find(
      (p) => p.season === '2026' && p.round === 1 && p.originalRosterId === 2
    )!;
    expect(pick2026R1Orig2.projectedSlot).toBe(4);
    expect(pick2026R1Orig2.projectedTier).toBe('Mid');

    const pick2026R1Orig4 = matrix.allPicks.find(
      (p) => p.season === '2026' && p.round === 1 && p.originalRosterId === 4
    )!;
    expect(pick2026R1Orig4.projectedSlot).toBe(10);
    expect(pick2026R1Orig4.projectedTier).toBe('Late');
    expect(pick2026R1Orig3.dynastyValue).toBeGreaterThan(pick2026R1Orig2.dynastyValue);
    expect(pick2026R1Orig2.dynastyValue).toBeGreaterThan(pick2026R1Orig4.dynastyValue);

    // Verify 2028–2029 picks regress 50% toward Mid-Round blended with the Original Roster's under-25 core:
    // Roster #4 (top contender ppts=1391, Late in 2026–2027, but aging veteran roster with zero under-25 core)
    // regresses from Late (Slot 10 in 2026) to Mid in 2028–2029.
    const pick2028R1Orig4 = matrix.allPicks.find(
      (p) => p.season === '2028' && p.round === 1 && p.originalRosterId === 4
    )!;
    expect(pick2028R1Orig4.projectedTier).toBe('Mid');

    // Roster #6 (low current ppts=986, Early Slot 2 in 2026–2027, but stacked with under-25 young core)
    // regresses from Early (in 2026) to Mid in 2028–2029.
    const pick2027R1Orig6 = matrix.allPicks.find(
      (p) => p.season === '2027' && p.round === 1 && p.originalRosterId === 6
    )!;
    const pick2028R1Orig6 = matrix.allPicks.find(
      (p) => p.season === '2028' && p.round === 1 && p.originalRosterId === 6
    )!;
    expect(pick2027R1Orig6.projectedTier).toBe('Early');
    expect(pick2028R1Orig6.projectedTier).toBe('Mid');
  });

  it('evaluates League Power Rankings across all 10 MBA Rosters with Contender Score, Young Core Value, Draft Pick Capital, and Archetype tags', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const rankings = await engine.evaluateLeaguePowerRankings();

    expect(rankings).toHaveLength(10);
    expect(rankings.map((r) => r.overallRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // Verify rankings are sorted in descending order of overallDynastyPower
    for (let i = 1; i < rankings.length; i++) {
      expect(rankings[i - 1].overallDynastyPower).toBeGreaterThanOrEqual(
        rankings[i].overallDynastyPower
      );
    }

    // Roster #1 (Ashley ketchcum) has both elite Starting 10 FP/G and the #1 Under-25 core (Wemby, Banchero, Flagg, Sengun, Chet) + extra traded picks -> Young Juggernaut
    const r1 = rankings.find((r) => r.rosterId === 1)!;
    expect(r1.archetype).toBe('Young Juggernaut');
    expect(r1.youngCoreRank).toBe(1);
    expect(r1.ownedFirstRoundPicksCount).toBe(6); // Own 4 (2026..2029) + 2027 1st via #6 + 2028 1st via #10

    // Roster #4 (Cobra Clutch, 4-0, veteran high-scoring contender) -> Title Favorite
    const r4 = rankings.find((r) => r.rosterId === 4)!;
    expect(r4.archetype).toBe('Title Favorite');
    expect(r4.contenderRank).toBeLessThanOrEqual(2);

    // Roster #5 (MeMoiralday Farm League, 0-4, holds extra 2026 1st via #3 and 2029 1st via #8) -> Asset-Rich Rebuilder
    const r5 = rankings.find((r) => r.rosterId === 5)!;
    expect(r5.archetype).toBe('Asset-Rich Rebuilder');
    expect(r5.ownedFirstRoundPicksCount).toBe(6);

    // Verify all 4 canonical archetypes are assigned across the 10 rosters
    const archetypes = new Set(rankings.map((r) => r.archetype));
    expect(archetypes.has('Young Juggernaut')).toBe(true);
    expect(archetypes.has('Title Favorite')).toBe(true);
    expect(archetypes.has('Asset-Rich Rebuilder')).toBe(true);
    expect(archetypes.has('Reloading')).toBe(true);
  });

  it('honors manual Projected Pick Tier overrides stored in ManagerStateStore when resolving Draft Pick Assets', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const baselineMatrix = await engine.getDraftPickMatrix();
    const targetPick = baselineMatrix.allPicks.find(
      (p) => p.season === '2028' && p.round === 1 && p.originalRosterId === 10
    )!;
    expect(targetPick.hasManualTierOverride).toBe(false);

    // Override 2028 1st via Roster #10 to Early and verify higher Dynasty Value
    engine.setPickTierOverride(targetPick.id, 'Early');
    const earlyMatrix = await engine.getDraftPickMatrix();
    const earlyPick = earlyMatrix.allPicks.find((p) => p.id === targetPick.id)!;
    expect(earlyPick.hasManualTierOverride).toBe(true);
    expect(earlyPick.projectedTier).toBe('Early');

    // Override to Late and verify lower Dynasty Value
    engine.setPickTierOverride(targetPick.id, 'Late');
    const lateMatrix = await engine.getDraftPickMatrix();
    const latePick = lateMatrix.allPicks.find((p) => p.id === targetPick.id)!;
    expect(latePick.projectedTier).toBe('Late');
    expect(earlyPick.dynastyValue).toBeGreaterThan(latePick.dynastyValue);
  });
});

describe('MbaLeagueEngine — 2-Center Bipartite Slot Optimizer, Swap & Lock Alerts & Sleeper Sync Seam', () => {
  it('solves the maximum-scoring legal 10-starter assignment across PG, SG, G, SF, PF, F, C, C, UTIL, UTIL while keeping Pinned Starters immovable and computing Hypothetical Best 10', async () => {
    const fixtures = createDeterministicMbaFixtures();
    // Make Nikola Jokic (1511, C slot index 7) an inferred Pinned Starter with a low locked Game 1 score (28.0 FP)
    // while Game 2 finished at 37.0 FP, and move Alexandre Sarr (4895, C/PF) from Taxi to Bench with 49.0 FP
    // alongside Alperen Sengun (1883, Bench C with 52.0 FP).
    const r1 = fixtures.rosters.find((r) => r.roster_id === 1)!;
    r1.taxi = ['4756', '4868'];

    const jGame1 = fixtures.weeklyStats.find((g) => g.game_id === 'wk5_1511_1')!;
    jGame1.stats = { pts: 20, reb: 10, ast: 7, dd: 1 }; // 10 + 10 + 7 + 1 = 28.0 FP
    const r1Matchup = fixtures.matchups.find((m) => m.roster_id === 1)!;
    r1Matchup.players_points['1511'] = 28.0; // Inferred Locked Score at 28.0 FP
    r1Matchup.players_points['4895'] = 49.0; // Bench C/PF Alexandre Sarr has 49.0 FP
    r1Matchup.players_points['2772'] = 44.0; // Bench PG/SG Dyson Daniels has 44.0 FP

    const gateway = new InMemorySleeperGateway(fixtures);
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    // Also manually lock Devin Booker (1648, SG slot index 1) at his Game 1 score of 31.0 FP
    engine.setPlayerManualLock(1, '1648', true);

    const optimization = await engine.optimizeRosterLineup(1, 5);

    // 1. All 10 MBA Starter Slots are filled with legal positions in both actionable and hypothetical lineups
    expect(optimization.actionableOptimalStarters.map((s) => s.slotLabel)).toEqual([
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
    ]);
    expect(optimization.hypotheticalOptimalStarters.map((s) => s.slotLabel)).toEqual([
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
    ]);

    // 2. Two Center slots (indices 6 and 7) are occupied by C-eligible players
    expect(optimization.actionableOptimalStarters[6].positions).toContain('C');
    expect(optimization.actionableOptimalStarters[7].positions).toContain('C');
    expect(optimization.hypotheticalOptimalStarters[6].positions).toContain('C');
    expect(optimization.hypotheticalOptimalStarters[7].positions).toContain('C');

    // 3. Pinned Starter Constraint:
    // - Nikola Jokic (1511, inferred lock at 28.0 FP) MUST remain at slot index 7 (C) in actionableOptimalStarters
    // - Devin Booker (1648, manual lock at 31.0 FP) MUST remain at slot index 1 (SG) in actionableOptimalStarters
    expect(optimization.actionableOptimalStarters[7].playerId).toBe('1511');
    expect(optimization.actionableOptimalStarters[7].isPinnedStarter).toBe(true);
    expect(optimization.actionableOptimalStarters[7].effectiveWeeklyScore).toBe(28.0);
    expect(optimization.actionableOptimalStarters[1].playerId).toBe('1648');
    expect(optimization.actionableOptimalStarters[1].isPinnedStarter).toBe(true);
    expect(optimization.actionableOptimalStarters[1].effectiveWeeklyScore).toBe(31.0);

    // 4. All 3 high-scoring Bench players (Sengun 52.0, Sarr 49.0, Daniels 44.0) enter the actionable starting 10
    // in place of the 3 lowest non-pinned starters (Banchero 25.0, Barnes 27.5, Edwards 35.0)
    const actionableIds = optimization.actionableOptimalStarters.map((s) => s.playerId);
    expect(actionableIds).toContain('1883'); // Alperen Sengun (52.0)
    expect(actionableIds).toContain('4895'); // Alexandre Sarr (49.0)
    expect(actionableIds).toContain('2772'); // Dyson Daniels (44.0)
    expect(actionableIds).not.toContain('1988'); // Paolo Banchero (25.0) displaced
    expect(actionableIds).not.toContain('1739'); // Scottie Barnes (27.5) displaced
    expect(actionableIds).not.toContain('2580'); // Anthony Edwards (35.0) displaced

    // Current total (with Jokic 28.0 and Booker 31.0): 357.71
    // Actionable Optimal total: 357.71 - (25.0 + 27.5 + 35.0) + (52.0 + 49.0 + 44.0) = 415.21 (+57.50 FP)
    expect(optimization.currentTotalScore).toBe(357.71);
    expect(optimization.actionableTotalScore).toBe(415.21);
    expect(optimization.actionableDeltaScore).toBe(57.5);

    // 5. Hypothetical Best 10 ignores Pinned Starter locks on Jokic (28.0 FP) and Booker (31.0 FP),
    // replacing them with higher-scoring Anthony Edwards (35.0 FP) in the unconstrained 10-starter optimum (+7.0 FP higher)
    const hypotheticalIds = optimization.hypotheticalOptimalStarters.map((s) => s.playerId);
    expect(hypotheticalIds).not.toContain('1511'); // Pinned Jokic (28.0) replaced in unconstrained Hypothetical Best 10
    expect(hypotheticalIds).toContain('2580'); // Anthony Edwards (35.0) kept over Jokic (28.0)
    expect(optimization.hypotheticalTotalScore).toBe(422.21);
    expect(optimization.hypotheticalTotalScore).toBeGreaterThan(optimization.actionableTotalScore);
  });

  it('emits Swap & Lock Alerts when a Bench player in an open Lock-In Window exceeds an eligible non-pinned Starter Slot and never targets Pinned Starters', async () => {
    const fixtures = createDeterministicMbaFixtures();
    const gateway = new InMemorySleeperGateway(fixtures);
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();
    const optimization = snapshot.activeRoster.lineupOptimization;

    // Alperen Sengun (1883, Bench C) has 52.0 FP in an open Lock-In Window (2026-11-17 vs CHI)
    expect(optimization.swapAndLockAlerts).toHaveLength(1);
    const alert = optimization.swapAndLockAlerts[0];
    expect(alert.benchPlayerId).toBe('1883');
    expect(alert.benchPlayerName).toBe('Alperen Sengun');
    expect(alert.lockableScore).toBe(52.0);
    expect(alert.gameOpponent).toBe('CHI');
    expect(alert.gameDate).toBe('2026-11-17');

    // Lowest directly eligible non-pinned starter for C-eligible Sengun is UTIL Anthony Edwards (2580, 35.0 FP)
    // while C slot 7 (Nikola Jokic, 1511) is a Pinned Starter and never targeted
    expect(alert.targetSlotLabel).toBe('UTIL');
    expect(alert.displacedPlayerId).toBe('2580');
    expect(alert.displacedPlayerName).toBe('Anthony Edwards');
    expect(alert.displacedEffectiveScore).toBe(35.0);
    expect(alert.deltaPoints).toBe(17.0); // 52.0 - 35.0
    // With 2-Center bipartite multi-position slide (Wembanyama C -> PF displacing Banchero 25.0 FP), net lineup gain is +27.0 FP
    expect(alert.netLineupDeltaPoints).toBe(27.0);

    // Verify that if Jokic (slot 7, C) has a lower score (e.g. 20.0 FP) but is a Pinned Starter,
    // and both UTIL slots + C slot 6 have higher scores (55.0 FP), Sengun (52.0 FP) cannot target Pinned Starter Jokic
    gateway.updateBundle((bundle) => {
      const jGame1 = bundle.weeklyStats.find((g) => g.game_id === 'wk5_1511_1')!;
      jGame1.stats = { pts: 20, reb: 10 }; // 10 + 10 = 20.0 FP locked
      const m1 = bundle.matchups.find((m) => m.roster_id === 1)!;
      m1.players_points['1511'] = 20.0; // Jokic pinned at 20.0 FP
      // Make all non-pinned C/UTIL/PF/F/SF starters > 52.0 FP so no non-pinned slot is beaten
      for (const pid of ['1846', '2580', '4922', '1988', '1739', '2304']) {
        m1.players_points[pid] = 58.0;
      }
      bundle.weeklyStats = bundle.weeklyStats.filter((g) => g.player_id !== '1846');
      bundle.weeklyProjections = bundle.weeklyProjections.filter((g) => g.player_id !== '1846');
    });

    const pinnedBlockedOpt = await engine.optimizeRosterLineup(1, 5);
    expect(pinnedBlockedOpt.swapAndLockAlerts).toHaveLength(0);
    expect(pinnedBlockedOpt.actionableOptimalStarters[7].playerId).toBe('1511');
  });

  it('flags Out/IR active starters and healthy players on Reserve (IR), and replaces unpinned Out starters with healthy Bench players', async () => {
    const fixtures = createDeterministicMbaFixtures();
    // 1. Mark active PF starter Paolo Banchero (1988) as 'Out' even with a high raw points placeholder (48.0)
    fixtures.players['1988'].injury_status = 'Out';
    fixtures.players['1988'].injury_notes = 'Ankle sprain';
    const r1Matchup = fixtures.matchups.find((m) => m.roster_id === 1)!;
    r1Matchup.players_points['1988'] = 48.0;

    // 2. Mark Reserve (IR) player Ja Morant (2458) as healthy (injury_status: null)
    fixtures.players['2458'].injury_status = null;
    fixtures.players['2458'].injury_notes = null;

    // 3. Also add an injured ('Out') Bench player Jalen Williams (2136) with 60.0 points to verify Out Bench players are never promoted
    fixtures.players['2136'].injury_status = 'Out';
    r1Matchup.players_points['2136'] = 60.0;

    const gateway = new InMemorySleeperGateway(fixtures);
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const optimization = await engine.optimizeRosterLineup(1, 5);

    // Expect both INJURED_STARTER (for Paolo Banchero, with 2/3 IR slots used -> hasOpenIrSlot = true)
    // and HEALTHY_ON_IR (for Ja Morant on IR with injuryStatus === null)
    const injuredStarterWarn = optimization.eligibilityWarnings.find(
      (w) => w.type === 'INJURED_STARTER' && w.playerId === '1988'
    );
    expect(injuredStarterWarn).toBeDefined();
    expect(injuredStarterWarn!.slotLabel).toBe('PF');
    expect(injuredStarterWarn!.injuryStatus).toBe('Out');
    expect(injuredStarterWarn!.hasOpenIrSlot).toBe(true);

    const healthyIrWarn = optimization.eligibilityWarnings.find(
      (w) => w.type === 'HEALTHY_ON_IR' && w.playerId === '2458'
    );
    expect(healthyIrWarn).toBeDefined();
    expect(healthyIrWarn!.slotLabel).toBe('IR');
    expect(healthyIrWarn!.playerName).toBe('Ja Morant');

    // Out starter Paolo Banchero (1988) is replaced in actionableOptimalStarters,
    // and Out Bench player Jalen Williams (2136) is NOT promoted into starter slots
    const optimalIds = optimization.actionableOptimalStarters.map((s) => s.playerId);
    expect(optimalIds).not.toContain('1988');
    expect(optimalIds).not.toContain('2136');
  });

  it('stages step-by-step slot swaps, Lock-In actions, and IR moves through LineupMutationAdapter with Sleeper deep link', async () => {
    const fixtures = createDeterministicMbaFixtures();
    const gateway = new InMemorySleeperGateway(fixtures);
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const checklist = await engine.stageRosterLineupSync(1, 5);

    expect(checklist.leagueId).toBe('1344293979830640640');
    expect(checklist.rosterId).toBe(1);
    expect(checklist.week).toBe(5);
    expect(checklist.sleeperDeepLink).toBe('https://sleeper.com/leagues/1344293979830640640/team');

    // Should include SWAP steps (sliding Wembanyama C -> PF for Banchero and moving Sengun BN -> C)
    const swapSteps = checklist.steps.filter((s) => s.type === 'SWAP');
    expect(swapSteps.length).toBeGreaterThanOrEqual(1);
    expect(swapSteps.some((s) => s.title.includes('Alperen Sengun'))).toBe(true);

    // Should include LOCK steps for open Lock-In Window Smash/Lean locks (SGA 51.0 FP, Wembanyama 47.0 FP, Sengun 52.0 FP)
    const lockSteps = checklist.steps.filter((s) => s.type === 'LOCK');
    expect(lockSteps.some((s) => s.title.includes('Shai Gilgeous-Alexander') && s.title.includes('51.0'))).toBe(
      true
    );
    expect(lockSteps.some((s) => s.title.includes('Alperen Sengun') && s.title.includes('52.0'))).toBe(
      true
    );
    expect(lockSteps.some((s) => s.title.includes('Victor Wembanyama') && s.title.includes('47.0'))).toBe(
      true
    );
    // Inferred locked player Nikola Jokic (1511) is already locked in Sleeper and should not have a redundant LOCK step
    expect(lockSteps.some((s) => s.title.includes('Nikola Jokic'))).toBe(false);

    // Verify v2 SleeperGraphQLWriteAdapter scaffold reports mode 'SLEEPER_GRAPHQL' and throws NOT_CONFIGURED without credentials
    const graphqlAdapter = new SleeperGraphQLWriteAdapter();
    expect(graphqlAdapter.mode).toBe('SLEEPER_GRAPHQL');
    expect(graphqlAdapter.isConfigured()).toBe(false);
    expect(() =>
      graphqlAdapter.stageLineupChanges({
        leagueId: checklist.leagueId,
        rosterId: checklist.rosterId,
        week: checklist.week,
        slotSwaps: [],
        lockActions: [],
      })
    ).toThrowError(SleeperGraphQLNotConfiguredError);
  });
});

describe('MbaLeagueEngine — Non-Linear Dynasty Trade Analyzer & Quick Trade Text Parser Seam', () => {
  it('prevents the "4 quarters for a dollar" fallacy in uneven 3-for-1 trades by applying Consolidation Premium to elite cornerstones and deducting Replacement Cut Assets from the Roster receiving excess players', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();

    // Roster #1 (Ashley ketchcum) sends 1 elite cornerstone: Victor Wembanyama ('1846')
    // Roster #2 (Basketball Stinks) sends 3 bench/role players ('r2_p11', 'r2_p12', 'r2_p13')
    // Even though 3 role players sum to more raw Dynasty Value than 1 superstar,
    // Roster #1 must cut its 2 lowest-Dynasty-Value Bench (BN) players (Replacement Cut Assets)
    // and Roster #2 earns a non-linear Consolidation Premium for acquiring Wembanyama.
    const evaluation = await engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPlayerIds: ['1846'],
            incomingPlayerIds: ['r2_p11', 'r2_p12', 'r2_p13'],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: ['r2_p11', 'r2_p12', 'r2_p13'],
            incomingPlayerIds: ['1846'],
          },
        ],
      },
      snapshot
    );

    const side1 = evaluation.participants.find((p) => p.rosterId === 1)!;
    const side2 = evaluation.participants.find((p) => p.rosterId === 2)!;

    // Raw linear sum of the 3 role players exceeds Wembanyama's single raw value
    expect(side1.rawIncomingDynastyValue).toBeGreaterThan(side1.rawOutgoingDynastyValue);

    // Roster #1 receives 3 players and sends 1 -> 2 Replacement Cut Assets from Roster #1's lowest-value Bench (BN) slots
    expect(side1.replacementCutAssets).toHaveLength(2);
    expect(side1.replacementCutAssets.every((c) => c.slotLabel === 'BN')).toBe(true);
    expect(side1.replacementCutPenalty).toBeGreaterThan(0);

    // Roster #2 receives 1 player and sends 3 -> 0 Replacement Cut Assets, and receives Consolidation Premium on Wembanyama
    expect(side2.replacementCutAssets).toHaveLength(0);
    expect(side2.consolidationPremium).toBeGreaterThan(10);

    // Single-sided Replacement Cut Asset accounting (ADR-0002): consolidating side does NOT subtract freedSlotReplacementCredit
    expect(side2.adjustedOutgoingDynastyValue).toBe(
      Math.round((side2.rawOutgoingDynastyValue + side2.outgoingConsolidationPremium) * 10) / 10
    );

    // After Consolidation Premium + single-sided Replacement Cut Asset accounting, Roster #2 (superstar receiver) wins decisively
    expect(side2.adjustedDynastyDelta).toBeGreaterThan(15);
    expect(side1.adjustedDynastyDelta).toBeLessThan(-20);
    expect(evaluation.winnerRosterId).toBe(2);
    expect(['A+', 'A']).toContain(side2.letterGrade);
    expect(['D', 'F']).toContain(side1.letterGrade);
  });

  it('solves pre-trade and post-trade optimal 10-starter lineups (Starting 10 Δ FP/G), tracks 2-Center depth and age delta, honors manual Projected Pick Tier overrides, and supports 3-team trades and URL encoding', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();

    // Roster #3 (rebuilder) sends 2027 1st ('2027-r1-orig-3') to Roster #4 for Stephen Curry ('r4_p1', age 27 PG, high FP/G)
    const baseProposal = {
      participants: [
        {
          rosterId: 3,
          outgoingPickIds: ['2027-r1-orig-3'],
          incomingPlayerIds: ['r4_p1'],
        },
        {
          rosterId: 4,
          outgoingPlayerIds: ['r4_p1'],
          incomingPickIds: ['2027-r1-orig-3'],
        },
      ],
    };

    const lateOverrideEval = engine.evaluateTrade(
      {
        ...baseProposal,
        pickTierOverrides: { '2027-r1-orig-3': 'Late' },
      },
      snapshot
    );
    const earlyOverrideEval = engine.evaluateTrade(
      {
        ...baseProposal,
        pickTierOverrides: { '2027-r1-orig-3': 'Early' },
      },
      snapshot
    );

    const r3WithLate = lateOverrideEval.participants.find((p) => p.rosterId === 3)!;
    const r4WithLate = lateOverrideEval.participants.find((p) => p.rosterId === 4)!;
    const r4WithEarly = earlyOverrideEval.participants.find((p) => p.rosterId === 4)!;

    // Roster #3 acquires high-scoring starter 'r4_p1' (Stephen Curry) and sends only a future pick -> Starting 10 Δ FP/G is positive!
    expect(r3WithLate.starting10DeltaFppg).toBeGreaterThan(5);
    expect(r3WithLate.postTradeOptimalStarterFpg).toBeGreaterThan(
      r3WithLate.preTradeOptimalStarterFpg
    );
    expect(r3WithLate.postTradeOptimalStarters).toHaveLength(10);

    // Toggling 2027-r1-orig-3 from Late to Early increases Roster #4's incoming pick Dynasty Value and Adjusted Dynasty Delta
    expect(r4WithEarly.incomingPicks[0].projectedTier).toBe('Early');
    expect(r4WithEarly.incomingPicks[0].hasManualTierOverride).toBe(true);
    expect(r4WithEarly.incomingPicks[0].dynastyValue).toBeGreaterThan(
      r4WithLate.incomingPicks[0].dynastyValue
    );
    expect(r4WithEarly.adjustedDynastyDelta).toBeGreaterThan(r4WithLate.adjustedDynastyDelta);

    // 3-Team Trade across Roster #1, Roster #4, and Roster #10:
    // Roster #1 sends Alperen Sengun ('1883', C) to Roster #4;
    // Roster #4 sends Anthony Davis ('r4_p7', C, age 27) to Roster #10;
    // Roster #10 sends Giannis Antetokounmpo ('r10_p5', PF/C, age 26) to Roster #1
    const threeTeamProposal = {
      participants: [
        {
          rosterId: 1,
          outgoingPlayerIds: ['1883'],
          incomingPlayerIds: ['r10_p5'],
          outgoingPickIds: ['2028-r1-orig-10'],
        },
        {
          rosterId: 4,
          outgoingPlayerIds: ['r4_p7'],
          incomingPlayerIds: ['1883'],
        },
        {
          rosterId: 10,
          outgoingPlayerIds: ['r10_p5'],
          incomingPlayerIds: ['r4_p7'],
          incomingPickIds: ['2028-r1-orig-10'],
        },
      ],
      pickTierOverrides: { '2028-r1-orig-10': 'Early' as const },
    };

    const threeTeamEval = engine.evaluateTrade(threeTeamProposal, snapshot);
    expect(threeTeamEval.participants).toHaveLength(3);
    expect(threeTeamEval.participants.every((p) => p.takeaways.length >= 2)).toBe(true);

    // Verify URL state round-trip encoding & decoding
    const encoded = engine.encodeTradeUrlParam(threeTeamProposal);
    expect(encoded.length).toBeGreaterThan(10);
    const decoded = engine.decodeTradeUrlParam(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.participants).toHaveLength(3);
    expect(decoded!.pickTierOverrides?.['2028-r1-orig-10']).toBe('Early');
  });

  it('parses freeform trade descriptions via Quick Trade Text Parser (parseTradeText) into a structured TradeProposal ready for evaluateTrade', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();

    // Example 1: Canonical ticket string with team names, player names, and 2027/2028 pick tokens
    const rawText1 =
      'Reefer Chiefers receives Giannis Antetokounmpo, 2028 1st; Ashley ketchcum receives Alperen Sengun, 2027 1st, 2027 2nd';
    const parsed1 = await engine.parseTradeText(rawText1, snapshot);

    expect(parsed1.proposal.participants).toHaveLength(2);
    const pReefer = parsed1.proposal.participants.find((p) => p.rosterId === 10)!;
    const pAshley = parsed1.proposal.participants.find((p) => p.rosterId === 1)!;

    expect(pReefer).toBeDefined();
    expect(pAshley).toBeDefined();
    expect(pReefer.incomingPlayerIds).toContain('r10_p5'); // Giannis Antetokounmpo
    expect(pReefer.incomingPickIds?.some((id) => id.startsWith('2028-r1-'))).toBe(true);
    expect(pAshley.incomingPlayerIds).toContain('1883'); // Alperen Sengun
    expect(pAshley.incomingPickIds?.some((id) => id.startsWith('2027-r1-'))).toBe(true);
    expect(pAshley.incomingPickIds?.some((id) => id.startsWith('2027-r2-'))).toBe(true);

    // Evaluate the parsed proposal directly
    const eval1 = engine.evaluateTrade(parsed1.proposal, snapshot);
    expect(eval1.participants).toHaveLength(2);
    expect(eval1.participants.find((p) => p.rosterId === 10)?.incomingPlayers[0].fullName).toBe(
      'Giannis Antetokounmpo'
    );
    expect(eval1.participants.find((p) => p.rosterId === 1)?.incomingPlayers[0].fullName).toBe(
      'Alperen Sengun'
    );

    // Example 2: Roster # syntax + "+" delimiters + surname matching
    const rawText2 =
      'Roster 1 gets Doncic + 2026 Early 1st, Roster 10 gets Booker + 2028 2nd';
    const parsed2 = engine.parseTradeText(rawText2, snapshot);
    expect(parsed2.proposal.participants.map((p) => p.rosterId)).toEqual([1, 10]);
    expect(parsed2.proposal.participants[0].incomingPlayerIds).toContain('r10_p1'); // Luka Doncic
    expect(parsed2.proposal.participants[1].incomingPlayerIds).toContain('1648'); // Devin Booker
    expect(Object.values(parsed2.proposal.pickTierOverrides ?? {})).toContain('Early');
  });
});

describe('MbaLeagueEngine — Completed League Trade Grader (2026 & 2025 Seasons) & Flipped Asset Seam', () => {
  it('aggregates and grades completed trades across both the 2026 (1344293979830640640) and 2025 (1212393765696700416) MBA seasons using the ADR-0002 dual-axis trade analyzer, while ignoring non-trade transactions', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();
    const allTrades = await engine.gradeHistoricalTrades({ season: 'ALL' });

    // Snapshot also exposes graded historical trades directly
    expect(snapshot.historicalTrades).toBeDefined();
    expect(snapshot.historicalTrades.length).toBe(allTrades.length);
    expect(allTrades.length).toBeGreaterThanOrEqual(6);

    // Includes completed trades from both 2026 (1344293979830640640) and 2025 (1212393765696700416)
    const trades2026 = allTrades.filter((t) => t.season === '2026');
    const trades2025 = allTrades.filter((t) => t.season === '2025');
    expect(trades2026.length).toBeGreaterThanOrEqual(3);
    expect(trades2025.length).toBeGreaterThanOrEqual(3);
    expect(trades2026.every((t) => t.leagueId === '1344293979830640640')).toBe(true);
    expect(trades2025.every((t) => t.leagueId === '1212393765696700416')).toBe(true);

    // Sorted newest-first by created timestamp
    for (let i = 1; i < allTrades.length; i++) {
      expect(allTrades[i - 1].created).toBeGreaterThanOrEqual(allTrades[i].created);
    }

    // Every graded historical trade has a dual-axis evaluation with Letter Grades, Adjusted Dynasty Value, and Starting 10 Δ FP/G
    for (const trade of allTrades) {
      expect(trade.transactionId).toBeTruthy();
      expect(trade.formattedDate).toBeTruthy();
      expect(trade.participants.length).toBeGreaterThanOrEqual(2);
      expect(trade.fairnessScore).toBeGreaterThanOrEqual(0);
      expect(trade.fairnessScore).toBeLessThanOrEqual(100);
      for (const part of trade.participants) {
        expect(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F']).toContain(
          part.letterGrade
        );
        expect(typeof part.adjustedDynastyDelta).toBe('number');
        expect(typeof part.starting10DeltaFppg).toBe('number');
      }
    }
  });

  it('detects single-hop and multi-hop Flipped Assets across 2025 and 2026 transactions when an acquired player or Draft Pick Asset is subsequently traded away by the acquiring Roster', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const allTrades = await engine.gradeHistoricalTrades({ season: 'ALL' });

    const tx2025_1 = allTrades.find((t) => t.transactionId === 'tx_2025_1')!;
    const tx2025_3 = allTrades.find((t) => t.transactionId === 'tx_2025_3')!;
    const tx2026_1 = allTrades.find((t) => t.transactionId === 'tx_2026_1')!;

    expect(tx2025_1).toBeDefined();
    expect(tx2025_3).toBeDefined();
    expect(tx2026_1).toBeDefined();

    // Hop 1 (tx_2025_1): Roster #4 (Cobra Clutch) acquires player '1362' (Damian Lillard) and '2028-r1-orig-10' from Roster #10,
    // and later trades both away to Roster #7 in tx_2025_3
    const r4InTx1 = tx2025_1.participants.find((p) => p.rosterId === 4)!;
    const lillardHop1 = r4InTx1.incomingPlayers.find((p) => p.playerId === '1362')!;
    const pick2028Hop1 = r4InTx1.incomingPicks.find((pk) => pk.pickId === '2028-r1-orig-10')!;

    expect(lillardHop1.isFlippedAsset).toBe(true);
    expect(lillardHop1.flippedInTransactionId).toBe('tx_2025_3');
    expect(lillardHop1.flippedToRosterId).toBe(7);
    expect(lillardHop1.flippedTimestamp).toBe(tx2025_3.created);
    expect(lillardHop1.flippedSummary).toContain('Golden State Hospice');

    expect(pick2028Hop1.isFlippedAsset).toBe(true);
    expect(pick2028Hop1.flippedInTransactionId).toBe('tx_2025_3');
    expect(pick2028Hop1.flippedToRosterId).toBe(7);

    // Hop 2 (tx_2025_3): Roster #7 (Golden State Hospice) acquires '1362' and '2028-r1-orig-10' from Roster #4,
    // keeps '1362', and later flips '2028-r1-orig-10' to Roster #1 (Ashley ketchcum) in tx_2026_1 (2026 season!)
    const r7InTx3 = tx2025_3.participants.find((p) => p.rosterId === 7)!;
    const lillardHop2 = r7InTx3.incomingPlayers.find((p) => p.playerId === '1362')!;
    const pick2028Hop2 = r7InTx3.incomingPicks.find((pk) => pk.pickId === '2028-r1-orig-10')!;

    expect(lillardHop2.isFlippedAsset).toBe(false);
    expect(lillardHop2.flippedInTransactionId).toBeNull();

    expect(pick2028Hop2.isFlippedAsset).toBe(true);
    expect(pick2028Hop2.flippedInTransactionId).toBe('tx_2026_1');
    expect(pick2028Hop2.flippedToRosterId).toBe(1);
    expect(pick2028Hop2.flippedTimestamp).toBe(tx2026_1.created);
    expect(pick2028Hop2.flippedSummary).toContain('Ashley ketchcum');

    // Hop 3 (tx_2026_1): Roster #1 acquires '2028-r1-orig-10' and holds it -> not flipped
    const r1InTx2026_1 = tx2026_1.participants.find((p) => p.rosterId === 1)!;
    const pick2028Hop3 = r1InTx2026_1.incomingPicks.find((pk) => pk.pickId === '2028-r1-orig-10')!;
    expect(pick2028Hop3.isFlippedAsset).toBe(false);
    expect(pick2028Hop3.flippedInTransactionId).toBeNull();
  });

  it('filters historical trades by season (2026, 2025, ALL) and by participating Manager / Roster while preserving cross-season Flipped Asset links', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();

    const only2026 = engine.gradeHistoricalTrades({ season: '2026' }, snapshot);
    expect(only2026.length).toBe(3);
    expect(only2026.every((t) => t.season === '2026')).toBe(true);

    const only2025 = engine.gradeHistoricalTrades({ season: '2025' }, snapshot);
    expect(only2025.length).toBe(3);
    expect(only2025.every((t) => t.season === '2025')).toBe(true);

    // Cross-season Flipped Asset link (tx_2025_3 -> tx_2026_1) is preserved even when filtering to '2025'
    const tx2025_3 = only2025.find((t) => t.transactionId === 'tx_2025_3')!;
    expect(tx2025_3.hasFlippedAssets).toBe(true);
    expect(tx2025_3.flippedAssets[0].flippedInTransactionId).toBe('tx_2026_1');

    // Filter by participating Roster #1 (Ashley ketchcum) across all seasons
    const roster1Trades = engine.gradeHistoricalTrades({ season: 'ALL', rosterId: 1 }, snapshot);
    expect(roster1Trades.length).toBe(2);
    expect(roster1Trades.every((t) => t.rosterIds.includes(1))).toBe(true);

    // Filter by participating Roster #4 (Cobra Clutch) in 2025 season
    const roster4In2025 = await engine.gradeHistoricalTrades({ season: '2025', rosterId: 4 });
    expect(roster4In2025.length).toBe(2);
    expect(roster4In2025.every((t) => t.season === '2025' && t.rosterIds.includes(4))).toBe(true);
  });
});


