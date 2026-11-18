'use client';

import React, { useState } from 'react';
import { ArrowLeftRight, History, Sparkles } from 'lucide-react';
import { useMbaLeague } from '@/components/providers/mba-league-provider';
import { DynastyTradeBuilder } from '@/components/trades/dynasty-trade-builder';

export type TradeCenterTab = 'BUILDER' | 'COMPLETED_GRADER';

export default function TradesPage() {
  const { snapshot } = useMbaLeague();
  const [activeTab, setActiveTab] = useState<TradeCenterTab>('BUILDER');

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
                Assets • Starting 10 Δ FP/G
              </p>
            </div>
          </div>

          {/* Clean Tab Header for Trade Builder & Completed League Trade Grader (2026 & 2025) */}
          <div
            role="tablist"
            aria-label="Trade Center Sections"
            className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1.5 text-xs"
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
              <span>Completed League Trade Grader (2026 &amp; 2025)</span>
            </button>
          </div>
        </div>
      </section>

      {activeTab === 'BUILDER' ? (
        <DynastyTradeBuilder />
      ) : (
        <section
          data-testid="completed-trade-grader-placeholder"
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center"
        >
          <History className="mx-auto h-8 w-8 text-orange-400" />
          <h2 className="mt-3 text-lg font-extrabold text-white">
            Completed League Trade Grader (2026 &amp; 2025 Seasons)
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Historical Sleeper transaction grader with Flipped Asset tracking across seasons 2026 (
            1344293979830640640) and 2025 (1212393765696700416).
          </p>
        </section>
      )}
    </div>
  );
}
