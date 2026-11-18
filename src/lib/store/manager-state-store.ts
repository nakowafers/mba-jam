import {
  MBA_LEAGUE_ID_2026,
  ManagerStateStore,
  ProjectedPickTier,
} from '../types/mba';

export class InMemoryManagerStateStore implements ManagerStateStore {
  private activeRosterByLeague = new Map<string, number>();
  private lockOverrides = new Map<string, boolean>();
  private pickTierOverrides = new Map<string, ProjectedPickTier>();

  getActiveRosterId(leagueId: string = MBA_LEAGUE_ID_2026): number | null {
    return this.activeRosterByLeague.get(leagueId) ?? null;
  }

  setActiveRosterId(rosterId: number, leagueId: string = MBA_LEAGUE_ID_2026): void {
    this.activeRosterByLeague.set(leagueId, rosterId);
  }

  getManualLockOverride(leagueId: string, week: number, rosterId: number, playerId: string): boolean | null {
    const key = `${leagueId}:${week}:${rosterId}:${playerId}`;
    return this.lockOverrides.has(key) ? this.lockOverrides.get(key)! : null;
  }

  setManualLockOverride(
    leagueId: string,
    week: number,
    rosterId: number,
    playerId: string,
    locked: boolean | null
  ): void {
    const key = `${leagueId}:${week}:${rosterId}:${playerId}`;
    if (locked === null) {
      this.lockOverrides.delete(key);
    } else {
      this.lockOverrides.set(key, locked);
    }
  }

  getPickTierOverride(pickId: string): ProjectedPickTier | null {
    return this.pickTierOverrides.get(pickId) ?? null;
  }

  setPickTierOverride(pickId: string, tier: ProjectedPickTier | null): void {
    if (tier === null) {
      this.pickTierOverrides.delete(pickId);
    } else {
      this.pickTierOverrides.set(pickId, tier);
    }
  }
}

const STORAGE_PREFIX = 'mba_jam_v1';

export class LocalStorageManagerStateStore implements ManagerStateStore {
  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  getActiveRosterId(leagueId: string = MBA_LEAGUE_ID_2026): number | null {
    if (!this.isBrowser()) return null;
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:active_roster:${leagueId}`);
      if (!raw) return null;
      const parsed = Number.parseInt(raw, 10);
      return Number.isNaN(parsed) ? null : parsed;
    } catch {
      return null;
    }
  }

  setActiveRosterId(rosterId: number, leagueId: string = MBA_LEAGUE_ID_2026): void {
    if (!this.isBrowser()) return;
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}:active_roster:${leagueId}`, String(rosterId));
    } catch {
      // Ignore quota errors
    }
  }

  getManualLockOverride(leagueId: string, week: number, rosterId: number, playerId: string): boolean | null {
    if (!this.isBrowser()) return null;
    try {
      const key = `${STORAGE_PREFIX}:lock:${leagueId}:${week}:${rosterId}:${playerId}`;
      const raw = window.localStorage.getItem(key);
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return null;
    } catch {
      return null;
    }
  }

  setManualLockOverride(
    leagueId: string,
    week: number,
    rosterId: number,
    playerId: string,
    locked: boolean | null
  ): void {
    if (!this.isBrowser()) return;
    try {
      const key = `${STORAGE_PREFIX}:lock:${leagueId}:${week}:${rosterId}:${playerId}`;
      if (locked === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, String(locked));
      }
    } catch {
      // Ignore storage errors
    }
  }

  getPickTierOverride(pickId: string): ProjectedPickTier | null {
    if (!this.isBrowser()) return null;
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:pick_tier:${pickId}`);
      if (raw === 'Early' || raw === 'Mid' || raw === 'Late') return raw;
      return null;
    } catch {
      return null;
    }
  }

  setPickTierOverride(pickId: string, tier: ProjectedPickTier | null): void {
    if (!this.isBrowser()) return;
    try {
      const key = `${STORAGE_PREFIX}:pick_tier:${pickId}`;
      if (tier === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, tier);
      }
    } catch {
      // Ignore storage errors
    }
  }
}
