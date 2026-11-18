'use client';

import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useMbaLeague } from '@/components/providers/mba-league-provider';

export default function TradesPage() {
  const { snapshot } = useMbaLeague();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400">
            <ArrowLeftRight className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white">MBA Dynasty Trade Center</h1>
            <p className="text-xs text-slate-400">
              Active Perspective: Roster #{snapshot.activeRoster.rosterId}{' '}
              {snapshot.activeRoster.manager.rosterName} (@{snapshot.activeRoster.manager.displayName})
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
