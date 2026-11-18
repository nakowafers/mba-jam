'use client';

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useMbaLeague } from '@/components/providers/mba-league-provider';
import { RosterPlayerSlot } from '@/lib/types/mba';

function SlotBadge({ label, category }: { label: string; category: RosterPlayerSlot['category'] }) {
  const styles: Record<RosterPlayerSlot['category'], string> = {
    STARTER: 'bg-orange-500/20 text-orange-300 ring-orange-500/40',
    BENCH: 'bg-slate-800 text-slate-300 ring-slate-700',
    RESERVE: 'bg-rose-500/20 text-rose-300 ring-rose-500/40',
    TAXI: 'bg-amber-500/20 text-amber-300 ring-amber-500/40',
  };

  return (
    <span
      className={`inline-flex h-8 w-14 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-extrabold tracking-wider ring-1 ${styles[category]}`}
    >
      {label}
    </span>
  );
}

function InjuryBadge({ status, notes }: { status: string | null; notes: string | null }) {
  if (!status) return null;
  const isSevere = status === 'Out' || status === 'IR' || status === 'SUS';
  return (
    <span
      title={notes ?? status}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${
        isSevere
          ? 'bg-rose-500/20 text-rose-300 ring-rose-500/40'
          : 'bg-amber-500/20 text-amber-300 ring-amber-500/40'
      }`}
    >
      <AlertTriangle className="h-3 w-3" />
      {status}
    </span>
  );
}

function PlayerSlotRow({ slot }: { slot: RosterPlayerSlot }) {
  const m = slot.seasonMetrics;

  return (
    <div
      data-testid={`roster-slot-${slot.category.toLowerCase()}-${slot.slotIndex}`}
      className="group flex flex-col justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 transition hover:border-slate-700 hover:bg-slate-900 sm:flex-row sm:items-center"
    >
      <div className="flex items-center gap-3.5">
        <SlotBadge label={slot.slotLabel} category={slot.category} />

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-white">{slot.fullName}</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-300">
              {slot.nbaTeam}
            </span>
            <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
              {slot.positions.join('/')}
            </span>
            <InjuryBadge status={slot.injuryStatus} notes={slot.injuryNotes} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            {slot.age ? <span>Age {slot.age}</span> : null}
            <span>GP: {m.gamesPlayed}</span>
            <span>
              {m.ptsPerGame.toFixed(1)} PTS • {m.rebPerGame.toFixed(1)} REB •{' '}
              {m.astPerGame.toFixed(1)} AST • {(m.stlPerGame + m.blkPerGame).toFixed(1)} STOCKS
            </span>
          </div>
        </div>
      </div>

      {/* Right side: Weekly Lock-In & Custom MBA FP/G Metrics */}
      <div className="flex items-center justify-between gap-4 border-t border-slate-800/60 pt-2.5 sm:justify-end sm:border-t-0 sm:pt-0">
        <div className="text-left sm:text-right">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Week {slot.currentWeekCompletedGamesCount > 0 ? 'Matchup / Latest' : 'Matchup Pts'}
          </div>
          <div className="font-mono text-sm font-bold text-slate-200">
            {slot.currentWeekMatchupPoints.toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-400">pts</span>
            {slot.latestCompletedGamePoints !== null && (
              <span className="ml-1.5 text-xs text-emerald-400">
                (Last: {slot.latestCompletedGamePoints.toFixed(1)})
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            {slot.currentWeekCompletedGamesCount} played • {slot.currentWeekRemainingGamesCount} rem
          </div>
        </div>

        <div className="min-w-[92px] rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider text-orange-300">
            MBA FP/G
          </div>
          <div className="font-mono text-base font-extrabold text-white">
            {m.mbaFantasyPointsPerGame.toFixed(1)}
          </div>
          <div className="font-mono text-[10px] text-orange-200/70">
            {m.totalMbaPoints.toFixed(1)} tot
          </div>
        </div>
      </div>
    </div>
  );
}

export function RosterOverview() {
  const { snapshot, selectRoster } = useMbaLeague();
  const { activeRoster, scoringSettings } = snapshot;
  const [showScoringModal, setShowScoringModal] = useState(false);

  const scoringPills = [
    { label: 'PTS', val: `+${scoringSettings.pts}` },
    { label: 'REB', val: `+${scoringSettings.reb}` },
    { label: 'AST', val: `+${scoringSettings.ast}` },
    { label: 'STL', val: `+${scoringSettings.stl}` },
    { label: 'BLK', val: `+${scoringSettings.blk}` },
    { label: '3PM', val: `+${scoringSettings.tpm}` },
    { label: 'TO', val: `${scoringSettings.to}` },
    { label: 'DD', val: `+${scoringSettings.dd}` },
    { label: 'TD', val: `+${scoringSettings.td}` },
    { label: '40+ PT', val: `+${scoringSettings.bonus_pt_40p}` },
    { label: '50+ PT', val: `+${scoringSettings.bonus_pt_50p}` },
    { label: 'TF / FF', val: `${scoringSettings.tf}` },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* Top 10-Manager Quick Selector Strip */}
      <section aria-label="MBA League Managers">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Users className="h-3.5 w-3.5 text-orange-400" />
            <span>10-Team MBA Dynasty Rosters (1-Tap Zero-Auth Switcher)</span>
          </div>
          <button
            type="button"
            onClick={() => setShowScoringModal((v) => !v)}
            className="cursor-pointer text-xs font-semibold text-orange-400 hover:text-orange-300"
          >
            {showScoringModal ? 'Hide MBA Scoring Rules' : 'View Custom MBA Scoring Rules'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
          {snapshot.rosters.map((roster) => {
            const isSelected = roster.rosterId === activeRoster.rosterId;
            return (
              <button
                key={roster.rosterId}
                type="button"
                onClick={() => selectRoster(roster.rosterId)}
                data-testid={`roster-pill-${roster.rosterId}`}
                className={`flex cursor-pointer flex-col justify-between rounded-xl border p-2.5 text-left transition ${
                  isSelected
                    ? 'border-orange-500 bg-orange-500/15 shadow-sm shadow-orange-500/10'
                    : 'border-slate-800/90 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[10px] font-bold text-slate-400">
                    #{roster.rosterId}
                  </span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300">
                    {roster.standing.wins}-{roster.standing.losses}
                  </span>
                </div>
                <div className="mt-1.5 truncate text-xs font-bold text-white">
                  {roster.manager.rosterName}
                </div>
                <div className="truncate text-[11px] text-slate-400">
                  @{roster.manager.displayName}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Custom MBA Scoring Banner */}
      {showScoringModal && (
        <section className="rounded-2xl border border-orange-500/30 bg-slate-900/90 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-orange-300">
              Official MBA Custom Scoring Weights (Sleeper League #{snapshot.leagueId})
            </h3>
            <span className="text-xs text-slate-400">2-Center Lock-In Dynasty Format</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {scoringPills.map((pill) => (
              <div
                key={pill.label}
                className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs"
              >
                <span className="font-semibold text-slate-400">{pill.label}:</span>
                <span className="font-mono font-bold text-white">{pill.val}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active Roster Hero Summary Card */}
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 shadow-lg">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-lg bg-orange-500/20 px-2.5 py-1 font-mono text-xs font-bold text-orange-300 ring-1 ring-orange-500/30">
                Roster #{activeRoster.rosterId}
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                {activeRoster.manager.rosterName}
              </h1>
              <span className="text-sm font-medium text-slate-400">
                Managed by <strong className="text-slate-200">@{activeRoster.manager.displayName}</strong>
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              10 Starter Slots (<span className="font-mono text-slate-300">PG, SG, G, SF, PF, F, C, C, UTIL, UTIL</span>) •{' '}
              {activeRoster.benchSlots.length} Bench • {activeRoster.reserveSlots.length} Reserve (IR) •{' '}
              {activeRoster.taxiSlots.length} Taxi
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <Award className="h-3.5 w-3.5 text-orange-400" />
                <span>Record</span>
              </div>
              <div className="mt-1 font-mono text-lg font-extrabold text-white">
                {activeRoster.standing.wins}-{activeRoster.standing.losses}
              </div>
              <div className="text-[11px] text-slate-500">
                Max PF: {activeRoster.standing.ppts.toFixed(1)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                <span>Starting 10 FP/G</span>
              </div>
              <div className="mt-1 font-mono text-lg font-extrabold text-emerald-300">
                {activeRoster.starterTotalFpg.toFixed(1)}
              </div>
              <div className="text-[11px] text-slate-500">Custom MBA Scoring</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <Activity className="h-3.5 w-3.5 text-sky-400" />
                <span>Week {snapshot.currentWeek} Live</span>
              </div>
              <div className="mt-1 font-mono text-lg font-extrabold text-white">
                {activeRoster.currentWeekMatchupPoints.toFixed(1)}
              </div>
              <div className="text-[11px] text-slate-500">
                Matchup #{activeRoster.currentWeekMatchupId ?? '—'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>Season Total</span>
              </div>
              <div className="mt-1 font-mono text-lg font-extrabold text-white">
                {activeRoster.standing.fpts.toFixed(1)}
              </div>
              <div className="text-[11px] text-slate-500">
                PA: {activeRoster.standing.fptsAgainst.toFixed(1)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Roster Grid: 10 Starter Slots + Bench / IR / Taxi */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7 Cols: 10 Active Starter Slots */}
        <section className="space-y-3 lg:col-span-7" aria-label="Active Starter Slots">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-orange-400" />
              <h2 className="text-base font-bold text-white">
                Active Starter Slots (10)
              </h2>
            </div>
            <span className="font-mono text-xs text-slate-400">
              PG • SG • G • SF • PF • F • C • C • UTIL • UTIL
            </span>
          </div>

          <div className="space-y-2.5">
            {activeRoster.starterSlots.map((slot) => (
              <PlayerSlotRow key={`starter-${slot.slotIndex}-${slot.playerId}`} slot={slot} />
            ))}
          </div>
        </section>

        {/* Right 5 Cols: Bench (BN), Reserve (IR), and Taxi (TAXI) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Bench Slots */}
          <section className="space-y-3" aria-label="Bench Slots">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Bench Slots ({activeRoster.benchSlots.length})
              </h2>
              <span className="font-mono text-xs text-slate-400">BN</span>
            </div>
            <div className="space-y-2.5">
              {activeRoster.benchSlots.map((slot) => (
                <PlayerSlotRow key={`bench-${slot.slotIndex}-${slot.playerId}`} slot={slot} />
              ))}
            </div>
          </section>

          {/* Reserve (IR) Slots */}
          <section className="space-y-3" aria-label="Reserve IR Slots">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-400" />
                <h2 className="text-base font-bold text-white">
                  Reserve Slots ({activeRoster.reserveSlots.length} / 3 IR)
                </h2>
              </div>
              <span className="font-mono text-xs text-rose-400">IR</span>
            </div>
            {activeRoster.reserveSlots.length === 0 ? (
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-4 text-xs text-slate-400">
                No players currently on Reserve (IR).
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeRoster.reserveSlots.map((slot) => (
                  <PlayerSlotRow key={`ir-${slot.slotIndex}-${slot.playerId}`} slot={slot} />
                ))}
              </div>
            )}
          </section>

          {/* Taxi Squad Slots */}
          <section className="space-y-3" aria-label="Taxi Squad Slots">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Taxi Squad ({activeRoster.taxiSlots.length} / 3 TAXI)
              </h2>
              <span className="font-mono text-xs text-amber-400">TAXI</span>
            </div>
            {activeRoster.taxiSlots.length === 0 ? (
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-4 text-xs text-slate-400">
                No players currently on Taxi Squad.
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeRoster.taxiSlots.map((slot) => (
                  <PlayerSlotRow key={`taxi-${slot.slotIndex}-${slot.playerId}`} slot={slot} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
