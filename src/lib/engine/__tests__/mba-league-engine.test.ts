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

    // Verify snapshot hydrates dynastyValue on every player slot (e.g. Nikola Jokic: 43.8 FP/G, age 31, C -> 43.8 * 0.72 * 1.12 * 2 = 70.6)
    const snapshot = await engine.getLeagueSnapshot();
    const jokicSlot = snapshot.activeRoster.starterSlots[7];
    expect(jokicSlot.fullName).toBe('Nikola Jokic');
    expect(jokicSlot.dynastyValue).toBe(70.6);
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
    expect(pick2028R1Via10.ownerRosterId).toBe(1);
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

    // After Consolidation Premium + Replacement Cut Asset accounting, Roster #2 (superstar receiver) wins decisively
    expect(side2.adjustedDynastyDelta).toBeGreaterThan(20);
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

    // Roster #1 (Ashley ketchcum, young core) sends Alperen Sengun ('1883', age 24 C) + 2028 1st via #10 ('2028-r1-orig-10')
    // Roster #4 (Cobra Clutch, veteran contender) sends Nikola Jokic? No, Roster #4 has Anthony Davis ('r4_p7', age 27 C) & Kevin Durant ('r4_p5')
    // Let's test a 2-team trade with Draft Pick Tier override comparison first:
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

