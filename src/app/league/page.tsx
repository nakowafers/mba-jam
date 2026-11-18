'use client';

import React from 'react';
import { Trophy } from 'lucide-react';
import { useMbaLeague } from '@/components/providers/mba-league-provider';

export default function LeaguePage() {
  const { snapshot } = useMbaLeague();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white">
              MBA Power Rankings & 2026–2029 Draft Pick Matrix
            </h1>
            <p className="text-xs text-slate-400">
              Comparing all {snapshot.rosters.length} MBA Rosters • Active: Roster #
              {snapshot.activeRoster.rosterId} {snapshot.activeRoster.manager.rosterName}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
