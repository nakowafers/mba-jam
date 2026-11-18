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
