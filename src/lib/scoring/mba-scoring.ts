import {
  DEFAULT_MBA_SCORING_SETTINGS,
  LockInAvgSource,
  MbaScoringSettings,
  PlayerSeasonMetrics,
  SleeperMatchup,
  SleeperStatLine,
} from '../types/mba';

export interface PlayerLockInHistorySummary {
  weeksCount: number;
  totalPoints: number;
  averagePoints: number;
}

export function computePlayerLockInHistoryMap(
  historicalMatchups?: Record<number, SleeperMatchup[]>
): Map<string, PlayerLockInHistorySummary> {
  const result = new Map<string, PlayerLockInHistorySummary>();
  if (!historicalMatchups) return result;

  const totalsByPlayerId = new Map<string, { weeksCount: number; total: number }>();

  for (const matchups of Object.values(historicalMatchups)) {
    if (!Array.isArray(matchups) || matchups.length === 0) continue;

    // Deduplicate per (week, playerId): prefer started entry, else higher score
    const weekEntries = new Map<string, { points: number; started: boolean }>();

    for (const matchup of matchups) {
      const starterSet = new Set(matchup.starters ?? []);
      const playersPoints = matchup.players_points ?? {};

      for (const [playerId, pts] of Object.entries(playersPoints)) {
        if (typeof pts !== 'number' || Number.isNaN(pts) || pts === 0) {
          continue;
        }
        const started = starterSet.has(playerId);
        const existing = weekEntries.get(playerId);
        if (!existing) {
          weekEntries.set(playerId, { points: pts, started });
        } else if (started && !existing.started) {
          weekEntries.set(playerId, { points: pts, started });
        } else if (started === existing.started && pts > existing.points) {
          weekEntries.set(playerId, { points: pts, started });
        }
      }
    }

    for (const [playerId, entry] of weekEntries.entries()) {
      const acc = totalsByPlayerId.get(playerId) ?? { weeksCount: 0, total: 0 };
      acc.weeksCount += 1;
      acc.total += entry.points;
      totalsByPlayerId.set(playerId, acc);
    }
  }

  for (const [playerId, acc] of totalsByPlayerId.entries()) {
    if (acc.weeksCount <= 0) continue;
    const totalPoints = Math.round(acc.total * 100) / 100;
    const averagePoints = Math.round((acc.total / acc.weeksCount) * 10) / 10;
    result.set(playerId, {
      weeksCount: acc.weeksCount,
      totalPoints,
      averagePoints,
    });
  }

  return result;
}

export function countCompletedMatchupWeeks(
  historicalMatchups?: Record<number, SleeperMatchup[]>
): number {
  if (!historicalMatchups) return 0;
  let count = 0;
  for (const matchups of Object.values(historicalMatchups)) {
    if (Array.isArray(matchups) && matchups.length > 0) {
      count += 1;
    }
  }
  return count;
}

export function computeRosterWeeklyMatchupAverages(
  historicalMatchups?: Record<number, SleeperMatchup[]>
): Map<number, number> {
  const result = new Map<number, number>();
  if (!historicalMatchups) return result;

  const totalsByRosterId = new Map<number, { weeksCount: number; total: number }>();
  for (const weekMatchups of Object.values(historicalMatchups)) {
    if (!Array.isArray(weekMatchups) || weekMatchups.length === 0) continue;
    for (const m of weekMatchups) {
      if (typeof m.points === 'number' && !Number.isNaN(m.points) && m.points > 0) {
        const acc = totalsByRosterId.get(m.roster_id) ?? { weeksCount: 0, total: 0 };
        acc.weeksCount += 1;
        acc.total += m.points;
        totalsByRosterId.set(m.roster_id, acc);
      }
    }
  }

  for (const [rosterId, acc] of totalsByRosterId.entries()) {
    if (acc.weeksCount <= 0) continue;
    result.set(rosterId, Math.round((acc.total / acc.weeksCount) * 10) / 10);
  }

  return result;
}

export function computeMbaPoints(
  stats: SleeperStatLine | undefined | null,
  scoringSettings: MbaScoringSettings = DEFAULT_MBA_SCORING_SETTINGS
): number {
  if (!stats) return 0;

  let total = 0;
  const keys: Array<keyof MbaScoringSettings> = [
    'pts',
    'reb',
    'ast',
    'stl',
    'blk',
    'tpm',
    'to',
    'tf',
    'ff',
    'dd',
    'td',
    'bonus_pt_40p',
    'bonus_pt_50p',
  ];

  for (const key of keys) {
    const statVal = stats[key as string];
    const weight = scoringSettings[key] ?? DEFAULT_MBA_SCORING_SETTINGS[key] ?? 0;
    if (typeof statVal === 'number' && !Number.isNaN(statVal)) {
      total += statVal * weight;
    }
  }

  return Math.round(total * 100) / 100;
}

export function computeSeasonMetrics(
  stats: SleeperStatLine | undefined | null,
  scoringSettings: MbaScoringSettings = DEFAULT_MBA_SCORING_SETTINGS,
  lockInHistory?: PlayerLockInHistorySummary
): PlayerSeasonMetrics {
  const gp = stats?.gp && stats.gp > 0 ? stats.gp : 0;
  const totalMbaPoints = computeMbaPoints(stats, scoringSettings);
  const mbaFantasyPointsPerGame = gp > 0 ? Math.round((totalMbaPoints / gp) * 10) / 10 : 0;
  const perGame = (val?: number) => (gp > 0 && typeof val === 'number' ? Math.round((val / gp) * 10) / 10 : 0);

  const hasLockInHistory = Boolean(lockInHistory && lockInHistory.weeksCount > 0);
  const lockInAvgSource: LockInAvgSource = hasLockInHistory ? 'SLEEPER_LOCKED' : 'FALLBACK_FPG';
  const averageLockInPoints = hasLockInHistory
    ? lockInHistory!.averagePoints
    : mbaFantasyPointsPerGame;
  const lockInWeeksCount = hasLockInHistory ? lockInHistory!.weeksCount : 0;
  const totalLockInPoints = hasLockInHistory ? lockInHistory!.totalPoints : 0;

  return {
    gamesPlayed: gp,
    totalMbaPoints,
    mbaFantasyPointsPerGame,
    averageLockInPoints,
    lockInWeeksCount,
    totalLockInPoints,
    lockInAvgSource,
    ptsPerGame: perGame(stats?.pts),
    rebPerGame: perGame(stats?.reb),
    astPerGame: perGame(stats?.ast),
    stlPerGame: perGame(stats?.stl),
    blkPerGame: perGame(stats?.blk),
    tpmPerGame: perGame(stats?.tpm),
    toPerGame: perGame(stats?.to),
  };
}
