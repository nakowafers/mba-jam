import { describe, expect, it } from 'vitest';
import {
  computeLeaguePowerRankings,
  computePlayerDynastyValue,
} from '../dynasty-valuation';
import {
  DraftPickMatrix,
  HydratedRoster,
  MBA_DRAFT_PICK_SEASONS,
} from '../../types/mba';
import { createDeterministicMbaFixtures } from '../../engine/fixtures/mba-fixtures';
import { MbaLeagueEngine } from '../../engine/mba-league-engine';
import { InMemorySleeperGateway } from '../../gateway/in-memory-sleeper-gateway';
import { InMemoryManagerStateStore } from '../../store/manager-state-store';

function createMinimalRoster(params: {
  rosterId: number;
  rosterName: string;
  starterTotalAvgLockIn: number;
  starterTotalFpg: number;
  wins?: number;
  losses?: number;
  ppts?: number;
  fpts?: number;
}): HydratedRoster {
  return {
    rosterId: params.rosterId,
    manager: {
      userId: `user-${params.rosterId}`,
      rosterId: params.rosterId,
      displayName: `mgr${params.rosterId}`,
      rosterName: params.rosterName,
      avatarUrl: null,
    },
    standing: {
      wins: params.wins ?? 2,
      losses: params.losses ?? 2,
      ties: 0,
      fpts: params.fpts ?? 1000,
      fptsAgainst: 1000,
      ppts: params.ppts ?? 1100,
    },
    starterSlots: [],
    benchSlots: [],
    reserveSlots: [],
    taxiSlots: [],
    allPlayers: [],
    ownedDraftPicks: [],
    currentWeekMatchupPoints: 0,
    currentWeekProjectedPoints: 0,
    currentWeekMatchupId: null,
    starterTotalFpg: params.starterTotalFpg,
    starterTotalAvgLockIn: params.starterTotalAvgLockIn,
    averageWeeklyMatchupPoints: null,
    lineupOptimization: {} as HydratedRoster['lineupOptimization'],
    stagedChecklist: {} as HydratedRoster['stagedChecklist'],
  };
}

function createEmptyPickMatrix(rosters: HydratedRoster[]): DraftPickMatrix {
  const byOwnerRosterId: DraftPickMatrix['byOwnerRosterId'] = {};
  const rows = rosters.map((r) => {
    const picksBySeason = {
      '2026': [],
      '2027': [],
      '2028': [],
      '2029': [],
    };
    byOwnerRosterId[r.rosterId] = picksBySeason;
    return {
      rosterId: r.rosterId,
      rosterName: r.manager.rosterName,
      managerDisplayName: r.manager.displayName,
      totalPickCapital: 0,
      firstRoundCount: 0,
      secondRoundCount: 0,
      picksBySeason,
      allOwnedPicks: [],
    };
  });

  return {
    seasons: MBA_DRAFT_PICK_SEASONS,
    allPicks: [],
    byOwnerRosterId,
    rows,
  };
}

describe('Power Rankings — Average Lock-In Contender Score', () => {
  it('sets contenderScore to starterTotalAvgLockIn, preserves starterTotalFpg, and ranks contenders by Avg Lock-In', () => {
    // Roster 1 has higher Avg Lock-In (380) despite lower raw FP/G (295)
    // Roster 2 has lower Avg Lock-In (345) despite higher raw FP/G (310)
    const roster1 = createMinimalRoster({
      rosterId: 1,
      rosterName: 'High Ceiling Lock-Ins',
      starterTotalAvgLockIn: 380,
      starterTotalFpg: 295,
    });
    const roster2 = createMinimalRoster({
      rosterId: 2,
      rosterName: 'Steady Raw FPG',
      starterTotalAvgLockIn: 345,
      starterTotalFpg: 310,
    });

    const rosters = [roster1, roster2];
    const rankings = computeLeaguePowerRankings({
      rosters,
      pickMatrix: createEmptyPickMatrix(rosters),
    });

    const r1 = rankings.find((r) => r.rosterId === 1)!;
    const r2 = rankings.find((r) => r.rosterId === 2)!;

    expect(r1.contenderScore).toBe(380);
    expect(r1.starterTotalAvgLockIn).toBe(380);
    expect(r1.starterTotalFpg).toBe(295);
    expect(r1.contenderRank).toBe(1);

    expect(r2.contenderScore).toBe(345);
    expect(r2.starterTotalAvgLockIn).toBe(345);
    expect(r2.starterTotalFpg).toBe(310);
    expect(r2.contenderRank).toBe(2);
  });

  it('normalizes the contender component of overallDynastyPower against a 400-point ceiling', () => {
    const r340 = createMinimalRoster({
      rosterId: 1,
      rosterName: 'At Old Ceiling 340',
      starterTotalAvgLockIn: 340,
      starterTotalFpg: 280,
    });
    const r400 = createMinimalRoster({
      rosterId: 2,
      rosterName: 'At New Ceiling 400',
      starterTotalAvgLockIn: 400,
      starterTotalFpg: 320,
    });
    const r460 = createMinimalRoster({
      rosterId: 3,
      rosterName: 'Above Ceiling 460',
      starterTotalAvgLockIn: 460,
      starterTotalFpg: 360,
    });

    const rosters = [r340, r400, r460];
    const rankings = computeLeaguePowerRankings({
      rosters,
      pickMatrix: createEmptyPickMatrix(rosters),
    });

    // With 0 dynastyCoreScore, 0 youngCoreValue, and 0 draftPickCapital,
    // overallDynastyPower equals contenderComp = min(40, (contenderScore / 400) * 40).
    expect(rankings.find((r) => r.rosterId === 1)!.overallDynastyPower).toBe(34.0);
    expect(rankings.find((r) => r.rosterId === 2)!.overallDynastyPower).toBe(40.0);
    expect(rankings.find((r) => r.rosterId === 3)!.overallDynastyPower).toBe(40.0);
  });

  it('keeps computePlayerDynastyValue unchanged on raw/blended FP/G', () => {
    // Age 23 (1.22x) + Center scarcity (1.12x) on blended FP/G: 0.75 * 32 + 0.25 * 36 = 33.0
    // 33.0 * 1.22 * 1.12 * 2.0 = 90.1824 -> 90.2
    const centerResult = computePlayerDynastyValue({
      actualFpg: 32,
      gamesPlayed: 10,
      projectedFpg: 36,
      age: 23,
      positions: ['C'],
    });

    expect(centerResult.blendedFpg).toBe(33);
    expect(centerResult.ageMultiplier).toBe(1.22);
    expect(centerResult.scarcityMultiplier).toBe(1.12);
    expect(centerResult.dynastyValue).toBe(90.2);

    // Age 27 (1.00x) + non-Center (1.00x) with no projectedFpg -> 30 * 1.0 * 1.0 * 2.0 = 60.0
    const guardResult = computePlayerDynastyValue({
      actualFpg: 30,
      gamesPlayed: 12,
      age: 27,
      positions: ['PG', 'SG'],
    });

    expect(guardResult.blendedFpg).toBe(30);
    expect(guardResult.ageMultiplier).toBe(1.0);
    expect(guardResult.scarcityMultiplier).toBe(1.0);
    expect(guardResult.dynastyValue).toBe(60);
  });

  it('integrates with MbaLeagueEngine.evaluateLeaguePowerRankings using deterministic fixtures', async () => {
    const gateway = new InMemorySleeperGateway(createDeterministicMbaFixtures());
    const stateStore = new InMemoryManagerStateStore();
    const engine = new MbaLeagueEngine({ gateway, stateStore });

    const snapshot = await engine.getLeagueSnapshot();
    const rankings = engine.evaluateLeaguePowerRankings(snapshot);

    expect(rankings).toHaveLength(10);
    for (const ranking of rankings) {
      const roster = snapshot.rosters.find((r) => r.rosterId === ranking.rosterId)!;
      expect(ranking.contenderScore).toBe(roster.starterTotalAvgLockIn);
      expect(ranking.starterTotalAvgLockIn).toBe(roster.starterTotalAvgLockIn);
      expect(ranking.starterTotalFpg).toBe(roster.starterTotalFpg);
    }
  });
});
