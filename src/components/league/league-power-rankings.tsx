'use client';

import React, { useMemo, useState } from 'react';
import {
  Award,
  Crown,
  Flame,
  Layers,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { useMbaLeague } from '@/components/providers/mba-league-provider';
import {
   getCenterScarcityMultiplier,
  getDynastyAgeMultiplier,
} from '@/lib/trades/dynasty-valuation';
import {
  DraftPickAsset,
  ProjectedPickTier,
  RosterArchetype,
  RosterPowerRanking,
} from '@/lib/types/mba';

type SortColumn =
  | 'overall'
  | 'contender'
  | 'youngCore'
  | 'dynastyCore'
  | 'draftCapital';

function ArchetypeBadge({ archetype }: { archetype: RosterArchetype }) {
  const styles: Record<RosterArchetype, string> = {
    'Young Juggernaut':
      'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40',
    'Title Favorite':
      'bg-orange-500/20 text-orange-300 ring-orange-500/40',
    Reloading:
      'bg-sky-500/20 text-sky-300 ring-sky-500/40',
    'Asset-Rich Rebuilder':
      'bg-purple-500/20 text-purple-300 ring-purple-500/40',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ring-1 ${styles[archetype]}`}
    >
      <Sparkles className="h-3 w-3" />
      {archetype}
    </span>
  );
}

function PickTierChip({ pick }: { pick: DraftPickAsset }) {
  const tierStyles: Record<ProjectedPickTier, string> = {
    Early:
      'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
    Mid:
      'border-amber-500/40 bg-amber-500/15 text-amber-200',
    Late:
      'border-slate-700 bg-slate-800/90 text-slate-300',
  };

  const tierBadgeStyles: Record<ProjectedPickTier, string> = {
    Early: 'bg-emerald-500/30 text-emerald-200',
    Mid: 'bg-amber-500/30 text-amber-200',
    Late: 'bg-slate-700 text-slate-300',
  };

  const slotFormatted = `${pick.round}.${String(pick.projectedSlot).padStart(2, '0')}`;

  return (
    <div
      data-testid={`pick-chip-${pick.id}`}
      className={`rounded-lg border p-2 text-xs transition ${tierStyles[pick.projectedTier]}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-extrabold">
            {pick.round === 1 ? '1st' : '2nd'}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${tierBadgeStyles[pick.projectedTier]}`}
          >
            {pick.projectedTier} ({slotFormatted})
          </span>
        </div>
        <span className="font-mono text-[11px] font-bold text-white">
          {pick.dynastyValue.toFixed(1)}
        </span>
      </div>

      {pick.isTraded ? (
        <div className="mt-1 truncate text-[11px] font-semibold text-orange-300">
          via Roster #{pick.originalRosterId} ({pick.originalRosterName})
        </div>
      ) : (
        <div className="mt-1 text-[10px] text-slate-400">Own Selection</div>
      )}
    </div>
  );
}

export function LeaguePowerRankingsView() {
  const { engine, snapshot, activeRosterId, selectRoster } = useMbaLeague();
  const [sortBy, setSortBy] = useState<SortColumn>('overall');
  const [archetypeFilter, setArchetypeFilter] = useState<RosterArchetype | 'ALL'>('ALL');
  const [roundFilter, setRoundFilter] = useState<'ALL' | 1 | 2>('ALL');

  const powerRankings = useMemo(
    () => engine.evaluateLeaguePowerRankings(snapshot),
    [engine, snapshot]
  );

  const pickMatrix = useMemo(
    () => engine.getDraftPickMatrix(snapshot),
    [engine, snapshot]
  );

  const sortedRankings = useMemo(() => {
    const filtered =
      archetypeFilter === 'ALL'
        ? powerRankings
        : powerRankings.filter((r) => r.archetype === archetypeFilter);

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'contender':
          return a.contenderRank - b.contenderRank;
        case 'youngCore':
          return a.youngCoreRank - b.youngCoreRank;
        case 'dynastyCore':
          return a.dynastyCoreRank - b.dynastyCoreRank;
        case 'draftCapital':
          return a.draftPickRank - b.draftPickRank;
        case 'overall':
        default:
          return a.overallRank - b.overallRank;
      }
    });
  }, [powerRankings, archetypeFilter, sortBy]);

  // Top 12 NBA Dynasty Assets across the league to showcase age curve + 2-Center scarcity
  const topDynastyPlayers = useMemo(() => {
    const list = snapshot.rosters.flatMap((roster) =>
      roster.allPlayers.map((player) => ({
        player,
        roster,
        ageMultiplier: getDynastyAgeMultiplier(player.age),
        scarcityMultiplier: getCenterScarcityMultiplier(player.positions),
      }))
    );
    return list
      .sort((a, b) => b.player.dynastyValue - a.player.dynastyValue)
      .slice(0, 12);
  }, [snapshot.rosters]);

  const tradedPicksCount = useMemo(
    () => pickMatrix.allPicks.filter((p) => p.isTraded).length,
    [pickMatrix.allPicks]
  );

  const activeRanking: RosterPowerRanking | undefined = powerRankings.find(
    (r) => r.rosterId === activeRosterId
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      {/* Hero Banner */}
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-lg">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight text-white">
                  MBA Power Rankings & 2026–2029 Draft Pick Matrix
                </h1>
                <span className="rounded-md bg-orange-500/15 px-2 py-0.5 font-mono text-xs font-bold text-orange-300 ring-1 ring-orange-500/30">
                  80 Draft Pick Assets Resolved
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Custom MBA Dynasty Valuation (Age Curve 1.22x Peak at 21–24 • 1.12x 2-Center Scarcity) •{' '}
                2026–2027 Inverse Max PF (<span className="font-mono text-slate-300">ppts</span>) Tiers &
                2028–2029 50% Mid-Round Young-Core Regression
              </p>
            </div>
          </div>

          {activeRanking && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-orange-300">
                  Active Roster Power Rank
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-extrabold text-white">
                    #{activeRanking.overallRank} Overall
                  </span>
                  <span className="text-xs font-semibold text-slate-300">
                    ({activeRanking.rosterName})
                  </span>
                </div>
              </div>
              <ArchetypeBadge archetype={activeRanking.archetype} />
            </div>
          )}
        </div>
      </section>

      {/* Section 1: MBA Power Rankings Table */}
      <section className="space-y-4" aria-label="MBA Power Rankings Table">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
              <Crown className="h-5 w-5 text-orange-400" />
              <span>10-Team MBA Dynasty Power Rankings</span>
            </h2>
            <p className="text-xs text-slate-400">
              Comparing Contender Score (Starting 10 MBA FP/G), Under-25 Young Core Value, and 2026–2029 Draft Pick Capital
            </p>
          </div>

          {/* Sort & Archetype Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1 text-xs">
              {(
                [
                  { id: 'overall', label: 'Overall Power' },
                  { id: 'contender', label: 'Contender (Start 10)' },
                  { id: 'youngCore', label: 'Young Core (<25)' },
                  { id: 'draftCapital', label: 'Draft Capital' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSortBy(tab.id)}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 font-semibold transition ${
                    sortBy === tab.id
                      ? 'bg-orange-500 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter by Roster Archetype"
              value={archetypeFilter}
              onChange={(e) => setArchetypeFilter(e.target.value as RosterArchetype | 'ALL')}
              className="cursor-pointer rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 outline-none focus:border-orange-500"
            >
              <option value="ALL">All Archetypes (10)</option>
              <option value="Young Juggernaut">Young Juggernaut</option>
              <option value="Title Favorite">Title Favorite</option>
              <option value="Reloading">Reloading</option>
              <option value="Asset-Rich Rebuilder">Asset-Rich Rebuilder</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl">
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3.5">Rank</th>
                <th className="px-4 py-3.5">MBA Roster & Manager</th>
                <th className="px-4 py-3.5">Archetype</th>
                <th className="px-4 py-3.5 text-right">Overall Dynasty Power</th>
                <th className="px-4 py-3.5 text-right">Contender Score (Start 10 FP/G)</th>
                <th className="px-4 py-3.5 text-right">Young Core (&lt;25 Dynasty Val)</th>
                <th className="px-4 py-3.5 text-right">2026–2029 Draft Pick Capital</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {sortedRankings.map((row) => {
                const isSelected = row.rosterId === activeRosterId;
                return (
                  <tr
                    key={row.rosterId}
                    data-testid={`power-ranking-row-${row.rosterId}`}
                    onClick={() => selectRoster(row.rosterId)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? 'bg-orange-500/10 hover:bg-orange-500/15'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-extrabold ${
                          row.overallRank <= 3
                            ? 'bg-orange-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        #{row.overallRank}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-400">
                          #{row.rosterId}
                        </span>
                        <div>
                          <div className="font-bold text-white">{row.rosterName}</div>
                          <div className="text-xs text-slate-400">
                            @{row.managerDisplayName} •{' '}
                            <span className="font-mono text-slate-300">
                              {row.wins}-{row.losses}
                            </span>{' '}
                            • Max PF:{' '}
                            <span className="font-mono text-slate-300">
                              {row.ppts.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <ArchetypeBadge archetype={row.archetype} />
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="font-mono text-base font-extrabold text-orange-300">
                        {row.overallDynastyPower.toFixed(1)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Core: {row.dynastyCoreScore.toFixed(1)} (#{row.dynastyCoreRank})
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="font-mono text-sm font-bold text-emerald-300">
                        {row.contenderScore.toFixed(1)} FP/G
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Rank #{row.contenderRank}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="font-mono text-sm font-bold text-sky-300">
                        {row.youngCoreValue.toFixed(1)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {row.under25PlayerCount} under-25 • Rank #{row.youngCoreRank}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="font-mono text-sm font-bold text-purple-300">
                        {row.draftPickCapital.toFixed(1)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {row.ownedFirstRoundPicksCount}× 1st • {row.ownedSecondRoundPicksCount}× 2nd (#{row.draftPickRank})
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: 2026–2029 Draft Capital Ownership Matrix */}
      <section className="space-y-4" aria-label="2026–2029 Draft Capital Ownership Matrix">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
              <Layers className="h-5 w-5 text-orange-400" />
              <span>2026–2029 Draft Pick Asset Ownership Matrix (80 Picks)</span>
            </h2>
            <p className="text-xs text-slate-400">
              All 10 MBA Rosters × 4 Seasons × 2 Rounds • {tradedPicksCount} Traded Picks Resolved from{' '}
              <span className="font-mono text-slate-300">/traded_picks</span> with Original Roster Attribution
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Tier Legend Pills */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300 ring-1 ring-emerald-500/30">
                Early (Slots 1–3)
              </span>
              <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300 ring-1 ring-amber-500/30">
                Mid (Slots 4–6)
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-300 ring-1 ring-slate-700">
                Late (Slots 7–10)
              </span>
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1 text-xs">
              {(
                [
                  { id: 'ALL', label: 'All Rounds (80)' },
                  { id: 1, label: 'Round 1 (40)' },
                  { id: 2, label: 'Round 2 (40)' },
                ] as const
              ).map((btn) => (
                <button
                  key={String(btn.id)}
                  type="button"
                  onClick={() => setRoundFilter(btn.id)}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 font-semibold transition ${
                    roundFilter === btn.id
                      ? 'bg-orange-500 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="w-56 px-4 py-3.5">Owning MBA Roster</th>
                {pickMatrix.seasons.map((season) => (
                  <th key={season} className="px-4 py-3.5">
                    <div className="flex items-center justify-between">
                      <span>{season} Draft Picks</span>
                      <span className="font-mono text-[10px] font-normal text-slate-500">
                        {season === '2026' || season === '2027'
                          ? 'Inv. Max PF'
                          : '50% Mid Regressed'}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {pickMatrix.rows.map((row) => {
                const isSelected = row.rosterId === activeRosterId;
                return (
                  <tr
                    key={row.rosterId}
                    data-testid={`pick-matrix-row-${row.rosterId}`}
                    className={`align-top transition ${
                      isSelected ? 'bg-orange-500/10' : 'hover:bg-slate-900/90'
                    }`}
                  >
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => selectRoster(row.rosterId)}
                        className="cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-orange-400">
                            #{row.rosterId}
                          </span>
                          <span className="font-bold text-white hover:underline">
                            {row.rosterName}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          @{row.managerDisplayName}
                        </div>
                        <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-300">
                          <span>Cap: {row.totalPickCapital.toFixed(1)}</span>
                          <span>•</span>
                          <span>
                            {row.firstRoundCount}× R1 / {row.secondRoundCount}× R2
                          </span>
                        </div>
                      </button>
                    </td>

                    {pickMatrix.seasons.map((season) => {
                      const picks = row.picksBySeason[season].filter(
                        (p) => roundFilter === 'ALL' || p.round === roundFilter
                      );
                      return (
                        <td key={season} className="px-3 py-3">
                          {picks.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-800 p-2.5 text-center text-xs text-slate-500">
                              No picks owned
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {picks.map((pick) => (
                                <PickTierChip key={pick.id} pick={pick} />
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: League Cornerstone Player Dynasty Value Leaderboard */}
      <section className="space-y-3" aria-label="NBA Player Dynasty Value Leaderboard">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
              <Flame className="h-5 w-5 text-orange-400" />
              <span>MBA Dynasty Cornerstone Leaderboard (0–100 Scale)</span>
            </h2>
            <p className="text-xs text-slate-400">
              Combines 2026 Custom MBA FP/G, Dynasty Age Curve (1.22x Peak at Ages 21–24), and 1.12x 2-Center Positional Scarcity
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topDynastyPlayers.map(({ player, roster, ageMultiplier, scarcityMultiplier }, idx) => (
            <div
              key={`${roster.rosterId}-${player.playerId}`}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 p-3.5"
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-orange-400">
                    #{idx + 1}
                  </span>
                  <span className="truncate text-sm font-bold text-white">
                    {player.fullName}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="font-mono text-slate-300">
                    {player.positions.join('/')}
                  </span>
                  <span>•</span>
                  <span>Age {player.age ?? '—'} ({ageMultiplier.toFixed(2)}x)</span>
                  {scarcityMultiplier > 1 && (
                    <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-300">
                      2C {scarcityMultiplier.toFixed(2)}x
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-[11px] text-slate-500">
                  Roster #{roster.rosterId} {roster.manager.rosterName} •{' '}
                  {player.seasonMetrics.mbaFantasyPointsPerGame.toFixed(1)} FP/G
                </div>
              </div>

              <div className="shrink-0 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1.5 text-right">
                <div className="text-[9px] font-bold uppercase tracking-wider text-orange-300">
                  Dynasty
                </div>
                <div className="font-mono text-base font-extrabold text-white">
                  {player.dynastyValue.toFixed(1)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
