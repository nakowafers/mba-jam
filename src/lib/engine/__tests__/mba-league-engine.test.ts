import { describe, it, expect } from 'vitest';
import { MbaLeagueEngine } from '../mba-league-engine';
import { createDeterministicMbaFixtures } from '../fixtures/mba-fixtures';
import { InMemorySleeperGateway } from '../../gateway/in-memory-sleeper-gateway';
import { InMemoryManagerStateStore } from '../../store/manager-state-store';

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
    // Scenario A (Protect Lead): Completed Game 1 = 38.0 MBA FP (0.95x of 40.0 threshold, inside >= 0.92x borderline floor-lock band)
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

