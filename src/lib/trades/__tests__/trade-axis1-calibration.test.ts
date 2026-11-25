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

describe('Axis 1 Trade Grade Calibration (#17) — MbaLeagueEngine Seam', () => {
  it('computes continuous Consolidation Premium above 58.0 Dynasty Value with no cliff at 65.0 and ignores 2nd-round Draft Pick Assets in uneven multi-asset bonuses', async () => {
    const { engine } = createEngine();
    const snapshot = await engine.getLeagueSnapshot();

    const r1 = snapshot.rosters.find((r) => r.rosterId === 1)!;
    const r2 = snapshot.rosters.find((r) => r.rosterId === 2)!;

    // Set up a 1-for-1 baseline where p1 = 62.0 DV (between 58 and 65) and p2 = 88.0 DV (superstar)
    const p1 = r1.starterSlots[1]; // Devin Booker
    const p2 = r2.starterSlots[1]; // r2_p2
    const p2Extra = r2.benchSlots[0]; // r2_p11
    p1.dynastyValue = 62.0;
    p2.dynastyValue = 88.0;
    p2Extra.dynastyValue = 20.0;

    // 1-for-1 trade: p1 (62.0) vs p2 (88.0)
    const oneForOne = engine.evaluateTrade(
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

    const side1OneForOne = oneForOne.participants.find((p) => p.rosterId === 1)!;
    const side2OneForOne = oneForOne.participants.find((p) => p.rosterId === 2)!;

    // Asset at 62.0 DV (previously 0.0 under >= 65 cliff): (62 - 58) * 0.30 = 1.2
    expect(side2OneForOne.incomingPlayers[0].consolidationPremium).toBe(1.2);
    expect(side2OneForOne.consolidationPremium).toBe(1.2);

    // Asset at 88.0 DV: (88 - 58) * 0.30 + (88 - 72) * 0.35 + (88 - 85) * 0.40 = 9.0 + 5.6 + 1.2 = 15.8
    // Multi-asset incoming boost for side1: bestIn (88) > 58 && 88 > 62 + 3 -> (88 - 62) * 0.22 = 5.72
    // Total consolidationPremium for side1 = round10(15.8 + 5.72) = 21.5
    expect(side1OneForOne.incomingPlayers[0].consolidationPremium).toBe(15.8);
    expect(side1OneForOne.consolidationPremium).toBe(21.5);

    // Now test uneven consolidation: Roster #1 sends p1 (62.0) + bench player (22.0) for p2 (88.0)
    // vs. also throwing in a 2nd-round Draft Pick Asset (2026-r2-orig-1) from Roster #1.
    const r1Bench = r1.benchSlots[1];
    r1Bench.dynastyValue = 22.0;

    const twoPlayersForOne = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPlayerIds: [p1.playerId, r1Bench.playerId],
            incomingPlayerIds: [p2.playerId],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [p2.playerId],
            incomingPlayerIds: [p1.playerId, r1Bench.playerId],
          },
        ],
      },
      snapshot
    );

    const twoPlayersPlusSecondRounder = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPlayerIds: [p1.playerId, r1Bench.playerId],
            outgoingPickIds: ['2026-r2-orig-1'],
            incomingPlayerIds: [p2.playerId],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [p2.playerId],
            incomingPlayerIds: [p1.playerId, r1Bench.playerId],
            incomingPickIds: ['2026-r2-orig-1'],
          },
        ],
      },
      snapshot
    );

    const side1Without2nd = twoPlayersForOne.participants.find((p) => p.rosterId === 1)!;
    const side1With2nd = twoPlayersPlusSecondRounder.participants.find((p) => p.rosterId === 1)!;

    // Base 15.8 + (88 - 62) * 0.22 (5.72) + 1 extra outgoing player * 4.0 = 25.52 -> 25.5
    expect(side1Without2nd.consolidationPremium).toBe(25.5);
    // Adding a 2nd-round Draft Pick Asset must NOT inflate the counterparty's consolidation bonus
    expect(side1With2nd.consolidationPremium).toBe(side1Without2nd.consolidationPremium);

    // Adding a 1st-round Draft Pick Asset DOES add +1.5 to the consolidating side
    const twoPlayersPlusFirstRounder = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPlayerIds: [p1.playerId, r1Bench.playerId],
            outgoingPickIds: ['2026-r1-orig-1'],
            incomingPlayerIds: [p2.playerId],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [p2.playerId],
            incomingPlayerIds: [p1.playerId, r1Bench.playerId],
            incomingPickIds: ['2026-r1-orig-1'],
          },
        ],
      },
      snapshot
    );
    const side1With1st = twoPlayersPlusFirstRounder.participants.find((p) => p.rosterId === 1)!;
    // 15.8 + 5.72 + 4.0 + 1.5 = 27.02 -> 27.0
    expect(side1With1st.consolidationPremium).toBe(27.0);
  });

  it('absorbs excess incoming players into open active (<15) and open IR (<3) slots in LIVE mode, excludes TAXI from absorption and cuts, and isolates HISTORICAL mode at 15-slot capacity', async () => {
    const { fixtures, engine } = createEngine();

    // Case A: Roster #2 has 13 active main players (10 starters + 3 BN = 2 open active slots) and 2/3 IR.
    // Roster #4 sends 2 healthy players (r4_p11, r4_p12) for Roster #2's 2027 1st.
    // In LIVE mode, Roster #2 absorbs both into its 2 open active slots at 0 cut cost.
    // In HISTORICAL mode, Roster #2 is evaluated at deterministic 15-slot capacity and incurs 2 BN cuts.
    const liveSnap = await engine.getLeagueSnapshot();
    const pickForTwoHealthy = {
      participants: [
        {
          rosterId: 2,
          outgoingPickIds: ['2027-r1-orig-2'],
          incomingPlayerIds: ['r4_p11', 'r4_p12'],
        },
        {
          rosterId: 4,
          outgoingPlayerIds: ['r4_p11', 'r4_p12'],
          incomingPickIds: ['2027-r1-orig-2'],
        },
      ],
    };

    const liveEval = engine.evaluateTrade(pickForTwoHealthy, liveSnap);
    const liveSide2 = liveEval.participants.find((p) => p.rosterId === 2)!;
    expect(liveSide2.replacementCutAssets).toHaveLength(0);
    expect(liveSide2.replacementCutPenalty).toBe(0);

    const histEval = engine.evaluateTrade(pickForTwoHealthy, liveSnap, {
      evaluationMode: 'HISTORICAL',
    });
    const histSide2 = histEval.participants.find((p) => p.rosterId === 2)!;
    expect(histSide2.replacementCutAssets).toHaveLength(2);
    expect(histSide2.replacementCutPenalty).toBeGreaterThan(0);

    // Also verify gradeHistoricalTrades uses HISTORICAL mode on a transaction with Roster #2 acquiring r4_p11
    fixtures.transactions = [
      {
        transaction_id: 'tx_hist_capacity_check',
        type: 'trade',
        status: 'complete',
        created: 1764000000000,
        leg: 6,
        season: '2026',
        league_id: fixtures.league.league_id,
        roster_ids: [2, 4],
        adds: { r4_p11: 2 },
        drops: { r4_p11: 4 },
        draft_picks: [
          {
            season: '2027',
            round: 1,
            roster_id: 2,
            previous_owner_id: 2,
            owner_id: 4,
          },
        ],
      },
    ];
    const gradedHist = await engine.gradeHistoricalTrades({ season: '2026' });
    const txHist = gradedHist.find((t) => t.transactionId === 'tx_hist_capacity_check')!;
    const txHistSide2 = txHist.participants.find((p) => p.rosterId === 2)!;
    expect(txHistSide2.replacementCutAssets).toHaveLength(1);
    expect(txHistSide2.replacementCutPenalty).toBeGreaterThan(0);

    // Case B: Roster #1 has 15/15 active players (10 starters + 5 BN), 2/3 IR slots (1 open IR slot),
    // and 0 TAXI slots (open TAXI slots must NOT absorb healthy incoming players).
    const taxiClearedFixtures = createDeterministicMbaFixtures();
    const r1Raw = taxiClearedFixtures.rosters.find((r) => r.roster_id === 1)!;
    const taxiSet = new Set(r1Raw.taxi ?? []);
    r1Raw.taxi = []; // 3 open TAXI slots
    r1Raw.players = (r1Raw.players ?? []).filter((pid) => !taxiSet.has(pid));

    const engineB = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(taxiClearedFixtures),
      stateStore: new InMemoryManagerStateStore(),
    });
    const snapB = await engineB.getLeagueSnapshot();

    // Acquiring an 'Out' player (r2_p14) into Roster #1's open IR slot -> 0 cuts
    const acquireOutIntoIr = engineB.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPickIds: ['2026-r2-orig-1'],
            incomingPlayerIds: ['r2_p14'], // Out
          },
          {
            rosterId: 2,
            outgoingPlayerIds: ['r2_p14'],
            incomingPickIds: ['2026-r2-orig-1'],
          },
        ],
      },
      snapB
    );
    const side1IrAbsorb = acquireOutIntoIr.participants.find((p) => p.rosterId === 1)!;
    expect(side1IrAbsorb.replacementCutAssets).toHaveLength(0);
    expect(side1IrAbsorb.replacementCutPenalty).toBe(0);

    // Acquiring a healthy player (r2_p11) on Roster #1 despite 3 open TAXI slots -> 1 BN cut
    const acquireHealthyWithOpenTaxi = engineB.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPickIds: ['2026-r2-orig-1'],
            incomingPlayerIds: ['r2_p11'], // healthy
          },
          {
            rosterId: 2,
            outgoingPlayerIds: ['r2_p11'],
            incomingPickIds: ['2026-r2-orig-1'],
          },
        ],
      },
      snapB
    );
    const side1HealthyCut = acquireHealthyWithOpenTaxi.participants.find((p) => p.rosterId === 1)!;
    expect(side1HealthyCut.replacementCutAssets).toHaveLength(1);
    expect(side1HealthyCut.replacementCutAssets[0].slotLabel).toBe('BN');

    // Case C: Never cut IR or TAXI players even when all BN players are exhausted/traded away!
    const fullSnap = await engine.getLeagueSnapshot();
    const r1Full = fullSnap.rosters.find((r) => r.rosterId === 1)!;
    const r2Full = fullSnap.rosters.find((r) => r.rosterId === 2)!;
    // Trade away all 5 BN players on Roster #1 in exchange for 6 players from Roster #2 (net +1 excess player),
    // with 0 BN players remaining on Roster #1. Make Roster #1 IR/TAXI have very low DV (5.0) so old buggy
    // fallbackOtherCuts would have picked IR/TAXI, whereas fixed code must pick a Starter Slot (never IR/TAXI).
    for (const ir of r1Full.reserveSlots) ir.dynastyValue = 5.0;
    for (const tx of r1Full.taxiSlots) tx.dynastyValue = 5.0;

    const r1AllBenchIds = r1Full.benchSlots.map((b) => b.playerId);
    const r2SixIds = [
      ...r2Full.starterSlots.slice(0, 3).map((s) => s.playerId),
      ...r2Full.benchSlots.map((b) => b.playerId),
    ];
    const exhaustedBenchEval = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPlayerIds: r1AllBenchIds,
            incomingPlayerIds: r2SixIds,
          },
          {
            rosterId: 2,
            outgoingPlayerIds: r2SixIds,
            incomingPlayerIds: r1AllBenchIds,
          },
        ],
      },
      fullSnap
    );
    const side1Exhausted = exhaustedBenchEval.participants.find((p) => p.rosterId === 1)!;
    expect(side1Exhausted.replacementCutAssets).toHaveLength(1);
    expect(['IR', 'TAXI']).not.toContain(side1Exhausted.replacementCutAssets[0].slotLabel);
  });

  it('caps individual Replacement Cut Assets at 24.0 DV and applies the 14.0 Waiver Replacement Baseline offset strictly to net outgoing Draft Pick Asset conversions', async () => {
    const { engine } = createEngine();
    const snapshot = await engine.getLeagueSnapshot();

    const r1 = snapshot.rosters.find((r) => r.rosterId === 1)!;
    const r2 = snapshot.rosters.find((r) => r.rosterId === 2)!;

    // Roster #1 is 15/15 active (10 starters + 5 BN). Set BN DVs so lowest two BN players are 38.0 and 45.0.
    r1.benchSlots[0].dynastyValue = 70.0;
    r1.benchSlots[1].dynastyValue = 60.0;
    r1.benchSlots[2].dynastyValue = 55.0;
    r1.benchSlots[3].dynastyValue = 45.0;
    r1.benchSlots[4].dynastyValue = 38.0;

    // 1. 2-for-1 player trade (0 net outgoing picks): Roster #1 cuts 38.0-DV benched star -> capped at 24.0
    const twoForOne = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPlayerIds: [r1.starterSlots[1].playerId],
            incomingPlayerIds: [r2.starterSlots[1].playerId, r2.benchSlots[0].playerId],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [r2.starterSlots[1].playerId, r2.benchSlots[0].playerId],
            incomingPlayerIds: [r1.starterSlots[1].playerId],
          },
        ],
      },
      snapshot
    );
    const side1TwoForOne = twoForOne.participants.find((p) => p.rosterId === 1)!;
    expect(side1TwoForOne.replacementCutAssets).toHaveLength(1);
    expect(side1TwoForOne.replacementCutAssets[0].dynastyValue).toBe(38.0);
    expect(side1TwoForOne.replacementCutPenalty).toBe(24.0);

    // 2. 3-for-1 player trade (0 net outgoing picks): 100% of capped BN cuts (24.0 + 24.0 = 48.0)
    const threeForOne = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPlayerIds: [r1.starterSlots[1].playerId],
            incomingPlayerIds: [
              r2.starterSlots[1].playerId,
              r2.benchSlots[0].playerId,
              r2.benchSlots[1].playerId,
            ],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [
              r2.starterSlots[1].playerId,
              r2.benchSlots[0].playerId,
              r2.benchSlots[1].playerId,
            ],
            incomingPlayerIds: [r1.starterSlots[1].playerId],
          },
        ],
      },
      snapshot
    );
    const side1ThreeForOne = threeForOne.participants.find((p) => p.rosterId === 1)!;
    expect(side1ThreeForOne.replacementCutAssets).toHaveLength(2);
    expect(side1ThreeForOne.replacementCutPenalty).toBe(48.0);

    // 3. Pick-for-player trade (1 player in, 0 players out, 1 pick out -> netOutgoingPicks = 1):
    // Capped 24.0 cut receives 14.0 Waiver Replacement Baseline offset -> 24.0 - 14.0 = 10.0
    const pickForPlayer = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPickIds: ['2026-r1-orig-1'],
            incomingPlayerIds: [r2.starterSlots[1].playerId],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [r2.starterSlots[1].playerId],
            incomingPickIds: ['2026-r1-orig-1'],
          },
        ],
      },
      snapshot
    );
    const side1PickForPlayer = pickForPlayer.participants.find((p) => p.rosterId === 1)!;
    expect(side1PickForPlayer.replacementCutAssets).toHaveLength(1);
    expect(side1PickForPlayer.replacementCutPenalty).toBe(10.0);

    // 4. Mixed package: 1 net outgoing pick + 2 excess incoming players (3 players in vs 1 player + 1 pick out)
    // First cut gets 14.0 offset (24 - 14 = 10.0); second cut gets 100% of cappedDv (24.0) -> 34.0 total
    const mixedPackage = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPlayerIds: [r1.starterSlots[1].playerId],
            outgoingPickIds: ['2026-r1-orig-1'],
            incomingPlayerIds: [
              r2.starterSlots[1].playerId,
              r2.benchSlots[0].playerId,
              r2.benchSlots[1].playerId,
            ],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [
              r2.starterSlots[1].playerId,
              r2.benchSlots[0].playerId,
              r2.benchSlots[1].playerId,
            ],
            incomingPlayerIds: [r1.starterSlots[1].playerId],
            incomingPickIds: ['2026-r1-orig-1'],
          },
        ],
      },
      snapshot
    );
    const side1Mixed = mixedPackage.participants.find((p) => p.rosterId === 1)!;
    expect(side1Mixed.replacementCutAssets).toHaveLength(2);
    expect(side1Mixed.replacementCutPenalty).toBe(34.0);

    // 5. Lower-DV bench player (16.0 DV) with pick offset respects 3.0 minimum floor;
    //    ultra-deep 2.2 DV bench player is clamped to min(2.2, max(3.0, 2.2 - 14.0)) = 2.2
    r1.benchSlots[4].dynastyValue = 16.0;
    const lowBenchPickTrade = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPickIds: ['2026-r1-orig-1'],
            incomingPlayerIds: [r2.starterSlots[1].playerId],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [r2.starterSlots[1].playerId],
            incomingPickIds: ['2026-r1-orig-1'],
          },
        ],
      },
      snapshot
    );
    expect(lowBenchPickTrade.participants.find((p) => p.rosterId === 1)!.replacementCutPenalty).toBe(
      3.0
    );

    r1.benchSlots[4].dynastyValue = 2.2;
    const ultraDeepBenchPickTrade = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPickIds: ['2026-r1-orig-1'],
            incomingPlayerIds: [r2.starterSlots[1].playerId],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [r2.starterSlots[1].playerId],
            incomingPickIds: ['2026-r1-orig-1'],
          },
        ],
      },
      snapshot
    );
    expect(
      ultraDeepBenchPickTrade.participants.find((p) => p.rosterId === 1)!.replacementCutPenalty
    ).toBe(2.2);
  });

  it('anchors completed 2025 Round 1 and Round 2 Draft Pick Assets to neutral Mid (46 / 15 DV, Slot #5) with 2025 season and labels intact', async () => {
    const { fixtures, engine } = createEngine();

    fixtures.transactions = [
      {
        transaction_id: 'tx_2025_picks_anchor',
        type: 'trade',
        status: 'complete',
        created: 1733000000000,
        leg: 6,
        season: '2025',
        league_id: '1212393765696700416',
        roster_ids: [3, 4],
        adds: {},
        drops: {},
        draft_picks: [
          {
            season: '2025',
            round: 1,
            roster_id: 4, // 2026 Late slot #10, must NOT inherit 2026 slot!
            previous_owner_id: 4,
            owner_id: 3,
          },
          {
            season: '2025',
            round: 2,
            roster_id: 3, // 2026 Early slot #1, must NOT inherit 2026 slot!
            previous_owner_id: 3,
            owner_id: 4,
          },
        ],
      },
    ];

    const graded = await engine.gradeHistoricalTrades({ season: '2025' });
    const tx = graded.find((t) => t.transactionId === 'tx_2025_picks_anchor')!;
    expect(tx).toBeDefined();

    const r3 = tx.participants.find((p) => p.rosterId === 3)!;
    const r4 = tx.participants.find((p) => p.rosterId === 4)!;

    const pick2025R1 = r3.incomingPicks[0];
    expect(pick2025R1.pickId).toBe('2025-r1-orig-4');
    expect(pick2025R1.season).toBe('2025');
    expect(pick2025R1.displayLabel).toContain('2025 1st');
    expect(pick2025R1.projectedSlot).toBe(5);
    expect(pick2025R1.projectedTier).toBe('Mid');
    expect(pick2025R1.dynastyValue).toBe(46);

    const pick2025R2 = r4.incomingPicks[0];
    expect(pick2025R2.pickId).toBe('2025-r2-orig-3');
    expect(pick2025R2.season).toBe('2025');
    expect(pick2025R2.displayLabel).toContain('2025 2nd');
    expect(pick2025R2.projectedSlot).toBe(5);
    expect(pick2025R2.projectedTier).toBe('Mid');
    expect(pick2025R2.dynastyValue).toBe(15);
  });

  it('explains 24.0 drop ceiling, 14.0 Waiver Replacement Baseline pick-offset, and open-slot absorption in plain-english takeaways', async () => {
    const { engine } = createEngine();
    const snapshot = await engine.getLeagueSnapshot();

    const r1 = snapshot.rosters.find((r) => r.rosterId === 1)!;
    const r2 = snapshot.rosters.find((r) => r.rosterId === 2)!;

    // Roster #1 has 15/15 active players; lowest BN player has 38.0 DV (> 24.0 ceiling).
    // Buying r2_p1 with 2026-r1-orig-1 triggers BOTH the 24.0 drop ceiling AND the 14.0 Waiver Replacement Baseline offset (net -10.0 vs 38.0 raw).
    r1.benchSlots.forEach((b, idx) => {
      b.dynastyValue = idx === 4 ? 38.0 : 60.0;
    });

    const evalResult = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPickIds: ['2026-r1-orig-1'],
            incomingPlayerIds: [r2.starterSlots[0].playerId],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [r2.starterSlots[0].playerId],
            incomingPickIds: ['2026-r1-orig-1'],
          },
        ],
      },
      snapshot
    );

    const side1 = evalResult.participants.find((p) => p.rosterId === 1)!;
    const cutTakeaway = side1.takeaways.find((t) => t.includes('Replacement Cut Asset'))!;
    expect(cutTakeaway).toBeDefined();
    expect(cutTakeaway).toContain('10.0');
    expect(cutTakeaway).toContain('38.0');
    expect(cutTakeaway).toContain('24.0');
    expect(cutTakeaway).toContain('Waiver Replacement Baseline');

    // Roster #2 (13/15 active = 2 open active slots) absorbing +1 player in LIVE mode gets open-slot takeaway
    const openSlotEval = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 2,
            outgoingPickIds: ['2026-r1-orig-2'],
            incomingPlayerIds: [r1.starterSlots[0].playerId],
          },
          {
            rosterId: 1,
            outgoingPlayerIds: [r1.starterSlots[0].playerId],
            incomingPickIds: ['2026-r1-orig-2'],
          },
        ],
      },
      snapshot
    );
    const side2 = openSlotEval.participants.find((p) => p.rosterId === 2)!;
    expect(
      side2.takeaways.some(
        (t) => t.includes('Open') && t.includes('0.0') && t.includes('Replacement Cut Asset')
      )
    ).toBe(true);
  });

  it('omits 14.0 Waiver Replacement Baseline pick-offset attribution when the pick-offset cut has DV <= 3.0 and only the 24.0 drop ceiling reduced penalty', async () => {
    const { engine } = createEngine();
    const snapshot = await engine.getLeagueSnapshot();

    const r1 = snapshot.rosters.find((r) => r.rosterId === 1)!;
    const r2 = snapshot.rosters.find((r) => r.rosterId === 2)!;

    // Roster #1 is 15/15 active (10 starters + 5 BN).
    // Lowest two BN cuts: cut #1 = 2.5 DV (<= 3.0 floor, unaffected by pick-offset) and cut #2 = 38.0 DV (> 24.0 drop ceiling).
    r1.benchSlots[0].dynastyValue = 70.0;
    r1.benchSlots[1].dynastyValue = 65.0;
    r1.benchSlots[2].dynastyValue = 60.0;
    r1.benchSlots[3].dynastyValue = 38.0;
    r1.benchSlots[4].dynastyValue = 2.5;

    // 3 players in vs 1 player + 1 pick out -> 2 excess cuts, netOutgoingPicks === 1.
    // Cut #1 (2.5 DV) receives the 1 pick-offset slot -> min(2.5, max(3.0, 2.5 - 14.0)) = 2.5 (no reduction).
    // Cut #2 (38.0 DV) receives no pick-offset -> capped at 24.0 by the 24.0 drop ceiling.
    // Total penalty = 26.5 vs 40.5 raw sum.
    const multiCutEval = engine.evaluateTrade(
      {
        participants: [
          {
            rosterId: 1,
            outgoingPlayerIds: [r1.starterSlots[1].playerId],
            outgoingPickIds: ['2026-r1-orig-1'],
            incomingPlayerIds: [
              r2.starterSlots[1].playerId,
              r2.benchSlots[0].playerId,
              r2.benchSlots[1].playerId,
            ],
          },
          {
            rosterId: 2,
            outgoingPlayerIds: [
              r2.starterSlots[1].playerId,
              r2.benchSlots[0].playerId,
              r2.benchSlots[1].playerId,
            ],
            incomingPlayerIds: [r1.starterSlots[1].playerId],
            incomingPickIds: ['2026-r1-orig-1'],
          },
        ],
      },
      snapshot
    );

    const side1 = multiCutEval.participants.find((p) => p.rosterId === 1)!;
    expect(side1.replacementCutAssets).toHaveLength(2);
    expect(side1.replacementCutPenalty).toBe(26.5);

    const cutTakeaway = side1.takeaways.find((t) => t.includes('Replacement Cut Asset'))!;
    expect(cutTakeaway).toBeDefined();
    expect(cutTakeaway).toContain('26.5');
    expect(cutTakeaway).toContain('40.5');
    expect(cutTakeaway).toContain('24.0 drop ceiling');
    expect(cutTakeaway).not.toContain('Waiver Replacement Baseline');
    expect(cutTakeaway).not.toContain('pick-offset');
  });
});
