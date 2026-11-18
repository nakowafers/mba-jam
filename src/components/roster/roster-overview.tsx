'use client';

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Award,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
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
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { useMbaLeague } from '@/components/providers/mba-league-provider';
import {
  LockInRecommendationBadge,
  MatchupLeverageSummary,
  OptimizedStarterSlotAssignment,
  RosterEligibilityWarning,
  RosterLineupOptimization,
  RosterPlayerSlot,
  StagedLineupChecklist,
  SwapAndLockAlert,
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

function SwapAndLockAlertBanners({
  alerts,
  onOpenSyncDrawer,
}: {
  alerts: SwapAndLockAlert[];
  onOpenSyncDrawer: () => void;
}) {
  if (alerts.length === 0) return null;

  return (
    <section
      aria-label="Swap and Lock Alerts"
      data-testid="swap-and-lock-alerts-banner"
      className="space-y-2.5"
    >
      {alerts.map((alert) => (
        <div
          key={alert.id}
          data-testid={`swap-lock-alert-${alert.benchPlayerId}`}
          className="flex flex-col justify-between gap-4 rounded-2xl border border-orange-500/50 bg-gradient-to-r from-orange-950/60 via-slate-900 to-slate-950 p-4 shadow-lg shadow-orange-500/10 lg:flex-row lg:items-center"
        >
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-2.5 py-1 font-mono text-xs font-extrabold uppercase tracking-wider text-slate-950">
                <Zap className="h-3.5 w-3.5" />
                Swap &amp; Lock Alert
              </span>
              <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 font-mono text-xs font-extrabold text-emerald-300 ring-1 ring-emerald-500/40">
                +{alert.deltaPoints.toFixed(1)} FP Direct Swap
                {alert.netLineupDeltaPoints > alert.deltaPoints
                  ? ` • +${alert.netLineupDeltaPoints.toFixed(1)} FP Optimal Slide`
                  : ''}
              </span>
              {alert.gameDate && alert.gameOpponent && (
                <span className="font-mono text-xs text-orange-200/90">
                  Open Lock-In Window ({alert.gameDate} vs {alert.gameOpponent})
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-white">
              Bench {alert.benchPlayerPositions.join('/')} {alert.benchPlayerName} ({alert.benchPlayerTeam}) banked{' '}
              <span className="font-mono text-orange-300">{alert.lockableScore.toFixed(1)} MBA FP</span> — beats{' '}
              <span className="font-mono text-slate-200">{alert.targetSlotLabel}</span> starter{' '}
              {alert.displacedPlayerName} ({alert.displacedEffectiveScore.toFixed(1)} eff FP)
            </p>
            <p className="text-xs text-slate-300">{alert.detail}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenSyncDrawer}
              data-testid={`alert-open-sync-drawer-${alert.benchPlayerId}`}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-slate-950 shadow-sm transition hover:bg-orange-400"
            >
              <ClipboardCheck className="h-4 w-4" />
              <span>Stage Swap &amp; Lock</span>
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function EligibilityWarningsBanner({ warnings }: { warnings: RosterEligibilityWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <section
      aria-label="Roster and IR Eligibility Warnings"
      data-testid="eligibility-warnings-banner"
      className="space-y-2"
    >
      {warnings.map((warning) => (
        <div
          key={warning.id}
          data-testid={`eligibility-warning-${warning.playerId}`}
          className={`flex flex-col justify-between gap-2 rounded-xl border p-3.5 sm:flex-row sm:items-center ${
            warning.severity === 'ERROR'
              ? 'border-rose-500/50 bg-rose-950/30 text-rose-200'
              : 'border-amber-500/50 bg-amber-950/30 text-amber-200'
          }`}
        >
          <div className="flex items-start gap-2.5 sm:items-center">
            <ShieldAlert
              className={`h-4 w-4 shrink-0 ${
                warning.severity === 'ERROR' ? 'text-rose-400' : 'text-amber-400'
              }`}
            />
            <div>
              <span className="mr-2 rounded bg-slate-900/80 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider">
                {warning.type === 'INJURED_STARTER' ? 'Injured Starter' : 'Healthy on IR'}
              </span>
              <span className="text-xs font-semibold">{warning.message}</span>
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-slate-950/80 px-2.5 py-1 font-mono text-[11px] font-bold text-white ring-1 ring-slate-700">
            Action: {warning.recommendedAction}
          </span>
        </div>
      ))}
    </section>
  );
}

function OptimalLineupComparisonBar({
  optimization,
  lineupViewMode,
  onChangeViewMode,
  onOpenSyncDrawer,
}: {
  optimization: RosterLineupOptimization;
  lineupViewMode: 'CURRENT' | 'ACTIONABLE' | 'HYPOTHETICAL';
  onChangeViewMode: (mode: 'CURRENT' | 'ACTIONABLE' | 'HYPOTHETICAL') => void;
  onOpenSyncDrawer: () => void;
}) {
  const pinnedCount = optimization.currentStarters.filter((s) => s.isPinnedStarter).length;
  const actionableGain = optimization.actionableDeltaScore;
  const hypotheticalGain = optimization.hypotheticalDeltaScore;

  return (
    <section
      aria-label="2-Center Bipartite Slot Optimizer Summary"
      data-testid="optimal-lineup-comparison-bar"
      className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 p-4 shadow-md"
    >
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/20 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider text-indigo-300 ring-1 ring-indigo-500/30">
              <Wand2 className="h-3.5 w-3.5" />
              2-Center Bipartite Slot Optimizer
            </span>
            <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 font-mono text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/30">
              {pinnedCount} Pinned {pinnedCount === 1 ? 'Starter' : 'Starters'} Respected
            </span>
            {optimization.recommendedSwaps.length > 0 ? (
              <span className="rounded-lg bg-orange-500/20 px-2.5 py-1 font-mono text-xs font-bold text-orange-300 ring-1 ring-orange-500/30">
                {optimization.recommendedSwaps.length} Recommended{' '}
                {optimization.recommendedSwaps.length === 1 ? 'Swap' : 'Swaps'} (+
                {actionableGain.toFixed(1)} FP)
              </span>
            ) : (
              <span className="rounded-lg bg-slate-800 px-2.5 py-1 font-mono text-xs font-semibold text-slate-300">
                Starting 10 Optimal
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Solves maximum-scoring legal assignment across{' '}
            <span className="font-mono text-slate-300">PG, SG, G, SF, PF, F, C, C, UTIL, UTIL</span>{' '}
            using Effective Weekly Scores while keeping Pinned Starters fixed in their slots.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onChangeViewMode('CURRENT')}
              data-testid="optimizer-mode-current"
              className={`cursor-pointer rounded-xl border px-3 py-2 text-left transition ${
                lineupViewMode === 'CURRENT'
                  ? 'border-orange-500 bg-orange-500/15'
                  : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Current 10
              </div>
              <div
                data-testid="optimizer-current-total"
                className="mt-0.5 font-mono text-base font-extrabold text-white"
              >
                {optimization.currentTotalScore.toFixed(1)}
              </div>
              <div className="font-mono text-[10px] text-slate-400">Active Lineup</div>
            </button>

            <button
              type="button"
              onClick={() => onChangeViewMode('ACTIONABLE')}
              data-testid="optimizer-mode-actionable"
              className={`cursor-pointer rounded-xl border px-3 py-2 text-left transition ${
                lineupViewMode === 'ACTIONABLE'
                  ? 'border-emerald-500 bg-emerald-500/15'
                  : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Actionable Optimal
              </div>
              <div
                data-testid="optimizer-actionable-total"
                className="mt-0.5 font-mono text-base font-extrabold text-emerald-300"
              >
                {optimization.actionableTotalScore.toFixed(1)}
              </div>
              <div
                data-testid="optimizer-actionable-delta"
                className="font-mono text-[10px] font-bold text-emerald-400"
              >
                {actionableGain >= 0 ? '+' : ''}
                {actionableGain.toFixed(1)} FP Δ
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChangeViewMode('HYPOTHETICAL')}
              data-testid="optimizer-mode-hypothetical"
              className={`cursor-pointer rounded-xl border px-3 py-2 text-left transition ${
                lineupViewMode === 'HYPOTHETICAL'
                  ? 'border-sky-500 bg-sky-500/15'
                  : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
                Hypothetical Best 10
              </div>
              <div
                data-testid="optimizer-hypothetical-total"
                className="mt-0.5 font-mono text-base font-extrabold text-sky-200"
              >
                {optimization.hypotheticalTotalScore.toFixed(1)}
              </div>
              <div className="font-mono text-[10px] text-sky-400">
                Unconstrained ({hypotheticalGain >= 0 ? '+' : ''}
                {hypotheticalGain.toFixed(1)})
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenSyncDrawer}
            data-testid="optimize-sync-lineup-button"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-slate-950 shadow-md shadow-orange-500/15 transition hover:from-orange-400 hover:to-amber-400"
          >
            <ClipboardCheck className="h-4 w-4" />
            <span>Optimize &amp; Sync Lineup ({optimization.stagedChecklist.steps.length})</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function SleeperSyncChecklistDrawer({
  isOpen,
  onClose,
  checklist,
  optimization,
}: {
  isOpen: boolean;
  onClose: () => void;
  checklist: StagedLineupChecklist;
  optimization: RosterLineupOptimization;
}) {
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const toggleStep = (stepId: string) => {
    setCheckedIds((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const completedCount = checklist.steps.filter((s) => checkedIds[s.id]).length;

  return (
    <div
      role="dialog"
      aria-label="Sleeper Sync Checklist Drawer"
      data-testid="sleeper-sync-checklist-drawer"
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/75 backdrop-blur-sm"
    >
      <div className="flex h-full w-full max-w-lg flex-col justify-between border-l border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="space-y-5 overflow-y-auto pr-1">
          <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-orange-500/20 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-orange-300 ring-1 ring-orange-500/30">
                ADR-0001 LineupMutationAdapter
              </span>
              <h2 className="mt-1.5 text-lg font-extrabold text-white">
                Sleeper Sync Checklist (Week {checklist.week})
              </h2>
              <p className="text-xs text-slate-400">
                Check off each recommended slot swap and Lock-In action in Sleeper.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-testid="close-sync-drawer-button"
              className="cursor-pointer rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:border-slate-700 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Score Gain Summary */}
          <div className="grid grid-cols-3 gap-2.5 rounded-xl border border-slate-800 bg-slate-950/90 p-3">
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-400">Current</div>
              <div className="font-mono text-sm font-extrabold text-white">
                {optimization.currentTotalScore.toFixed(1)} FP
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-emerald-400">
                Actionable Optimal
              </div>
              <div className="font-mono text-sm font-extrabold text-emerald-300">
                {optimization.actionableTotalScore.toFixed(1)} FP (+
                {optimization.actionableDeltaScore.toFixed(1)})
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-sky-400">Progress</div>
              <div
                data-testid="checklist-progress-count"
                className="font-mono text-sm font-extrabold text-sky-300"
              >
                {completedCount} / {checklist.steps.length} Done
              </div>
            </div>
          </div>

          {/* Interactive Checklist Steps */}
          {checklist.steps.length === 0 ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-xs text-emerald-200">
              Your starting lineup and Lock-In selections are already fully optimized for Week{' '}
              {checklist.week}!
            </div>
          ) : (
            <div className="space-y-2.5">
              {checklist.steps.map((step, index) => {
                const isChecked = Boolean(checkedIds[step.id]);
                const typeBadgeStyle =
                  step.type === 'SWAP'
                    ? 'bg-orange-500/20 text-orange-300 ring-orange-500/40'
                    : step.type === 'LOCK'
                      ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 ring-rose-500/40';

                return (
                  <label
                    key={step.id}
                    data-testid={`sync-checklist-step-${index}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                      isChecked
                        ? 'border-emerald-500/40 bg-emerald-950/20 opacity-75'
                        : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleStep(step.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-orange-500"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-extrabold uppercase ring-1 ${typeBadgeStyle}`}
                        >
                          {step.type}
                        </span>
                        <span
                          className={`text-xs font-bold ${
                            isChecked ? 'line-through text-slate-400' : 'text-white'
                          }`}
                        >
                          {step.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{step.detail}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {/* Pluggable Adapter Seam Status */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3 text-[11px] text-slate-400">
            <div className="font-mono font-bold text-slate-300">
              Adapter Seam: ChecklistLineupAdapter (v1 Active)
            </div>
            <p className="mt-0.5">
              v2 Direct Sleeper GraphQL Write Adapter slot is wired behind{' '}
              <code className="text-orange-300">LineupMutationAdapter</code> (ADR-0001).
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2.5 border-t border-slate-800 pt-4">
          <a
            href={checklist.sleeperDeepLink}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="sleeper-deep-link-button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-slate-950 transition hover:bg-orange-400"
          >
            <span>Open MBA League Team in Sleeper</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
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
  previousSlotLabel,
  isMoved,
  hasSwapAndLockAlert,
}: {
  slot: RosterPlayerSlot;
  onToggleManualLock: (playerId: string) => void;
  previousSlotLabel?: string;
  isMoved?: boolean;
  hasSwapAndLockAlert?: boolean;
}) {
  const m = slot.seasonMetrics;
  const { lockIn } = slot;

  return (
    <div
      data-testid={`roster-slot-${slot.category.toLowerCase()}-${slot.slotIndex}`}
      className={`group flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition ${
        hasSwapAndLockAlert
          ? 'border-orange-500/70 bg-orange-950/20 shadow-sm shadow-orange-500/10'
          : isMoved
            ? 'border-indigo-500/50 bg-indigo-950/20'
            : slot.isPinnedStarter
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
              {isMoved && previousSlotLabel && (
                <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-indigo-200 ring-1 ring-indigo-500/40">
                  <ArrowRightLeft className="h-2.5 w-2.5" />
                  Moved from {previousSlotLabel}
                </span>
              )}
              {hasSwapAndLockAlert && (
                <span className="inline-flex items-center gap-1 rounded-md bg-orange-500 px-2 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-wider text-slate-950">
                  <Zap className="h-2.5 w-2.5" />
                  Swap &amp; Lock Ready
                </span>
              )}
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
  const optimization = activeRoster.lineupOptimization;
  const [showScoringModal, setShowScoringModal] = useState(false);
  const [lineupViewMode, setLineupViewMode] = useState<'CURRENT' | 'ACTIONABLE' | 'HYPOTHETICAL'>(
    'CURRENT'
  );
  const [isSyncDrawerOpen, setIsSyncDrawerOpen] = useState(false);

  const displayedStarterSlots: OptimizedStarterSlotAssignment[] =
    lineupViewMode === 'ACTIONABLE'
      ? optimization.actionableOptimalStarters
      : lineupViewMode === 'HYPOTHETICAL'
        ? optimization.hypotheticalOptimalStarters
        : optimization.currentStarters;

  const alertBenchPlayerIds = new Set(
    optimization.swapAndLockAlerts.map((a) => a.benchPlayerId)
  );

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

      {/* Urgent Swap & Lock Alert Banner(s) */}
      <SwapAndLockAlertBanners
        alerts={optimization.swapAndLockAlerts}
        onOpenSyncDrawer={() => setIsSyncDrawerOpen(true)}
      />

      {/* IR & Injury Eligibility Warnings */}
      <EligibilityWarningsBanner warnings={optimization.eligibilityWarnings} />

      {/* Live Head-to-Head Matchup Leverage Banner */}
      {matchupLeverage && <MatchupLeverageBanner leverage={matchupLeverage} />}

      {/* 2-Center Bipartite Optimal Lineup Comparison Bar */}
      <OptimalLineupComparisonBar
        optimization={optimization}
        lineupViewMode={lineupViewMode}
        onChangeViewMode={setLineupViewMode}
        onOpenSyncDrawer={() => setIsSyncDrawerOpen(true)}
      />

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
                {lineupViewMode === 'CURRENT'
                  ? 'Active Starter Slots (10)'
                  : lineupViewMode === 'ACTIONABLE'
                    ? 'Actionable Optimal Starter Slots (10)'
                    : 'Hypothetical Unconstrained Best 10'}
              </h2>
            </div>
            <span className="font-mono text-xs text-slate-400">
              PG • SG • G • SF • PF • F • C • C • UTIL • UTIL
            </span>
          </div>

          <div className="space-y-2.5">
            {displayedStarterSlots.map((slot) => (
              <PlayerSlotRow
                key={`starter-${lineupViewMode}-${slot.slotIndex}-${slot.playerId}`}
                slot={slot}
                onToggleManualLock={toggleManualLock}
                previousSlotLabel={slot.previousSlotLabel}
                isMoved={slot.isMoved}
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
                  hasSwapAndLockAlert={alertBenchPlayerIds.has(slot.playerId)}
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

      {/* Interactive Sleeper Sync Checklist Drawer */}
      <SleeperSyncChecklistDrawer
        isOpen={isSyncDrawerOpen}
        onClose={() => setIsSyncDrawerOpen(false)}
        checklist={activeRoster.stagedChecklist}
        optimization={optimization}
      />
    </div>
  );
}
