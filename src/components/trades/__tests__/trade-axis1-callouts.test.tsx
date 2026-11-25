import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MbaLeagueProvider } from '@/components/providers/mba-league-provider';
import { DynastyTradeBuilder } from '@/components/trades/dynasty-trade-builder';
import { createDeterministicMbaFixtures } from '@/lib/engine/fixtures/mba-fixtures';
import { TradeProposal } from '@/lib/types/mba';

function decodeHtmlEntities(html: string): string {
  return html.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
}

describe('Trade Center Axis 1 Callouts (#17) — MbaLeagueProvider UI Seam', () => {
  it('renders 24.0 drop ceiling and 14.0 Waiver Replacement Baseline pick-offset breakdown in DynastyTradeBuilder callout when replacementCutPenalty < rawCutSum', () => {
    const fixtures = createDeterministicMbaFixtures();
    // Roster #1 is 15/15 active and all BN players have DV > 24.0 (e.g. Trey Murphy III '2713' ~ 53.8 DV).
    // Roster #1 sends 2026-r1-orig-1 for Roster #2's Trae Young ('r2_p1') ->
    // 1 cut ('2713' > 24.0) capped at 24.0 and offset by 14.0 Waiver Replacement Baseline -> -10.0 net penalty.
    const proposal: TradeProposal = {
      participants: [
        {
          rosterId: 1,
          outgoingPickIds: ['2026-r1-orig-1'],
          incomingPlayerIds: ['r2_p1'],
        },
        {
          rosterId: 2,
          outgoingPlayerIds: ['r2_p1'],
          incomingPickIds: ['2026-r1-orig-1'],
        },
      ],
    };

    const html = decodeHtmlEntities(
      renderToStaticMarkup(
        <MbaLeagueProvider initialBundle={fixtures}>
          <DynastyTradeBuilder externalProposal={proposal} />
        </MbaLeagueProvider>
      )
    );

    expect(html).toContain('data-testid="replacement-cut-callout-1"');
    expect(html).toContain('-10.0');
    expect(html).toContain('24.0');
    expect(html).toContain('Waiver Replacement Baseline');
  });
});
