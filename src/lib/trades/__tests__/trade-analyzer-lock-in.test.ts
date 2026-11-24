import { describe, expect, it } from 'vitest';
import { solveOptimalStarting10Lineup } from '../trade-analyzer';
import { MbaLeagueEngine } from '@/lib/engine/mba-league-engine';
import { InMemorySleeperGateway } from '@/lib/gateway/in-memory-sleeper-gateway';
import { InMemoryManagerStateStore } from '@/lib/store/manager-state-store';
import { createDeterministicMbaFixtures } from '@/lib/engine/fixtures/mba-fixtures';
import { RosterPlayerSlot } from '@/lib/types/mba';

function makePlayer(overrides: {
  playerId: string;
  fullName: string;
  positions: string[];
  fpg: number;
  avgLockIn: number;
  dynastyValue?: number;
}): RosterPlayerSlot {
  return {
    slotIndex: 0,
    slotLabel: 'BN',
    category: 'BENCH',
    playerId: overrides.playerId,
    fullName: overrides.fullName,
    firstName: overrides.fullName.split(' ')[0] ?? overrides.fullName,
    lastName: overrides.fullName.split(' ')[1] ?? '',
    nbaTeam: 'TST',
    positions: overrides.positions,
    injuryStatus: null,
    injuryNotes: null,
    age: 25,
    yearsExp: 4,
    seasonMetrics: {
      gamesPlayed: 12,
      totalMbaPoints: overrides.fpg * 12,
      mbaFantasyPointsPerGame: overrides.fpg,
      averageLockInPoints: overrides.avgLockIn,
      lockInWeeksCount: 4,
      totalLockInPoints: overrides.avgLockIn * 4,
      lockInAvgSource: 'SLEEPER_LOCKED',
      ptsPerGame: 15,
      rebPerGame: 5,
      astPerGame: 4,
      stlPerGame: 1,
      blkPerGame: 0.5,
      tpmPerGame: 1.5,
      toPerGame: 2,
    },
    currentWeekMatchupPoints: 0,
    currentWeekCompletedGamesCount: 0,
    currentWeekRemainingGamesCount: 2,
    latestCompletedGamePoints: null,
    completedGames: [],
    remainingGames: [],
    isLocked: false,
    isPinnedStarter: false,
    lockedScore: null,
    isLockInWindowOpen: false,
    lockInThreshold: overrides.fpg,
    effectiveWeeklyScore: overrides.fpg,
    recommendation: 'ROLL THE DICE',
    leverageAnnotation: null,
    lockIn: {
      isLocked: false,
      isPinnedStarter: false,
      lockSource: null,
      lockedScore: null,
      lockedGame: null,
      isLockInWindowOpen: false,
      canToggleManualLock: false,
      lockableLatestGame: null,
      completedGames: [],
      remainingGames: [],
      remainingGamesMean: overrides.fpg,
      remainingGamesMultiplier: 1.0,
      lockInThreshold: overrides.fpg,
      effectiveWeeklyScore: overrides.fpg,
      recommendation: 'ROLL THE DICE',
      leverageAnnotation: null,
    },
    dynastyValue: overrides.dynastyValue ?? 50,
  };
}

function createBaseStarters(): RosterPlayerSlot[] {
  return [
    makePlayer({ playerId: 'pg1', fullName: 'PG One', positions: ['PG'], fpg: 30, avgLockIn: 36 }),
    makePlayer({ playerId: 'sg1', fullName: 'SG One', positions: ['SG'], fpg: 28, avgLockIn: 34 }),
    makePlayer({ playerId: 'g1', fullName: 'G One', positions: ['PG', 'SG'], fpg: 26, avgLockIn: 32 }),
    makePlayer({ playerId: 'sf1', fullName: 'SF One', positions: ['SF'], fpg: 25, avgLockIn: 31 }),
    makePlayer({ playerId: 'pf1', fullName: 'PF One', positions: ['PF'], fpg: 24, avgLockIn: 30 }),
    makePlayer({ playerId: 'f1', fullName: 'F One', positions: ['SF', 'PF'], fpg: 23, avgLockIn: 29 }),
    makePlayer({ playerId: 'c1', fullName: 'C One', positions: ['C'], fpg: 32, avgLockIn: 40 }),
    makePlayer({ playerId: 'c2', fullName: 'C Two', positions: ['C'], fpg: 27, avgLockIn: 35 }),
    makePlayer({ playerId: 'u1', fullName: 'Util One', positions: ['SG'], fpg: 22, avgLockIn: 28 }),
  ];
}

describe('Trade Analyzer — Average Lock-In Optimization & Evaluation', () => {
  it('solveOptimalStarting10Lineup maximizes averageLockInPoints over raw FP/G and returns totalAvgLockIn, totalFpg, and per-slot avgLockIn', () => {
    const baseStarters = createBaseStarters();

    // Competing for the 10th starter slot (UTIL):
    // steadyFloor has higher raw FP/G (24.0 > 20.0)
    // boomCeiling has higher averageLockInPoints (33.5 > 26.0)
    const steadyFloor = makePlayer({
      playerId: 'steady',
      fullName: 'Steady Floor',
      positions: ['SF'],
      fpg: 24.0,
      avgLockIn: 26.0,
      dynastyValue: 55,
    });
    const boomCeiling = makePlayer({
      playerId: 'boom',
      fullName: 'Boom Ceiling',
      positions: ['SF'],
      fpg: 20.0,
      avgLockIn: 33.5,
      dynastyValue: 48,
    });

    const result = solveOptimalStarting10Lineup([...baseStarters, steadyFloor, boomCeiling]);

    const starterIds = result.starters.map((s) => s.playerId);
    expect(starterIds).toHaveLength(10);
    expect(starterIds).toContain('boom');
    expect(starterIds).not.toContain('steady');

    // Sum of avgLockIn: 36+34+32+31+30+29+40+35+28+33.5 = 328.5
    expect(result.totalAvgLockIn).toBe(328.5);
    // Sum of raw FP/G for those chosen 10 starters: 30+28+26+25+24+23+32+27+22+20 = 257.0
    expect(result.totalFpg).toBe(257.0);

    const boomSlot = result.starters.find((s) => s.playerId === 'boom')!;
    expect(boomSlot.avgLockIn).toBe(33.5);
    expect(boomSlot.fpg).toBe(20.0);
  });

  it('solveOptimalStarting10Lineup breaks averageLockInPoints ties using mbaFantasyPointsPerGame then dynastyValue', () => {
    const baseStarters = createBaseStarters();

    const lowerTie = makePlayer({
      playerId: 'tie-low',
      fullName: 'Tie Low',
      positions: ['SF'],
      fpg: 21.0,
      avgLockIn: 27.0,
      dynastyValue: 40,
    });
    const higherFpgTie = makePlayer({
      playerId: 'tie-high-fpg',
      fullName: 'Tie High FPG',
      positions: ['SF'],
      fpg: 24.5,
      avgLockIn: 27.0,
      dynastyValue: 40,
    });

    const result = solveOptimalStarting10Lineup([...baseStarters, lowerTie, higherFpgTie]);
    const starterIds = result.starters.map((s) => s.playerId);
    expect(starterIds).toContain('tie-high-fpg');
    expect(starterIds).not.toContain('tie-low');
  });

  it('solveOptimalStarting10Lineup breaks cross-lineup totalAvgLockIn ties by higher total FP/G when two distinct 10-player combinations have identical totalAvgLockIn', () => {
    // 8 locked-in starters with avgLockIn >= 36 filling C1, SG, G, SF, PF, F, UTIL, UTIL
    // leaving exactly one C slot and one PG slot open.
    const lockedEight: RosterPlayerSlot[] = [
      makePlayer({ playerId: 'c1', fullName: 'C One', positions: ['C'], fpg: 35, avgLockIn: 45 }),
      makePlayer({ playerId: 'sg1', fullName: 'SG One', positions: ['SG'], fpg: 32, avgLockIn: 42 }),
      makePlayer({ playerId: 'sg2', fullName: 'SG Two', positions: ['SG'], fpg: 31, avgLockIn: 41 }),
      makePlayer({ playerId: 'sf1', fullName: 'SF One', positions: ['SF'], fpg: 30, avgLockIn: 40 }),
      makePlayer({ playerId: 'pf1', fullName: 'PF One', positions: ['PF'], fpg: 29, avgLockIn: 39 }),
      makePlayer({ playerId: 'sf2', fullName: 'SF Two', positions: ['SF'], fpg: 28, avgLockIn: 38 }),
      makePlayer({ playerId: 'pf2', fullName: 'PF Two', positions: ['PF'], fpg: 27, avgLockIn: 37 }),
      makePlayer({ playerId: 'sf3', fullName: 'SF Three', positions: ['SF'], fpg: 26, avgLockIn: 36 }),
    ];

    // Two distinct 10-player combinations tie at totalAvgLockIn = 318 + 50 = 368:
    //   1) dual (C, 30) + pure_pg (PG, 20) -> explored first by DFS, extra FP/G = 15 + 15 = 30
    //   2) pure_c (C, 20) + dual (PG, 30)  -> explored second by DFS, extra FP/G = 25 + 15 = 40
    const dual = makePlayer({
      playerId: 'dual',
      fullName: 'Dual Guard Center',
      positions: ['PG', 'C'],
      fpg: 15.0,
      avgLockIn: 30.0,
      dynastyValue: 50,
    });
    const purePg = makePlayer({
      playerId: 'pure-pg',
      fullName: 'Pure PG',
      positions: ['PG'],
      fpg: 15.0,
      avgLockIn: 20.0,
      dynastyValue: 50,
    });
    const pureC = makePlayer({
      playerId: 'pure-c',
      fullName: 'Pure C',
      positions: ['C'],
      fpg: 25.0,
      avgLockIn: 20.0,
      dynastyValue: 50,
    });

    const result = solveOptimalStarting10Lineup([...lockedEight, dual, purePg, pureC]);
    const starterIds = result.starters.map((s) => s.playerId);

    expect(result.totalAvgLockIn).toBe(368);
    expect(starterIds).toContain('dual');
    expect(starterIds).toContain('pure-c');
    expect(starterIds).not.toContain('pure-pg');
    expect(result.totalFpg).toBe(278);
  });

  it('evaluateTrade populates avgLockIn, starting10DeltaAvgLockIn, and starting10DeltaFppg, drives Axis 2 composite grade with starting10DeltaAvgLockIn, and leads takeaways with Avg Lock-In', async () => {
    const fixtures = createDeterministicMbaFixtures();
    const gateway = new InMemorySleeperGateway(fixtures);
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();

    // Clone snapshot and craft a controlled 1-for-1 trade between Roster #1 and Roster #2
    // where two SG-eligible players have identical FP/G and identical dynastyValue,
    // so Axis 1 (adjustedDynastyDelta) is 0.0 and raw FP/G delta is 0.0,
    // while their averageLockInPoints differ significantly (+10.0 Avg Lock-In).
    const r1 = snapshot.rosters.find((r) => r.rosterId === 1)!;
    const r2 = snapshot.rosters.find((r) => r.rosterId === 2)!;

    const p1 = r1.starterSlots[1]; // SG starter on Roster #1 (Devin Booker, 1648)
    const p2 = r2.starterSlots[1]; // SG starter on Roster #2

    // Make both players identical in FP/G and Dynasty Value, differing only in averageLockInPoints
    // Values (55.0 and 65.0) are well above both rosters' bench thresholds so both are guaranteed starters
    const sharedFpg = 32.0;
    const sharedDynastyValue = 62.0;
    p1.seasonMetrics = {
      ...p1.seasonMetrics,
      mbaFantasyPointsPerGame: sharedFpg,
      averageLockInPoints: 55.0,
      lockInWeeksCount: 4,
      lockInAvgSource: 'SLEEPER_LOCKED',
    };
    p1.dynastyValue = sharedDynastyValue;

    p2.seasonMetrics = {
      ...p2.seasonMetrics,
      mbaFantasyPointsPerGame: sharedFpg,
      averageLockInPoints: 65.0,
      lockInWeeksCount: 4,
      lockInAvgSource: 'SLEEPER_LOCKED',
    };
    p2.dynastyValue = sharedDynastyValue;

    // Ensure both are comfortably inside each roster's Starting 10 both pre- and post-trade
    const evalResult = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPlayerIds: [p1.playerId],
            incomingPlayerIds: [p2.playerId],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [p2.playerId],
            incomingPlayerIds: [p1.playerId],
          },
        ],
      },
      snapshot
    );

    const side1 = evalResult.participants.find((p) => p.rosterId === 1)!;
    const side2 = evalResult.participants.find((p) => p.rosterId === 2)!;

    // Evaluated player assets include avgLockIn
    expect(side1.incomingPlayers[0].avgLockIn).toBe(65.0);
    expect(side1.outgoingPlayers[0].avgLockIn).toBe(55.0);
    expect(side2.incomingPlayers[0].avgLockIn).toBe(55.0);
    expect(side2.outgoingPlayers[0].avgLockIn).toBe(65.0);

    // Starting 10 Avg Lock-In delta reflects the +10.0 / -10.0 swing while raw FP/G delta is 0.0
    expect(side1.adjustedDynastyDelta).toBe(0);
    expect(side1.starting10DeltaFppg).toBe(0);
    expect(side1.starting10DeltaAvgLockIn).toBe(10.0);
    expect(side1.postTradeOptimalStarterAvgLockIn).toBe(
      Math.round((side1.preTradeOptimalStarterAvgLockIn + 10.0) * 10) / 10
    );

    expect(side2.adjustedDynastyDelta).toBe(0);
    expect(side2.starting10DeltaFppg).toBe(0);
    expect(side2.starting10DeltaAvgLockIn).toBe(-10.0);
    expect(side2.postTradeOptimalStarterAvgLockIn).toBe(
      Math.round((side2.preTradeOptimalStarterAvgLockIn - 10.0) * 10) / 10
    );

    // Axis 2 composite grade responds directly to starting10DeltaAvgLockIn:
    // Side 1 (Top-5 Contender, 2.2x Win-Now Boost): 0 + 10.0 * 2.2 = +22.0 -> A (>= 21.0, < 32.0)
    expect(side1.compositeGradeScore).toBe(22.0);
    expect(side1.letterGrade).toBe('A');
    // Side 2 (negative delta without picks/youth/sidelined focus, 1.5x LIVE base): 0 + (-10.0) * 1.5 = -15.0 -> C+ (>= -20.0, < -12.5)
    expect(side2.compositeGradeScore).toBe(-15.0);
    expect(side2.letterGrade).toBe('C+');
    expect(evalResult.winnerRosterId).toBe(1);

    // Takeaways lead with Avg Lock-In and include raw FP/G in parentheses
    const starterTakeaway1 = side1.takeaways.find((t) =>
      t.startsWith('Optimal Starting 10 Impact:')
    );
    expect(starterTakeaway1).toBeDefined();
    expect(starterTakeaway1).toContain('+10.0 Avg Lock-In');
    expect(starterTakeaway1).toContain('FP/G');
    expect(starterTakeaway1!.indexOf('Avg Lock-In')).toBeLessThan(
      starterTakeaway1!.indexOf('FP/G')
    );
  });

  it('dampens negative starting10DeltaAvgLockIn weight (0.65x vs 1.5x) when a rebuilding Roster gains Dynasty Value via incoming draft picks', async () => {
    const fixtures = createDeterministicMbaFixtures();
    const gateway = new InMemorySleeperGateway(fixtures);
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();

    // Roster #4 sends a veteran starter ('r4_p1') to Roster #3 for Roster #3's Early 2027 1st ('2027-r1-orig-3')
    // Roster #4 loses Starting 10 Avg Lock-In (< 0) while gaining draft pick Dynasty Value (> 0)
    const evalResult = engine.evaluateTrade(
      {
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
        pickTierOverrides: { '2027-r1-orig-3': 'Early' },
      },
      snapshot
    );

    const r4 = evalResult.participants.find((p) => p.rosterId === 4)!;
    expect(r4.starting10DeltaAvgLockIn).toBeLessThan(0);
    expect(r4.incomingPicks.length).toBe(1);
    expect(r4.adjustedDynastyDelta).toBeGreaterThanOrEqual(-4.0);

    const expectedComposite =
      Math.round((r4.adjustedDynastyDelta + r4.starting10DeltaAvgLockIn * 0.65) * 10) / 10;
    expect(r4.compositeGradeScore).toBe(expectedComposite);
  });
});
