import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MbaLeagueProvider } from '@/components/providers/mba-league-provider';
import { CompletedTradeGrader } from '@/components/trades/completed-trade-grader';
import { DynastyTradeBuilder } from '@/components/trades/dynasty-trade-builder';
import { createDeterministicMbaFixtures } from '@/lib/engine/fixtures/mba-fixtures';
import { TradeProposal } from '@/lib/types/mba';

function decodeHtmlEntities(html: string): string {
  return html.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
}

describe('Trade Center Axis 2 Fairness UI Synchronization (#18) — MbaLeagueProvider Seam', () => {
  it('synchronizes DynastyTradeBuilder Fairness Index progress-bar and label colors to 85 / 68 / 45 cutoffs', () => {
    const fixtures = createDeterministicMbaFixtures();

    const renderBuilderBanner = (proposal: TradeProposal) =>
      decodeHtmlEntities(
        renderToStaticMarkup(
          <MbaLeagueProvider initialBundle={fixtures}>
            <DynastyTradeBuilder externalProposal={proposal} />
          </MbaLeagueProvider>
        )
      );

    // 1. Balanced Trade (>= 85): 22 vs 15 -> spread 7.0 -> score 90 -> bg-emerald-500
    const balancedHtml = renderBuilderBanner({
      participants: [
        { rosterId: 1, outgoingPickIds: ['2026-r2-orig-1'], incomingPickIds: ['2026-r2-orig-2'] },
        { rosterId: 2, outgoingPickIds: ['2026-r2-orig-2'], incomingPickIds: ['2026-r2-orig-1'] },
      ],
      pickTierOverrides: { '2026-r2-orig-1': 'Early', '2026-r2-orig-2': 'Mid' },
    });
    expect(balancedHtml).toContain('Balanced Trade (90/100 Fairness)');
    expect(balancedHtml).toContain('h-full rounded-full transition-all bg-emerald-500');

    // 2. Slight Edge (68-84): 46 vs 32 -> spread 14.0 -> score 80 -> bg-sky-500 (not bg-emerald-500!)
    const slightEdgeHtml = renderBuilderBanner({
      participants: [
        { rosterId: 1, outgoingPickIds: ['2026-r1-orig-1'], incomingPickIds: ['2026-r1-orig-2'] },
        { rosterId: 2, outgoingPickIds: ['2026-r1-orig-2'], incomingPickIds: ['2026-r1-orig-1'] },
      ],
      pickTierOverrides: { '2026-r1-orig-1': 'Mid', '2026-r1-orig-2': 'Late' },
    });
    expect(slightEdgeHtml).toContain('Slight Edge (80/100 Fairness)');
    expect(slightEdgeHtml).toContain('h-full rounded-full transition-all bg-sky-500');

    // 3. Lopsided Trade (45-67): 46 vs 15 -> spread 31.0 -> score 57 -> bg-amber-400 (not bg-rose-500!)
    const lopsidedHtml = renderBuilderBanner({
      participants: [
        { rosterId: 1, outgoingPickIds: ['2026-r1-orig-1'], incomingPickIds: ['2026-r2-orig-2'] },
        { rosterId: 2, outgoingPickIds: ['2026-r2-orig-2'], incomingPickIds: ['2026-r1-orig-1'] },
      ],
      pickTierOverrides: { '2026-r1-orig-1': 'Mid', '2026-r2-orig-2': 'Mid' },
    });
    expect(lopsidedHtml).toContain('Lopsided Trade (57/100 Fairness)');
    expect(lopsidedHtml).toContain('bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40');
    expect(lopsidedHtml).toContain('h-full rounded-full transition-all bg-amber-400');

    // 4. Fleecing Alert (< 45): (46 + 15) vs 15 -> spread 46.0 -> score 36 -> bg-rose-500
    const fleecingHtml = renderBuilderBanner({
      participants: [
        {
          rosterId: 1,
          outgoingPickIds: ['2026-r1-orig-1', '2026-r2-orig-1'],
          incomingPickIds: ['2026-r2-orig-2'],
        },
        {
          rosterId: 2,
          outgoingPickIds: ['2026-r2-orig-2'],
          incomingPickIds: ['2026-r1-orig-1', '2026-r2-orig-1'],
        },
      ],
      pickTierOverrides: {
        '2026-r1-orig-1': 'Mid',
        '2026-r2-orig-1': 'Mid',
        '2026-r2-orig-2': 'Mid',
      },
    });
    expect(fleecingHtml).toContain('Fleecing Alert (36/100 Fairness)');
    expect(fleecingHtml).toContain('bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40');
    expect(fleecingHtml).toContain('h-full rounded-full transition-all bg-rose-500');
  });

  it('styles Lopsided Trade (amber) distinctly from Fleecing Alert (rose) in CompletedTradeGrader', () => {
    const fixtures = createDeterministicMbaFixtures();
    fixtures.transactions = [
      // Lopsided Trade: 2025-r1-orig-1 (46) vs 2025-r2-orig-3 (15) -> spread 31.0 -> score 57
      {
        transaction_id: 'tx_lopsided_test',
        type: 'trade',
        status: 'complete',
        created: 1733000100000,
        leg: 6,
        season: '2025',
        league_id: '1212393765696700416',
        roster_ids: [1, 2],
        adds: {},
        drops: {},
        draft_picks: [
          { season: '2025', round: 1, roster_id: 1, previous_owner_id: 1, owner_id: 2 },
          { season: '2025', round: 2, roster_id: 3, previous_owner_id: 2, owner_id: 1 },
        ],
      },
      // Fleecing Alert: 2025-r1-orig-1 (46) + 2025-r2-orig-1 (15) vs 2025-r2-orig-3 (15) -> spread 46.0 -> score 36
      {
        transaction_id: 'tx_fleecing_test',
        type: 'trade',
        status: 'complete',
        created: 1733000000000,
        leg: 5,
        season: '2025',
        league_id: '1212393765696700416',
        roster_ids: [3, 4],
        adds: {},
        drops: {},
        draft_picks: [
          { season: '2025', round: 1, roster_id: 1, previous_owner_id: 3, owner_id: 4 },
          { season: '2025', round: 2, roster_id: 1, previous_owner_id: 3, owner_id: 4 },
          { season: '2025', round: 2, roster_id: 3, previous_owner_id: 4, owner_id: 3 },
        ],
      },
    ];

    const html = decodeHtmlEntities(
      renderToStaticMarkup(
        <MbaLeagueProvider initialBundle={fixtures}>
          <CompletedTradeGrader />
        </MbaLeagueProvider>
      )
    );

    expect(html).toContain('Lopsided Trade (57/100)');
    expect(html).toContain('bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30');
    expect(html).toContain('Fleecing Alert (36/100)');
    expect(html).toContain('bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30');
  });
});
