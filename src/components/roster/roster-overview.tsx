'use client';

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  Flame,
  Lock,
  Pin,
  Scale,
  ShieldAlert,
  Sparkles,
  Swords,
  TrendingUp,
  Unlock,
  Users,
} from 'lucide-react';
import { useMbaLeague } from '@/components/providers/mba-league-provider';
import {
  LockInRecommendationBadge,
  MatchupLeverageSummary,
  RosterPlayerSlot,
} from '@/lib/types/mba';

function SlotBadge({
  label,
  category,
  isPinnedStarter,
}: {
  label: string;
  category: RosterPlayerSlot['category'];
  isPinnedStarter: boolean;
}) {
  const styles: Record<RosterPlayerSlot['category'], string> = {
    STARTER: isPinnedStarter
      ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40'
      : 'bg-orange-500/20 text-orange-300 ring-orange-500/40',
    BENCH: 'bg-slate-800 text-slate-300 ring-slate-700',
    RESERVE: 'bg-rose-500/20 text-rose-300 ring-rose-500/40',
    TAXI: 'bg-amber-500/20 text-amber-300 ring-amber-500/40',
  };

  return (
    <span
      className={`inline-flex h-8 w-14 shrink-0 items-center justify-center gap-1 rounded-lg font-mono text-xs font-extrabold tracking-wider ring-1 ${styles[category]}`}
    >
      {isPinnedStarter && <Pin className="h-3 w-3 text-emerald-400" />}
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

function RecommendationBadge({
  badge,
  lockSource,
  playerId,
}: {
  badge: LockInRecommendationBadge;
  lockSource: RosterPlayerSlot['lockIn']['lockSource'];
  playerId: string;
}) {
  const styles: Record<LockInRecommendationBadge, string> = {
    LOCKED: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40',
    'SMASH LOCK': 'bg-orange-500/25 text-orange-200 ring-orange-400/50',
    'LEAN LOCK': 'bg-amber-500/20 text-amber-200 ring-amber-400/40',
    'ROLL THE DICE': 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  };

  const sourceTag =
    badge === 'LOCKED'
      ? lockSource === 'INFERRED_SLEEPER'
        ? 'Inferred'
        : lockSource === 'MANUAL_OVERRIDE'
          ? 'Manual'
          : 'Final Game'
      : null;

  return (
    <span
      data-testid={`lock-badge-${playerId}`}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-extrabold uppercase tracking-wider ring-1 ${styles[badge]}`}
    >
      {badge === 'LOCKED' && <Lock className="h-3 w-3" />}
      {badge === 'SMASH LOCK' && <Flame className="h-3 w-3 text-orange-400" />}
      <span>{badge}</span>
      {sourceTag && (
        <span className="ml-0.5 text-[10px] font-normal opacity-80">({sourceTag})</span>
      )}
    </span>
  );
}

function MatchupLeverageBanner({ leverage }: { leverage: MatchupLeverageSummary }) {
  const diff = leverage.projectedDifferential;
  const diffFormatted = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} FP`;
  const currentDiff = leverage.currentDifferential;
  const currentDiffFormatted = `${currentDiff >= 0 ? '+' : ''}${currentDiff.toFixed(1)} FP`;

  const postureStyle =
    leverage.posture === 'PROTECT_LEAD'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : leverage.posture === 'CHASE_UPSIDE'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-sky-500/40 bg-sky-500/10 text-sky-300';

  return (
    <section
      aria-label="Head-to-Head Matchup Leverage"
      data-testid="matchup-leverage-banner"
      className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 p-4 shadow-md"
    >
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/15 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider text-orange-300 ring-1 ring-orange-500/30">
              <Swords className="h-3.5 w-3.5" />
              Week {leverage.week} Head-to-Head Matchup Leverage (#{leverage.matchupId})
            </span>
            <span
              data-testid="matchup-leverage-posture"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${postureStyle}`}
            >
              <Scale className="h-3.5 w-3.5" />
              {leverage.postureLabel}
            </span>
          </div>
          <p className="text-xs text-slate-300">{leverage.summaryText}</p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:min-w-[440px]">
          <div className="rounded-xl border border-orange-500/30 bg-slate-950/80 px-3 py-2">
            <div className="truncate text-[11px] font-bold text-orange-300">
              #{leverage.activeRosterId} {leverage.activeRosterName}
            </div>
            <div className="mt-0.5 font-mono text-base font-extrabold text-white">
              {leverage.activeProjectedScore.toFixed(1)}{' '}
              <span className="text-[10px] font-normal text-slate-400">proj</span>
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              Live: {leverage.activeCurrentScore.toFixed(1)} FP
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Projected Δ
            </span>
            <span
              data-testid="matchup-projected-differential"
              className={`font-mono text-base font-extrabold ${
                diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-slate-200'
              }`}
            >
              {diffFormatted}
            </span>
            <span className="font-mono text-[10px] text-slate-500">Live Δ: {currentDiffFormatted}</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-right">
            <div className="truncate text-[11px] font-bold text-slate-300">
              vs #{leverage.opponentRosterId} {leverage.opponentRosterName}
            </div>
            <div className="mt-0.5 font-mono text-base font-extrabold text-slate-200">
              {leverage.opponentProjectedScore.toFixed(1)}{' '}
              <span className="text-[10px] font-normal text-slate-400">proj</span>
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              Live: {leverage.opponentCurrentScore.toFixed(1)} FP
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlayerSlotRow({
  slot,
  onToggleManualLock,
}: {
  slot: RosterPlayerSlot;
  onToggleManualLock: (playerId: string) => void;
}) {
  const m = slot.seasonMetrics;
  const { lockIn } = slot;

  return (
    <div
      data-testid={`roster-slot-${slot.category.toLowerCase()}-${slot.slotIndex}`}
      className={`group flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition ${
        slot.isPinnedStarter
          ? 'border-emerald-500/40 bg-emerald-950/15 hover:border-emerald-500/60'
          : slot.isLockInWindowOpen && !slot.isLocked
            ? 'border-orange-500/35 bg-slate-900/80 hover:border-orange-500/60'
            : 'border-slate-800/80 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
      }`}
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5 sm:items-center">
          <SlotBadge
            label={slot.slotLabel}
            category={slot.category}
            isPinnedStarter={slot.isPinnedStarter}
          />

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
              {slot.isPinnedStarter && (
                <span
                  data-testid={`pinned-starter-badge-${slot.playerId}`}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30"
                >
                  <Pin className="h-2.5 w-2.5" />
                  Pinned Starter
                </span>
              )}
              <RecommendationBadge
                badge={slot.recommendation}
                lockSource={lockIn.lockSource}
                playerId={slot.playerId}
              />
              {slot.leverageAnnotation && (
                <span
                  data-testid={`leverage-annotation-${slot.playerId}`}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide ring-1 ${
                    slot.leverageAnnotation.startsWith('Protect Lead')
                      ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 ring-amber-500/30'
                  }`}
                >
                  {slot.leverageAnnotation}
                </span>
              )}
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

        {/* Right side: Lock-In Threshold, Effective Weekly Score & Custom MBA FP/G */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/60 pt-2.5 sm:justify-end sm:border-t-0 sm:pt-0">
          {lockIn.canToggleManualLock && (
            <button
              type="button"
              onClick={() => onToggleManualLock(slot.playerId)}
              data-testid={`manual-lock-toggle-${slot.playerId}`}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                slot.isLocked
                  ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                  : 'border-orange-500/50 bg-orange-500/15 text-orange-200 hover:bg-orange-500/25'
              }`}
            >
              {slot.isLocked ? (
                <>
                  <Unlock className="h-3.5 w-3.5" />
                  <span>Locked (Unlock)</span>
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  <span>Lock Score ({slot.latestCompletedGamePoints?.toFixed(1)})</span>
                </>
              )}
            </button>
          )}

          <div className="text-left sm:text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Effective Weekly / E[max] Bar
            </div>
            <div className="font-mono text-sm font-extrabold text-white">
              <span data-testid={`effective-score-${slot.playerId}`}>
                {slot.effectiveWeeklyScore.toFixed(1)}
              </span>{' '}
              <span className="text-[11px] font-normal text-slate-400">eff</span>
              {slot.lockInThreshold > 0 && (
                <span
                  data-testid={`threshold-score-${slot.playerId}`}
                  className="ml-1.5 text-xs font-semibold text-sky-300"
                >
                  • Bar: {slot.lockInThreshold.toFixed(1)} ({lockIn.remainingGamesMultiplier.toFixed(2)}x)
                </span>
              )}
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              Matchup: {slot.currentWeekMatchupPoints.toFixed(1)} pts
              {slot.latestCompletedGamePoints !== null && (
                <span className="ml-1.5 text-emerald-400">
                  (Last: {slot.latestCompletedGamePoints.toFixed(1)})
                </span>
              )}
            </div>
          </div>

          <div className="min-w-[88px] rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-right">
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

      {/* Weekly Schedule Strip: Completed Games & Remaining Scheduled Games */}
      {(slot.completedGames.length > 0 || slot.remainingGames.length > 0) && (
        <div
          data-testid={`weekly-schedule-${slot.playerId}`}
          className="flex flex-wrap items-center gap-2 border-t border-slate-800/70 pt-2 text-[11px]"
        >
          <span className="inline-flex items-center gap-1 font-semibold text-slate-400">
            <Calendar className="h-3 w-3 text-slate-500" />
            <span>
              Week Schedule ({slot.currentWeekCompletedGamesCount} played •{' '}
              {slot.currentWeekRemainingGamesCount} rem):
            </span>
          </span>

          {slot.completedGames.map((game) => (
            <span
              key={game.gameId}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono ring-1 ${
                game.isLockedGame
                  ? 'bg-emerald-500/20 font-bold text-emerald-200 ring-emerald-500/50'
                  : 'bg-slate-800/90 text-slate-200 ring-slate-700'
              }`}
            >
              {game.isLockedGame && <Lock className="h-2.5 w-2.5 text-emerald-400" />}
              <span>
                {game.date} vs {game.opponent}: <strong>{game.mbaPoints.toFixed(1)}</strong> FP
              </span>
            </span>
          ))}

          {slot.remainingGames.map((game) => (
            <span
              key={game.gameId}
              className="inline-flex items-center gap-1 rounded-md bg-slate-950/80 px-2 py-0.5 font-mono text-slate-400 ring-1 ring-slate-800"
            >
              <span>
                {game.date} vs {game.opponent} (proj {game.projectedMbaPoints.toFixed(1)})
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function RosterOverview() {
  const { snapshot, selectRoster, toggleManualLock } = useMbaLeague();
  const { activeRoster, scoringSettings, matchupLeverage } = snapshot;
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

      {/* Live Head-to-Head Matchup Leverage Banner */}
      {matchupLeverage && <MatchupLeverageBanner leverage={matchupLeverage} />}

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
                <span>Week {snapshot.currentWeek} Projected</span>
              </div>
              <div className="mt-1 font-mono text-lg font-extrabold text-white">
                {activeRoster.currentWeekProjectedPoints.toFixed(1)}
              </div>
              <div className="text-[11px] text-slate-500">
                Live: {activeRoster.currentWeekMatchupPoints.toFixed(1)} FP
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
              <PlayerSlotRow
                key={`starter-${slot.slotIndex}-${slot.playerId}`}
                slot={slot}
                onToggleManualLock={toggleManualLock}
              />
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
                <PlayerSlotRow
                  key={`bench-${slot.slotIndex}-${slot.playerId}`}
                  slot={slot}
                  onToggleManualLock={toggleManualLock}
                />
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
                  <PlayerSlotRow
                    key={`ir-${slot.slotIndex}-${slot.playerId}`}
                    slot={slot}
                    onToggleManualLock={toggleManualLock}
                  />
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
                  <PlayerSlotRow
                    key={`taxi-${slot.slotIndex}-${slot.playerId}`}
                    slot={slot}
                    onToggleManualLock={toggleManualLock}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
