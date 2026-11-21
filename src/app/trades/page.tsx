'use client';

import React, { useCallback, useState } from 'react';
import { ArrowLeftRight, History, Sparkles } from 'lucide-react';
import { useMbaLeague } from '@/components/providers/mba-league-provider';
import { CompletedTradeGrader } from '@/components/trades/completed-trade-grader';
import { DynastyTradeBuilder } from '@/components/trades/dynasty-trade-builder';
import { TradeProposal } from '@/lib/types/mba';

export type TradeCenterTab = 'BUILDER' | 'COMPLETED_GRADER';

export default function TradesPage() {
  const { snapshot } = useMbaLeague();
  const [activeTab, setActiveTab] = useState<TradeCenterTab>('BUILDER');
  const [builderProposal, setBuilderProposal] = useState<TradeProposal | null>(null);

  const handleLoadInBuilder = useCallback((proposal: TradeProposal) => {
    setBuilderProposal(proposal);
    setActiveTab('BUILDER');
  }, []);

  const handleProposalConsumed = useCallback(() => {
    setBuilderProposal(null);
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* Trade Center Header & Tab Navigation */}
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-lg">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30">
              <ArrowLeftRight className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight text-white">
                  MBA Dynasty Trade Center
                </h1>
                <span className="rounded-md bg-orange-500/15 px-2 py-0.5 font-mono text-xs font-bold text-orange-300 ring-1 ring-orange-500/30">
                  ADR-0002 Non-Linear Dual-Axis Model
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Active Perspective: Roster #{snapshot.activeRoster.rosterId}{' '}
                <span className="font-semibold text-slate-200">
                  {snapshot.activeRoster.manager.rosterName}
                </span>{' '}
                (@{snapshot.activeRoster.manager.displayName}) • Consolidation Premium • Replacement Cut
                Assets • Starting 10 Δ FP/G • Flipped Asset Tracking
              </p>
            </div>
          </div>

          {/* Clean Tab Header for Trade Builder & MBA Trade History (Completed League Trade Grader) */}
          <div
            role="tablist"
            aria-label="Trade Center Sections"
            className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1.5 text-xs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'BUILDER'}
              data-testid="tab-trade-builder"
              onClick={() => setActiveTab('BUILDER')}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 font-bold transition ${
                activeTab === 'BUILDER'
                  ? 'bg-orange-500 text-slate-950 shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Interactive Dynasty Trade Builder</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'COMPLETED_GRADER'}
              data-testid="tab-completed-trade-grader"
              onClick={() => setActiveTab('COMPLETED_GRADER')}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 font-bold transition ${
                activeTab === 'COMPLETED_GRADER'
                  ? 'bg-orange-500 text-slate-950 shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>MBA Trade History (2026 &amp; 2025 Grader)</span>
            </button>
          </div>
        </div>
      </section>

      {activeTab === 'BUILDER' ? (
        <DynastyTradeBuilder
          externalProposal={builderProposal}
          onExternalProposalConsumed={handleProposalConsumed}
        />
      ) : (
        <CompletedTradeGrader onLoadInBuilder={handleLoadInBuilder} />
      )}
    </div>
  );
}
