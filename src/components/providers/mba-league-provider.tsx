'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MbaLeagueEngine } from '@/lib/engine/mba-league-engine';
import { ClientApiSleeperGateway } from '@/lib/gateway/http-sleeper-gateway';
import { LocalStorageManagerStateStore } from '@/lib/store/manager-state-store';
import { MbaLeagueSnapshot, SleeperLeagueBundle } from '@/lib/types/mba';

interface MbaLeagueContextValue {
  engine: MbaLeagueEngine;
  snapshot: MbaLeagueSnapshot;
  activeRosterId: number;
  isSyncing: boolean;
  lastError: string | null;
  selectRoster: (rosterId: number) => void;
  syncLatestData: () => Promise<void>;
}

const MbaLeagueContext = createContext<MbaLeagueContextValue | null>(null);

export function MbaLeagueProvider({
  initialBundle,
  children,
}: {
  initialBundle: SleeperLeagueBundle;
  children: React.ReactNode;
}) {
  const stateStore = useMemo(() => new LocalStorageManagerStateStore(), []);
  const gateway = useMemo(() => new ClientApiSleeperGateway(), []);
  const engine = useMemo(
    () => new MbaLeagueEngine({ gateway, stateStore }),
    [gateway, stateStore]
  );

  const [bundle, setBundle] = useState<SleeperLeagueBundle>(initialBundle);
  const [activeRosterId, setActiveRosterId] = useState<number>(
    initialBundle.rosters[0]?.roster_id ?? 1
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Hydrate persisted active Roster from LocalStorageManagerStateStore on mount
  useEffect(() => {
    const stored = engine.getStoredActiveRosterId(bundle.league.league_id);
    if (stored && bundle.rosters.some((r) => r.roster_id === stored)) {
      setActiveRosterId(stored);
    }
  }, [engine, bundle.league.league_id, bundle.rosters]);

  const selectRoster = useCallback(
    (rosterId: number) => {
      engine.selectActiveRoster(rosterId, bundle.league.league_id);
      setActiveRosterId(rosterId);
    },
    [engine, bundle.league.league_id]
  );

  const syncLatestData = useCallback(async () => {
    setIsSyncing(true);
    setLastError(null);
    try {
      const freshBundle = await gateway.fetchLeagueBundle({ forceRefresh: true });
      setBundle(freshBundle);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Failed to sync Sleeper data');
    } finally {
      setIsSyncing(false);
    }
  }, [gateway]);

  const snapshot = useMemo(
    () => engine.buildSnapshotFromBundle(bundle, activeRosterId),
    [engine, bundle, activeRosterId]
  );

  const value = useMemo(
    () => ({
      engine,
      snapshot,
      activeRosterId: snapshot.activeRosterId,
      isSyncing,
      lastError,
      selectRoster,
      syncLatestData,
    }),
    [engine, snapshot, isSyncing, lastError, selectRoster, syncLatestData]
  );

  return <MbaLeagueContext.Provider value={value}>{children}</MbaLeagueContext.Provider>;
}

export function useMbaLeague(): MbaLeagueContextValue {
  const ctx = useContext(MbaLeagueContext);
  if (!ctx) {
    throw new Error('useMbaLeague must be used inside MbaLeagueProvider');
  }
  return ctx;
}
