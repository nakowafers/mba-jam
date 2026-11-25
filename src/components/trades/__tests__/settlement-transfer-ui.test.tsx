import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MbaLeagueProvider } from '@/components/providers/mba-league-provider';
import {
  CompletedTradeGrader,
  resolveFlippedTradeJumpFilters,
} from '@/components/trades/completed-trade-grader';
import { DynastyTradeBuilder } from '@/components/trades/dynasty-trade-builder';
import { createDeterministicMbaFixtures } from '@/lib/engine/fixtures/mba-fixtures';
import { MbaLeagueEngine } from '@/lib/engine/mba-league-engine';
import { InMemorySleeperGateway } from '@/lib/gateway/in-memory-sleeper-gateway';
import { InMemoryManagerStateStore } from '@/lib/store/manager-state-store';
import { TradeProposal } from '@/lib/types/mba';

function decodeHtmlEntities(html: string): string {
  return html.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
}

describe('Settlement Transfer UI — DynastyTradeBuilder & CompletedTradeGrader (#19)', () => {
  it('renders N/A badges in neutral slate and an incomplete-proposal banner instead of Fleecing Alert / F in 2-Roster and 3-Roster mid-build states', () => {
    const fixtures = createDeterministicMbaFixtures();
    const renderBuilder = (proposal: TradeProposal) =>
      decodeHtmlEntities(
        renderToStaticMarkup(
          <MbaLeagueProvider initialBundle={fixtures}>
            <DynastyTradeBuilder externalProposal={proposal} />
          </MbaLeagueProvider>
        )
      );

    // 2-Roster unilateral mid-build: Roster 1 sends Victor Wembanyama ('1846'), Roster 2 sends nothing
    const twoRosterPartialHtml = renderBuilder({
      participants: [
        { rosterId: 1, outgoingPlayerIds: ['1846'], incomingPlayerIds: [] },
        { rosterId: 2, outgoingPlayerIds: [], incomingPlayerIds: ['1846'] },
      ],
    });

    expect(twoRosterPartialHtml).toContain(
      'Incomplete Trade Proposal — Add Incoming & Outgoing Assets for Every Roster'
    );
    expect(twoRosterPartialHtml).toContain('data-testid="incomplete-proposal-banner"');
    expect(twoRosterPartialHtml).not.toContain('Fleecing Alert');
    expect(twoRosterPartialHtml).not.toContain('0/100 Fairness');
    expect(twoRosterPartialHtml).toContain('border-slate-600/60 bg-slate-800/70 text-slate-300');
    expect(twoRosterPartialHtml.match(/>N\/A</g) ?? []).toHaveLength(2);
    expect(twoRosterPartialHtml).not.toMatch(/rounded-2xl border-2 font-mono[^>]*>F</);

    // 3-Roster partial mid-build: Roster 1 & 2 swap picks, Roster 3 has 0 incoming and 0 outgoing
    const threeRosterPartialHtml = renderBuilder({
      participants: [
        { rosterId: 1, outgoingPickIds: ['2026-r1-orig-1'], incomingPickIds: ['2026-r1-orig-2'] },
        { rosterId: 2, outgoingPickIds: ['2026-r1-orig-2'], incomingPickIds: ['2026-r1-orig-1'] },
        { rosterId: 3, outgoingPickIds: [], incomingPickIds: [] },
      ],
    });

    expect(threeRosterPartialHtml).toContain('data-testid="incomplete-proposal-banner"');
    expect(threeRosterPartialHtml).not.toContain('Fleecing Alert');
    const naBadges = threeRosterPartialHtml.match(/>N\/A</g) ?? [];
    expect(naBadges.length).toBe(3);
  });

  it('renders N/A badges, Settlement Transfer badges, competitive graded count, and Hide Settlements toggle in CompletedTradeGrader, and auto-reveals settlements on Flipped Asset jump', async () => {
    const fixtures = createDeterministicMbaFixtures();
    fixtures.transactions = [
      {
        transaction_id: 'tx_ui_settlement_1',
        type: 'trade',
        status: 'complete',
        created: 1900000000000,
        leg: 6,
        roster_ids: [1, 2],
        adds: { '1846': 2 },
        drops: { '1846': 1 },
        draft_picks: [],
        season: '2026',
        league_id: fixtures.league.league_id,
      },
      {
        transaction_id: 'tx_ui_settlement_2',
        type: 'trade',
        status: 'complete',
        created: 1900000100000,
        leg: 6,
        roster_ids: [2, 3],
        adds: { '1846': 3 },
        drops: { '1846': 2 },
        draft_picks: [],
        season: '2026',
        league_id: fixtures.league.league_id,
      },
      ...(fixtures.transactions ?? []),
    ];

    const engine = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(fixtures),
      stateStore: new InMemoryManagerStateStore(),
    });
    const allTrades = await engine.gradeHistoricalTrades({ season: 'ALL' });
    const settlementCount = allTrades.filter((t) => t.isSettlementTransfer).length;
    const competitiveCount = allTrades.length - settlementCount;

    const html = decodeHtmlEntities(
      renderToStaticMarkup(
        <MbaLeagueProvider initialBundle={fixtures}>
          <CompletedTradeGrader />
        </MbaLeagueProvider>
      )
    );

    // Summary metrics card shows competitive graded count as primary figure + total & Settlement Transfers subtext
    expect(html).toMatch(new RegExp(`data-testid="graded-trades-count"[^>]*>${competitiveCount}<`));
    expect(html).toContain(`${allTrades.length} total • ${settlementCount} Settlement Transfer`);

    // Hide Settlements toggle is present and defaults to showing settlements
    expect(html).toContain('data-testid="toggle-settlements-filter"');
    expect(html).toContain('Hide Settlements');
    expect(html).toContain('data-testid="historical-trade-card-tx_ui_settlement_1"');
    expect(html).toContain('data-testid="historical-trade-card-tx_ui_settlement_2"');

    // Settlement Transfer card shows distinct neutral Settlement Transfer badge (no 0/100 score) and N/A grades
    expect(html).toContain('Settlement Transfer');
    expect(html).not.toContain('Settlement Transfer (0/100)');
    expect(html).toContain('border-slate-600/60 bg-slate-800/70 text-slate-300');
    expect(html).toContain('>N/A<');
    expect(html).toContain('data-testid="flipped-asset-badge-tx_ui_settlement_1-1846"');

    // Auto-reveal settlement visibility when jumping to a Flipped Asset transaction that is a Settlement Transfer
    const targetSettlement = allTrades.find((t) => t.transactionId === 'tx_ui_settlement_2')!;
    const resolvedFilters = resolveFlippedTradeJumpFilters(targetSettlement, {
      seasonFilter: '2025',
      rosterIdFilter: 1,
      includeSettlements: false,
    });
    expect(resolvedFilters).toEqual({
      seasonFilter: 'ALL',
      rosterIdFilter: null,
      includeSettlements: true,
    });
  });
});
