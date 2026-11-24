import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MbaLeagueProvider } from '@/components/providers/mba-league-provider';
import { CompletedTradeGrader } from '@/components/trades/completed-trade-grader';
import { DynastyTradeBuilder } from '@/components/trades/dynasty-trade-builder';
import { createDeterministicMbaFixtures } from '@/lib/engine/fixtures/mba-fixtures';
import { MbaLeagueEngine } from '@/lib/engine/mba-league-engine';
import { InMemorySleeperGateway } from '@/lib/gateway/in-memory-sleeper-gateway';
import { InMemoryManagerStateStore } from '@/lib/store/manager-state-store';
import { SleeperGameStatEntry } from '@/lib/types/mba';

function makeStatEntry(params: {
  playerId: string;
  season: string;
  gp: number;
  fpg: number;
}): SleeperGameStatEntry {
  return {
    player_id: params.playerId,
    date: null,
    opponent: null,
    game_id: `${params.season}_${params.playerId}`,
    season: params.season,
    week: null,
    team: 'HOU',
    stats:
      params.gp > 0
        ? { gp: params.gp, reb: Math.round(params.gp * params.fpg * 100) / 100 }
        : {},
  };
}

function decodeHtmlEntities(html: string): string {
  return html.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
}

function createEstimatedTradeFixtures() {
  const fixtures = createDeterministicMbaFixtures();
  // Seeded Trade Builder default includes '1883' (Roster 1 -> 10) and 'r10_p5' (Roster 10 -> 1).
  // '1883' is also in fixture historical trade tx_2026_1.
  // Make '1883' a 0-GP BASELINE_ESTIMATE player and 'r10_p5' a 2-GP SMALL_SAMPLE_BLENDED player.
  const baselineId = '1883';
  const smallSampleId = 'r10_p5';

  fixtures.seasonStats = fixtures.seasonStats.filter(
    (s) => s.player_id !== baselineId && s.player_id !== smallSampleId
  );
  fixtures.weeklyProjections = fixtures.weeklyProjections.filter(
    (p) => p.player_id !== baselineId && p.player_id !== smallSampleId
  );

  fixtures.seasonStats.push(
    makeStatEntry({ playerId: baselineId, season: '2026', gp: 0, fpg: 0 }),
    makeStatEntry({ playerId: smallSampleId, season: '2026', gp: 2, fpg: 5.0 })
  );

  fixtures.previousSeasonStats = [
    makeStatEntry({ playerId: baselineId, season: '2025', gp: 50, fpg: 18.4 }),
    makeStatEntry({ playerId: smallSampleId, season: '2025', gp: 60, fpg: 24.0 }),
  ];
  fixtures.seasonProjections = [
    makeStatEntry({ playerId: baselineId, season: '2026', gp: 1, fpg: 15.7 }),
    makeStatEntry({ playerId: smallSampleId, season: '2026', gp: 1, fpg: 22.0 }),
  ];

  // Add a historical trade involving smallSampleId ('r10_p5') and an established Roster 2 player
  const roster2EstablishedId = fixtures.rosters
    .find((r) => r.roster_id === 2)!
    .players!.find((pid) => pid !== baselineId && pid !== smallSampleId)!;

  fixtures.transactions = [
    {
      transaction_id: 'tx_est_badge_small_sample',
      type: 'trade',
      status: 'complete',
      created: 1900000000000,
      leg: 5,
      roster_ids: [10, 2],
      adds: { [smallSampleId]: 2, [roster2EstablishedId]: 10 },
      drops: { [smallSampleId]: 10, [roster2EstablishedId]: 2 },
      draft_picks: [],
      season: '2026',
      league_id: fixtures.league.league_id,
    },
    ...(fixtures.transactions ?? []),
  ];

  return { fixtures, baselineId, smallSampleId, roster2EstablishedId };
}

describe('Trade Center Est. Dynasty Value Provenance Badge', () => {
  it('renders Est. badge with basis note tooltip for BASELINE_ESTIMATE and SMALL_SAMPLE_BLENDED in DynastyTradeBuilder picker and evaluated package rows, and omits it for ACTUAL_ESTABLISHED', () => {
    const { fixtures, baselineId, smallSampleId } = createEstimatedTradeFixtures();

    const engine = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(fixtures),
      stateStore: new InMemoryManagerStateStore(),
    });
    const snapshot = engine.buildSnapshotFromBundle(fixtures, 1);

    const baselineSlot = snapshot.rosters
      .find((r) => r.rosterId === 1)!
      .allPlayers.find((p) => p.playerId === baselineId)!;
    const smallSampleSlot = snapshot.rosters
      .find((r) => r.rosterId === 10)!
      .allPlayers.find((p) => p.playerId === smallSampleId)!;

    expect(baselineSlot.dynastyValueSource).toBe('BASELINE_ESTIMATE');
    expect(smallSampleSlot.dynastyValueSource).toBe('SMALL_SAMPLE_BLENDED');

    const html = decodeHtmlEntities(
      renderToStaticMarkup(
        <MbaLeagueProvider initialBundle={fixtures}>
          <DynastyTradeBuilder />
        </MbaLeagueProvider>
      )
    );

    // Appears in both evaluated package row and roster picker row for baselineId and smallSampleId (4 total)
    const estMatches = html.match(/>Est\.</g) ?? [];
    expect(estMatches.length).toBe(4);
    expect(html).toContain(`title="${baselineSlot.dynastyValueBasisNote}"`);
    expect(html).toContain(`title="${smallSampleSlot.dynastyValueBasisNote}"`);
  });

  it('renders Est. badge with basis note tooltip in CompletedTradeGrader only for estimated players and not for ACTUAL_ESTABLISHED players', () => {
    const { fixtures, baselineId, smallSampleId, roster2EstablishedId } =
      createEstimatedTradeFixtures();

    const engine = new MbaLeagueEngine({
      gateway: new InMemorySleeperGateway(fixtures),
      stateStore: new InMemoryManagerStateStore(),
    });
    const snapshot = engine.buildSnapshotFromBundle(fixtures, 1);
    const baselineSlot = snapshot.rosters
      .find((r) => r.rosterId === 1)!
      .allPlayers.find((p) => p.playerId === baselineId)!;
    const smallSampleSlot = snapshot.rosters
      .find((r) => r.rosterId === 10)!
      .allPlayers.find((p) => p.playerId === smallSampleId)!;
    const establishedSlot = snapshot.rosters
      .find((r) => r.rosterId === 2)!
      .allPlayers.find((p) => p.playerId === roster2EstablishedId)!;

    expect(establishedSlot.dynastyValueSource).toBe('ACTUAL_ESTABLISHED');

    const html = decodeHtmlEntities(
      renderToStaticMarkup(
        <MbaLeagueProvider initialBundle={fixtures}>
          <CompletedTradeGrader />
        </MbaLeagueProvider>
      )
    );

    // 1883 (BASELINE_ESTIMATE in tx_2026_1) + r10_p5 (SMALL_SAMPLE_BLENDED in tx_est_badge_small_sample) = 2 total
    const estMatches = html.match(/>Est\.</g) ?? [];
    expect(estMatches.length).toBe(2);
    expect(html).toContain(`title="${baselineSlot.dynastyValueBasisNote}"`);
    expect(html).toContain(`title="${smallSampleSlot.dynastyValueBasisNote}"`);
  });

  it('renders zero Est. badges when all players are ACTUAL_ESTABLISHED', () => {
    const fixtures = createDeterministicMbaFixtures();

    const builderHtml = renderToStaticMarkup(
      <MbaLeagueProvider initialBundle={fixtures}>
        <DynastyTradeBuilder />
      </MbaLeagueProvider>
    );
    const graderHtml = renderToStaticMarkup(
      <MbaLeagueProvider initialBundle={fixtures}>
        <CompletedTradeGrader />
      </MbaLeagueProvider>
    );

    expect(builderHtml.match(/>Est\.</g) ?? []).toHaveLength(0);
    expect(graderHtml.match(/>Est\.</g) ?? []).toHaveLength(0);
  });
});
