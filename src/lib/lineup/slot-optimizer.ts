import {
  HydratedRoster,
  LineupMutationAdapter,
  MBA_LEAGUE_ID_2026,
  MBA_STARTER_SLOTS,
  OptimizedStarterSlotAssignment,
  RosterEligibilityWarning,
  RosterLineupOptimization,
  RosterPlayerSlot,
  StagedLockAction,
  StagedSlotSwap,
  StarterSlotType,
  SwapAndLockAlert,
} from '../types/mba';

export function isInjuredUnavailable(injuryStatus: string | null | undefined): boolean {
  if (!injuryStatus) return false;
  const normalized = injuryStatus.trim().toUpperCase();
  return normalized === 'OUT' || normalized === 'IR' || normalized === 'SUS' || normalized === 'O';
}

export function isPlayerEligibleForStarterSlot(
  positions: readonly string[],
  slotType: StarterSlotType
): boolean {
  if (slotType === 'UTIL') return true;
  if (slotType === 'PG') return positions.includes('PG');
  if (slotType === 'SG') return positions.includes('SG');
  if (slotType === 'G') {
    return positions.includes('PG') || positions.includes('SG') || positions.includes('G');
  }
  if (slotType === 'SF') return positions.includes('SF');
  if (slotType === 'PF') return positions.includes('PF');
  if (slotType === 'F') {
    return positions.includes('SF') || positions.includes('PF') || positions.includes('F');
  }
  if (slotType === 'C') return positions.includes('C');
  return false;
}

export function getPlayerOptimizerScore(player: RosterPlayerSlot, respectPin: boolean): number {
  if (respectPin && player.isPinnedStarter) {
    return player.effectiveWeeklyScore;
  }
  if (isInjuredUnavailable(player.injuryStatus) && !player.isLocked) {
    return 0;
  }
  return player.effectiveWeeklyScore;
}

function popcount10(mask: number): number {
  let c = 0;
  let m = mask;
  while (m > 0) {
    c += m & 1;
    m >>= 1;
  }
  return c;
}

export function solveOptimalTenStarters(params: {
  starterSlots: RosterPlayerSlot[];
  benchSlots: RosterPlayerSlot[];
  respectPinnedStarters: boolean;
}): OptimizedStarterSlotAssignment[] {
  const { starterSlots, benchSlots, respectPinnedStarters } = params;

  const pinnedSlotAssignment = new Map<number, RosterPlayerSlot>();
  const pinnedPlayerIds = new Set<string>();
  let initialMask = 0;

  if (respectPinnedStarters) {
    starterSlots.forEach((slot, idx) => {
      if (slot.isPinnedStarter) {
        pinnedSlotAssignment.set(idx, slot);
        pinnedPlayerIds.add(slot.playerId);
        initialMask |= 1 << idx;
      }
    });
  }

  // Candidate pool: all unpinned starters + all healthy (non-Out/IR) bench players
  const pool: RosterPlayerSlot[] = [];
  for (const starter of starterSlots) {
    if (!pinnedPlayerIds.has(starter.playerId)) {
      pool.push(starter);
    }
  }
  for (const bench of benchSlots) {
    if (!pinnedPlayerIds.has(bench.playerId) && !isInjuredUnavailable(bench.injuryStatus)) {
      pool.push(bench);
    }
  }

  const TOTAL_MASKS = 1 << 10; // 1024
  const dp = new Float64Array(TOTAL_MASKS).fill(-Infinity);
  const assignments: Array<Int16Array | null> = new Array(TOTAL_MASKS).fill(null);

  const initArr = new Int16Array(10).fill(-1);
  dp[initialMask] = 0;
  assignments[initialMask] = initArr;

  for (let pIdx = 0; pIdx < pool.length; pIdx++) {
    const candidate = pool[pIdx];
    const isInjuredStarter =
      candidate.category === 'STARTER' && isInjuredUnavailable(candidate.injuryStatus);
    const baseScore = getPlayerOptimizerScore(candidate, respectPinnedStarters);

    // Precompute eligibility and slot edge weights for this candidate across slots 0..9
    const slotWeights = new Float64Array(10).fill(-Infinity);
    for (let s = 0; s < 10; s++) {
      if ((initialMask & (1 << s)) !== 0) continue;
      const slotType = MBA_STARTER_SLOTS[s];
      if (!isPlayerEligibleForStarterSlot(candidate.positions, slotType)) continue;

      // If an unpinned starter is Out/IR, only allow keeping them in their original slot with a penalty
      // so any healthy eligible Bench player (score >= 0) replaces them
      let weight = baseScore;
      if (isInjuredStarter) {
        weight = candidate.slotIndex === s ? -0.5 : -Infinity;
      } else {
        if (candidate.category === 'STARTER') {
          weight += 1e-4;
          if (candidate.slotIndex === s) {
            weight += 2e-5;
          }
          if (candidate.slotLabel === slotType) {
            weight += 5e-6;
          }
        }
        if (slotType !== 'UTIL') {
          weight += 1e-6 * Math.max(0, 4 - candidate.positions.length);
        }
      }
      slotWeights[s] = weight;
    }

    for (let mask = TOTAL_MASKS - 1; mask >= 0; mask--) {
      const currentVal = dp[mask];
      if (currentVal === -Infinity) continue;
      const currentAssign = assignments[mask]!;

      for (let s = 0; s < 10; s++) {
        if ((mask & (1 << s)) !== 0) continue;
        const w = slotWeights[s];
        if (w === -Infinity) continue;

        const nextMask = mask | (1 << s);
        const candVal = currentVal + w;
        if (candVal > dp[nextMask] + 1e-11) {
          dp[nextMask] = candVal;
          const nextAssign = new Int16Array(currentAssign);
          nextAssign[s] = pIdx;
          assignments[nextMask] = nextAssign;
        }
      }
    }
  }

  let bestMask = initialMask;
  let bestCount = popcount10(initialMask);
  let bestScore = dp[initialMask];

  if (dp[TOTAL_MASKS - 1] !== -Infinity) {
    bestMask = TOTAL_MASKS - 1;
  } else {
    for (let mask = 0; mask < TOTAL_MASKS; mask++) {
      if (dp[mask] === -Infinity) continue;
      const count = popcount10(mask);
      if (count > bestCount || (count === bestCount && dp[mask] > bestScore)) {
        bestCount = count;
        bestScore = dp[mask];
        bestMask = mask;
      }
    }
  }

  const winningAssign = assignments[bestMask] ?? initArr;
  const usedPlayerIds = new Set<string>(pinnedPlayerIds);
  for (let s = 0; s < 10; s++) {
    const pIdx = winningAssign[s];
    if (pIdx >= 0 && pool[pIdx]) {
      usedPlayerIds.add(pool[pIdx].playerId);
    }
  }

  const result: OptimizedStarterSlotAssignment[] = MBA_STARTER_SLOTS.map((slotLabel, idx) => {
    const pinned = pinnedSlotAssignment.get(idx);
    if (pinned) {
      return {
        ...pinned,
        slotIndex: idx,
        slotLabel,
        previousSlotLabel: pinned.slotLabel,
        previousSlotIndex: pinned.slotIndex,
        isMoved: false,
        optimizerEffectiveScore: getPlayerOptimizerScore(pinned, respectPinnedStarters),
      };
    }

    const pIdx = winningAssign[idx];
    if (pIdx >= 0 && pool[pIdx]) {
      const chosen = pool[pIdx];
      return {
        ...chosen,
        slotIndex: idx,
        slotLabel,
        previousSlotLabel: chosen.slotLabel,
        previousSlotIndex: chosen.slotIndex,
        isMoved: chosen.category !== 'STARTER' || chosen.slotIndex !== idx,
        optimizerEffectiveScore: getPlayerOptimizerScore(chosen, respectPinnedStarters),
      };
    }

    // Fallback to original starter if unfilled
    const fallback = starterSlots[idx];
    usedPlayerIds.add(fallback.playerId);
    return {
      ...fallback,
      slotIndex: idx,
      slotLabel,
      previousSlotLabel: fallback.slotLabel,
      previousSlotIndex: fallback.slotIndex,
      isMoved: false,
      optimizerEffectiveScore: getPlayerOptimizerScore(fallback, respectPinnedStarters),
    };
  });

  return result;
}

export function detectSwapAndLockAlerts(params: {
  starterSlots: RosterPlayerSlot[];
  benchSlots: RosterPlayerSlot[];
  actionableOptimalStarters: OptimizedStarterSlotAssignment[];
  actionableDeltaScore: number;
}): SwapAndLockAlert[] {
  const { starterSlots, benchSlots, actionableOptimalStarters, actionableDeltaScore } = params;
  const alerts: SwapAndLockAlert[] = [];

  for (const bench of benchSlots) {
    if (isInjuredUnavailable(bench.injuryStatus)) continue;
    const hasOpenWindowScore =
      bench.isLockInWindowOpen && !bench.isLocked && bench.latestCompletedGamePoints !== null;
    if (!hasOpenWindowScore) continue;

    const lockableScore = bench.latestCompletedGamePoints!;
    const latestGame = bench.lockIn.lockableLatestGame ?? bench.completedGames.at(-1) ?? null;

    // Find all eligible non-pinned Starter Slots whose effective score is strictly less than lockableScore
    const eligibleTargets = starterSlots
      .map((starter, idx) => ({
        starter,
        idx,
        effectiveScore: getPlayerOptimizerScore(starter, true),
      }))
      .filter(({ starter, effectiveScore }) => {
        if (starter.isPinnedStarter) return false;
        if (!isPlayerEligibleForStarterSlot(bench.positions, starter.slotLabel as StarterSlotType)) {
          return false;
        }
        return lockableScore > effectiveScore + 0.005;
      })
      .sort((a, b) => {
        if (Math.abs(a.effectiveScore - b.effectiveScore) > 0.005) {
          return a.effectiveScore - b.effectiveScore;
        }
        return a.idx - b.idx;
      });

    if (eligibleTargets.length > 0) {
      const bestDirect = eligibleTargets[0];
      const deltaPoints = Math.round((lockableScore - bestDirect.effectiveScore) * 100) / 100;
      const isInOptimal = actionableOptimalStarters.some((s) => s.playerId === bench.playerId);
      const netLineupDeltaPoints =
        isInOptimal && actionableDeltaScore > deltaPoints ? actionableDeltaScore : deltaPoints;

      alerts.push({
        id: `swap-lock-alert-${bench.playerId}`,
        benchPlayerId: bench.playerId,
        benchPlayerName: bench.fullName,
        benchPlayerPositions: bench.positions,
        benchPlayerTeam: bench.nbaTeam,
        lockableScore,
        latestCompletedGamePoints: lockableScore,
        gameOpponent: latestGame?.opponent ?? null,
        gameDate: latestGame?.date ?? null,
        targetSlotIndex: bestDirect.idx,
        targetSlotLabel: bestDirect.starter.slotLabel as StarterSlotType,
        displacedPlayerId: bestDirect.starter.playerId,
        displacedPlayerName: bestDirect.starter.fullName,
        displacedEffectiveScore: bestDirect.effectiveScore,
        deltaPoints,
        netLineupDeltaPoints,
        headline: `SWAP & LOCK ALERT: ${bench.fullName} (${lockableScore.toFixed(1)} FP in open Lock-In Window)`,
        detail: `Swap ${bench.fullName} (${bench.positions.join('/')}) from BN into ${bestDirect.starter.slotLabel} for ${bestDirect.starter.fullName} (${bestDirect.effectiveScore.toFixed(1)} eff FP) and lock ${lockableScore.toFixed(1)} FP${latestGame ? ` vs ${latestGame.opponent}` : ''} (+${deltaPoints.toFixed(1)} FP direct${netLineupDeltaPoints > deltaPoints ? `, +${netLineupDeltaPoints.toFixed(1)} FP with positional slide` : ''}).`,
      });
    }
  }

  return alerts.sort((a, b) => b.deltaPoints - a.deltaPoints);
}

export function detectRosterEligibilityWarnings(params: {
  starterSlots: RosterPlayerSlot[];
  reserveSlots: RosterPlayerSlot[];
  maxReserveSlots?: number;
}): RosterEligibilityWarning[] {
  const { starterSlots, reserveSlots, maxReserveSlots = 3 } = params;
  const warnings: RosterEligibilityWarning[] = [];
  const hasOpenIrSlot = reserveSlots.length < maxReserveSlots;

  for (const starter of starterSlots) {
    if (isInjuredUnavailable(starter.injuryStatus)) {
      const statusText = starter.injuryStatus ?? 'Out';
      const irNote = hasOpenIrSlot
        ? `An open Reserve (IR) slot is available (${reserveSlots.length}/${maxReserveSlots} used) — move ${starter.fullName} to IR and promote a healthy Bench player.`
        : `All Reserve (IR) slots are full — swap ${starter.fullName} to Bench (BN) for a healthy eligible player.`;

      warnings.push({
        id: `warn-injured-starter-${starter.playerId}`,
        type: 'INJURED_STARTER',
        severity: starter.isPinnedStarter ? 'WARNING' : 'ERROR',
        playerId: starter.playerId,
        playerName: starter.fullName,
        slotLabel: starter.slotLabel,
        injuryStatus: starter.injuryStatus,
        hasOpenIrSlot,
        message: `Active starter ${starter.fullName} (${starter.slotLabel}) is marked ${statusText}. ${irNote}`,
        recommendedAction: hasOpenIrSlot
          ? `Move ${starter.fullName} from ${starter.slotLabel} to IR`
          : `Move ${starter.fullName} from ${starter.slotLabel} to BN`,
      });
    }
  }

  for (const reserve of reserveSlots) {
    if (reserve.injuryStatus === null) {
      warnings.push({
        id: `warn-healthy-ir-${reserve.playerId}`,
        type: 'HEALTHY_ON_IR',
        severity: 'WARNING',
        playerId: reserve.playerId,
        playerName: reserve.fullName,
        slotLabel: 'IR',
        injuryStatus: null,
        hasOpenIrSlot,
        message: `Healthy player ${reserve.fullName} (no injury designation) is occupying a Reserve (IR) slot. Sleeper requires activating healthy IR players before making lineup claims.`,
        recommendedAction: `Activate ${reserve.fullName} from IR to BN`,
      });
    }
  }

  return warnings;
}

export function evaluateRosterLineupOptimization(params: {
  roster: Pick<
    HydratedRoster,
    'rosterId' | 'starterSlots' | 'benchSlots' | 'reserveSlots' | 'taxiSlots'
  >;
  leagueId?: string;
  week?: number;
  maxReserveSlots?: number;
  mutationAdapter: LineupMutationAdapter;
}): RosterLineupOptimization {
  const {
    roster,
    leagueId = MBA_LEAGUE_ID_2026,
    week = 5,
    maxReserveSlots = 3,
    mutationAdapter,
  } = params;

  const currentStarters: OptimizedStarterSlotAssignment[] = roster.starterSlots.map((slot, idx) => ({
    ...slot,
    slotIndex: idx,
    slotLabel: slot.slotLabel as StarterSlotType,
    previousSlotLabel: slot.slotLabel,
    previousSlotIndex: idx,
    isMoved: false,
    optimizerEffectiveScore: getPlayerOptimizerScore(slot, true),
  }));

  const currentTotalScore =
    Math.round(
      currentStarters.reduce((sum, s) => sum + s.optimizerEffectiveScore, 0) * 100
    ) / 100;

  const actionableOptimalStarters = solveOptimalTenStarters({
    starterSlots: roster.starterSlots,
    benchSlots: roster.benchSlots,
    respectPinnedStarters: true,
  });

  const actionableTotalScore =
    Math.round(
      actionableOptimalStarters.reduce((sum, s) => sum + s.optimizerEffectiveScore, 0) * 100
    ) / 100;

  const actionableDeltaScore =
    Math.round((actionableTotalScore - currentTotalScore) * 100) / 100;

  const hypotheticalOptimalStarters = solveOptimalTenStarters({
    starterSlots: roster.starterSlots,
    benchSlots: roster.benchSlots,
    respectPinnedStarters: false,
  });

  const hypotheticalTotalScore =
    Math.round(
      hypotheticalOptimalStarters.reduce((sum, s) => sum + s.optimizerEffectiveScore, 0) * 100
    ) / 100;

  const hypotheticalDeltaScore =
    Math.round((hypotheticalTotalScore - currentTotalScore) * 100) / 100;

  // Build ordered recommended swaps to transition from currentStarters to actionableOptimalStarters
  const recommendedSwaps: StagedSlotSwap[] = [];
  const optimalPlayerIds = new Set(actionableOptimalStarters.map((s) => s.playerId));

  for (let idx = 0; idx < 10; idx++) {
    const currentSlot = currentStarters[idx];
    const optimalSlot = actionableOptimalStarters[idx];
    if (currentSlot.playerId === optimalSlot.playerId) continue;

    const delta =
      Math.round((optimalSlot.optimizerEffectiveScore - currentSlot.optimizerEffectiveScore) * 100) /
      100;
    const isOutgoingDemotedToBench = !optimalPlayerIds.has(currentSlot.playerId);
    const isIncomingFromBench = optimalSlot.previousSlotLabel === 'BN';

    let reason = `${optimalSlot.optimizerEffectiveScore.toFixed(1)} eff FP vs ${currentSlot.optimizerEffectiveScore.toFixed(1)} eff FP`;
    if (isInjuredUnavailable(currentSlot.injuryStatus)) {
      reason = `Replaces injured (${currentSlot.injuryStatus}) starter ${currentSlot.fullName} (+${optimalSlot.optimizerEffectiveScore.toFixed(1)} eff FP)`;
    } else if (
      isIncomingFromBench &&
      optimalSlot.isLockInWindowOpen &&
      optimalSlot.latestCompletedGamePoints !== null
    ) {
      reason = `Swap & Lock ${optimalSlot.latestCompletedGamePoints.toFixed(1)} FP open Lock-In Window score`;
    } else if (!isIncomingFromBench && isOutgoingDemotedToBench) {
      reason = `Positional slide into ${optimalSlot.slotLabel} (sends ${currentSlot.fullName} to BN)`;
    } else if (delta > 0) {
      reason = `+${delta.toFixed(1)} eff FP slot upgrade`;
    }

    recommendedSwaps.push({
      fromSlot: optimalSlot.previousSlotLabel,
      toSlot: optimalSlot.slotLabel,
      playerInId: optimalSlot.playerId,
      playerInName: optimalSlot.fullName,
      playerOutId: currentSlot.playerId,
      playerOutName: currentSlot.fullName,
      deltaPoints: delta,
      reason,
    });
  }

  // Order starter-to-starter slides before bench-to-starter promotions so the human Manager can see the chain cleanly
  recommendedSwaps.sort((a, b) => {
    const aFromBench = a.fromSlot === 'BN' ? 1 : 0;
    const bFromBench = b.fromSlot === 'BN' ? 1 : 0;
    return aFromBench - bFromBench;
  });

  const swapAndLockAlerts = detectSwapAndLockAlerts({
    starterSlots: roster.starterSlots,
    benchSlots: roster.benchSlots,
    actionableOptimalStarters,
    actionableDeltaScore,
  });

  const eligibilityWarnings = detectRosterEligibilityWarnings({
    starterSlots: roster.starterSlots,
    reserveSlots: roster.reserveSlots,
    maxReserveSlots,
  });

  // Build recommended Lock-In actions for players in the actionable optimal starting 10
  const recommendedLockActions: StagedLockAction[] = [];
  for (const slot of actionableOptimalStarters) {
    if (slot.lockIn.lockSource === 'INFERRED_SLEEPER' || slot.lockIn.lockSource === 'FINAL_GAME_AUTO') {
      continue;
    }
    const latestGame = slot.lockIn.lockableLatestGame ?? slot.completedGames.at(-1) ?? null;
    if (!latestGame) continue;

    const isPromotedBenchLock =
      slot.previousSlotLabel === 'BN' &&
      slot.isLockInWindowOpen &&
      latestGame.mbaPoints >= slot.lockInThreshold;
    const isRecommendedStarterLock =
      slot.isLockInWindowOpen &&
      (slot.recommendation === 'SMASH LOCK' ||
        slot.recommendation === 'LEAN LOCK' ||
        slot.lockIn.lockSource === 'MANUAL_OVERRIDE');

    if (isPromotedBenchLock || isRecommendedStarterLock) {
      recommendedLockActions.push({
        playerId: slot.playerId,
        playerName: slot.fullName,
        gameScore: latestGame.mbaPoints,
        opponent: latestGame.opponent,
        date: latestGame.date,
        recommendation: isPromotedBenchLock
          ? `SWAP & LOCK (${slot.recommendation})`
          : slot.recommendation === 'LOCKED'
            ? 'MANUAL LOCK — Sync in Sleeper'
            : slot.recommendation,
      });
    }
  }

  // Build IR moves from eligibility warnings
  const irMoves: StagedSlotSwap[] = eligibilityWarnings.map((w) => {
    if (w.type === 'INJURED_STARTER') {
      return {
        fromSlot: w.slotLabel,
        toSlot: w.hasOpenIrSlot ? 'IR' : 'BN',
        playerInId: w.playerId,
        playerInName: w.playerName,
        reason: `Starter marked ${w.injuryStatus ?? 'Out'} — ${w.hasOpenIrSlot ? 'place in open Reserve (IR) slot' : 'move to Bench'}`,
      };
    }
    return {
      fromSlot: 'IR',
      toSlot: 'BN',
      playerInId: w.playerId,
      playerInName: w.playerName,
      reason: 'Healthy player on Reserve (IR) — activate to Bench',
    };
  });

  const stagedChecklist = mutationAdapter.stageLineupChanges({
    leagueId,
    rosterId: roster.rosterId,
    week,
    slotSwaps: recommendedSwaps,
    lockActions: recommendedLockActions,
    irMoves,
  });

  return {
    rosterId: roster.rosterId,
    week,
    currentStarters,
    currentTotalScore,
    actionableOptimalStarters,
    actionableTotalScore,
    actionableDeltaScore,
    hypotheticalOptimalStarters,
    hypotheticalTotalScore,
    hypotheticalDeltaScore,
    recommendedSwaps,
    recommendedLockActions,
    swapAndLockAlerts,
    eligibilityWarnings,
    warnings: eligibilityWarnings,
    stagedChecklist,
  };
}
