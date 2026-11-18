import { createDeterministicMbaFixtures } from '../engine/fixtures/mba-fixtures';
import {
  MBA_LEAGUE_ID_2025,
  MBA_LEAGUE_ID_2026,
  SleeperGameStatEntry,
  SleeperGateway,
  SleeperLeague,
  SleeperLeagueBundle,
  SleeperMatchup,
  SleeperNbaState,
  SleeperPlayer,
  SleeperRoster,
  SleeperTradedPick,
  SleeperTransaction,
  SleeperUser,
} from '../types/mba';

// Cache the large /v1/players/nba dictionary in server memory for 1 hour
let cachedPlayersDict: Record<string, SleeperPlayer> | null = null;
let cachedPlayersTimestamp = 0;
const PLAYERS_TTL_MS = 60 * 60 * 1000;

async function fetchJson<T>(url: string, forceRefresh?: boolean): Promise<T> {
  const res = await fetch(url, {
    cache: forceRefresh ? 'no-store' : 'default',
    next: forceRefresh ? { revalidate: 0 } : { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Sleeper request failed (${res.status}): ${url}`);
  }
  return (await res.json()) as T;
}

export class HttpSleeperGateway implements SleeperGateway {
  private readonly leagueId: string;

  constructor(leagueId: string = MBA_LEAGUE_ID_2026) {
    this.leagueId = leagueId;
  }

  async fetchLeagueBundle(options?: {
    forceRefresh?: boolean;
    leg?: number;
  }): Promise<SleeperLeagueBundle> {
    try {
      const force = options?.forceRefresh;
      const [nbaState, league, users, rosters, tradedPicks] = await Promise.all([
        fetchJson<SleeperNbaState>('https://api.sleeper.app/v1/state/nba', force),
        fetchJson<SleeperLeague>(`https://api.sleeper.app/v1/league/${this.leagueId}`, force),
        fetchJson<SleeperUser[]>(`https://api.sleeper.app/v1/league/${this.leagueId}/users`, force),
        fetchJson<SleeperRoster[]>(`https://api.sleeper.app/v1/league/${this.leagueId}/rosters`, force),
        fetchJson<SleeperTradedPick[]>(
          `https://api.sleeper.app/v1/league/${this.leagueId}/traded_picks`,
          force
        ),
      ]);

      const activeLeg = options?.leg ?? nbaState.leg ?? league.settings?.leg ?? 1;
      const season = league.season || nbaState.season || '2026';

      // Collect all player IDs on MBA rosters so we only keep needed players in the bundle
      const rosterPlayerIds = new Set<string>();
      for (const r of rosters) {
        for (const pid of r.players ?? []) rosterPlayerIds.add(pid);
        for (const pid of r.starters ?? []) rosterPlayerIds.add(pid);
        for (const pid of r.reserve ?? []) rosterPlayerIds.add(pid);
        for (const pid of r.taxi ?? []) rosterPlayerIds.add(pid);
      }

      const [
        matchups,
        seasonStatsRaw,
        weeklyStatsRaw,
        weeklyProjRaw,
        fullPlayersDict,
        historicalTransactions,
      ] = await Promise.all([
        fetchJson<SleeperMatchup[]>(
          `https://api.sleeper.app/v1/league/${this.leagueId}/matchups/${activeLeg}`,
          force
        ),
        fetchJson<SleeperGameStatEntry[]>(
          `https://api.sleeper.com/stats/nba/${season}?season_type=regular`,
          force
        ),
        fetchJson<SleeperGameStatEntry[]>(
          `https://api.sleeper.com/stats/nba/${season}/${activeLeg}?season_type=regular`,
          force
        ),
        fetchJson<SleeperGameStatEntry[]>(
          `https://api.sleeper.com/projections/nba/${season}/${activeLeg}?season_type=regular`,
          force
        ),
        this.getPlayersDictionary(),
        this.fetchMultiSeasonTrades(
          this.leagueId,
          league.previous_league_id || MBA_LEAGUE_ID_2025,
          activeLeg
        ),
      ]);

      for (const tx of historicalTransactions) {
        for (const pid of Object.keys(tx.adds ?? {})) rosterPlayerIds.add(pid);
        for (const pid of Object.keys(tx.drops ?? {})) rosterPlayerIds.add(pid);
      }

      // Prune to roster players + traded players + top active NBA players to keep client payloads snappy
      const players: Record<string, SleeperPlayer> = {};
      for (const pid of rosterPlayerIds) {
        if (fullPlayersDict[pid]) {
          players[pid] = fullPlayersDict[pid];
        }
      }

      const seasonStats = seasonStatsRaw.filter(
        (entry) => rosterPlayerIds.has(entry.player_id) || (entry.stats?.pts ?? 0) >= 150
      );
      for (const entry of seasonStats) {
        if (!players[entry.player_id] && fullPlayersDict[entry.player_id]) {
          players[entry.player_id] = fullPlayersDict[entry.player_id];
        }
      }

      const weeklyStats = weeklyStatsRaw.filter((entry) => Boolean(players[entry.player_id]));
      const weeklyProjections = weeklyProjRaw.filter((entry) => Boolean(players[entry.player_id]));

      return {
        nbaState,
        league,
        users,
        rosters,
        matchups,
        tradedPicks,
        transactions: historicalTransactions,
        players,
        seasonStats,
        weeklyStats,
        weeklyProjections,
      };
    } catch (error) {
      console.warn('HttpSleeperGateway falling back to deterministic MBA fixtures:', error);
      return createDeterministicMbaFixtures();
    }
  }

  async fetchTransactions(leagueId: string, leg: number): Promise<SleeperTransaction[]> {
    try {
      const season = leagueId === MBA_LEAGUE_ID_2025 ? '2025' : '2026';
      const raw = await fetchJson<SleeperTransaction[]>(
        `https://api.sleeper.app/v1/league/${leagueId}/transactions/${leg}`
      );
      return raw.map((tx) => ({
        ...tx,
        season: tx.season ?? season,
        league_id: tx.league_id ?? leagueId,
      }));
    } catch {
      return [];
    }
  }

  private async fetchMultiSeasonTrades(
    leagueId2026: string,
    leagueId2025: string,
    currentLeg2026: number
  ): Promise<SleeperTransaction[]> {
    try {
      const legs2026 = Array.from({ length: Math.max(1, currentLeg2026) }, (_, i) => i + 1);
      const legs2025 = Array.from({ length: 18 }, (_, i) => i + 1);

      const [tx2026Arrays, tx2025Arrays] = await Promise.all([
        Promise.all(legs2026.map((leg) => this.fetchTransactions(leagueId2026, leg))),
        Promise.all(legs2025.map((leg) => this.fetchTransactions(leagueId2025, leg))),
      ]);

      const byId = new Map<string, SleeperTransaction>();
      for (const tx of [...tx2025Arrays.flat(), ...tx2026Arrays.flat()]) {
        if (tx.type === 'trade' && tx.status === 'complete') {
          byId.set(tx.transaction_id, tx);
        }
      }

      if (byId.size > 0) {
        return [...byId.values()];
      }
      return createDeterministicMbaFixtures().transactions ?? [];
    } catch {
      return createDeterministicMbaFixtures().transactions ?? [];
    }
  }

  private async getPlayersDictionary(): Promise<Record<string, SleeperPlayer>> {
    const now = Date.now();
    if (cachedPlayersDict && now - cachedPlayersTimestamp < PLAYERS_TTL_MS) {
      return cachedPlayersDict;
    }
    const res = await fetch('https://api.sleeper.app/v1/players/nba', {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Sleeper players request failed (${res.status})`);
    }
    const raw = (await res.json()) as Record<string, SleeperPlayer>;
    cachedPlayersDict = raw;
    cachedPlayersTimestamp = now;
    return raw;
  }
}

export class ClientApiSleeperGateway implements SleeperGateway {
  async fetchLeagueBundle(options?: {
    forceRefresh?: boolean;
    leg?: number;
  }): Promise<SleeperLeagueBundle> {
    const params = new URLSearchParams();
    if (options?.forceRefresh) params.set('force', '1');
    if (options?.leg) params.set('leg', String(options.leg));

    const query = params.toString();
    const res = await fetch(`/api/sleeper/sync${query ? `?${query}` : ''}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to sync Sleeper data: ${res.status}`);
    }
    return (await res.json()) as SleeperLeagueBundle;
  }
}
