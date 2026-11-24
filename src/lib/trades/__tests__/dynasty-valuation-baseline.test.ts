import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeterministicMbaFixtures } from '@/lib/engine/fixtures/mba-fixtures';
import { MbaLeagueEngine } from '@/lib/engine/mba-league-engine';
import { HttpSleeperGateway } from '@/lib/gateway/http-sleeper-gateway';
import { InMemorySleeperGateway } from '@/lib/gateway/in-memory-sleeper-gateway';
import { InMemoryManagerStateStore } from '@/lib/store/manager-state-store';
import { SleeperGameStatEntry } from '@/lib/types/mba';

function makeStatEntry(params: {
  playerId: string;
  season: string;
  gp: number;
  fpg: number;
  week?: number | null;
}): SleeperGameStatEntry {
  // Using MBA scoring (reb = 1.0), setting reb = gp * fpg produces exact totalMbaPoints = gp * fpg -> mbaFantasyPointsPerGame = fpg
  return {
    player_id: params.playerId,
    date: null,
    opponent: null,
    game_id: `${params.season}_${params.playerId}`,
    season: params.season,
    week: params.week ?? null,
    team: 'POR',
    stats: params.gp > 0 ? { gp: params.gp, reb: Math.round(params.gp * params.fpg * 100) / 100 } : {},
  };
}

describe('Multi-Season & Projected Dynasty Value Baseline (MbaLeagueEngine seam)', () => {
  it('prices a 0-GP injured player (Shaedon Sharpe profile) from prior-season actuals and full-season projection with BASELINE_ESTIMATE provenance and 0.0 Average Lock-In Score', async () => {
    const fixtures = createDeterministicMbaFixtures();
    const sharpeId = '2476';

    // Put Shaedon Sharpe on Roster #1's IR slot (0 GP in 2026, Out — Knee Surgery)
    fixtures.players[sharpeId] = {
      player_id: sharpeId,
      full_name: 'Shaedon Sharpe',
      first_name: 'Shaedon',
      last_name: 'Sharpe',
      age: 23,
      years_exp: 4,
      position: 'SG',
      fantasy_positions: ['PG', 'SG'],
      team: 'POR',
      injury_status: 'Out',
      injury_notes: 'Knee Surgery',
      active: true,
    };

    const roster1 = fixtures.rosters.find((r) => r.roster_id === 1)!;
    roster1.players = [...(roster1.players ?? []), sharpeId];
    roster1.reserve = [...(roster1.reserve ?? []), sharpeId];

    // 0 GP in 2026 (empty stats), empty weekly projection for Out player
    fixtures.seasonStats.push({
      player_id: sharpeId,
      date: null,
      opponent: null,
      game_id: 'season_2026_2476',
      season: '2026',
      week: null,
      team: 'POR',
      stats: {},
    });
    fixtures.weeklyProjections.push({
      player_id: sharpeId,
      date: '2026-11-18',
      opponent: 'LAL',
      game_id: 'wk_proj_2476',
      season: '2026',
      week: 5,
      team: 'POR',
      stats: {},
    });

    // 2025 prior season: 50 GP, 18.4 MBA FP/G; 2026 full-season projection: 15.7 MBA FP/G
    fixtures.previousSeasonStats = [
      makeStatEntry({ playerId: sharpeId, season: '2025', gp: 50, fpg: 18.4 }),
    ];
    fixtures.seasonProjections = [
      makeStatEntry({ playerId: sharpeId, season: '2026', gp: 1, fpg: 15.7 }),
    ];

    const engine = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(fixtures),
      stateStore: new InMemoryManagerStateStore(),
    });

    const snapshot = await engine.getLeagueSnapshot();
    const sharpe = snapshot.rosters
      .find((r) => r.rosterId === 1)!
      .allPlayers.find((p) => p.playerId === sharpeId)!;

    // priorWeight = min(0.6, 50/50) = 0.6 -> baseline = 0.6*18.4 + 0.4*15.7 = 17.32
    // Age 23 (1.22x), PG/SG (1.0x) -> 17.32 * 1.22 * 1.0 * 2.0 = 42.2608 -> 42.3
    expect(sharpe.dynastyValue).toBe(42.3);
    expect(sharpe.dynastyValueSource).toBe('BASELINE_ESTIMATE');
    expect(sharpe.dynastyValueBasisNote).toContain('0 GP');
    expect(sharpe.dynastyValueBasisNote).toContain('18.4');
    expect(sharpe.dynastyValueBasisNote).toContain('15.7');

    // Axis 2 remains strictly current-season (0.0 for 0-GP injured player)
    expect(sharpe.seasonMetrics.gamesPlayed).toBe(0);
    expect(sharpe.seasonMetrics.mbaFantasyPointsPerGame).toBe(0);
    expect(sharpe.seasonMetrics.averageLockInPoints).toBe(0);
  });

  it('weights full-season projections higher for a 0-GP player with a small prior-season sample (Dereck Lively II profile)', async () => {
    const fixtures = createDeterministicMbaFixtures();
    const livelyId = 'lively_22';

    fixtures.players[livelyId] = {
      player_id: livelyId,
      full_name: 'Dereck Lively II',
      first_name: 'Dereck',
      last_name: 'Lively II',
      age: 22,
      years_exp: 3,
      position: 'C',
      fantasy_positions: ['C'],
      team: 'DAL',
      injury_status: 'Out',
      injury_notes: 'Ankle',
      active: true,
    };

    const roster1 = fixtures.rosters.find((r) => r.roster_id === 1)!;
    roster1.players = [...(roster1.players ?? []), livelyId];
    roster1.reserve = [...(roster1.reserve ?? []), livelyId];

    // 0 GP in 2026; 7 GP at 12.1 FP/G in 2025; 17.0 FP/G 2026 season projection
    fixtures.seasonStats.push(makeStatEntry({ playerId: livelyId, season: '2026', gp: 0, fpg: 0 }));
    fixtures.previousSeasonStats = [
      makeStatEntry({ playerId: livelyId, season: '2025', gp: 7, fpg: 12.1 }),
    ];
    fixtures.seasonProjections = [
      makeStatEntry({ playerId: livelyId, season: '2026', gp: 1, fpg: 17.0 }),
    ];

    const engine = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(fixtures),
      stateStore: new InMemoryManagerStateStore(),
    });

    const snapshot = await engine.getLeagueSnapshot();
    const lively = snapshot.rosters
      .find((r) => r.rosterId === 1)!
      .allPlayers.find((p) => p.playerId === livelyId)!;

    // priorWeight = min(0.6, 7/50) = 0.14 -> baseline = 0.14*12.1 + 0.86*17.0 = 16.314 -> 16.31
    // Age 22 (1.22x), C (1.12x) -> 16.31 * 1.22 * 1.12 * 2.0 = 44.57 -> 44.6
    expect(lively.dynastyValue).toBe(44.6);
    expect(lively.dynastyValueSource).toBe('BASELINE_ESTIMATE');
    expect(lively.dynastyValueBasisNote).toContain('7 GP');
    expect(lively.seasonMetrics.averageLockInPoints).toBe(0);
  });

  it('anchors a 1-GP negative injury-exit outlier (Kon Knueppel profile) near baseline with SMALL_SAMPLE_BLENDED provenance', async () => {
    const fixtures = createDeterministicMbaFixtures();
    const knueppelId = 'knueppel_21';

    fixtures.players[knueppelId] = {
      player_id: knueppelId,
      full_name: 'Kon Knueppel',
      first_name: 'Kon',
      last_name: 'Knueppel',
      age: 21,
      years_exp: 2,
      position: 'SG',
      fantasy_positions: ['SG', 'SF'],
      team: 'CHA',
      injury_status: 'Out',
      injury_notes: 'Foot',
      active: true,
    };

    const roster1 = fixtures.rosters.find((r) => r.roster_id === 1)!;
    roster1.players = [...(roster1.players ?? []), knueppelId];
    roster1.reserve = [...(roster1.reserve ?? []), knueppelId];

    // 1 GP with -0.5 FP/G in 2026 (1 pt = +0.5, 1 to = -1.0 -> -0.5); 81 GP at 19.6 FP/G in 2025; 21.3 season proj
    fixtures.seasonStats.push({
      player_id: knueppelId,
      date: null,
      opponent: null,
      game_id: 'season_2026_knueppel',
      season: '2026',
      week: null,
      team: 'CHA',
      stats: { gp: 1, pts: 1, to: 1 },
    });
    fixtures.previousSeasonStats = [
      makeStatEntry({ playerId: knueppelId, season: '2025', gp: 81, fpg: 19.6 }),
    ];
    fixtures.seasonProjections = [
      makeStatEntry({ playerId: knueppelId, season: '2026', gp: 1, fpg: 21.3 }),
    ];

    const engine = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(fixtures),
      stateStore: new InMemoryManagerStateStore(),
    });

    const snapshot = await engine.getLeagueSnapshot();
    const knueppel = snapshot.rosters
      .find((r) => r.rosterId === 1)!
      .allPlayers.find((p) => p.playerId === knueppelId)!;

    // baseline = 0.6*19.6 + 0.4*21.3 = 20.28
    // sampleWeight = 1/10 = 0.1 -> actualWeight = 0.075
    // blended = 0.075*(-0.5) + 0.925*20.28 = 18.7215 -> 18.72
    // Age 21 (1.22x), SG/SF (1.0x) -> 18.72 * 1.22 * 2.0 = 45.6768 -> 45.7
    expect(knueppel.dynastyValue).toBe(45.7);
    expect(knueppel.dynastyValueSource).toBe('SMALL_SAMPLE_BLENDED');
    expect(knueppel.dynastyValueBasisNote).toContain('1 GP');
    expect(knueppel.dynastyValueBasisNote).toContain('19.6');
    expect(knueppel.dynastyValueBasisNote).toContain('21.3');
  });

  it('converges 10+ GP players to 75/25 ACTUAL_ESTABLISHED with null basis note, prefers full-season projections when present, and ignores empty weekly projection statlines', async () => {
    const fixtures = createDeterministicMbaFixtures();
    const jokicId = Object.values(fixtures.players).find((p) => p.full_name === 'Nikola Jokic')!
      .player_id;
    // Nikola Jokic has 10 GP, 43.8 actual FP/G, age 31 (0.72x), C (1.12x)
    // Add an empty weekly projection entry stats: {} alongside Jokic's existing 43.0 weekly projection
    fixtures.weeklyProjections.push({
      player_id: jokicId,
      date: '2026-11-22',
      opponent: 'UTA',
      game_id: 'empty_proj_jokic',
      season: '2026',
      week: 5,
      team: 'DEN',
      stats: {},
    });

    const engineWithoutSeasonProj = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(fixtures),
      stateStore: new InMemoryManagerStateStore(),
    });
    const snapFallback = await engineWithoutSeasonProj.getLeagueSnapshot();
    const jokicFallback = snapFallback.activeRoster.starterSlots.find(
      (s) => s.playerId === jokicId
    )!;

    // Empty stats: {} entry is ignored -> weekly projectedFpg stays 43.0 -> blended = 0.75*43.8 + 0.25*43.0 = 43.6 -> 70.3
    expect(jokicFallback.dynastyValue).toBe(70.3);
    expect(jokicFallback.dynastyValueSource).toBe('ACTUAL_ESTABLISHED');
    expect(jokicFallback.dynastyValueBasisNote).toBeNull();

    // Now supply a full-season projection (47.0 FP/G) for Jokic: it must supersede weekly projections
    fixtures.seasonProjections = [
      makeStatEntry({ playerId: jokicId, season: '2026', gp: 1, fpg: 47.0 }),
    ];
    const engineWithSeasonProj = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(fixtures),
      stateStore: new InMemoryManagerStateStore(),
    });
    const snapSeasonProj = await engineWithSeasonProj.getLeagueSnapshot();
    const jokicSeasonProj = snapSeasonProj.activeRoster.starterSlots.find(
      (s) => s.playerId === jokicId
    )!;

    // 0.75 * 43.8 + 0.25 * 47.0 = 44.6 -> 44.6 * 0.72 * 1.12 * 2.0 = 71.93088 -> 71.9
    expect(jokicSeasonProj.dynastyValue).toBe(71.9);
    expect(jokicSeasonProj.dynastyValueSource).toBe('ACTUAL_ESTABLISHED');
    expect(jokicSeasonProj.dynastyValueBasisNote).toBeNull();
  });

  it('propagates baseline Dynasty Value, provenance, and 0.0 Avg Lock-In through evaluateTrade and gradeHistoricalTrades, including Replacement Cut Assets', async () => {
    const fixtures = createDeterministicMbaFixtures();
    const sharpeId = '2476';

    fixtures.players[sharpeId] = {
      player_id: sharpeId,
      full_name: 'Shaedon Sharpe',
      first_name: 'Shaedon',
      last_name: 'Sharpe',
      age: 23,
      years_exp: 4,
      position: 'SG',
      fantasy_positions: ['PG', 'SG'],
      team: 'POR',
      injury_status: 'Out',
      injury_notes: 'Knee Surgery',
      active: true,
    };

    const roster1 = fixtures.rosters.find((r) => r.roster_id === 1)!;
    const roster2 = fixtures.rosters.find((r) => r.roster_id === 2)!;
    roster1.players = [...(roster1.players ?? []), sharpeId];
    // Put Sharpe on Bench (not IR) so we can also test Replacement Cut Asset accounting on Roster #1
    fixtures.seasonStats.push(makeStatEntry({ playerId: sharpeId, season: '2026', gp: 0, fpg: 0 }));
    fixtures.previousSeasonStats = [
      makeStatEntry({ playerId: sharpeId, season: '2025', gp: 50, fpg: 18.4 }),
    ];
    fixtures.seasonProjections = [
      makeStatEntry({ playerId: sharpeId, season: '2026', gp: 1, fpg: 15.7 }),
    ];

    // Add a completed historical trade involving Sharpe
    const r2BenchPlayerId = roster2.players!.find((pid) => !(roster2.starters ?? []).includes(pid))!;
    fixtures.transactions = [
      ...(fixtures.transactions ?? []),
      {
        transaction_id: 'tx_sharpe_baseline_test',
        type: 'trade',
        status: 'complete',
        created: 1763500000000,
        leg: 5,
        roster_ids: [1, 2],
        adds: { [sharpeId]: 2, [r2BenchPlayerId]: 1 },
        drops: { [sharpeId]: 1, [r2BenchPlayerId]: 2 },
        draft_picks: [],
        season: '2026',
        league_id: fixtures.league.league_id,
      },
    ];

    const engine = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(fixtures),
      stateStore: new InMemoryManagerStateStore(),
    });
    const snapshot = await engine.getLeagueSnapshot();

    // Evaluate trade sending 0-GP Shaedon Sharpe (42.3) from Roster #1 to Roster #2 for a draft pick
    const evalResult = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPlayerIds: [sharpeId],
            incomingPickIds: ['2026-r1-orig-2'],
          },
          {
            rosterId: 2,
            outgoingPickIds: ['2026-r1-orig-2'],
            incomingPlayerIds: [sharpeId],
          },
        ],
      },
      snapshot
    );

    const side2 = evalResult.participants.find((p) => p.rosterId === 2)!;
    const incomingSharpe = side2.incomingPlayers.find((p) => p.playerId === sharpeId)!;
    expect(incomingSharpe.dynastyValue).toBe(42.3);
    expect(incomingSharpe.dynastyValueSource).toBe('BASELINE_ESTIMATE');
    expect(incomingSharpe.dynastyValueBasisNote).toContain('0 GP');
    expect(incomingSharpe.avgLockIn).toBe(0);
    // Axis 2: adding a 0-GP player does not increase Roster #2's optimal Starting 10 Avg Lock-In
    expect(side2.starting10DeltaAvgLockIn).toBe(0);
    // Axis 1: Roster #2 receives 42.3 raw Dynasty Value (not 0.0)
    expect(side2.rawIncomingDynastyValue).toBe(42.3);

    // Historical trade grading also propagates provenance and baseline Dynasty Value
    const historicalTrades = engine.gradeHistoricalTrades({ season: '2026' }, snapshot);
    const sharpeTrade = historicalTrades.find((t) => t.transactionId === 'tx_sharpe_baseline_test')!;
    const histSide2 = sharpeTrade.participants.find((p) => p.rosterId === 2)!;
    const histSharpe = histSide2.incomingPlayers.find((p) => p.playerId === sharpeId)!;
    expect(histSharpe.dynastyValue).toBe(42.3);
    expect(histSharpe.dynastyValueSource).toBe('BASELINE_ESTIMATE');
    expect(histSharpe.dynastyValueBasisNote).toContain('0 GP');
  });

  it('reflects baseline Dynasty Values in Consolidation Premium and Replacement Cut Asset selection for uneven trades', async () => {
    const fixtures = createDeterministicMbaFixtures();
    const injuredStarId = 'injured_star_c';
    const injuredBenchId = 'injured_bench_g';
    const lowValueBenchId = 'low_val_bench';

    fixtures.players[injuredStarId] = {
      player_id: injuredStarId,
      full_name: 'Injured Cornerstone',
      first_name: 'Injured',
      last_name: 'Cornerstone',
      age: 23,
      years_exp: 3,
      position: 'C',
      fantasy_positions: ['C'],
      team: 'OKC',
      injury_status: 'Out',
      injury_notes: 'Hip',
      active: true,
    };
    fixtures.players[injuredBenchId] = {
      player_id: injuredBenchId,
      full_name: 'Shaedon Sharpe',
      first_name: 'Shaedon',
      last_name: 'Sharpe',
      age: 23,
      years_exp: 4,
      position: 'SG',
      fantasy_positions: ['PG', 'SG'],
      team: 'POR',
      injury_status: 'Out',
      injury_notes: 'Knee',
      active: true,
    };
    fixtures.players[lowValueBenchId] = {
      player_id: lowValueBenchId,
      full_name: 'End Of Bench Vet',
      first_name: 'End',
      last_name: 'Vet',
      age: 34,
      years_exp: 12,
      position: 'PF',
      fantasy_positions: ['PF'],
      team: 'WAS',
      injury_status: null,
      injury_notes: null,
      active: true,
    };

    const roster1 = fixtures.rosters.find((r) => r.roster_id === 1)!;
    const roster2 = fixtures.rosters.find((r) => r.roster_id === 2)!;
    roster1.players = [...(roster1.players ?? []), injuredBenchId, lowValueBenchId];
    roster2.players = [...(roster2.players ?? []), injuredStarId];

    // Both injured players have 0 GP in 2026; lowValueBenchId has 12 GP at 8.0 FP/G (~10.4 Dynasty Value)
    fixtures.seasonStats.push(
      makeStatEntry({ playerId: injuredStarId, season: '2026', gp: 0, fpg: 0 }),
      makeStatEntry({ playerId: injuredBenchId, season: '2026', gp: 0, fpg: 0 }),
      makeStatEntry({ playerId: lowValueBenchId, season: '2026', gp: 12, fpg: 8.0 })
    );
    fixtures.previousSeasonStats = [
      makeStatEntry({ playerId: injuredStarId, season: '2025', gp: 65, fpg: 30.0 }),
      makeStatEntry({ playerId: injuredBenchId, season: '2025', gp: 50, fpg: 18.4 }),
    ];
    fixtures.seasonProjections = [
      makeStatEntry({ playerId: injuredStarId, season: '2026', gp: 1, fpg: 30.0 }),
      makeStatEntry({ playerId: injuredBenchId, season: '2026', gp: 1, fpg: 15.7 }),
    ];

    const engine = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(fixtures),
      stateStore: new InMemoryManagerStateStore(),
    });
    const snapshot = await engine.getLeagueSnapshot();

    // Roster #2 sends injuredStarId (baseline 30.0, age 23, C -> 82.0 >= 65) + a bench player to Roster #1 for 1 player from Roster #1
    const r1Outgoing = roster1.starters![1];
    const r2Extra = roster2.players!.find(
      (pid) => pid !== injuredStarId && !(roster2.starters ?? []).includes(pid)
    )!;

    const evalResult = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPlayerIds: [r1Outgoing],
            incomingPlayerIds: [injuredStarId, r2Extra],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [injuredStarId, r2Extra],
            incomingPlayerIds: [r1Outgoing],
          },
        ],
      },
      snapshot
    );

    const side1 = evalResult.participants.find((p) => p.rosterId === 1)!;
    // Injured cornerstone (82.0) earns Consolidation Premium (> 0)
    const starAsset = side1.incomingPlayers.find((p) => p.playerId === injuredStarId)!;
    expect(starAsset.dynastyValue).toBe(82.0);
    expect(starAsset.consolidationPremium).toBeGreaterThan(0);

    // Roster #1 absorbs +1 player -> must cut lowValueBenchId (~10.4), NOT 0-GP injuredBenchId (42.3)
    expect(side1.replacementCutAssets).toHaveLength(1);
    expect(side1.replacementCutAssets[0].playerId).toBe(lowValueBenchId);
    expect(side1.replacementCutAssets[0].playerId).not.toBe(injuredBenchId);
  });

  it('reflects baseline Dynasty Values in Power Rankings Dynasty Core Score and Young Core Value without inflating Contender Score', async () => {
    const baseFixtures = createDeterministicMbaFixtures();
    const sharpeId = '2476';

    baseFixtures.players[sharpeId] = {
      player_id: sharpeId,
      full_name: 'Shaedon Sharpe',
      first_name: 'Shaedon',
      last_name: 'Sharpe',
      age: 23,
      years_exp: 4,
      position: 'SG',
      fantasy_positions: ['PG', 'SG'],
      team: 'POR',
      injury_status: 'Out',
      injury_notes: 'Knee Surgery',
      active: true,
    };
    const r3Base = baseFixtures.rosters.find((r) => r.roster_id === 3)!;
    r3Base.players = [...(r3Base.players ?? []), sharpeId];
    r3Base.reserve = [...(r3Base.reserve ?? []), sharpeId];
    baseFixtures.seasonStats.push(makeStatEntry({ playerId: sharpeId, season: '2026', gp: 0, fpg: 0 }));

    // Snapshot A: without prior-season / season-projection baseline (Sharpe is 0.0)
    const engineWithoutBaseline = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(structuredClone(baseFixtures)),
      stateStore: new InMemoryManagerStateStore(),
    });
    const snapWithout = await engineWithoutBaseline.getLeagueSnapshot();
    const rankingsWithout = engineWithoutBaseline.evaluateLeaguePowerRankings(snapWithout);
    const r3Without = rankingsWithout.find((r) => r.rosterId === 3)!;

    // Snapshot B: with prior-season + season-projection baseline (Sharpe is 42.3, age 23 < 25)
    const withBaselineFixtures = structuredClone(baseFixtures);
    withBaselineFixtures.previousSeasonStats = [
      makeStatEntry({ playerId: sharpeId, season: '2025', gp: 50, fpg: 18.4 }),
    ];
    withBaselineFixtures.seasonProjections = [
      makeStatEntry({ playerId: sharpeId, season: '2026', gp: 1, fpg: 15.7 }),
    ];

    const engineWithBaseline = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(withBaselineFixtures),
      stateStore: new InMemoryManagerStateStore(),
    });
    const snapWith = await engineWithBaseline.getLeagueSnapshot();
    const rankingsWith = engineWithBaseline.evaluateLeaguePowerRankings(snapWith);
    const r3With = rankingsWith.find((r) => r.rosterId === 3)!;

    // Young Core Value increases by exactly +42.3
    expect(Math.round((r3With.youngCoreValue - r3Without.youngCoreValue) * 10) / 10).toBe(42.3);
    // Dynasty Core Score increases (or stays >=) when Sharpe enters Top 10
    expect(r3With.dynastyCoreScore).toBeGreaterThanOrEqual(r3Without.dynastyCoreScore);
    // Contender Score (Starting 10 Avg Lock-In) is completely unchanged
    expect(r3With.contenderScore).toBe(r3Without.contenderScore);
  });
});

describe('HttpSleeperGateway — Prior-Season Stats & Season Projections', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockFetch(options: {
    failPreviousSeasonStats?: boolean;
    failSeasonProjections?: boolean;
    previousSeasonTag?: string;
  } = {}) {
    const fixtures = createDeterministicMbaFixtures();
    const season = options.previousSeasonTag
      ? String(Number(options.previousSeasonTag) + 1)
      : '2026';
    const prevSeason = options.previousSeasonTag ?? '2025';
    fixtures.league.season = season;
    fixtures.nbaState.season = season;
    fixtures.nbaState.leg = 1;
    fixtures.league.settings.leg = 1;

    const rosteredPlayerId = fixtures.rosters[0].players![0];
    const unrosteredPlayerId = 'unrostered_999999';

    const previousSeasonPayload: SleeperGameStatEntry[] = [
      makeStatEntry({ playerId: rosteredPlayerId, season: prevSeason, gp: 50, fpg: 18.4 }),
      makeStatEntry({ playerId: unrosteredPlayerId, season: prevSeason, gp: 40, fpg: 12.0 }),
    ];
    const seasonProjectionsPayload: SleeperGameStatEntry[] = [
      makeStatEntry({ playerId: rosteredPlayerId, season, gp: 1, fpg: 15.7 }),
      makeStatEntry({ playerId: unrosteredPlayerId, season, gp: 1, fpg: 11.0 }),
    ];

    const prevStatsUrl = `https://api.sleeper.com/stats/nba/${prevSeason}?season_type=regular`;
    const seasonProjUrl = `https://api.sleeper.com/projections/nba/${season}?season_type=regular`;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const okJson = (data: unknown) =>
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      if (url === prevStatsUrl) {
        if (options.failPreviousSeasonStats) {
          return new Response('Upstream error', { status: 503 });
        }
        return okJson(previousSeasonPayload);
      }
      if (url === seasonProjUrl) {
        if (options.failSeasonProjections) {
          return new Response('Upstream error', { status: 503 });
        }
        return okJson(seasonProjectionsPayload);
      }
      if (url.endsWith('/v1/state/nba')) return okJson(fixtures.nbaState);
      if (url.endsWith(`/v1/league/${fixtures.league.league_id}`)) return okJson(fixtures.league);
      if (url.endsWith('/users')) return okJson(fixtures.users);
      if (url.endsWith('/rosters')) return okJson(fixtures.rosters);
      if (url.endsWith('/traded_picks')) return okJson(fixtures.tradedPicks);
      if (url.includes('/matchups/')) return okJson(fixtures.matchups);
      if (url.includes('/transactions/')) return okJson([]);
      if (url.endsWith('/v1/players/nba')) return okJson(fixtures.players);
      if (url.includes(`/stats/nba/${season}?`)) return okJson(fixtures.seasonStats);
      if (url.includes(`/stats/nba/${season}/`)) return okJson(fixtures.weeklyStats);
      if (url.includes(`/projections/nba/${season}/`)) return okJson(fixtures.weeklyProjections);

      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, prevStatsUrl, seasonProjUrl, rosteredPlayerId, unrosteredPlayerId };
  }

  it('fetches prior-season stats and full-season projections, prunes to hydrated players, and caches prior-season stats in server memory', async () => {
    // Use a distinct prior season year ('2023' -> season '2024') to isolate module cache in this test
    const { fetchMock, prevStatsUrl, rosteredPlayerId, unrosteredPlayerId } = createMockFetch({
      previousSeasonTag: '2023',
    });

    const gateway = new HttpSleeperGateway();
    const bundle1 = await gateway.fetchLeagueBundle();

    expect(bundle1.previousSeasonStats).toBeDefined();
    expect(bundle1.previousSeasonStats!.map((e) => e.player_id)).toContain(rosteredPlayerId);
    expect(bundle1.previousSeasonStats!.map((e) => e.player_id)).not.toContain(unrosteredPlayerId);

    expect(bundle1.seasonProjections).toBeDefined();
    expect(bundle1.seasonProjections!.map((e) => e.player_id)).toContain(rosteredPlayerId);
    expect(bundle1.seasonProjections!.map((e) => e.player_id)).not.toContain(unrosteredPlayerId);

    // Second fetch without forceRefresh should hit server-memory cache for prior-season stats
    await gateway.fetchLeagueBundle();
    const prevStatsCalls = fetchMock.mock.calls.filter(([u]) => String(u) === prevStatsUrl);
    expect(prevStatsCalls).toHaveLength(1);
  });

  it('degrades gracefully to empty arrays when prior-season stats or season projections endpoints fail', async () => {
    // Use another distinct prior season year ('2022' -> season '2023') so cache is empty
    createMockFetch({
      previousSeasonTag: '2022',
      failPreviousSeasonStats: true,
      failSeasonProjections: true,
    });

    const gateway = new HttpSleeperGateway();
    const bundle = await gateway.fetchLeagueBundle();

    expect(bundle.previousSeasonStats).toEqual([]);
    expect(bundle.seasonProjections).toEqual([]);
    expect(bundle.rosters.length).toBeGreaterThan(0);
  });
});
