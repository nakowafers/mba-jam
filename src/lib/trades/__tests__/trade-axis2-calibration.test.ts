import { describe, expect, it } from 'vitest';
import { createDeterministicMbaFixtures } from '@/lib/engine/fixtures/mba-fixtures';
import { MbaLeagueEngine } from '@/lib/engine/mba-league-engine';
import { InMemorySleeperGateway } from '@/lib/gateway/in-memory-sleeper-gateway';
import { InMemoryManagerStateStore } from '@/lib/store/manager-state-store';

function createEngine() {
  const fixtures = createDeterministicMbaFixtures();
  const gateway = new InMemorySleeperGateway(fixtures);
  const stateStore = new InMemoryManagerStateStore();
  return {
    fixtures,
    engine: new MbaLeagueEngine({ gateway, stateStore }),
  };
}

describe('Axis 2 & Grade Calibration (#18) — MbaLeagueEngine Seam', () => {
  it('applies asset-anchored Trade Grade cutoffs (B within ±5.5, A+ >= 32.0, F < -48.0) and soft-compresses extreme Axis 2 swings beyond ±14.0 at 0.5x slope', async () => {
    const { engine } = createEngine();
    const snapshot = await engine.getLeagueSnapshot();

    const r1 = snapshot.rosters.find((r) => r.rosterId === 1)!;
    const r2 = snapshot.rosters.find((r) => r.rosterId === 2)!;

    // Equalize ages to avoid triggering age shift, keep both starters comfortably in Starting 10
    const p1 = r1.starterSlots[1]; // SG on Roster #1
    const p2 = r2.starterSlots[1]; // SG on Roster #2
    p1.age = 26;
    p2.age = 26;

    // 1. Dead-even lateral swap -> compositeScore = 0 -> B (within [-5.5, +5.5))
    p1.dynastyValue = 50.0;
    p2.dynastyValue = 50.0;
    p1.seasonMetrics.averageLockInPoints = 45.0;
    p2.seasonMetrics.averageLockInPoints = 45.0;

    const evenEval = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 1, outgoingPlayerIds: [p1.playerId], incomingPlayerIds: [p2.playerId] },
          { rosterId: 2, outgoingPlayerIds: [p2.playerId], incomingPlayerIds: [p1.playerId] },
        ],
      },
      snapshot
    );
    expect(evenEval.participants[0].compositeGradeScore).toBe(0);
    expect(evenEval.participants[0].letterGrade).toBe('B');
    expect(evenEval.participants[1].letterGrade).toBe('B');

    // 2. Boundary checks via Axis 1 differential (with starting10DeltaAvgLockIn = 0):
    // +5.0 -> B (was B+ under old >= 3.5 cutoff)
    // +5.5 -> B+
    // +12.5 -> A-
    // +21.0 -> A (not A+ like old >= 22)
    // +32.0 -> A+
    // -5.5 -> B
    // -5.6 -> B-
    // -12.6 -> C+
    // -20.1 -> C
    // -28.1 -> C-
    // -37.1 -> D
    // -48.1 -> F
    const checkGradeAtDvDelta = (inDv: number, outDv: number, expectedGrade: string) => {
      p1.dynastyValue = outDv;
      p2.dynastyValue = inDv;
      const res = engine.evaluateTrade(
        {
          participants: [
            { rosterId: 1, outgoingPlayerIds: [p1.playerId], incomingPlayerIds: [p2.playerId] },
            { rosterId: 2, outgoingPlayerIds: [p2.playerId], incomingPlayerIds: [p1.playerId] },
          ],
        },
        snapshot
      );
      const side1 = res.participants.find((p) => p.rosterId === 1)!;
      expect(side1.letterGrade).toBe(expectedGrade);
    };

    checkGradeAtDvDelta(55.0, 50.0, 'B');
    checkGradeAtDvDelta(55.5, 50.0, 'B+');
    checkGradeAtDvDelta(57.5, 45.0, 'A-');
    checkGradeAtDvDelta(57.0, 36.0, 'A');
    checkGradeAtDvDelta(57.0, 25.0, 'A+');
    checkGradeAtDvDelta(44.5, 50.0, 'B');
    checkGradeAtDvDelta(44.4, 50.0, 'B-');
    checkGradeAtDvDelta(37.4, 50.0, 'C+');
    checkGradeAtDvDelta(29.9, 50.0, 'C');
    checkGradeAtDvDelta(21.9, 50.0, 'C-');
    checkGradeAtDvDelta(12.9, 50.0, 'D');
    checkGradeAtDvDelta(1.9, 50.0, 'F');

    // 3. Soft-compression beyond ±14.0 Starting 10 Avg Lock-In delta:
    // Swap equal-DV (50.0) SG starters where Roster #1 gains +20.0 Avg Lock-In (45 -> 65)
    // effectiveLiDelta = 14.0 + (20.0 - 14.0) * 0.5 = 17.0
    // Roster #1 (top-5 contender, 2.2x) -> 17.0 * 2.2 = +37.4 (A+)
    // Roster #2 (non-focus negative, 1.5x) -> -17.0 * 1.5 = -25.5 (C)
    p1.dynastyValue = 50.0;
    p2.dynastyValue = 50.0;
    p1.seasonMetrics.averageLockInPoints = 45.0;
    p2.seasonMetrics.averageLockInPoints = 65.0;

    const swingEval = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 1, outgoingPlayerIds: [p1.playerId], incomingPlayerIds: [p2.playerId] },
          { rosterId: 2, outgoingPlayerIds: [p2.playerId], incomingPlayerIds: [p1.playerId] },
        ],
      },
      snapshot
    );
    const swing1 = swingEval.participants.find((p) => p.rosterId === 1)!;
    const swing2 = swingEval.participants.find((p) => p.rosterId === 2)!;

    expect(swing1.starting10DeltaAvgLockIn).toBe(20.0);
    expect(swing1.compositeGradeScore).toBe(37.4);
    expect(swing1.letterGrade).toBe('A+');

    expect(swing2.starting10DeltaAvgLockIn).toBe(-20.0);
    expect(swing2.compositeGradeScore).toBe(-25.5);
    expect(swing2.letterGrade).toBe('C');
  });

  it('applies 2.2x Win-Now Boost in LIVE mode when a non-contender vaults into the top-5 optimal Starting 10 Avg Lock-In (1.5x if staying outside top-5), and uses neutral 1.65x in HISTORICAL mode', async () => {
    const { engine } = createEngine();
    const snapshot = await engine.getLeagueSnapshot();

    // Rank all 10 rosters by pre-trade optimal Starting 10 Avg Lock-In to inspect the #6 roster
    const { solveOptimalStarting10Lineup } = await import('@/lib/trades/trade-analyzer');
    const rankedByOptimal = [...snapshot.rosters]
      .map((r) => ({
        roster: r,
        optimalLi: solveOptimalStarting10Lineup(r.allPlayers).totalAvgLockIn,
      }))
      .sort((a, b) => b.optimalLi - a.optimalLi);

    const top5Threshold = rankedByOptimal[4].optimalLi;
    const rankings = engine.evaluateLeaguePowerRankings(snapshot);
    const rank6 = rankedByOptimal[5];
    const rank6Archetype = rankings.find((rk) => rk.rosterId === rank6.roster.rosterId)?.archetype;
    expect(rank6Archetype).not.toBe('Title Favorite');
    expect(rank6Archetype).not.toBe('Young Juggernaut');

    const underdog = rank6.roster;
    const partner = rankedByOptimal[0].roster; // #1 contender

    // Equalize Dynasty Value and ages on two SG starters so Axis 1 delta = 0
    const underdogSg = underdog.starterSlots[1];
    const partnerSg = partner.starterSlots[1];
    underdogSg.age = 26;
    partnerSg.age = 26;
    underdogSg.dynastyValue = 50.0;
    partnerSg.dynastyValue = 50.0;

    // Case A: Small +0.4 Avg Lock-In gain keeps #6 underdog BELOW top5Threshold (gap is 0.7) -> 1.5x in LIVE
    const baseLi = underdogSg.seasonMetrics.averageLockInPoints;
    const gapToTop5 = Math.round((top5Threshold - rank6.optimalLi) * 10) / 10;
    expect(gapToTop5).toBeGreaterThan(0.4);

    partnerSg.seasonMetrics.averageLockInPoints = baseLi + 0.4;

    const nonVaultLive = engine.evaluateTrade(
      {
        evaluationMode: 'LIVE',
        participants: [
          { rosterId: underdog.rosterId, outgoingPlayerIds: [underdogSg.playerId], incomingPlayerIds: [partnerSg.playerId] },
          { rosterId: partner.rosterId, outgoingPlayerIds: [partnerSg.playerId], incomingPlayerIds: [underdogSg.playerId] },
        ],
      },
      snapshot
    );
    const nonVaultSide = nonVaultLive.participants.find((p) => p.rosterId === underdog.rosterId)!;
    expect(nonVaultSide.postTradeOptimalStarterAvgLockIn).toBeLessThan(top5Threshold);
    expect(nonVaultSide.starting10DeltaAvgLockIn).toBe(0.4);
    // 0 + 0.4 * 1.5 = 0.6 (NOT 0.4 * 2.2 = 0.9)
    expect(nonVaultSide.compositeGradeScore).toBe(0.6);

    // Case B: +5.0 Avg Lock-In upgrade vaults #6 underdog INTO top-5 -> 2.2x Win-Now Boost in LIVE
    partnerSg.seasonMetrics.averageLockInPoints = baseLi + 5.0;

    const vaultLive = engine.evaluateTrade(
      {
        evaluationMode: 'LIVE',
        participants: [
          { rosterId: underdog.rosterId, outgoingPlayerIds: [underdogSg.playerId], incomingPlayerIds: [partnerSg.playerId] },
          { rosterId: partner.rosterId, outgoingPlayerIds: [partnerSg.playerId], incomingPlayerIds: [underdogSg.playerId] },
        ],
      },
      snapshot
    );
    const vaultSideLive = vaultLive.participants.find((p) => p.rosterId === underdog.rosterId)!;
    expect(vaultSideLive.preTradeOptimalStarterAvgLockIn).toBeLessThan(top5Threshold);
    expect(vaultSideLive.postTradeOptimalStarterAvgLockIn).toBeGreaterThanOrEqual(top5Threshold);
    expect(vaultSideLive.starting10DeltaAvgLockIn).toBe(5.0);
    // 0 + 5.0 * 2.2 = 11.0
    expect(vaultSideLive.compositeGradeScore).toBe(11.0);

    // Case C: Exact same vaulting trade in HISTORICAL mode uses neutral 1.65x (not 2.2x)
    const vaultHistorical = engine.evaluateTrade(
      {
        evaluationMode: 'HISTORICAL',
        participants: [
          { rosterId: underdog.rosterId, outgoingPlayerIds: [underdogSg.playerId], incomingPlayerIds: [partnerSg.playerId] },
          { rosterId: partner.rosterId, outgoingPlayerIds: [partnerSg.playerId], incomingPlayerIds: [underdogSg.playerId] },
        ],
      },
      snapshot
    );
    const vaultSideHist = vaultHistorical.participants.find((p) => p.rosterId === underdog.rosterId)!;
    // 0 + 5.0 * 1.65 = 8.25 -> 8.3
    expect(vaultSideHist.compositeGradeScore).toBe(8.3);
  });

  it('dampens negative starting10DeltaAvgLockIn at 0.65x for sidelined 0-GP/Out (>= 25.0 DV) or youth (age delta <= -0.4) without picks, and smoothly interpolates across -10.0 to -4.0 with zero cliff at 0.0', async () => {
    const { engine } = createEngine();
    const snapshot = await engine.getLeagueSnapshot();

    const r1 = snapshot.rosters.find((r) => r.rosterId === 1)!;
    const r2 = snapshot.rosters.find((r) => r.rosterId === 2)!;

    // Healthy veteran on Roster #1 (SG starter) traded for sidelined 0-GP / BASELINE_ESTIMATE star on Roster #2 (SG starter)
    const vet1 = r1.starterSlots[1];
    const sidelined2 = r2.starterSlots[1];

    // Keep ages equal (26) so age shift is 0.0 and only sidelined status triggers dampening
    vet1.age = 26;
    sidelined2.age = 26;
    vet1.dynastyValue = 42.3;
    vet1.seasonMetrics.averageLockInPoints = 40.0;
    vet1.injuryStatus = null;
    vet1.dynastyValueSource = 'ACTUAL_ESTABLISHED';

    // Put sidelined2 into 0-GP / Out / BASELINE_ESTIMATE state (0.0 Avg Lock-In, 42.3 DV >= 25.0)
    sidelined2.dynastyValue = 42.3;
    sidelined2.seasonMetrics.gamesPlayed = 0;
    sidelined2.seasonMetrics.mbaFantasyPointsPerGame = 0;
    sidelined2.seasonMetrics.averageLockInPoints = 0;
    sidelined2.dynastyValueSource = 'BASELINE_ESTIMATE';
    sidelined2.injuryStatus = 'Out';

    // Ensure Roster #1 drops by a known negative starting10DeltaAvgLockIn (no picks involved)
    const sidelinedEval = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 1, outgoingPlayerIds: [vet1.playerId], incomingPlayerIds: [sidelined2.playerId] },
          { rosterId: 2, outgoingPlayerIds: [sidelined2.playerId], incomingPlayerIds: [vet1.playerId] },
        ],
      },
      snapshot
    );
    const r1Sidelined = sidelinedEval.participants.find((p) => p.rosterId === 1)!;
    expect(r1Sidelined.incomingPicks).toHaveLength(0);
    expect(r1Sidelined.averageAgeDelta).toBe(0);
    expect(r1Sidelined.adjustedDynastyDelta).toBe(0);
    expect(r1Sidelined.starting10DeltaAvgLockIn).toBeLessThan(0);

    const deltaLi = r1Sidelined.starting10DeltaAvgLockIn;
    const compressedLi =
      -1 * (Math.min(Math.abs(deltaLi), 14.0) + Math.max(0, Math.abs(deltaLi) - 14.0) * 0.5);
    expect(r1Sidelined.compositeGradeScore).toBe(Math.round(compressedLi * 0.65 * 10) / 10);

    // Smooth ramp across -10.0 to -4.0 and zero cliff across 0.0 (+0.1 vs -0.1):
    // Fix deltaLi via controlled swap of two healthy players where Roster #1 shifts younger (age 35 -> age 20 => avgAgeDelta <= -0.4)
    const young2 = r2.starterSlots[2];
    vet1.age = 35;
    young2.age = 20;
    vet1.seasonMetrics.averageLockInPoints = 50.0;
    young2.seasonMetrics.averageLockInPoints = 40.0; // -10.0 Avg Lock-In for Roster #1
    young2.injuryStatus = null;
    young2.dynastyValueSource = 'ACTUAL_ESTABLISHED';

    const evaluateAtDynastyDelta = (targetDelta: number, mode: 'LIVE' | 'HISTORICAL' = 'LIVE') => {
      vet1.dynastyValue = 50.0;
      young2.dynastyValue = 50.0 + targetDelta;
      const res = engine.evaluateTrade(
        {
          evaluationMode: mode,
          participants: [
            { rosterId: 1, outgoingPlayerIds: [vet1.playerId], incomingPlayerIds: [young2.playerId] },
            { rosterId: 2, outgoingPlayerIds: [young2.playerId], incomingPlayerIds: [vet1.playerId] },
          ],
        },
        snapshot
      );
      return res.participants.find((p) => p.rosterId === 1)!;
    };

    const atPlusZeroPointOne = evaluateAtDynastyDelta(0.1);
    expect(atPlusZeroPointOne.averageAgeDelta).toBeLessThanOrEqual(-0.4);
    expect(atPlusZeroPointOne.starting10DeltaAvgLockIn).toBe(-10.0);
    // +0.1 + (-10.0 * 0.65) = -6.4
    expect(atPlusZeroPointOne.compositeGradeScore).toBe(-6.4);

    const atMinusZeroPointOne = evaluateAtDynastyDelta(-0.1);
    // -0.1 + (-10.0 * 0.65) = -6.6 (no cliff at 0.0!)
    expect(atMinusZeroPointOne.compositeGradeScore).toBe(-6.6);

    const atMinusFour = evaluateAtDynastyDelta(-4.0);
    // -4.0 + (-10.0 * 0.65) = -10.5
    expect(atMinusFour.compositeGradeScore).toBe(-10.5);

    const atMinusSevenLive = evaluateAtDynastyDelta(-7.0, 'LIVE');
    // Midpoint between 0.65 and 1.5 is 1.075 -> -7.0 + (-10.0 * 1.075) = -17.75 -> -17.8 (or -17.7 depending on IEEE round)
    expect(atMinusSevenLive.compositeGradeScore).toBe(Math.round((-7.0 + -10.0 * 1.075) * 10) / 10);

    const atMinusSevenHist = evaluateAtDynastyDelta(-7.0, 'HISTORICAL');
    // Midpoint between 0.65 and 1.65 is 1.15 -> -7.0 + (-10.0 * 1.15) = -18.5
    expect(atMinusSevenHist.compositeGradeScore).toBe(-18.5);

    const atMinusTenLive = evaluateAtDynastyDelta(-10.0, 'LIVE');
    // -10.0 + (-10.0 * 1.5) = -25.0
    expect(atMinusTenLive.compositeGradeScore).toBe(-25.0);

    const atMinusTenHist = evaluateAtDynastyDelta(-10.0, 'HISTORICAL');
    // -10.0 + (-10.0 * 1.65) = -26.5
    expect(atMinusTenHist.compositeGradeScore).toBe(-26.5);

    // Sub-25 DV sidelined asset without picks or age shift does NOT dampen (uses 1.5x LIVE)
    vet1.age = 26;
    sidelined2.age = 26;
    vet1.dynastyValue = 24.0;
    sidelined2.dynastyValue = 24.0;
    const sub25Eval = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 1, outgoingPlayerIds: [vet1.playerId], incomingPlayerIds: [sidelined2.playerId] },
          { rosterId: 2, outgoingPlayerIds: [sidelined2.playerId], incomingPlayerIds: [vet1.playerId] },
        ],
      },
      snapshot
    );
    const r1Sub25 = sub25Eval.participants.find((p) => p.rosterId === 1)!;
    const sub25Li = r1Sub25.starting10DeltaAvgLockIn;
    const sub25Compressed =
      -1 * (Math.min(Math.abs(sub25Li), 14.0) + Math.max(0, Math.abs(sub25Li) - 14.0) * 0.5);
    expect(r1Sub25.compositeGradeScore).toBe(Math.round(sub25Compressed * 1.5 * 10) / 10);
  });

  it('recognizes cross-timeline Contender-vs-Rebuilder complementarity (mutual B+/A- grades & Balanced Trade fairness), uses 1.4 spread slope, and crowns winner at composite gap >= 2.5 or netAdjustedSpread >= 3.0', async () => {
    const { engine } = createEngine();
    const snapshot = await engine.getLeagueSnapshot();

    // Roster #4 (Title Favorite, 2.2x) needs 15/15 active players to have a deterministic BN cut of 22.0 DV (offset by 14.0 -> 8.0 penalty)
    const r4 = snapshot.rosters.find((r) => r.rosterId === 4)!;
    const r5 = snapshot.rosters.find((r) => r.rosterId === 5)!;
    // Move r4's 2 reserve players into active bench slots so r4 has 15/15 active main players (10 starters + 5 BN)
    // with 16.0 DV bench depth (offset by 14.0 Waiver Replacement Baseline -> 3.0 minimum cut penalty)
    const r4ExtraBench = r4.reserveSlots.map((s) => ({ ...s, slotLabel: 'BN' as const, category: 'BENCH' as const, dynastyValue: 16.0 }));
    r4.benchSlots.forEach((b) => {
      b.dynastyValue = 16.0;
    });
    r4.benchSlots = [...r4.benchSlots, ...r4ExtraBench];
    r4.reserveSlots = [];

    // Roster #5 sends a high-scoring veteran starter ('r5_p1', 26.0 DV) to Roster #4 for Mid 2026 1st ('2026-r1-orig-4', 46.0 DV)
    const { solveOptimalStarting10Lineup } = await import('@/lib/trades/trade-analyzer');
    const r4Optimal = solveOptimalStarting10Lineup(r4.allPlayers);
    const r4LowestGuardOrUtil = Math.min(
      ...r4Optimal.starters
        .filter((s) => s.slotLabel === 'PG' || s.slotLabel === 'G' || s.slotLabel === 'UTIL')
        .map((s) => s.avgLockIn)
    );
    const r5Vet = r5.starterSlots[0]; // PG
    r5Vet.dynastyValue = 26.0;
    r5Vet.seasonMetrics.averageLockInPoints = Math.round((r4LowestGuardOrUtil + 14.0) * 10) / 10;

    const crossTimelineEval = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 4, outgoingPickIds: ['2026-r1-orig-4'], incomingPlayerIds: [r5Vet.playerId] },
          { rosterId: 5, outgoingPlayerIds: [r5Vet.playerId], incomingPickIds: ['2026-r1-orig-4'] },
        ],
        pickTierOverrides: { '2026-r1-orig-4': 'Mid' },
      },
      snapshot
    );

    const side4 = crossTimelineEval.participants.find((p) => p.rosterId === 4)!;
    const side5 = crossTimelineEval.participants.find((p) => p.rosterId === 5)!;

    // Cross-timeline conditions: one side DV < -2 & LI > +1, other side DV > +2 & LI < -1
    expect(side4.adjustedDynastyDelta).toBeLessThan(-2.0);
    expect(side4.starting10DeltaAvgLockIn).toBeGreaterThan(1.0);
    expect(side5.adjustedDynastyDelta).toBeGreaterThan(2.0);
    expect(side5.starting10DeltaAvgLockIn).toBeLessThan(-1.0);

    // Both Contender and Rebuilder earn B+ or A- simultaneously
    expect(['B+', 'A-']).toContain(side4.letterGrade);
    expect(['B+', 'A-']).toContain(side5.letterGrade);

    // Cross-timeline fairness recognizes complementarity -> Balanced Trade (>= 85) or Slight Edge (68-84)
    expect(crossTimelineEval.fairnessScore).toBeGreaterThanOrEqual(85);
    expect(crossTimelineEval.fairnessLabel).toBe('Balanced Trade');
    expect(crossTimelineEval.summaryHeadline.toLowerCase()).toContain('cross-timeline');

    // Non-cross-timeline 1.4 slope & winner crowning boundary (>= 2.5 composite gap or >= 3.0 netAdjustedSpread)
    const r1 = snapshot.rosters.find((r) => r.rosterId === 1)!;
    const r2 = snapshot.rosters.find((r) => r.rosterId === 2)!;
    const p1 = r1.starterSlots[1];
    const p2 = r2.starterSlots[1];
    p1.age = 26;
    p2.age = 26;
    p1.seasonMetrics.averageLockInPoints = 45.0;
    p2.seasonMetrics.averageLockInPoints = 45.0;

    // 2.0 DV gap -> netAdjustedSpread = 2.0 (< 3.0), composite gap = 4.0 (>= 2.5) vs 1.0 DV gap -> netAdjustedSpread = 1.0, composite gap = 2.0 (< 2.5)
    p1.dynastyValue = 50.0;
    p2.dynastyValue = 51.0; // delta +1.0 vs -1.0 -> composite gap = 2.0 (< 2.5), netAdjustedSpread = 1.0 (< 3.0)
    const noWinnerEval = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 1, outgoingPlayerIds: [p1.playerId], incomingPlayerIds: [p2.playerId] },
          { rosterId: 2, outgoingPlayerIds: [p2.playerId], incomingPlayerIds: [p1.playerId] },
        ],
      },
      snapshot
    );
    expect(noWinnerEval.winnerRosterId).toBeNull();
    expect(noWinnerEval.fairnessScore).toBe(99); // round(100 - 1.0 * 1.4) = 99

    // 15.0 netAdjustedSpread (p1 = 35.0, p2 = 50.0 -> +15 vs -15): fairnessScore = round(100 - 15 * 1.4) = 79 (Slight Edge)
    p1.dynastyValue = 35.0;
    p2.dynastyValue = 50.0;
    const slightEdgeEval = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 1, outgoingPlayerIds: [p1.playerId], incomingPlayerIds: [p2.playerId] },
          { rosterId: 2, outgoingPlayerIds: [p2.playerId], incomingPlayerIds: [p1.playerId] },
        ],
      },
      snapshot
    );
    expect(slightEdgeEval.netAdjustedSpread).toBe(15.0);
    expect(slightEdgeEval.fairnessScore).toBe(79);
    expect(slightEdgeEval.fairnessLabel).toBe('Slight Edge');
    expect(slightEdgeEval.winnerRosterId).toBe(1);
  });
});
