'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
  GitBranch,
  History,
  Repeat,
  Scale,
  Scissors,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserCheck,
} from 'lucide-react';
import { useMbaLeague } from '@/components/providers/mba-league-provider';
import {
  EvaluatedTradePickAsset,
  EvaluatedTradePlayerAsset,
  GradedHistoricalTrade,
  HistoricalTradeSeasonFilter,
  MBA_LEAGUE_ID_2025,
  MBA_LEAGUE_ID_2026,
  TradeLetterGrade,
  TradeParticipantEvaluation,
  TradeProposal,
} from '@/lib/types/mba';

function GradeBadge({ grade }: { grade: TradeLetterGrade }) {
  const isA = grade.startsWith('A');
  const isB = grade.startsWith('B');
  const isC = grade.startsWith('C');

  const style = isA
    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-emerald-950/50'
    : isB
      ? 'border-sky-500/50 bg-sky-500/20 text-sky-300 shadow-sky-950/50'
      : isC
        ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 shadow-amber-950/50'
        : 'border-rose-500/50 bg-rose-500/20 text-rose-300 shadow-rose-950/50';

  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 font-mono text-xl font-black shadow-md ${style}`}
    >
      {grade}
    </div>
  );
}

export function CompletedTradeGrader({
  onLoadInBuilder,
}: {
  onLoadInBuilder?: (proposal: TradeProposal) => void;
}) {
  const { engine, snapshot, activeRosterId } = useMbaLeague();

  const [seasonFilter, setSeasonFilter] = useState<HistoricalTradeSeasonFilter>('ALL');
  const [rosterIdFilter, setRosterIdFilter] = useState<number | null>(null);
  const [expandedTradeIds, setExpandedTradeIds] = useState<Record<string, boolean>>(() => {
    const firstId = snapshot.historicalTrades?.[0]?.transactionId;
    return firstId ? { [firstId]: true } : {};
  });
  const [highlightedTradeId, setHighlightedTradeId] = useState<string | null>(null);

  const allHistoricalTrades = useMemo(
    () => engine.gradeHistoricalTrades({ season: 'ALL' }, snapshot),
    [engine, snapshot]
  );

  const filteredTrades = useMemo(
    () =>
      engine.gradeHistoricalTrades(
        {
          season: seasonFilter,
          rosterId: rosterIdFilter,
        },
        snapshot
      ),
    [engine, snapshot, seasonFilter, rosterIdFilter]
  );

  const count2026 = useMemo(
    () => allHistoricalTrades.filter((t) => t.season === '2026').length,
    [allHistoricalTrades]
  );
  const count2025 = useMemo(
    () => allHistoricalTrades.filter((t) => t.season === '2025').length,
    [allHistoricalTrades]
  );
  const totalFlippedCount = useMemo(
    () => allHistoricalTrades.reduce((acc, t) => acc + t.flippedAssets.length, 0),
    [allHistoricalTrades]
  );

  const toggleExpandBreakdown = (transactionId: string) => {
    setExpandedTradeIds((prev) => ({
      ...prev,
      [transactionId]: !prev[transactionId],
    }));
  };

  const handleJumpToFlippedTrade = (targetTransactionId: string) => {
    // Ensure filters allow target trade to be visible
    const targetTrade = allHistoricalTrades.find(
      (t) => t.transactionId === targetTransactionId
    );
    if (!targetTrade) return;

    if (seasonFilter !== 'ALL' && targetTrade.season !== seasonFilter) {
      setSeasonFilter('ALL');
    }
    if (rosterIdFilter !== null && !targetTrade.rosterIds.includes(rosterIdFilter)) {
      setRosterIdFilter(null);
    }

    setExpandedTradeIds((prev) => ({
      ...prev,
      [targetTransactionId]: true,
    }));
    setHighlightedTradeId(targetTransactionId);

    setTimeout(() => {
      if (typeof document !== 'undefined') {
        const el = document.getElementById(`historical-trade-${targetTransactionId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);

    setTimeout(() => {
      setHighlightedTradeId((prev) => (prev === targetTransactionId ? null : prev));
    }, 3500);
  };

  return (
    <div className="space-y-6" data-testid="completed-trade-grader-feed">
      {/* Multi-Season Summary Metrics Strip */}
      <section
        aria-label="MBA Trade History Summary Metrics"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Total Graded Trades
          </div>
          <div className="mt-1 font-mono text-2xl font-black text-white">
            {allHistoricalTrades.length}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            ADR-0002 Dual-Axis Graded
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-orange-300">
            2026 MBA Season
          </div>
          <div className="mt-1 font-mono text-2xl font-black text-orange-300">
            {count2026}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
            League {MBA_LEAGUE_ID_2026}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
            2025 MBA Season
          </div>
          <div className="mt-1 font-mono text-2xl font-black text-sky-300">
            {count2025}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
            League {MBA_LEAGUE_ID_2025}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
            <Repeat className="h-3.5 w-3.5" />
            <span>Flipped Assets</span>
          </div>
          <div
            data-testid="flipped-assets-total-count"
            className="mt-1 font-mono text-2xl font-black text-amber-200"
          >
            {totalFlippedCount}
          </div>
          <div className="mt-0.5 text-[11px] text-amber-200/80">
            Re-traded across 2025–2026 chains
          </div>
        </div>
      </section>

      {/* Filter Controls Bar: Season Pills (All / 2026 / 2025) & Participating Manager / Roster Selector */}
      <section
        aria-label="Historical Trade Filters"
        className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/85 p-4 lg:flex-row lg:items-center"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Calendar className="h-3.5 w-3.5 text-orange-400" />
            <span>Season:</span>
          </span>

          <div
            role="group"
            aria-label="Filter trades by MBA season"
            className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1 text-xs"
          >
            <button
              type="button"
              data-testid="season-filter-ALL"
              onClick={() => setSeasonFilter('ALL')}
              className={`cursor-pointer rounded-lg px-3 py-1.5 font-bold transition ${
                seasonFilter === 'ALL'
                  ? 'bg-orange-500 text-slate-950 shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              All Seasons ({allHistoricalTrades.length})
            </button>
            <button
              type="button"
              data-testid="season-filter-2026"
              onClick={() => setSeasonFilter('2026')}
              className={`cursor-pointer rounded-lg px-3 py-1.5 font-bold transition ${
                seasonFilter === '2026'
                  ? 'bg-orange-500 text-slate-950 shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              2026 Season ({count2026})
            </button>
            <button
              type="button"
              data-testid="season-filter-2025"
              onClick={() => setSeasonFilter('2025')}
              className={`cursor-pointer rounded-lg px-3 py-1.5 font-bold transition ${
                seasonFilter === '2025'
                  ? 'bg-orange-500 text-slate-950 shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              2025 Season ({count2025})
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <label
              htmlFor="historical-roster-filter"
              className="text-xs font-bold uppercase tracking-wider text-slate-400"
            >
              Manager / Roster:
            </label>
          </div>

          <select
            id="historical-roster-filter"
            aria-label="Filter trades by participating Manager or Roster"
            data-testid="historical-roster-filter-select"
            value={rosterIdFilter ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              setRosterIdFilter(val ? Number.parseInt(val, 10) : null);
            }}
            className="cursor-pointer rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-orange-500"
          >
            <option value="">All 10 MBA Managers &amp; Rosters</option>
            {snapshot.rosters.map((r) => (
              <option key={r.rosterId} value={r.rosterId}>
                Roster #{r.rosterId} — {r.manager.rosterName} (@{r.manager.displayName})
              </option>
            ))}
          </select>

          <button
            type="button"
            data-testid="filter-my-roster-trades-btn"
            onClick={() =>
              setRosterIdFilter((prev) => (prev === activeRosterId ? null : activeRosterId))
            }
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
              rosterIdFilter === activeRosterId
                ? 'border-orange-500/60 bg-orange-500/20 text-orange-200'
                : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            <span>
              {rosterIdFilter === activeRosterId
                ? `Showing Roster #${activeRosterId}`
                : `My Roster (#${activeRosterId})`}
            </span>
          </button>
        </div>
      </section>

      {/* Historical Trade Feed Cards */}
      {filteredTrades.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
          <History className="mx-auto h-8 w-8 text-slate-500" />
          <h3 className="mt-3 text-base font-bold text-white">
            No Completed Trades Match Current Filters
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Try switching to All Seasons or clearing the Manager / Roster filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSeasonFilter('ALL');
              setRosterIdFilter(null);
            }}
            className="mt-4 cursor-pointer rounded-xl bg-orange-500 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-orange-400"
          >
            Reset Trade History Filters
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredTrades.map((trade: GradedHistoricalTrade) => {
            const isExpanded = Boolean(expandedTradeIds[trade.transactionId]);
            const isHighlighted = highlightedTradeId === trade.transactionId;

            return (
              <article
                key={trade.transactionId}
                id={`historical-trade-${trade.transactionId}`}
                data-testid={`historical-trade-card-${trade.transactionId}`}
                className={`rounded-2xl border transition-all duration-300 ${
                  isHighlighted
                    ? 'border-amber-400 bg-slate-900/95 ring-2 ring-amber-400/50 shadow-2xl'
                    : 'border-slate-800 bg-slate-900/80 shadow-xl'
                }`}
              >
                {/* Card Top Metadata Header */}
                <div className="flex flex-col justify-between gap-3 border-b border-slate-800/90 bg-slate-950/60 px-5 py-3.5 sm:flex-row sm:items-center">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-lg px-2.5 py-1 font-mono text-xs font-extrabold ${
                        trade.season === '2026'
                          ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40'
                          : 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40'
                      }`}
                    >
                      {trade.season} Season • Week {trade.leg}
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-300">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span>{trade.formattedDate}</span>
                    </span>

                    <span className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-400">
                      League {trade.leagueId}
                    </span>

                    {trade.hasFlippedAssets && (
                      <span
                        data-testid={`trade-has-flipped-badge-${trade.transactionId}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 px-2.5 py-1 text-[11px] font-extrabold text-amber-300 ring-1 ring-amber-500/40"
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                        <span>
                          {trade.flippedAssets.length} Flipped Asset
                          {trade.flippedAssets.length > 1 ? 's' : ''}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${
                        trade.fairnessLabel === 'Balanced Trade'
                          ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                          : trade.fairnessLabel === 'Slight Edge'
                            ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30'
                            : 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30'
                      }`}
                    >
                      <Scale className="h-3.5 w-3.5" />
                      <span>
                        {trade.fairnessLabel} ({trade.fairnessScore}/100)
                      </span>
                    </span>

                    {onLoadInBuilder && (
                      <button
                        type="button"
                        data-testid={`load-in-builder-btn-${trade.transactionId}`}
                        onClick={() => onLoadInBuilder(trade.proposal)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/15 px-3 py-1 text-xs font-bold text-orange-300 transition hover:bg-orange-500/25"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Load in Trade Builder</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Executive Verdict Banner */}
                <div className="border-b border-slate-800/60 bg-slate-900/40 px-5 py-2.5">
                  <p className="text-xs font-bold text-slate-200">{trade.summaryHeadline}</p>
                </div>

                {/* Participating Rosters & Exchanged Assets Grid */}
                <div
                  className={`grid grid-cols-1 gap-4 p-5 ${
                    trade.participants.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
                  }`}
                >
                  {trade.participants.map((part: TradeParticipantEvaluation) => (
                    <div
                      key={part.rosterId}
                      data-testid={`historical-trade-side-${trade.transactionId}-${part.rosterId}`}
                      className={`flex flex-col justify-between rounded-xl border p-4 ${
                        part.isWinner
                          ? 'border-emerald-500/40 bg-slate-950/85'
                          : 'border-slate-800 bg-slate-950/60'
                      }`}
                    >
                      <div className="space-y-3.5">
                        {/* Side Header: Roster Name, Manager, Winner Badge, Letter Grade */}
                        <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-orange-400">
                                Roster #{part.rosterId}
                              </span>
                              {part.isWinner && (
                                <span
                                  data-testid={`historical-winner-badge-${trade.transactionId}-${part.rosterId}`}
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300 ring-1 ring-emerald-500/40"
                                >
                                  <Trophy className="h-3 w-3" />
                                  <span>TRADE WINNER</span>
                                </span>
                              )}
                            </div>
                            <h3 className="mt-0.5 text-base font-extrabold text-white">
                              {part.rosterName}
                            </h3>
                            <p className="text-xs text-slate-400">
                              Manager: <span className="text-slate-200">@{part.managerDisplayName}</span>
                            </p>
                          </div>

                          <GradeBadge grade={part.letterGrade} />
                        </div>

                        {/* Quick Dual-Axis Delta Strip */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg border border-slate-800/90 bg-slate-900/90 px-3 py-2">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Adjusted Dynasty Δ
                            </div>
                            <div
                              className={`mt-0.5 font-mono text-sm font-black ${
                                part.adjustedDynastyDelta > 0
                                  ? 'text-emerald-400'
                                  : part.adjustedDynastyDelta < 0
                                    ? 'text-rose-400'
                                    : 'text-slate-200'
                              }`}
                            >
                              {part.adjustedDynastyDelta > 0 ? '+' : ''}
                              {part.adjustedDynastyDelta.toFixed(1)} pts
                            </div>
                          </div>

                          <div className="rounded-lg border border-slate-800/90 bg-slate-900/90 px-3 py-2">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Starting 10 Δ Avg Lock-In
                            </div>
                            <div
                              className={`mt-0.5 flex items-center gap-1 font-mono text-sm font-black ${
                                part.starting10DeltaAvgLockIn > 0
                                  ? 'text-emerald-400'
                                  : part.starting10DeltaAvgLockIn < 0
                                    ? 'text-rose-400'
                                    : 'text-slate-200'
                              }`}
                            >
                              {part.starting10DeltaAvgLockIn > 0 ? (
                                <TrendingUp className="h-3.5 w-3.5" />
                              ) : part.starting10DeltaAvgLockIn < 0 ? (
                                <TrendingDown className="h-3.5 w-3.5" />
                              ) : null}
                              <span>
                                {part.starting10DeltaAvgLockIn > 0 ? '+' : ''}
                                {part.starting10DeltaAvgLockIn.toFixed(1)} Avg LI
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              FP/G Δ: {part.starting10DeltaFppg > 0 ? '+' : ''}
                              {part.starting10DeltaFppg.toFixed(1)}
                            </div>
                          </div>
                        </div>

                        {/* Acquired Assets List */}
                        <div>
                          <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">
                            <span>
                              Acquired ({part.incomingPlayers.length + part.incomingPicks.length}{' '}
                              Asset{part.incomingPlayers.length + part.incomingPicks.length === 1 ? '' : 's'})
                            </span>
                            <span className="font-mono text-slate-300">
                              Adj. {part.adjustedIncomingDynastyValue.toFixed(1)} pts
                            </span>
                          </div>

                          <div className="mt-2 space-y-2">
                            {part.incomingPlayers.map((p: EvaluatedTradePlayerAsset) => (
                              <div
                                key={p.playerId}
                                className="rounded-lg border border-slate-800 bg-slate-900/95 p-2.5 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <span className="font-bold text-white">{p.fullName}</span>
                                    <span className="ml-1.5 text-[11px] text-slate-400">
                                      ({p.positions.join('/')} • {p.nbaTeam} • Age {p.age ?? '—'} •{' '}
                                      {p.avgLockIn.toFixed(1)} Avg LI • {p.fpg.toFixed(1)} FP/G)
                                    </span>
                                  </div>
                                  <span className="shrink-0 rounded bg-orange-500/15 px-2 py-0.5 font-mono text-xs font-bold text-orange-300">
                                    {p.dynastyValue.toFixed(1)}
                                  </span>
                                </div>

                                {p.isFlippedAsset && p.flippedInTransactionId && (
                                  <div className="mt-2">
                                    <button
                                      type="button"
                                      data-testid={`flipped-asset-badge-${trade.transactionId}-${p.playerId}`}
                                      onClick={() =>
                                        handleJumpToFlippedTrade(p.flippedInTransactionId!)
                                      }
                                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 transition hover:bg-amber-500/25"
                                    >
                                      <Repeat className="h-3 w-3 text-amber-300" />
                                      <span>FLIPPED ASSET: {p.flippedSummary}</span>
                                      <ArrowRight className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}

                            {part.incomingPicks.map((pk: EvaluatedTradePickAsset) => (
                              <div
                                key={pk.pickId}
                                className="rounded-lg border border-slate-800 bg-slate-900/95 p-2.5 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-bold text-sky-200">
                                      {pk.displayLabel}
                                    </span>
                                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300">
                                      Projected {pk.projectedTier} (Slot #{pk.projectedSlot})
                                    </span>
                                  </div>
                                  <span className="shrink-0 rounded bg-sky-500/15 px-2 py-0.5 font-mono text-xs font-bold text-sky-300">
                                    {pk.dynastyValue.toFixed(1)}
                                  </span>
                                </div>

                                {pk.isFlippedAsset && pk.flippedInTransactionId && (
                                  <div className="mt-2">
                                    <button
                                      type="button"
                                      data-testid={`flipped-asset-badge-${trade.transactionId}-${pk.pickId}`}
                                      onClick={() =>
                                        handleJumpToFlippedTrade(pk.flippedInTransactionId!)
                                      }
                                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 transition hover:bg-amber-500/25"
                                    >
                                      <Repeat className="h-3 w-3 text-amber-300" />
                                      <span>FLIPPED ASSET: {pk.flippedSummary}</span>
                                      <ArrowRight className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Sent Out Summary Line */}
                      <div className="mt-3 border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-400">
                        <span className="font-bold uppercase tracking-wider text-slate-500">
                          Sent Out:{' '}
                        </span>
                        <span>
                          {[
                            ...part.outgoingPlayers.map((p) => p.fullName),
                            ...part.outgoingPicks.map((pk) => pk.displayLabel),
                          ].join(', ') || 'None'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Expandable ADR-0002 Dual-Axis Breakdown Footer */}
                <div className="border-t border-slate-800/80 bg-slate-950/50 px-5 py-3">
                  <button
                    type="button"
                    data-testid={`toggle-breakdown-btn-${trade.transactionId}`}
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpandBreakdown(trade.transactionId)}
                    className="flex w-full cursor-pointer items-center justify-between text-left text-xs font-bold text-slate-300 hover:text-white"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-orange-400" />
                      <span>
                        Adjusted Dynasty Value &amp; Starting 10 Δ Avg Lock-In Breakdown (Consolidation
                        Premium, Replacement Cut Assets &amp; Takeaways)
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-orange-300">
                      <span>{isExpanded ? 'Hide Breakdown' : 'Expand Breakdown'}</span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </span>
                  </button>

                  {isExpanded && (
                    <div
                      data-testid={`trade-breakdown-panel-${trade.transactionId}`}
                      className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-800/80 pt-4 lg:grid-cols-2"
                    >
                      {trade.participants.map((part: TradeParticipantEvaluation) => (
                        <div
                          key={part.rosterId}
                          className="space-y-2.5 rounded-xl border border-slate-800/90 bg-slate-900/75 p-3.5 text-xs"
                        >
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="font-extrabold text-white">
                              Roster #{part.rosterId} — {part.rosterName} Breakdown
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              Composite Score: {part.compositeGradeScore > 0 ? '+' : ''}
                              {part.compositeGradeScore.toFixed(1)} ({part.letterGrade})
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 font-mono text-[11px] sm:grid-cols-4">
                            <div className="rounded bg-slate-950 p-2">
                              <div className="text-slate-400">Raw Package Δ</div>
                              <div className="font-bold text-slate-200">
                                {part.rawDynastyDelta > 0 ? '+' : ''}
                                {part.rawDynastyDelta.toFixed(1)}
                              </div>
                            </div>
                            <div className="rounded bg-slate-950 p-2">
                              <div className="text-slate-400">Consolidation</div>
                              <div className="font-bold text-orange-300">
                                +{part.consolidationPremium.toFixed(1)}
                              </div>
                            </div>
                            <div className="rounded bg-slate-950 p-2">
                              <div className="text-slate-400">Cut Penalty</div>
                              <div className="font-bold text-rose-300">
                                -{part.replacementCutPenalty.toFixed(1)}
                              </div>
                            </div>
                            <div className="rounded bg-slate-950 p-2">
                              <div className="text-slate-400">Optimal 10 Avg LI</div>
                              <div className="font-bold text-sky-300">
                                {part.preTradeOptimalStarterAvgLockIn.toFixed(1)} →{' '}
                                {part.postTradeOptimalStarterAvgLockIn.toFixed(1)}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                FP/G: {part.preTradeOptimalStarterFpg.toFixed(1)} →{' '}
                                {part.postTradeOptimalStarterFpg.toFixed(1)}
                              </div>
                            </div>
                          </div>

                          {part.replacementCutAssets.length > 0 && (
                            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-200">
                              <Scissors className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                              <div>
                                <span className="font-bold">Replacement Cut Asset(s): </span>
                                {part.replacementCutAssets
                                  .map((c) => `${c.fullName} (${c.dynastyValue.toFixed(1)} DV)`)
                                  .join(', ')}
                              </div>
                            </div>
                          )}

                          <ul className="space-y-1 text-[11px] text-slate-300">
                            {part.takeaways.map((bullet, bIdx) => (
                              <li key={bIdx} className="flex items-start gap-1.5">
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
