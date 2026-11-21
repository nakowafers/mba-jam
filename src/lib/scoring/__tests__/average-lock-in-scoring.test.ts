import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computePlayerLockInHistoryMap,
  computeSeasonMetrics,
} from '../mba-scoring';
import { MbaLeagueEngine } from '../../engine/mba-league-engine';
import { createDeterministicMbaFixtures } from '../../engine/fixtures/mba-fixtures';
import { HttpSleeperGateway } from '../../gateway/http-sleeper-gateway';
import { InMemoryManagerStateStore } from '../../store/manager-state-store';
import { DEFAULT_MBA_SCORING_SETTINGS, SleeperGateway, SleeperMatchup } from '../../types/mba';

function makeMatchup(overrides: Partial<SleeperMatchup> & { roster_id: number }): SleeperMatchup {
  return {
    matchup_id: 1,
    points: 280,
    starters: [],
    starters_points: [],
    players: [],
    players_points: {},
    ...overrides,
  };
}

describe('computePlayerLockInHistoryMap', () => {
  it('averages all non-zero rostered weeks (starter and bench), excludes 0-point DNP weeks, and retains negative scores', () => {
    const historicalMatchups: Record<number, SleeperMatchup[]> = {
      1: [
        makeMatchup({
          roster_id: 1,
          starters: ['p_active', 'p_dnp'],
          players: ['p_active', 'p_dnp', 'p_bench', 'p_neg'],
          players_points: {
            p_active: 52.0,
            p_dnp: 40.0,
            p_bench: 36.0,
            p_neg: 20.0,
          },
        }),
      ],
      2: [
        makeMatchup({
          roster_id: 1,
          starters: ['p_active'],
          players: ['p_active', 'p_dnp', 'p_bench', 'p_neg'],
          players_points: {
            p_active: 48.0,
            p_dnp: 0, // DNP week — must be excluded
            p_bench: 44.0, // Bench non-zero week — must be included
            p_neg: -2.0, // Negative score — must be retained
          },
        }),
      ],
      3: [
        makeMatchup({
          roster_id: 1,
          starters: ['p_active', 'p_dnp'],
          players: ['p_active', 'p_dnp', 'p_bench', 'p_neg'],
          players_points: {
            p_active: 56.0,
            p_dnp: 32.0,
            p_bench: 0, // DNP week on bench — excluded
            p_neg: 12.0,
          },
        }),
      ],
    };

    const history = computePlayerLockInHistoryMap(historicalMatchups);

    // p_active: (52 + 48 + 56) / 3 = 52.0
    expect(history.get('p_active')).toEqual({
      weeksCount: 3,
      totalPoints: 156,
      averagePoints: 52,
    });

    // p_dnp: week 2 is 0 -> excluded -> (40 + 32) / 2 = 36.0
    expect(history.get('p_dnp')).toEqual({
      weeksCount: 2,
      totalPoints: 72,
      averagePoints: 36,
    });

    // p_bench: starter=false in both active weeks, still included -> (36 + 44) / 2 = 40.0
    expect(history.get('p_bench')).toEqual({
      weeksCount: 2,
      totalPoints: 80,
      averagePoints: 40,
    });

    // p_neg: (20 + (-2) + 12) / 3 = 30 / 3 = 10.0
    expect(history.get('p_neg')).toEqual({
      weeksCount: 3,
      totalPoints: 30,
      averagePoints: 10,
    });
  });

  it('deduplicates per (week, playerId) preferring started entry, else higher score', () => {
    const historicalMatchups: Record<number, SleeperMatchup[]> = {
      1: [
        // Player traded mid-week: benched with 45 on roster 1, started with 38 on roster 2 -> prefer started (38)
        makeMatchup({
          roster_id: 1,
          starters: [],
          players: ['p_traded'],
          players_points: { p_traded: 45.0 },
        }),
        makeMatchup({
          roster_id: 2,
          starters: ['p_traded'],
          players: ['p_traded'],
          players_points: { p_traded: 38.0 },
        }),
      ],
      2: [
        // Neither started: roster 1 has 22, roster 2 has 34 -> prefer higher score (34)
        makeMatchup({
          roster_id: 1,
          starters: [],
          players: ['p_traded'],
          players_points: { p_traded: 22.0 },
        }),
        makeMatchup({
          roster_id: 2,
          starters: [],
          players: ['p_traded'],
          players_points: { p_traded: 34.0 },
        }),
      ],
    };

    const history = computePlayerLockInHistoryMap(historicalMatchups);
    // (38 + 34) / 2 = 36.0
    expect(history.get('p_traded')).toEqual({
      weeksCount: 2,
      totalPoints: 72,
      averagePoints: 36,
    });
  });

  it('returns an empty map when historicalMatchups is undefined or empty', () => {
    expect(computePlayerLockInHistoryMap(undefined).size).toBe(0);
    expect(computePlayerLockInHistoryMap({}).size).toBe(0);
  });
});

describe('computeSeasonMetrics with Lock-In history', () => {
  const sampleStats = {
    gp: 10,
    pts: 300, // 150
    reb: 100, // 100
    ast: 50, // 50
    // total = 300 -> 30.0 FP/G
  };

  it('uses SLEEPER_LOCKED average when lockInHistory has >= 1 completed week', () => {
    const metrics = computeSeasonMetrics(sampleStats, DEFAULT_MBA_SCORING_SETTINGS, {
      weeksCount: 4,
      totalPoints: 168.4,
      averagePoints: 42.1,
    });

    expect(metrics.mbaFantasyPointsPerGame).toBe(30);
    expect(metrics.averageLockInPoints).toBe(42.1);
    expect(metrics.lockInWeeksCount).toBe(4);
    expect(metrics.totalLockInPoints).toBe(168.4);
    expect(metrics.lockInAvgSource).toBe('SLEEPER_LOCKED');
  });

  it('falls back to raw FP/G (FALLBACK_FPG) when lockInHistory is missing or has 0 weeks', () => {
    const missing = computeSeasonMetrics(sampleStats, DEFAULT_MBA_SCORING_SETTINGS);
    expect(missing.averageLockInPoints).toBe(30);
    expect(missing.lockInWeeksCount).toBe(0);
    expect(missing.totalLockInPoints).toBe(0);
    expect(missing.lockInAvgSource).toBe('FALLBACK_FPG');

    const zeroWeeks = computeSeasonMetrics(sampleStats, DEFAULT_MBA_SCORING_SETTINGS, {
      weeksCount: 0,
      totalPoints: 0,
      averagePoints: 0,
    });
    expect(zeroWeeks.averageLockInPoints).toBe(30);
    expect(zeroWeeks.lockInWeeksCount).toBe(0);
    expect(zeroWeeks.totalLockInPoints).toBe(0);
    expect(zeroWeeks.lockInAvgSource).toBe('FALLBACK_FPG');
  });
});

function createEngineWithBundle(bundle = createDeterministicMbaFixtures()) {
  const gateway: SleeperGateway = {
    fetchLeagueBundle: async () => bundle,
  };
  return new MbaLeagueEngine({
    gateway,
    stateStore: new InMemoryManagerStateStore(),
  });
}

describe('MbaLeagueEngine — Average Lock-In hydration & deterministic fixtures', () => {
  it('hydrates starterTotalAvgLockIn, averageWeeklyMatchupPoints, and completedWeeksCount from historicalMatchups without including current in-progress week', () => {
    const bundle = createDeterministicMbaFixtures();
    // Override with controlled 2-week historical matchups for exact assertions
    bundle.historicalMatchups = {
      1: [
        makeMatchup({
          roster_id: 1,
          points: 310.0,
          starters: ['2301', '1648', '1967', '2304', '1988', '1739', '1846', '1511', '2580', '4922'],
          players: ['2301', '1648', '1967', '2304', '1988', '1739', '1846', '1511', '2580', '4922'],
          players_points: {
            '2301': 50,
            '1648': 40,
            '1967': 38,
            '2304': 44,
            '1988': 42,
            '1739': 36,
            '1846': 52,
            '1511': 60,
            '2580': 46,
            '4922': 32,
          },
        }),
      ],
      2: [
        makeMatchup({
          roster_id: 1,
          points: 350.0,
          starters: ['2301', '1648', '1967', '2304', '1988', '1739', '1846', '1511', '2580', '4922'],
          players: ['2301', '1648', '1967', '2304', '1988', '1739', '1846', '1511', '2580', '4922'],
          players_points: {
            '2301': 54,
            '1648': 0, // DNP week 2 -> excluded, avg stays 40.0 over 1w
            '1967': 42,
            '2304': 48,
            '1988': 46,
            '1739': 40,
            '1846': 56,
            '1511': 64,
            '2580': 50,
            '4922': 36,
          },
        }),
      ],
    };

    const engine = createEngineWithBundle(bundle);
    const snapshot = engine.buildSnapshotFromBundle(bundle, 1);

    expect(snapshot.completedWeeksCount).toBe(2);

    const roster1 = snapshot.activeRoster;
    // Average weekly matchup points for Roster 1: (310 + 350) / 2 = 330.0
    expect(roster1.averageWeeklyMatchupPoints).toBe(330);

    // Jokic (1511): (60 + 64) / 2 = 62.0 (current week 54.0 is NOT included)
    const jokic = roster1.starterSlots.find((s) => s.playerId === '1511')!;
    expect(jokic.seasonMetrics.averageLockInPoints).toBe(62);
    expect(jokic.seasonMetrics.lockInWeeksCount).toBe(2);
    expect(jokic.seasonMetrics.lockInAvgSource).toBe('SLEEPER_LOCKED');

    // Booker (1648): Week 2 was 0 (DNP) -> only Week 1 (40.0) counts
    const booker = roster1.starterSlots.find((s) => s.playerId === '1648')!;
    expect(booker.seasonMetrics.averageLockInPoints).toBe(40);
    expect(booker.seasonMetrics.lockInWeeksCount).toBe(1);
    expect(booker.seasonMetrics.lockInAvgSource).toBe('SLEEPER_LOCKED');

    // Sum of Starter 10 Avg Lock-In: 52 + 40 + 40 + 46 + 44 + 38 + 54 + 62 + 48 + 34 = 458.0
    expect(roster1.starterTotalAvgLockIn).toBe(458);

    // Roster 2 had no historical matchups in this custom bundle -> averageWeeklyMatchupPoints is null
    const roster2 = snapshot.rosters.find((r) => r.rosterId === 2)!;
    expect(roster2.averageWeeklyMatchupPoints).toBeNull();
  });

  it('sets completedWeeksCount to 0 and averageWeeklyMatchupPoints to null when historicalMatchups is empty', () => {
    const bundle = createDeterministicMbaFixtures();
    bundle.historicalMatchups = {};
    const engine = createEngineWithBundle(bundle);
    const snapshot = engine.buildSnapshotFromBundle(bundle, 1);

    expect(snapshot.completedWeeksCount).toBe(0);
    for (const roster of snapshot.rosters) {
      expect(roster.averageWeeklyMatchupPoints).toBeNull();
      expect(roster.starterTotalAvgLockIn).toBe(roster.starterTotalFpg);
      for (const starter of roster.starterSlots) {
        expect(starter.seasonMetrics.lockInAvgSource).toBe('FALLBACK_FPG');
        expect(starter.seasonMetrics.lockInWeeksCount).toBe(0);
      }
    }
  });

  it('provides 4 completed historical weeks in deterministic fixtures with Lock-In lift, a DNP exclusion, and a 0-week FALLBACK_FPG player', () => {
    const bundle = createDeterministicMbaFixtures();
    const engine = createEngineWithBundle(bundle);
    const snapshot = engine.buildSnapshotFromBundle(bundle, 1);

    expect(snapshot.completedWeeksCount).toBe(4);
    expect(snapshot.activeRoster.averageWeeklyMatchupPoints).not.toBeNull();
    expect(snapshot.activeRoster.starterTotalAvgLockIn).toBeGreaterThan(
      snapshot.activeRoster.starterTotalFpg
    );

    const roster1All = snapshot.activeRoster.allPlayers;
    // At least one active starter has 4 completed weeks with Lock-In lift over FP/G
    const jokic = roster1All.find((p) => p.playerId === '1511')!;
    expect(jokic.seasonMetrics.lockInWeeksCount).toBe(4);
    expect(jokic.seasonMetrics.lockInAvgSource).toBe('SLEEPER_LOCKED');
    expect(jokic.seasonMetrics.averageLockInPoints).toBeGreaterThan(
      jokic.seasonMetrics.mbaFantasyPointsPerGame
    );

    // At least one player had a 0-point DNP week excluded (< 4 weeks, >= 1 week)
    const dnpPlayer = roster1All.find(
      (p) => p.seasonMetrics.lockInAvgSource === 'SLEEPER_LOCKED' && p.seasonMetrics.lockInWeeksCount < 4
    );
    expect(dnpPlayer).toBeDefined();

    // At least one player has 0 completed lock-in weeks and falls back to FP/G
    const fallbackPlayer = roster1All.find(
      (p) => p.seasonMetrics.lockInAvgSource === 'FALLBACK_FPG' && p.seasonMetrics.lockInWeeksCount === 0
    );
    expect(fallbackPlayer).toBeDefined();
    expect(fallbackPlayer!.seasonMetrics.averageLockInPoints).toBe(
      fallbackPlayer!.seasonMetrics.mbaFantasyPointsPerGame
    );
  });
});

describe('HttpSleeperGateway — completed historical matchups fetch & caching', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches completed weeks 1..activeLeg-1 in parallel, caches them, and bypasses cache on forceRefresh', async () => {
    const fixtures = createDeterministicMbaFixtures();
    const matchupFetchCounts: Record<number, number> = {};

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/v1/state/nba')) {
        return new Response(JSON.stringify({ ...fixtures.nbaState, week: 4, leg: 4 }), { status: 200 });
      }
      if (url.endsWith('/v1/league/test-league-cache')) {
        return new Response(JSON.stringify({ ...fixtures.league, league_id: 'test-league-cache' }), { status: 200 });
      }
      if (url.endsWith('/users')) {
        return new Response(JSON.stringify(fixtures.users), { status: 200 });
      }
      if (url.endsWith('/rosters')) {
        return new Response(JSON.stringify(fixtures.rosters), { status: 200 });
      }
      if (url.endsWith('/traded_picks')) {
        return new Response(JSON.stringify(fixtures.tradedPicks), { status: 200 });
      }
      if (url.endsWith('/v1/players/nba')) {
        return new Response(JSON.stringify(fixtures.players), { status: 200 });
      }
      const matchupMatch = /\/matchups\/(\d+)$/.exec(url);
      if (matchupMatch) {
        const leg = Number.parseInt(matchupMatch[1], 10);
        matchupFetchCounts[leg] = (matchupFetchCounts[leg] ?? 0) + 1;
        return new Response(
          JSON.stringify([
            makeMatchup({
              roster_id: 1,
              points: 250 + leg * 10,
              starters: ['1511'],
              players: ['1511'],
              players_points: { '1511': 50 + leg },
            }),
          ]),
          { status: 200 }
        );
      }
      if (url.includes('/transactions/')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes('/stats/nba/') || url.includes('/projections/nba/')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      return new Response('Not Found', { status: 404 });
    });

    const gateway = new HttpSleeperGateway('test-league-cache');

    // First call (leg 4): fetches completed weeks 1, 2, 3 (plus active week 4)
    const bundle1 = await gateway.fetchLeagueBundle();
    expect(Object.keys(bundle1.historicalMatchups ?? {}).sort()).toEqual(['1', '2', '3']);
    expect(bundle1.historicalMatchups?.[1]?.[0]?.points).toBe(260);
    expect(bundle1.historicalMatchups?.[3]?.[0]?.points).toBe(280);
    expect(matchupFetchCounts[1]).toBe(1);
    expect(matchupFetchCounts[2]).toBe(1);
    expect(matchupFetchCounts[3]).toBe(1);

    // Second call (non-forced): weeks 1, 2, 3 served from in-memory cache
    const bundle2 = await gateway.fetchLeagueBundle();
    expect(Object.keys(bundle2.historicalMatchups ?? {}).sort()).toEqual(['1', '2', '3']);
    expect(matchupFetchCounts[1]).toBe(1);
    expect(matchupFetchCounts[2]).toBe(1);
    expect(matchupFetchCounts[3]).toBe(1);

    // Third call (forceRefresh: true): bypasses cache and re-fetches weeks 1, 2, 3
    await gateway.fetchLeagueBundle({ forceRefresh: true });
    expect(matchupFetchCounts[1]).toBe(2);
    expect(matchupFetchCounts[2]).toBe(2);
    expect(matchupFetchCounts[3]).toBe(2);

    // Leg 1 call: returns empty historicalMatchups {}
    const leg1Bundle = await gateway.fetchLeagueBundle({ leg: 1 });
    expect(leg1Bundle.historicalMatchups).toEqual({});

    expect(fetchMock).toHaveBeenCalled();
  });
});
