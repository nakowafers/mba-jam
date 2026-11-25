'use client';

import React from 'react';
import { describeReplacementCutAdjustment } from '@/lib/trades/trade-analyzer';
import {
  TradeFairnessLabel,
  TradeLetterGrade,
  TradeParticipantEvaluation,
} from '@/lib/types/mba';

export const TRADE_FAIRNESS_BADGE_STYLES: Record<TradeFairnessLabel, string> = {
  'Balanced Trade': 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40',
  'Slight Edge': 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40',
  'Lopsided Trade': 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40',
  'Fleecing Alert': 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40',
  'Settlement Transfer': 'bg-slate-800 text-slate-300 ring-1 ring-slate-600/50',
};

export function getFairnessBarColorClass(fairnessScore: number): string {
  if (fairnessScore >= 85) return 'bg-emerald-500';
  if (fairnessScore >= 68) return 'bg-sky-500';
  if (fairnessScore >= 45) return 'bg-amber-400';
  return 'bg-rose-500';
}

export function TradeGradeBadge({
  grade,
  size = 'lg',
}: {
  grade: TradeLetterGrade;
  size?: 'md' | 'lg';
}) {
  const isNA = grade === 'N/A';
  const colorStyle = isNA
    ? 'border-slate-600/60 bg-slate-800/70 text-slate-300 shadow-slate-950/50'
    : grade.startsWith('A')
      ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-emerald-950/50'
      : grade.startsWith('B')
        ? 'border-sky-500/50 bg-sky-500/20 text-sky-300 shadow-sky-950/50'
        : grade.startsWith('C')
          ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 shadow-amber-950/50'
          : 'border-rose-500/50 bg-rose-500/20 text-rose-300 shadow-rose-950/50';

  const frameStyle =
    size === 'md'
      ? 'h-12 w-12 rounded-xl border-2 font-mono font-black shadow-md'
      : 'h-14 w-14 rounded-2xl border-2 font-mono font-black shadow-lg';

  const textSize =
    size === 'md' ? (isNA ? 'text-base' : 'text-xl') : isNA ? 'text-lg' : 'text-2xl';

  return (
    <div
      className={`flex shrink-0 items-center justify-center ${frameStyle} ${colorStyle} ${textSize}`}
    >
      {grade}
    </div>
  );
}

export function ReplacementCutAdjustmentNote({
  participant,
  className = 'mt-1 text-[11px] text-amber-200/90',
}: {
  participant: Pick<
    TradeParticipantEvaluation,
    'replacementCutAssets' | 'replacementCutPenalty' | 'outgoingPicks' | 'incomingPicks'
  >;
  className?: string;
}) {
  const cutAdjustment = describeReplacementCutAdjustment({
    replacementCutAssets: participant.replacementCutAssets,
    replacementCutPenalty: participant.replacementCutPenalty,
    outgoingPicksCount: participant.outgoingPicks.length,
    incomingPicksCount: participant.incomingPicks.length,
  });

  if (!cutAdjustment.isReduced) return null;

  return (
    <div className={className}>
      Gross {cutAdjustment.rawCutSum.toFixed(1)} DV reduced to -
      {participant.replacementCutPenalty.toFixed(1)} via {cutAdjustment.reasons.join(' & ')}.
    </div>
  );
}
