import {
  DraftPickAsset,
  DraftPickMatrix,
  DraftPickMatrixRow,
  DraftPickSeason,
  HydratedRoster,
  MBA_DRAFT_PICK_SEASONS,
  ManagerStateStore,
  PlayerDynastyValuation,
  PlayerDynastyValuationInput,
  ProjectedPickTier,
  RosterArchetype,
  RosterPowerRanking,
  SleeperTradedPick,
} from '../types/mba';

/**
 * Dynasty Age Curve multiplier:
 * - Peaks at 1.22x for ages 21–24 (1.20x for ages <= 20)
 * - 1.10x at age 25
 * - 1.00x at ages 26–27
 * - 0.92x at age 28
 * - Tapers from 0.85x to 0.65x at ages 29+
 */
export function getDynastyAgeMultiplier(age: number | null | undefined): number {
  if (age === null || age === undefined) return 1.0;
  if (age <= 20) return 1.2;
  if (age >= 21 && age <= 24) return 1.22;
  if (age === 25) return 1.1;
  if (age === 26 || age === 27) return 1.0;
  if (age === 28) return 0.92;
  if (age === 29) return 0.85;
  if (age === 30) return 0.78;
  if (age === 31) return 0.72;
  return 0.65;
}

/**
 * Positional Scarcity Multiplier:
 * - 1.12x boost for Center (C) eligible players reflecting the two required C Starter Slots.
 */
export function getCenterScarcityMultiplier(positions: readonly string[]): number {
  return positions.includes('C') ? 1.12 : 1.0;
}

/**
 * Evaluates a player's 0–100 MBA Dynasty Value combining custom-scored MBA FP/G
 * (blending actual + projected FP/G), the Dynasty Age Curve, and the 2-Center scarcity boost.
 */
export function computePlayerDynastyValue(
  input: PlayerDynastyValuationInput
): PlayerDynastyValuation {
  const gamesPlayed = input.gamesPlayed ?? 1;
  const hasProjected =
    typeof input.projectedFpg === 'number' &&
    !Number.isNaN(input.projectedFpg) &&
    input.projectedFpg > 0;

  let blendedFpg: number;
  if (gamesPlayed > 0 && hasProjected) {
    blendedFpg =
      Math.round((0.75 * input.actualFpg + 0.25 * (input.projectedFpg as number)) * 100) / 100;
  } else if (gamesPlayed > 0) {
    blendedFpg = input.actualFpg;
  } else if (hasProjected) {
    blendedFpg = input.projectedFpg as number;
  } else {
    blendedFpg = input.actualFpg;
  }

  const ageMultiplier = getDynastyAgeMultiplier(input.age);
  const scarcityMultiplier = getCenterScarcityMultiplier(input.positions);
  const rawScore = blendedFpg * ageMultiplier * scarcityMultiplier * 2.0;
  const dynastyValue = Math.min(100, Math.max(0, Math.round(rawScore * 10) / 10));

  return {
    blendedFpg,
    ageMultiplier,
    scarcityMultiplier,
    dynastyValue,
  };
}

/**
 * Maps a 1..10 draft slot to its Projected Pick Tier (Early 1–3, Mid 4–6, Late 7–10).
 */
export function getProjectedPickTierFromSlot(slot: number): ProjectedPickTier {
  if (slot <= 3) return 'Early';
  if (slot <= 6) return 'Mid';
  return 'Late';
}

const ROUND_1_SLOT_BASE_VALUES: Record<number, number> = {
  1: 68,
  2: 63,
  3: 58,
  4: 50,
  5: 46,
  6: 42,
  7: 36,
  8: 33,
  9: 30,
  10: 28,
};

const ROUND_2_SLOT_BASE_VALUES: Record<number, number> = {
  1: 24,
  2: 22,
  3: 20,
  4: 17,
  5: 15,
  6: 13,
  7: 11,
  8: 10,
  9: 8,
  10: 7,
};

const TIER_ANCHOR_VALUES: Record<1 | 2, Record<ProjectedPickTier, number>> = {
  1: {
    Early: 63,
    Mid: 46,
    Late: 32,
  },
  2: {
    Early: 22,
    Mid: 15,
    Late: 9,
  },
};

const SEASON_DISCOUNT: Record<DraftPickSeason, number> = {
  '2026': 1.0,
  '2027': 0.96,
  '2028': 0.92,
  '2029': 0.88,
};

/**
 * Computes the 0–100 Dynasty Value of a Draft Pick Asset given its season, round,
 * Projected Pick Tier, projected slot (1..10), and whether a manual tier override is active.
 */
export function computeDraftPickDynastyValue(params: {
  season: DraftPickSeason;
  round: 1 | 2;
  projectedTier: ProjectedPickTier;
  projectedSlot: number;
  hasManualTierOverride?: boolean;
}): number {
  const { season, round, projectedTier, projectedSlot, hasManualTierOverride } = params;
  const clampedSlot = Math.min(10, Math.max(1, projectedSlot));
  const discount = SEASON_DISCOUNT[season] ?? 0.9;

  if (hasManualTierOverride) {
    const manualBase = TIER_ANCHOR_VALUES[round][projectedTier];
    return Math.round(manualBase * discount * 10) / 10;
  }

  const slotTable = round === 1 ? ROUND_1_SLOT_BASE_VALUES : ROUND_2_SLOT_BASE_VALUES;
  const slotValue = slotTable[clampedSlot] ?? TIER_ANCHOR_VALUES[round][projectedTier];
  const midAnchorValue = TIER_ANCHOR_VALUES[round].Mid;

  const isDistant = season === '2028' || season === '2029';
  const regressedValue = isDistant ? 0.5 * slotValue + 0.5 * midAnchorValue : slotValue;

  return Math.round(regressedValue * discount * 10) / 10;
}

/**
 * Computes the Under-25 Young Core Dynasty Value for a Roster (sum of Dynasty Value for players age < 25).
 */
export function computeRosterYoungCoreValue(roster: HydratedRoster): number {
  const sum = roster.allPlayers
    .filter((p) => p.age !== null && p.age < 25)
    .reduce((acc, p) => acc + p.dynastyValue, 0);
  return Math.round(sum * 10) / 10;
}

/**
 * Resolves all 80 Draft Pick Assets (10 Rosters × 4 seasons 2026–2029 × 2 rounds)
 * from /traded_picks and calculates Projected Pick Tiers and Dynasty Values.
 */
export function resolveDraftPickMatrix(params: {
  rosters: HydratedRoster[];
  tradedPicks: SleeperTradedPick[];
  stateStore?: ManagerStateStore;
}): DraftPickMatrix {
  const { rosters, tradedPicks, stateStore } = params;
  const rosterById = new Map<number, HydratedRoster>(rosters.map((r) => [r.rosterId, r]));

  // 1. Inverse Max Points For (ppts) slot order (1..10) for near-term 2026–2027 picks:
  // Lowest ppts => Slot 1 (Early), with fpts ascending, wins ascending, rosterId ascending tiebreakers
  const sortedByInversePpts = [...rosters].sort((a, b) => {
    if (a.standing.ppts !== b.standing.ppts) return a.standing.ppts - b.standing.ppts;
    if (a.standing.fpts !== b.standing.fpts) return a.standing.fpts - b.standing.fpts;
    if (a.standing.wins !== b.standing.wins) return a.standing.wins - b.standing.wins;
    return a.rosterId - b.rosterId;
  });

  const nearTermSlotByRosterId = new Map<number, number>();
  sortedByInversePpts.forEach((r, idx) => {
    nearTermSlotByRosterId.set(r.rosterId, idx + 1);
  });

  // 2. Inverse Under-25 Young Core slot order (1..10) for 2028–2029 regression:
  // Lowest youngCoreValue => Slot 1 (weakest future core -> earliest future pick)
  const youngCoreByRosterId = new Map<number, number>();
  for (const r of rosters) {
    youngCoreByRosterId.set(r.rosterId, computeRosterYoungCoreValue(r));
  }

  const sortedByInverseYoungCore = [...rosters].sort((a, b) => {
    const ycA = youngCoreByRosterId.get(a.rosterId) ?? 0;
    const ycB = youngCoreByRosterId.get(b.rosterId) ?? 0;
    if (ycA !== ycB) return ycA - ycB;
    if (a.standing.ppts !== b.standing.ppts) return a.standing.ppts - b.standing.ppts;
    return a.rosterId - b.rosterId;
  });

  const youngCoreSlotByRosterId = new Map<number, number>();
  sortedByInverseYoungCore.forEach((r, idx) => {
    youngCoreSlotByRosterId.set(r.rosterId, idx + 1);
  });

  // Index traded picks by `${season}:${round}:${originalRosterId}`
  const tradedOwnerMap = new Map<string, number>();
  for (const tp of tradedPicks) {
    const key = `${tp.season}:${tp.round}:${tp.roster_id}`;
    tradedOwnerMap.set(key, tp.owner_id);
  }

  const allPicks: DraftPickAsset[] = [];
  const sortedRosterIds = [...rosters].map((r) => r.rosterId).sort((a, b) => a - b);

  for (const season of MBA_DRAFT_PICK_SEASONS) {
    for (const round of [1, 2] as const) {
      for (const originalRosterId of sortedRosterIds) {
        const originalRoster = rosterById.get(originalRosterId)!;
        const tradedKey = `${season}:${round}:${originalRosterId}`;
        const currentOwnerRosterId = tradedOwnerMap.get(tradedKey) ?? originalRosterId;
        const ownerRoster = rosterById.get(currentOwnerRosterId) ?? originalRoster;

        const nearTermSlot = nearTermSlotByRosterId.get(originalRosterId) ?? 5;
        const youngCoreSlot = youngCoreSlotByRosterId.get(originalRosterId) ?? 5;

        const isNearTerm = season === '2026' || season === '2027';
        const projectedSlot = isNearTerm
          ? nearTermSlot
          : Math.min(
              10,
              Math.max(
                1,
                Math.round(0.5 * 5.0 + 0.5 * (0.35 * nearTermSlot + 0.65 * youngCoreSlot))
              )
            );

        const id = `${season}-r${round}-orig-${originalRosterId}`;
        const manualOverride = stateStore?.getPickTierOverride(id) ?? null;
        const projectedTier = manualOverride ?? getProjectedPickTierFromSlot(projectedSlot);
        const hasManualTierOverride = manualOverride !== null;

        const dynastyValue = computeDraftPickDynastyValue({
          season,
          round,
          projectedTier,
          projectedSlot,
          hasManualTierOverride,
        });

        const isTraded = currentOwnerRosterId !== originalRosterId;
        const roundOrdinal = round === 1 ? '1st' : '2nd';
        const viaAnnotation = isTraded
          ? `via Roster #${originalRosterId} (${originalRoster.manager.rosterName})`
          : null;
        const displayLabel = isTraded
          ? `${season} ${roundOrdinal} via Roster #${originalRosterId}`
          : `${season} ${roundOrdinal}`;

        allPicks.push({
          id,
          season,
          round,
          originalRosterId,
          originalRosterName: originalRoster.manager.rosterName,
          currentOwnerRosterId,
          currentOwnerRosterName: ownerRoster.manager.rosterName,
          isTraded,
          viaAnnotation,
          displayLabel,
          projectedSlot,
          projectedTier,
          hasManualTierOverride,
          dynastyValue,
        });
      }
    }
  }

  const byOwnerRosterId: Record<number, Record<DraftPickSeason, DraftPickAsset[]>> = {};
  for (const rId of sortedRosterIds) {
    byOwnerRosterId[rId] = {
      '2026': [],
      '2027': [],
      '2028': [],
      '2029': [],
    };
  }

  for (const pick of allPicks) {
    if (!byOwnerRosterId[pick.currentOwnerRosterId]) {
      byOwnerRosterId[pick.currentOwnerRosterId] = {
        '2026': [],
        '2027': [],
        '2028': [],
        '2029': [],
      };
    }
    byOwnerRosterId[pick.currentOwnerRosterId][pick.season].push(pick);
  }

  // Sort picks within each cell by round ascending, then projectedSlot ascending
  for (const rId of sortedRosterIds) {
    for (const season of MBA_DRAFT_PICK_SEASONS) {
      byOwnerRosterId[rId][season].sort((a, b) =>
        a.round !== b.round ? a.round - b.round : a.projectedSlot - b.projectedSlot
      );
    }
  }

  const rows: DraftPickMatrixRow[] = sortedRosterIds.map((rId) => {
    const roster = rosterById.get(rId)!;
    const picksBySeason = byOwnerRosterId[rId];
    const allOwnedPicks = MBA_DRAFT_PICK_SEASONS.flatMap((s) => picksBySeason[s]);
    const totalPickCapital =
      Math.round(allOwnedPicks.reduce((sum, p) => sum + p.dynastyValue, 0) * 10) / 10;
    const firstRoundCount = allOwnedPicks.filter((p) => p.round === 1).length;
    const secondRoundCount = allOwnedPicks.filter((p) => p.round === 2).length;

    return {
      rosterId: rId,
      rosterName: roster.manager.rosterName,
      managerDisplayName: roster.manager.displayName,
      totalPickCapital,
      firstRoundCount,
      secondRoundCount,
      picksBySeason,
      allOwnedPicks,
    };
  });

  return {
    seasons: MBA_DRAFT_PICK_SEASONS,
    allPicks,
    byOwnerRosterId,
    rows,
  };
}

/**
 * Evaluates all 10 MBA Rosters across Overall Dynasty Power, Contender Score (Starting 10 MBA FP/G),
 * Dynasty Core Score (Top 10 players' Dynasty Value), Young Core Value (Under-25 Dynasty Value),
 * and Draft Pick Capital (2026–2029 Draft Pick Asset sum), assigning each Roster an Archetype tag.
 */
export function computeLeaguePowerRankings(params: {
  rosters: HydratedRoster[];
  pickMatrix: DraftPickMatrix;
}): RosterPowerRanking[] {
  const { rosters, pickMatrix } = params;
  const pickRowByRosterId = new Map(pickMatrix.rows.map((r) => [r.rosterId, r]));

  const rawMetrics = rosters.map((roster) => {
    const contenderScore = roster.starterTotalFpg;
    const sortedByDynasty = [...roster.allPlayers].sort((a, b) => b.dynastyValue - a.dynastyValue);
    const top10DynastySum = sortedByDynasty
      .slice(0, 10)
      .reduce((sum, p) => sum + p.dynastyValue, 0);
    const dynastyCoreScore = Math.round(top10DynastySum * 10) / 10;

    const under25Players = roster.allPlayers.filter((p) => p.age !== null && p.age < 25);
    const youngCoreValue = computeRosterYoungCoreValue(roster);

    const pickRow = pickRowByRosterId.get(roster.rosterId);
    const draftPickCapital = pickRow?.totalPickCapital ?? 0;
    const ownedFirstRoundPicksCount = pickRow?.firstRoundCount ?? 0;
    const ownedSecondRoundPicksCount = pickRow?.secondRoundCount ?? 0;

    // Normalize components onto a 0–100 Overall Dynasty Power scale:
    // - Contender component (0–40 pts): starterTotalFpg / 350 * 40
    // - Dynasty Core & Young Core component (0–40 pts): (dynastyCoreScore / 750 * 25) + (youngCoreValue / 600 * 15)
    // - Draft Pick Capital component (0–20 pts): draftPickCapital / 350 * 20
    const contenderComp = Math.min(40, (contenderScore / 340) * 40);
    const coreComp =
      Math.min(25, (dynastyCoreScore / 720) * 25) + Math.min(15, (youngCoreValue / 550) * 15);
    const pickComp = Math.min(20, (draftPickCapital / 340) * 20);
    const overallDynastyPower =
      Math.round(Math.min(100, contenderComp + coreComp + pickComp) * 10) / 10;

    return {
      rosterId: roster.rosterId,
      rosterName: roster.manager.rosterName,
      managerDisplayName: roster.manager.displayName,
      wins: roster.standing.wins,
      losses: roster.standing.losses,
      ppts: roster.standing.ppts,
      fpts: roster.standing.fpts,
      overallDynastyPower,
      contenderScore,
      dynastyCoreScore,
      youngCoreValue,
      under25PlayerCount: under25Players.length,
      draftPickCapital,
      ownedFirstRoundPicksCount,
      ownedSecondRoundPicksCount,
    };
  });

  // Compute component ranks (1..10, descending)
  const byContender = [...rawMetrics].sort(
    (a, b) => b.contenderScore - a.contenderScore || b.ppts - a.ppts || a.rosterId - b.rosterId
  );
  const contenderRankMap = new Map(byContender.map((m, idx) => [m.rosterId, idx + 1]));

  const byDynastyCore = [...rawMetrics].sort(
    (a, b) =>
      b.dynastyCoreScore - a.dynastyCoreScore ||
      b.youngCoreValue - a.youngCoreValue ||
      a.rosterId - b.rosterId
  );
  const dynastyCoreRankMap = new Map(byDynastyCore.map((m, idx) => [m.rosterId, idx + 1]));

  const byYoungCore = [...rawMetrics].sort(
    (a, b) => b.youngCoreValue - a.youngCoreValue || b.ppts - a.ppts || a.rosterId - b.rosterId
  );
  const youngCoreRankMap = new Map(byYoungCore.map((m, idx) => [m.rosterId, idx + 1]));

  const byDraftPick = [...rawMetrics].sort(
    (a, b) =>
      b.draftPickCapital - a.draftPickCapital ||
      b.ownedFirstRoundPicksCount - a.ownedFirstRoundPicksCount ||
      a.rosterId - b.rosterId
  );
  const draftPickRankMap = new Map(byDraftPick.map((m, idx) => [m.rosterId, idx + 1]));

  const byOverall = [...rawMetrics].sort(
    (a, b) =>
      b.overallDynastyPower - a.overallDynastyPower ||
      b.contenderScore - a.contenderScore ||
      a.rosterId - b.rosterId
  );

  return byOverall.map((m, idx) => {
    const contenderRank = contenderRankMap.get(m.rosterId) ?? 5;
    const dynastyCoreRank = dynastyCoreRankMap.get(m.rosterId) ?? 5;
    const youngCoreRank = youngCoreRankMap.get(m.rosterId) ?? 5;
    const draftPickRank = draftPickRankMap.get(m.rosterId) ?? 5;

    let archetype: RosterArchetype;
    if (contenderRank <= 4 && youngCoreRank <= 3) {
      archetype = 'Young Juggernaut';
    } else if (contenderRank <= 4 || m.wins >= 3) {
      archetype = 'Title Favorite';
    } else if (draftPickRank <= 4 || m.ownedFirstRoundPicksCount >= 5 || contenderRank >= 8) {
      archetype = 'Asset-Rich Rebuilder';
    } else {
      archetype = 'Reloading';
    }

    return {
      ...m,
      overallRank: idx + 1,
      contenderRank,
      dynastyCoreRank,
      youngCoreRank,
      draftPickRank,
      archetype,
    };
  });
}
