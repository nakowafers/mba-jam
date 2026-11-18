import { computeMbaPoints } from '../scoring/mba-scoring';
import {
  CompletedWeeklyGame,
  HydratedRoster,
  LockInRecommendationBadge,
  LockSourceType,
  MatchupLeverageAnnotation,
  MatchupLeverageSummary,
  MbaScoringSettings,
  PlayerLockInEvaluation,
  RosterSlotCategory,
  ScheduledWeeklyGame,
  SleeperGameStatEntry,
} from '../types/mba';

export interface EvaluatePlayerLockInInput {
  category: RosterSlotCategory;
  currentWeekMatchupPoints: number;
  seasonFpg: number;
  completedEntries: SleeperGameStatEntry[];
  projectionEntries: SleeperGameStatEntry[];
  scoringSettings: MbaScoringSettings;
  manualLockOverride: boolean | null;
}

const SCORE_MATCH_TOLERANCE = 0.15;

export function getRemainingGamesOrderStatisticMultiplier(remainingCount: number): number {
  if (remainingCount <= 0) return 0;
  if (remainingCount === 1) return 1.0;
  if (remainingCount === 2) return 1.13;
  return 1.22;
}

export function evaluatePlayerLockIn(input: EvaluatePlayerLockInInput): PlayerLockInEvaluation {
  const {
    category,
    currentWeekMatchupPoints,
    seasonFpg,
    completedEntries,
    projectionEntries,
    scoringSettings,
    manualLockOverride,
  } = input;

  const sortedCompletedRaw = [...completedEntries].sort((a, b) => {
    const cmp = (a.date ?? '').localeCompare(b.date ?? '');
    if (cmp !== 0) return cmp;
    return (a.game_id ?? '').localeCompare(b.game_id ?? '');
  });

  const completedGames: CompletedWeeklyGame[] = sortedCompletedRaw.map((entry, idx) => ({
    gameId: entry.game_id || `completed-${idx}`,
    date: entry.date ?? 'TBD',
    opponent: entry.opponent ?? 'NBA',
    mbaPoints: computeMbaPoints(entry.stats, scoringSettings),
    stats: entry.stats ?? {},
    isLockedGame: false,
  }));

  const completedDates = new Set(
    sortedCompletedRaw.map((g) => g.date).filter((d): d is string => Boolean(d))
  );
  const completedGameIds = new Set(
    sortedCompletedRaw.map((g) => g.game_id).filter((id): id is string => Boolean(id))
  );

  const sortedRemainingRaw = [...projectionEntries]
    .filter((proj) => {
      if (proj.date && completedDates.has(proj.date)) return false;
      if (proj.game_id && completedGameIds.has(proj.game_id)) return false;
      return true;
    })
    .sort((a, b) => {
      const cmp = (a.date ?? '').localeCompare(b.date ?? '');
      if (cmp !== 0) return cmp;
      return (a.game_id ?? '').localeCompare(b.game_id ?? '');
    });

  const remainingGames: ScheduledWeeklyGame[] = sortedRemainingRaw.map((entry, idx) => ({
    gameId: entry.game_id || `sched-${idx}`,
    date: entry.date ?? 'TBD',
    opponent: entry.opponent ?? 'NBA',
    projectedMbaPoints: computeMbaPoints(entry.stats, scoringSettings),
    stats: entry.stats ?? {},
  }));

  const k = remainingGames.length;
  const remainingGamesMultiplier = getRemainingGamesOrderStatisticMultiplier(k);

  let remainingGamesMean = 0;
  if (k > 0) {
    const sumProj = remainingGames.reduce((sum, g) => sum + g.projectedMbaPoints, 0);
    remainingGamesMean = sumProj > 0 ? sumProj / k : seasonFpg;
  }

  const lockInThreshold =
    k > 0 ? Math.round(remainingGamesMean * remainingGamesMultiplier * 100) / 100 : 0;

  // Check for Inferred Locked Score:
  // When >= 2 games have completed and players_points matches an earlier completed game (index < length - 1)
  let inferredLockedGameIndex = -1;
  if (completedGames.length >= 2 && currentWeekMatchupPoints > 0) {
    const latestGame = completedGames[completedGames.length - 1];
    const matchesLatest =
      Math.abs(latestGame.mbaPoints - currentWeekMatchupPoints) <= SCORE_MATCH_TOLERANCE;

    for (let i = 0; i < completedGames.length - 1; i++) {
      const earlier = completedGames[i];
      if (
        Math.abs(earlier.mbaPoints - currentWeekMatchupPoints) <= SCORE_MATCH_TOLERANCE &&
        (!matchesLatest || Math.abs(earlier.mbaPoints - latestGame.mbaPoints) > SCORE_MATCH_TOLERANCE)
      ) {
        inferredLockedGameIndex = i;
        break;
      }
    }
  }

  let isLocked = false;
  let lockSource: LockSourceType = null;
  let lockedGame: CompletedWeeklyGame | null = null;
  let lockedScore: number | null = null;

  if (inferredLockedGameIndex >= 0) {
    isLocked = true;
    lockSource = 'INFERRED_SLEEPER';
    completedGames[inferredLockedGameIndex].isLockedGame = true;
    lockedGame = completedGames[inferredLockedGameIndex];
    lockedScore = lockedGame.mbaPoints;
  } else if (completedGames.length >= 1 && k === 0) {
    // Final game of the week is auto-locked when no remaining scheduled games exist
    const finalIdx = completedGames.length - 1;
    isLocked = true;
    lockSource = 'FINAL_GAME_AUTO';
    completedGames[finalIdx].isLockedGame = true;
    lockedGame = completedGames[finalIdx];
    lockedScore = lockedGame.mbaPoints;
  } else if (completedGames.length >= 1 && k >= 1 && manualLockOverride === true) {
    const latestIdx = completedGames.length - 1;
    isLocked = true;
    lockSource = 'MANUAL_OVERRIDE';
    completedGames[latestIdx].isLockedGame = true;
    lockedGame = completedGames[latestIdx];
    lockedScore = lockedGame.mbaPoints;
  }

  const latestCompletedGame = completedGames.at(-1) ?? null;
  const canToggleManualLock =
    completedGames.length >= 1 && k >= 1 && lockSource !== 'INFERRED_SLEEPER';
  const isLockInWindowOpen = canToggleManualLock;
  const lockableLatestGame = isLockInWindowOpen ? latestCompletedGame : null;

  let effectiveWeeklyScore = 0;
  if (isLocked && lockedScore !== null) {
    effectiveWeeklyScore = lockedScore;
  } else if (latestCompletedGame !== null) {
    effectiveWeeklyScore = Math.max(latestCompletedGame.mbaPoints, lockInThreshold);
  } else if (k > 0) {
    effectiveWeeklyScore = lockInThreshold;
  } else {
    effectiveWeeklyScore = currentWeekMatchupPoints > 0 ? currentWeekMatchupPoints : seasonFpg;
  }
  effectiveWeeklyScore = Math.round(effectiveWeeklyScore * 100) / 100;

  const isPinnedStarter = category === 'STARTER' && isLocked;

  const { recommendation, leverageAnnotation } = computeLockInRecommendation({
    isLocked,
    latestScore: latestCompletedGame?.mbaPoints ?? null,
    lockInThreshold,
    remainingGamesCount: k,
    projectedDifferential: 0,
  });

  return {
    isLocked,
    isPinnedStarter,
    lockSource,
    lockedScore,
    lockedGame,
    isLockInWindowOpen,
    canToggleManualLock,
    lockableLatestGame,
    completedGames,
    remainingGames,
    remainingGamesMean: Math.round(remainingGamesMean * 100) / 100,
    remainingGamesMultiplier,
    lockInThreshold,
    effectiveWeeklyScore,
    recommendation,
    leverageAnnotation,
  };
}

export function computeLockInRecommendation(params: {
  isLocked: boolean;
  latestScore: number | null;
  lockInThreshold: number;
  remainingGamesCount: number;
  projectedDifferential: number;
}): {
  recommendation: LockInRecommendationBadge;
  leverageAnnotation: MatchupLeverageAnnotation;
} {
  const { isLocked, latestScore, lockInThreshold, remainingGamesCount, projectedDifferential } =
    params;

  if (isLocked) {
    return { recommendation: 'LOCKED', leverageAnnotation: null };
  }

  if (latestScore === null || remainingGamesCount <= 0) {
    return { recommendation: 'ROLL THE DICE', leverageAnnotation: null };
  }

  const ratio = lockInThreshold > 0 ? latestScore / lockInThreshold : 1.25;

  // Matchup Leverage Shifts:
  // 1) Leading comfortably (> +25 FP): borderline scores (>= 0.92x threshold and < 1.12x threshold) get "Protect Lead — Floor Lock"
  if (projectedDifferential > 25 && ratio >= 0.92) {
    if (ratio < 1.12) {
      return {
        recommendation: 'LEAN LOCK',
        leverageAnnotation: 'Protect Lead — Floor Lock',
      };
    }
    return {
      recommendation: 'SMASH LOCK',
      leverageAnnotation: 'Protect Lead — Floor Lock',
    };
  }

  // 2) Trailing significantly (< -25 FP with k >= 1): scores <= 1.08x threshold get "Chase Upside — Roll for Ceiling"
  if (projectedDifferential < -25 && remainingGamesCount >= 1 && ratio <= 1.08) {
    return {
      recommendation: 'ROLL THE DICE',
      leverageAnnotation: 'Chase Upside — Roll for Ceiling',
    };
  }

  if (ratio >= 1.12) {
    return { recommendation: 'SMASH LOCK', leverageAnnotation: null };
  }
  if (ratio >= 1.0) {
    return { recommendation: 'LEAN LOCK', leverageAnnotation: null };
  }

  return { recommendation: 'ROLL THE DICE', leverageAnnotation: null };
}

export function applyMatchupLeverageToRoster(
  roster: HydratedRoster,
  opponentRoster: HydratedRoster | undefined,
  week: number
): MatchupLeverageSummary | null {
  if (!opponentRoster || roster.currentWeekMatchupId === null) {
    return null;
  }

  const activeCurrentScore = roster.currentWeekMatchupPoints;
  const opponentCurrentScore = opponentRoster.currentWeekMatchupPoints;
  const currentDifferential =
    Math.round((activeCurrentScore - opponentCurrentScore) * 100) / 100;

  const activeProjectedScore = roster.currentWeekProjectedPoints;
  const opponentProjectedScore = opponentRoster.currentWeekProjectedPoints;
  const projectedDifferential =
    Math.round((activeProjectedScore - opponentProjectedScore) * 100) / 100;

  let posture: MatchupLeverageSummary['posture'] = 'BALANCED';
  let postureLabel = 'Balanced Matchup — Standard E[max] Thresholds';
  let summaryText = `Projected within ${Math.abs(projectedDifferential).toFixed(1)} FP vs. ${opponentRoster.manager.rosterName}; hold standard E[max] Lock-In bars.`;

  if (projectedDifferential > 25) {
    posture = 'PROTECT_LEAD';
    postureLabel = 'Protect Lead — Floor Lock';
    summaryText = `Projected +${projectedDifferential.toFixed(1)} FP ahead of ${opponentRoster.manager.rosterName}; lock solid floor games (>= 0.92x threshold) to bank the win.`;
  } else if (projectedDifferential < -25) {
    posture = 'CHASE_UPSIDE';
    postureLabel = 'Chase Upside — Roll for Ceiling';
    summaryText = `Projected ${projectedDifferential.toFixed(1)} FP behind ${opponentRoster.manager.rosterName}; pass on borderline locks (<= 1.08x threshold) and roll for ceiling explosions.`;
  }

  for (const slot of roster.allPlayers) {
    const updated = computeLockInRecommendation({
      isLocked: slot.isLocked,
      latestScore: slot.latestCompletedGamePoints,
      lockInThreshold: slot.lockInThreshold,
      remainingGamesCount: slot.currentWeekRemainingGamesCount,
      projectedDifferential,
    });
    slot.recommendation = updated.recommendation;
    slot.leverageAnnotation = updated.leverageAnnotation;
    slot.lockIn.recommendation = updated.recommendation;
    slot.lockIn.leverageAnnotation = updated.leverageAnnotation;
  }

  return {
    matchupId: roster.currentWeekMatchupId,
    week,
    activeRosterId: roster.rosterId,
    activeRosterName: roster.manager.rosterName,
    activeManagerName: roster.manager.displayName,
    opponentRosterId: opponentRoster.rosterId,
    opponentRosterName: opponentRoster.manager.rosterName,
    opponentManagerName: opponentRoster.manager.displayName,
    activeCurrentScore,
    opponentCurrentScore,
    currentDifferential,
    activeProjectedScore,
    opponentProjectedScore,
    projectedDifferential,
    posture,
    postureLabel,
    summaryText,
  };
}
