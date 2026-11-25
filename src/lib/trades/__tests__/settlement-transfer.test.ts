import { describe, expect, it } from 'vitest';
import { MbaLeagueEngine } from '@/lib/engine/mba-league-engine';
import { createDeterministicMbaFixtures } from '@/lib/engine/fixtures/mba-fixtures';
import { InMemorySleeperGateway } from '@/lib/gateway/in-memory-sleeper-gateway';
import { InMemoryManagerStateStore } from '@/lib/store/manager-state-store';

function makeEngine(fixtures = createDeterministicMbaFixtures()) {
  const engine = new MbaLeagueEngine({
    gateway: new InMemorySleeperGateway(fixtures),
    stateStore: new InMemoryManagerStateStore(),
  });
  return { engine, fixtures };
}

describe('Settlement Transfer — atomic N/A resolution (MbaLeagueEngine.evaluateTrade)', () => {
  it('resolves a 2-Roster unilateral asset move to N/A grades, no winner, and Settlement Transfer label', async () => {
    const { engine } = makeEngine();
    const snapshot = await engine.getLeagueSnapshot();
    const result = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 1, outgoingPlayerIds: ['1846'], incomingPlayerIds: [] },
          { rosterId: 2, outgoingPlayerIds: [], incomingPlayerIds: ['1846'] },
        ],
        evaluationMode: 'HISTORICAL',
      },
      snapshot
    );
    expect(result.isSettlementTransfer).toBe(true);
    expect(result.fairnessScore).toBe(0);
    expect(result.fairnessLabel).toBe('Settlement Transfer');
    expect(result.winnerRosterId).toBeNull();
    expect(result.winnerRosterName).toBeNull();
    expect(result.summaryHeadline).toBe('Settlement Transfer — Unilateral Asset Move (Not Graded)');
    for (const p of result.participants) {
      expect(p.letterGrade).toBe('N/A');
      expect(p.isWinner).toBe(false);
    }
    expect(result.participants.find((p) => p.rosterId === 2)!.incomingPlayers.length).toBe(1);
  });

  it('returns fairnessScore 0 even for a low-DV unilateral transfer that would otherwise compute a non-zero pre-override fairness score', async () => {
    const { engine } = makeEngine();
    const snapshot = await engine.getLeagueSnapshot();
    const result = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 1, outgoingPickIds: ['2026-r2-orig-1'], incomingPickIds: [] },
          { rosterId: 2, outgoingPickIds: [], incomingPickIds: ['2026-r2-orig-1'] },
        ],
        pickTierOverrides: { '2026-r2-orig-1': 'Mid' },
        evaluationMode: 'HISTORICAL',
      },
      snapshot
    );
    expect(result.isSettlementTransfer).toBe(true);
    expect(result.fairnessScore).toBe(0);
    expect(result.fairnessLabel).toBe('Settlement Transfer');
    expect(result.participants.every((p) => p.letterGrade === 'N/A')).toBe(true);
  });

  it('uses the incomplete-proposal headline in LIVE mode', async () => {
    const { engine } = makeEngine();
    const snapshot = await engine.getLeagueSnapshot();
    const result = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 1, outgoingPlayerIds: ['1846'], incomingPlayerIds: [] },
          { rosterId: 2, outgoingPlayerIds: [], incomingPlayerIds: ['1846'] },
        ],
      },
      snapshot
    );
    expect(result.isSettlementTransfer).toBe(true);
    expect(result.fairnessScore).toBe(0);
    expect(result.summaryHeadline).toBe(
      'Incomplete Trade Proposal — Add Incoming & Outgoing Assets for Every Roster'
    );
  });

  it('resolves a 3-Roster proposal where one Roster has no assets to N/A', async () => {
    const { engine } = makeEngine();
    const snapshot = await engine.getLeagueSnapshot();
    const result = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 1, outgoingPlayerIds: ['1846'], incomingPlayerIds: ['r2_p11'] },
          { rosterId: 2, outgoingPlayerIds: ['r2_p11'], incomingPlayerIds: ['1846'] },
          { rosterId: 3, outgoingPlayerIds: [], incomingPlayerIds: [] },
        ],
      },
      snapshot
    );
    expect(result.participants.every((p) => p.letterGrade === 'N/A')).toBe(true);
    expect(result.winnerRosterId).toBeNull();
    expect(result.fairnessScore).toBe(0);
    expect(result.fairnessLabel).toBe('Settlement Transfer');
    expect(result.isSettlementTransfer).toBe(true);
  });

  it('keeps a complete two-sided trade graded and not a Settlement Transfer', async () => {
    const { engine } = makeEngine();
    const snapshot = await engine.getLeagueSnapshot();
    const result = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 1, outgoingPlayerIds: ['1846'], incomingPlayerIds: ['r2_p11'] },
          { rosterId: 2, outgoingPlayerIds: ['r2_p11'], incomingPlayerIds: ['1846'] },
        ],
      },
      snapshot
    );
    expect(result.isSettlementTransfer).toBe(false);
    expect(result.fairnessLabel).not.toBe('Settlement Transfer');
    expect(result.participants.every((p) => p.letterGrade !== 'N/A')).toBe(true);
  });

  it('marks an empty proposal as N/A with fairnessScore 100 and not a Settlement Transfer', async () => {
    const { engine } = makeEngine();
    const snapshot = await engine.getLeagueSnapshot();
    const result = engine.evaluateTrade(
      {
        participants: [
          { rosterId: 1, outgoingPlayerIds: [], incomingPlayerIds: [] },
          { rosterId: 2, outgoingPlayerIds: [], incomingPlayerIds: [] },
        ],
      },
      snapshot
    );
    expect(result.isSettlementTransfer).toBe(false);
    expect(result.fairnessScore).toBe(100);
    expect(result.fairnessLabel).toBe('Settlement Transfer');
    expect(result.participants.every((p) => p.letterGrade === 'N/A')).toBe(true);
  });
});

describe('Settlement Transfer — Hide Settlements filter (MbaLeagueEngine.gradeHistoricalTrades)', () => {
  function fixturesWithSettlement() {
    const fixtures = createDeterministicMbaFixtures();
    fixtures.transactions = [
      {
        transaction_id: 'tx_settle_a',
        type: 'trade',
        status: 'complete',
        created: 1900000000000,
        leg: 5,
        roster_ids: [1, 2],
        adds: { '1846': 2 },
        drops: { '1846': 1 },
        draft_picks: [],
        season: '2026',
        league_id: fixtures.league.league_id,
      },
      {
        transaction_id: 'tx_settle_b',
        type: 'trade',
        status: 'complete',
        created: 1900000100000,
        leg: 5,
        roster_ids: [2, 3],
        adds: { '1846': 3 },
        drops: { '1846': 2 },
        draft_picks: [],
        season: '2026',
        league_id: fixtures.league.league_id,
      },
      ...(fixtures.transactions ?? []),
    ];
    return fixtures;
  }

  it('grades unilateral historical transactions as Settlement Transfers and filters them with includeSettlements: false while keeping Flipped Asset chains', async () => {
    const { engine } = makeEngine(fixturesWithSettlement());
    const all = await engine.gradeHistoricalTrades({ season: 'ALL' });
    const settlements = all.filter((t) => t.isSettlementTransfer);
    expect(settlements.map((t) => t.transactionId)).toEqual(
      expect.arrayContaining(['tx_settle_a', 'tx_settle_b'])
    );
    for (const s of settlements) {
      expect(s.fairnessScore).toBe(0);
      expect(s.fairnessLabel).toBe('Settlement Transfer');
      expect(s.winnerRosterId).toBeNull();
      expect(s.participants.every((p) => p.letterGrade === 'N/A')).toBe(true);
    }
    const settleA = all.find((t) => t.transactionId === 'tx_settle_a')!;
    expect(settleA.hasFlippedAssets).toBe(true);
    expect(settleA.flippedAssets[0].flippedInTransactionId).toBe('tx_settle_b');

    const hidden = await engine.gradeHistoricalTrades({ season: 'ALL', includeSettlements: false });
    expect(hidden.some((t) => t.isSettlementTransfer)).toBe(false);
    expect(hidden.length).toBe(all.length - settlements.length);
    const shown = await engine.gradeHistoricalTrades({ includeSettlements: true });
    expect(shown.length).toBe(all.length);
  });
});
