'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RefreshCw, Trophy, ArrowLeftRight, LayoutGrid, Flame, ExternalLink } from 'lucide-react';
import { useMbaLeague } from '@/components/providers/mba-league-provider';

export function TopNavBar() {
  const pathname = usePathname();
  const { snapshot, activeRosterId, selectRoster, syncLatestData, isSyncing } = useMbaLeague();

  const navItems = [
    { href: '/', label: 'Lineup Studio', icon: LayoutGrid },
    { href: '/trades', label: 'Trade Center', icon: ArrowLeftRight },
    { href: '/league', label: 'Power Rankings & Pick Matrix', icon: Trophy },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Brand + Live Week/Leg Pill */}
        <div className="flex items-center gap-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 text-slate-950 shadow-md shadow-orange-500/20">
              <Flame className="h-5 w-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tight text-white">MBA JAM</span>
                <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-400 ring-1 ring-orange-500/30">
                  Dynasty Lock-In
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Sleeper League <span className="font-mono text-slate-300">#{snapshot.leagueId}</span>
              </p>
            </div>
          </Link>

          <div
            data-testid="live-week-pill"
            className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 sm:flex"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              {snapshot.season} Season • Week {snapshot.currentWeek} (Leg {snapshot.currentLeg})
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/70 p-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-orange-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Zero-Auth Manager / Roster Switcher & Sync Action */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-1.5">
            <label
              htmlFor="manager-roster-switcher"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-400"
            >
              Active Roster
            </label>
            <select
              id="manager-roster-switcher"
              data-testid="manager-roster-switcher"
              value={activeRosterId}
              onChange={(e) => selectRoster(Number.parseInt(e.target.value, 10))}
              className="cursor-pointer rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-white outline-none ring-1 ring-slate-700 transition focus:ring-orange-500"
            >
              {snapshot.rosters.map((r) => (
                <option key={r.rosterId} value={r.rosterId}>
                  #{r.rosterId} {r.manager.rosterName} (@{r.manager.displayName}) — {r.standing.wins}-
                  {r.standing.losses}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void syncLatestData()}
            disabled={isSyncing}
            data-testid="sync-sleeper-button"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-orange-500/40 bg-orange-500/15 px-3 py-2 text-xs font-bold text-orange-300 transition hover:bg-orange-500/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing Sleeper...' : 'Sync Latest Sleeper Data'}</span>
          </button>

          <a
            href={`https://sleeper.com/leagues/${snapshot.leagueId}/league`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open MBA League on Sleeper"
            className="hidden items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-2 text-xs font-medium text-slate-400 transition hover:border-slate-700 hover:text-white lg:inline-flex"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}
