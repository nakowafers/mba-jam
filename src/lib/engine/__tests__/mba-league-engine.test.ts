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
