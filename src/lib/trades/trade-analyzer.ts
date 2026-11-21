import { isPlayerEligibleForStarterSlot } from '@/lib/lineup/slot-optimizer';
import { computeDraftPickDynastyValue, resolveDraftPickMatrix } from './dynasty-valuation';
import {
  DraftPickAsset,
  EvaluatedTradePickAsset,
  EvaluatedTradePlayerAsset,
  HydratedRoster,
  MBA_STARTER_SLOTS,
  ManagerStateStore,
  MbaLeagueSnapshot,
  OptimalStarterAssignmentSlot,
  ProjectedPickTier,
  ReplacementCutAsset,
  RosterPlayerSlot,
  StarterSlotType,
  TradeEvaluationResult,
  TradeFairnessLabel,
  TradeLetterGrade,
  TradeParticipantEvaluation,
  TradeProposal,
} from '../types/mba';

/**
 * Solves the exact maximum-weight 10-starter lineup across ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'C', 'UTIL', 'UTIL']
 * maximizing Average Lock-In Score (with MBA FP/G and Dynasty Value tiebreakers).
 */
export function solveOptimalStarting10Lineup(players: RosterPlayerSlot[]): {
  totalAvgLockIn: number;
  totalFpg: number;
  starters: OptimalStarterAssignmentSlot[];
} {
  // Deduplicate players by playerId and sort descending by Average Lock-In Score, then FP/G, then Dynasty Value
  const uniqueMap = new Map<string, RosterPlayerSlot>();
  for (const p of players) {
    if (!p.playerId || p.playerId === '0') continue;
    if (!uniqueMap.has(p.playerId)) {
      uniqueMap.set(p.playerId, p);
    }
  }
  const pool = [...uniqueMap.values()].sort(
    (a, b) =>
      b.seasonMetrics.averageLockInPoints - a.seasonMetrics.averageLockInPoints ||
      b.seasonMetrics.mbaFantasyPointsPerGame - a.seasonMetrics.mbaFantasyPointsPerGame ||
      b.dynastyValue - a.dynastyValue
  );

  // Order the 10 starter slots from most constrained (C, C, PG, SG, SF, PF, G, F) to least constrained (UTIL, UTIL)
  const slotSearchOrder: Array<{ slotIndex: number; slotType: StarterSlotType }> = [
    { slotIndex: 6, slotType: 'C' },
    { slotIndex: 7, slotType: 'C' },
    { slotIndex: 0, slotType: 'PG' },
    { slotIndex: 1, slotType: 'SG' },
    { slotIndex: 3, slotType: 'SF' },
    { slotIndex: 4, slotType: 'PF' },
    { slotIndex: 2, slotType: 'G' },
    { slotIndex: 5, slotType: 'F' },
    { slotIndex: 8, slotType: 'UTIL' },
    { slotIndex: 9, slotType: 'UTIL' },
  ];

  // Precompute eligible player indices in pool for each slot in search order
  const eligibleIndicesByStep: number[][] = slotSearchOrder.map(({ slotType }) => {
    const indices: number[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (isPlayerEligibleForStarterSlot(pool[i].positions, slotType)) {
        indices.push(i);
      }
    }
    return indices;
  });

  const used = new Array<boolean>(pool.length).fill(false);
  const currentAssignment = new Array<number>(slotSearchOrder.length).fill(-1);
  let bestScore = -Infinity;
  let bestAssignment = new Array<number>(slotSearchOrder.length).fill(-1);

  function computeUpperBound(step: number, currentSum: number): number {
    const remainingSlots = slotSearchOrder.length - step;
    if (remainingSlots <= 0) return currentSum;
    let added = 0;
    let bound = currentSum;
    for (let i = 0; i < pool.length && added < remainingSlots; i++) {
      if (!used[i]) {
        bound += Math.max(0, pool[i].seasonMetrics.averageLockInPoints);
        added++;
      }
    }
    return bound;
  }

  function dfs(step: number, currentSum: number): void {
    if (step === slotSearchOrder.length) {
      if (currentSum > bestScore) {
        bestScore = currentSum;
        bestAssignment = [...currentAssignment];
      }
      return;
    }

    if (computeUpperBound(step, currentSum) <= bestScore + 1e-6) {
      return;
    }

    const candidates = eligibleIndicesByStep[step];
    let triedAny = false;
    for (const pIdx of candidates) {
      if (used[pIdx]) continue;
      triedAny = true;
      used[pIdx] = true;
      currentAssignment[step] = pIdx;
      dfs(step + 1, currentSum + pool[pIdx].seasonMetrics.averageLockInPoints);
      used[pIdx] = false;
      currentAssignment[step] = -1;
    }

    // In case a slot has no eligible unused candidate (e.g. depleted position), allow leaving slot empty
    if (!triedAny) {
      currentAssignment[step] = -1;
      dfs(step + 1, currentSum);
    }
  }

  dfs(0, 0);

  // Map back into canonical MBA_STARTER_SLOTS order (indices 0..9)
  const byOriginalSlot = new Map<number, OptimalStarterAssignmentSlot>();
  for (let step = 0; step < slotSearchOrder.length; step++) {
    const { slotIndex, slotType } = slotSearchOrder[step];
    const pIdx = bestAssignment[step];
    if (pIdx >= 0 && pool[pIdx]) {
      const p = pool[pIdx];
      byOriginalSlot.set(slotIndex, {
        slotIndex,
        slotLabel: slotType,
        playerId: p.playerId,
        fullName: p.fullName,
        positions: p.positions,
        fpg: p.seasonMetrics.mbaFantasyPointsPerGame,
        avgLockIn: p.seasonMetrics.averageLockInPoints,
      });
    } else {
      byOriginalSlot.set(slotIndex, {
        slotIndex,
        slotLabel: slotType,
        playerId: '0',
        fullName: 'Empty Slot',
        positions: [slotType],
        fpg: 0,
        avgLockIn: 0,
      });
    }
  }

  const starters: OptimalStarterAssignmentSlot[] = MBA_STARTER_SLOTS.map((_, idx) => byOriginalSlot.get(idx)!);
  const totalAvgLockIn =
    Math.round(starters.reduce((sum, s) => sum + s.avgLockIn, 0) * 10) / 10;
  const totalFpg =
    Math.round(starters.reduce((sum, s) => sum + s.fpg, 0) * 10) / 10;

  return {
    totalAvgLockIn,
    totalFpg,
    starters,
  };
}

/**
 * Computes the intrinsic cornerstone Consolidation Premium for a single asset with Dynasty Value >= 65.
 */
export function computeSingleAssetConsolidationBonus(dynastyValue: number): number {
  if (dynastyValue < 65) return 0;
  const baseElite = (dynastyValue - 60) * 0.35;
  const superElite = dynastyValue >= 80 ? (dynastyValue - 75) * 0.35 : 0;
  return Math.round((baseElite + superElite) * 10) / 10;
}

/**
 * Maps a composite trade evaluation score to a canonical Letter Grade (A+ through F).
 */
export function getTradeLetterGrade(compositeScore: number): TradeLetterGrade {
  if (compositeScore >= 22) return 'A+';
  if (compositeScore >= 14) return 'A';
  if (compositeScore >= 8) return 'A-';
  if (compositeScore >= 3.5) return 'B+';
  if (compositeScore >= -3.5) return 'B';
  if (compositeScore >= -8) return 'B-';
  if (compositeScore >= -13) return 'C+';
  if (compositeScore >= -18) return 'C';
  if (compositeScore >= -24) return 'C-';
  if (compositeScore >= -32) return 'D';
  return 'F';
}

export interface NormalizedParticipantAssets {
  rosterId: number;
  incomingPlayerIds: string[];
  outgoingPlayerIds: string[];
  incomingPickIds: string[];
  outgoingPickIds: string[];
}

function uniqueStrings(arr: readonly string[] | undefined): string[] {
  if (!arr) return [];
  return Array.from(new Set(arr.filter(Boolean)));
}

/**
 * Normalizes a 2-team or 3-team TradeProposal so that both incoming and outgoing player/pick lists
 * are populated consistently for every participating Roster.
 */
export function normalizeTradeParticipants(
  proposal: TradeProposal,
  rosterById: Map<number, HydratedRoster> = new Map(),
  pickById: Map<string, DraftPickAsset> = new Map()
): NormalizedParticipantAssets[] {
  const rawParticipants = proposal.participants.slice(0, 3);
  const normalized: NormalizedParticipantAssets[] = rawParticipants.map((p) => ({
    rosterId: p.rosterId,
    incomingPlayerIds: uniqueStrings(p.incomingPlayerIds),
    outgoingPlayerIds: uniqueStrings(p.outgoingPlayerIds),
    incomingPickIds: uniqueStrings(p.incomingPickIds),
    outgoingPickIds: uniqueStrings(p.outgoingPickIds),
  }));

  if (normalized.length === 2) {
    const [a, b] = normalized;
    if (a.incomingPlayerIds.length === 0 && b.outgoingPlayerIds.length > 0) {
      a.incomingPlayerIds = [...b.outgoingPlayerIds];
    }
    if (b.incomingPlayerIds.length === 0 && a.outgoingPlayerIds.length > 0) {
      b.incomingPlayerIds = [...a.outgoingPlayerIds];
    }
    if (a.outgoingPlayerIds.length === 0 && b.incomingPlayerIds.length > 0) {
      a.outgoingPlayerIds = [...b.incomingPlayerIds];
    }
    if (b.outgoingPlayerIds.length === 0 && a.incomingPlayerIds.length > 0) {
      b.outgoingPlayerIds = [...a.incomingPlayerIds];
    }

    if (a.incomingPickIds.length === 0 && b.outgoingPickIds.length > 0) {
      a.incomingPickIds = [...b.outgoingPickIds];
    }
    if (b.incomingPickIds.length === 0 && a.outgoingPickIds.length > 0) {
      b.incomingPickIds = [...a.outgoingPickIds];
    }
    if (a.outgoingPickIds.length === 0 && b.incomingPickIds.length > 0) {
      a.outgoingPickIds = [...b.incomingPickIds];
    }
    if (b.outgoingPickIds.length === 0 && a.incomingPickIds.length > 0) {
      b.outgoingPickIds = [...a.incomingPickIds];
    }
  } else if (normalized.length === 3) {
    // Index which participant currently owns each player or pick
    const playerOwnerMap = new Map<string, number>();
    for (const p of normalized) {
      const roster = rosterById.get(p.rosterId);
      if (!roster) continue;
      for (const slot of roster.allPlayers) {
        playerOwnerMap.set(slot.playerId, p.rosterId);
      }
    }

    // If incomingPlayerIds are specified without outgoingPlayerIds, attribute outgoing to the owning participant
    for (const receiver of normalized) {
      for (const pid of receiver.incomingPlayerIds) {
        const alreadySent = normalized.some((other) => other.outgoingPlayerIds.includes(pid));
        if (!alreadySent) {
          const ownerId = playerOwnerMap.get(pid);
          const sender =
            normalized.find((other) => other.rosterId === ownerId && other.rosterId !== receiver.rosterId) ??
            normalized.find((other) => other.rosterId !== receiver.rosterId);
          if (sender && !sender.outgoingPlayerIds.includes(pid)) {
            sender.outgoingPlayerIds.push(pid);
          }
        }
      }
      for (const pickId of receiver.incomingPickIds) {
        const alreadySent = normalized.some((other) => other.outgoingPickIds.includes(pickId));
        if (!alreadySent) {
          const pick = pickById.get(pickId);
          const ownerId = pick?.currentOwnerRosterId;
          const sender =
            normalized.find((other) => other.rosterId === ownerId && other.rosterId !== receiver.rosterId) ??
            normalized.find((other) => other.rosterId !== receiver.rosterId);
          if (sender && !sender.outgoingPickIds.includes(pickId)) {
            sender.outgoingPickIds.push(pickId);
          }
        }
      }
    }

    // Conversely, if outgoingPlayerIds/outgoingPickIds are specified without incoming, route to next participant
    for (let i = 0; i < normalized.length; i++) {
      const sender = normalized[i];
      const nextReceiver = normalized[(i + 1) % normalized.length];
      for (const pid of sender.outgoingPlayerIds) {
        const alreadyReceived = normalized.some((other) => other.incomingPlayerIds.includes(pid));
        if (!alreadyReceived && !nextReceiver.incomingPlayerIds.includes(pid)) {
          nextReceiver.incomingPlayerIds.push(pid);
        }
      }
      for (const pickId of sender.outgoingPickIds) {
        const alreadyReceived = normalized.some((other) => other.incomingPickIds.includes(pickId));
        if (!alreadyReceived && !nextReceiver.incomingPickIds.includes(pickId)) {
          nextReceiver.incomingPickIds.push(pickId);
        }
      }
    }
  }

  return normalized;
}

/**
 * Evaluates a 2-team or 3-team Dynasty Trade Proposal across both ADR-0002 / ADR-0003 axes:
 * (1) Adjusted Package Dynasty Value (with Consolidation Premium for elite cornerstones and Replacement Cut Asset deductions)
 * (2) Starting 10 Δ Avg Lock-In (solving pre-trade and post-trade optimal 10-starter lineups by Average Lock-In Score, with raw FP/G retained as secondary context)
 */
export function evaluateDynastyTrade(params: {
  proposal: TradeProposal;
  snapshot: MbaLeagueSnapshot;
  stateStore?: ManagerStateStore;
}): TradeEvaluationResult {
  const { proposal, snapshot, stateStore } = params;

  const rosterById = new Map<number, HydratedRoster>(
    snapshot.rosters.map((r) => [r.rosterId, r])
  );

  // Build global player lookup across all rosters (plus any catalog players from historical trades)
  const playerSlotById = new Map<string, { slot: RosterPlayerSlot; ownerRosterId: number }>();
  if (snapshot.playerCatalog) {
    for (const [pid, slot] of Object.entries(snapshot.playerCatalog)) {
      playerSlotById.set(pid, { slot, ownerRosterId: 0 });
    }
  }
  for (const roster of snapshot.rosters) {
    for (const slot of roster.allPlayers) {
      playerSlotById.set(slot.playerId, { slot, ownerRosterId: roster.rosterId });
    }
  }

  // Resolve baseline draft pick matrix and apply any per-pick Projected Pick Tier overrides
  const pickMatrix = resolveDraftPickMatrix({
    rosters: snapshot.rosters,
    tradedPicks: snapshot.tradedPicks,
    stateStore,
  });

  const appliedPickTierOverrides: Record<string, ProjectedPickTier> = {};
  const pickById = new Map<string, DraftPickAsset>();
  for (const basePick of pickMatrix.allPicks) {
    const proposalOverride = proposal.pickTierOverrides?.[basePick.id] ?? null;
    const storeOverride = stateStore?.getPickTierOverride(basePick.id) ?? null;
    const effectiveOverride = proposalOverride ?? storeOverride;

    if (effectiveOverride) {
      appliedPickTierOverrides[basePick.id] = effectiveOverride;
      const overriddenValue = computeDraftPickDynastyValue({
        season: basePick.season,
        round: basePick.round,
        projectedTier: effectiveOverride,
        projectedSlot: basePick.projectedSlot,
        hasManualTierOverride: true,
      });
      pickById.set(basePick.id, {
        ...basePick,
        projectedTier: effectiveOverride,
        hasManualTierOverride: true,
        dynastyValue: overriddenValue,
      });
    } else {
      pickById.set(basePick.id, basePick);
    }
  }

  const normalizedParticipants = normalizeTradeParticipants(proposal, rosterById, pickById);

  // Map each traded player/pick to its sender and receiver rosterId
  const senderByPlayerId = new Map<string, number>();
  const receiverByPlayerId = new Map<string, number>();
  const senderByPickId = new Map<string, number>();
  const receiverByPickId = new Map<string, number>();

  for (const p of normalizedParticipants) {
    for (const pid of p.outgoingPlayerIds) senderByPlayerId.set(pid, p.rosterId);
    for (const pid of p.incomingPlayerIds) receiverByPlayerId.set(pid, p.rosterId);
    for (const pickId of p.outgoingPickIds) senderByPickId.set(pickId, p.rosterId);
    for (const pickId of p.incomingPickIds) receiverByPickId.set(pickId, p.rosterId);
  }

  const participantEvaluations: TradeParticipantEvaluation[] = normalizedParticipants.map((part) => {
    const roster = rosterById.get(part.rosterId) ?? snapshot.rosters[0];

    const buildPlayerAsset = (pid: string, direction: 'IN' | 'OUT'): EvaluatedTradePlayerAsset | null => {
      const entry = playerSlotById.get(pid);
      if (!entry) return null;
      const { slot, ownerRosterId } = entry;
      const fromRosterId =
        direction === 'OUT'
          ? part.rosterId
          : senderByPlayerId.get(pid) ?? ownerRosterId;
      const toRosterId =
        direction === 'IN'
          ? part.rosterId
          : receiverByPlayerId.get(pid) ?? part.rosterId;

      return {
        playerId: slot.playerId,
        fullName: slot.fullName,
        nbaTeam: slot.nbaTeam,
        positions: slot.positions,
        age: slot.age,
        fpg: slot.seasonMetrics.mbaFantasyPointsPerGame,
        avgLockIn: slot.seasonMetrics.averageLockInPoints,
        dynastyValue: slot.dynastyValue,
        consolidationPremium: computeSingleAssetConsolidationBonus(slot.dynastyValue),
        fromRosterId,
        toRosterId,
      };
    };

    const buildPickAsset = (pickId: string, direction: 'IN' | 'OUT'): EvaluatedTradePickAsset | null => {
      let pick = pickById.get(pickId);
      if (!pick) {
        const match = /^(\d{4})-r(1|2)-orig-(\d+)$/.exec(pickId);
        if (!match) return null;
        const season = (['2026', '2027', '2028', '2029'].includes(match[1]) ? match[1] : '2026') as DraftPickAsset['season'];
        const round = Number.parseInt(match[2], 10) as 1 | 2;
        const origRosterId = Number.parseInt(match[3], 10);
        const templatePick = pickById.get(`2026-r${round}-orig-${origRosterId}`);
        const origRosterName =
          rosterById.get(origRosterId)?.manager.rosterName ?? `Roster #${origRosterId}`;
        const roundOrdinal = round === 1 ? '1st' : '2nd';
        pick = {
          id: pickId,
          season,
          round,
          originalRosterId: origRosterId,
          originalRosterName: origRosterName,
          currentOwnerRosterId: origRosterId,
          currentOwnerRosterName: origRosterName,
          isTraded: true,
          viaAnnotation: `via Roster #${origRosterId} (${origRosterName})`,
          displayLabel: `${match[1]} ${roundOrdinal} via Roster #${origRosterId}`,
          projectedSlot: templatePick?.projectedSlot ?? 5,
          projectedTier: templatePick?.projectedTier ?? 'Mid',
          hasManualTierOverride: false,
          dynastyValue: templatePick?.dynastyValue ?? (round === 1 ? 46 : 15),
        };
      }
      const fromRosterId =
        direction === 'OUT'
          ? part.rosterId
          : senderByPickId.get(pickId) ?? pick.currentOwnerRosterId;
      const toRosterId =
        direction === 'IN'
          ? part.rosterId
          : receiverByPickId.get(pickId) ?? part.rosterId;

      return {
        pickId: pick.id,
        season: pick.season,
        round: pick.round,
        originalRosterId: pick.originalRosterId,
        originalRosterName: pick.originalRosterName,
        displayLabel: pick.displayLabel,
        projectedSlot: pick.projectedSlot,
        projectedTier: pick.projectedTier,
        hasManualTierOverride: pick.hasManualTierOverride,
        dynastyValue: pick.dynastyValue,
        consolidationPremium: computeSingleAssetConsolidationBonus(pick.dynastyValue),
        fromRosterId,
        toRosterId,
      };
    };

    const incomingPlayers = part.incomingPlayerIds
      .map((pid) => buildPlayerAsset(pid, 'IN'))
      .filter((x): x is EvaluatedTradePlayerAsset => x !== null);
    const outgoingPlayers = part.outgoingPlayerIds
      .map((pid) => buildPlayerAsset(pid, 'OUT'))
      .filter((x): x is EvaluatedTradePlayerAsset => x !== null);
    const incomingPicks = part.incomingPickIds
      .map((id) => buildPickAsset(id, 'IN'))
      .filter((x): x is EvaluatedTradePickAsset => x !== null);
    const outgoingPicks = part.outgoingPickIds
      .map((id) => buildPickAsset(id, 'OUT'))
      .filter((x): x is EvaluatedTradePickAsset => x !== null);

    const rawIncomingDynastyValue =
      Math.round(
        (incomingPlayers.reduce((s, p) => s + p.dynastyValue, 0) +
          incomingPicks.reduce((s, p) => s + p.dynastyValue, 0)) *
          10
      ) / 10;

    const rawOutgoingDynastyValue =
      Math.round(
        (outgoingPlayers.reduce((s, p) => s + p.dynastyValue, 0) +
          outgoingPicks.reduce((s, p) => s + p.dynastyValue, 0)) *
          10
      ) / 10;

    const rawDynastyDelta =
      Math.round((rawIncomingDynastyValue - rawOutgoingDynastyValue) * 10) / 10;

    // Consolidation Premium calculation (ADR-0002):
    // 1. Intrinsic cornerstone bonus on assets with Dynasty Value >= 65
    // 2. Multi-asset consolidation bonus when acquiring the highest-valued cornerstone in an uneven trade
    const incomingValues = [
      ...incomingPlayers.map((p) => p.dynastyValue),
      ...incomingPicks.map((p) => p.dynastyValue),
    ];
    const outgoingValues = [
      ...outgoingPlayers.map((p) => p.dynastyValue),
      ...outgoingPicks.map((p) => p.dynastyValue),
    ];

    const bestIncoming = incomingValues.length > 0 ? Math.max(...incomingValues) : 0;
    const bestOutgoing = outgoingValues.length > 0 ? Math.max(...outgoingValues) : 0;
    const incomingAssetCount = incomingValues.length;
    const outgoingAssetCount = outgoingValues.length;

    const baseIncomingCornerstoneBonus =
      incomingPlayers.reduce((s, p) => s + p.consolidationPremium, 0) +
      incomingPicks.reduce((s, p) => s + p.consolidationPremium, 0);
    const baseOutgoingCornerstoneBonus =
      outgoingPlayers.reduce((s, p) => s + p.consolidationPremium, 0) +
      outgoingPicks.reduce((s, p) => s + p.consolidationPremium, 0);

    const multiAssetIncomingBoost =
      bestIncoming >= 65 && bestIncoming > bestOutgoing
        ? (bestIncoming - bestOutgoing) * 0.25 +
          Math.max(0, outgoingAssetCount - incomingAssetCount) * 4.5
        : 0;

    const multiAssetOutgoingBoost =
      bestOutgoing >= 65 && bestOutgoing > bestIncoming
        ? (bestOutgoing - bestIncoming) * 0.25 +
          Math.max(0, incomingAssetCount - outgoingAssetCount) * 4.5
        : 0;

    const consolidationPremium =
      Math.round((baseIncomingCornerstoneBonus + multiAssetIncomingBoost) * 10) / 10;
    const outgoingConsolidationPremium =
      Math.round((baseOutgoingCornerstoneBonus + multiAssetOutgoingBoost) * 10) / 10;

    // Replacement Cut Assets (ADR-0002):
    // When a Roster receives M players and sends out N < M players, identify the M - N lowest-Dynasty-Value
    // Bench (BN) players on that Roster as Replacement Cut Assets and deduct their Dynasty Value.
    const excessIncomingPlayers = Math.max(0, incomingPlayers.length - outgoingPlayers.length);
    const outgoingPlayerIdSet = new Set(outgoingPlayers.map((p) => p.playerId));
    const incomingPlayerIdSet = new Set(incomingPlayers.map((p) => p.playerId));

    const eligibleBenchCuts = [...roster.benchSlots]
      .filter((s) => !outgoingPlayerIdSet.has(s.playerId) && !incomingPlayerIdSet.has(s.playerId))
      .sort((a, b) => a.dynastyValue - b.dynastyValue || a.seasonMetrics.mbaFantasyPointsPerGame - b.seasonMetrics.mbaFantasyPointsPerGame);

    const fallbackOtherCuts = [...roster.allPlayers]
      .filter(
        (s) =>
          s.slotLabel !== 'BN' &&
          !outgoingPlayerIdSet.has(s.playerId) &&
          !incomingPlayerIdSet.has(s.playerId)
      )
      .sort((a, b) => a.dynastyValue - b.dynastyValue);

    const combinedCutPool = [...eligibleBenchCuts, ...fallbackOtherCuts];
    const replacementCutSlots = combinedCutPool.slice(0, excessIncomingPlayers);

    const replacementCutAssets: ReplacementCutAsset[] = replacementCutSlots.map((slot) => ({
      playerId: slot.playerId,
      fullName: slot.fullName,
      positions: slot.positions,
      age: slot.age,
      fpg: slot.seasonMetrics.mbaFantasyPointsPerGame,
      dynastyValue: slot.dynastyValue,
      slotLabel: slot.slotLabel,
    }));

    const replacementCutPenalty =
      Math.round(replacementCutAssets.reduce((sum, c) => sum + c.dynastyValue, 0) * 10) / 10;

    // Single-sided Replacement Cut Asset accounting (ADR-0002):
    // Deduct Replacement Cut Asset penalty only on the side absorbing excess incoming players.
    const adjustedIncomingDynastyValue =
      Math.round(
        (rawIncomingDynastyValue + consolidationPremium - replacementCutPenalty) * 10
      ) / 10;
    const adjustedOutgoingDynastyValue =
      Math.round((rawOutgoingDynastyValue + outgoingConsolidationPremium) * 10) / 10;
    const adjustedDynastyDelta =
      Math.round((adjustedIncomingDynastyValue - adjustedOutgoingDynastyValue) * 10) / 10;

    // Construct Pre-Trade and Post-Trade player pools for this Roster:
    // Ensure pre-trade pool contains outgoingPlayers and excludes incomingPlayers (even if pasted trade reverses current ownership),
    // and post-trade pool removes outgoingPlayers (+ replacementCutAssets) and adds incomingPlayers.
    const outgoingSlotObjects = outgoingPlayers
      .map((p) => playerSlotById.get(p.playerId)?.slot)
      .filter((s): s is RosterPlayerSlot => Boolean(s));
    const incomingSlotObjects = incomingPlayers
      .map((p) => playerSlotById.get(p.playerId)?.slot)
      .filter((s): s is RosterPlayerSlot => Boolean(s));
    const replacementCutIdSet = new Set(replacementCutAssets.map((c) => c.playerId));

    const basePreTradePoolMap = new Map<string, RosterPlayerSlot>();
    for (const slot of roster.allPlayers) {
      if (!incomingPlayerIdSet.has(slot.playerId)) {
        basePreTradePoolMap.set(slot.playerId, slot);
      }
    }
    for (const outSlot of outgoingSlotObjects) {
      basePreTradePoolMap.set(outSlot.playerId, outSlot);
    }
    const preTradePool = [...basePreTradePoolMap.values()];

    const postTradePoolMap = new Map<string, RosterPlayerSlot>();
    for (const slot of preTradePool) {
      if (!outgoingPlayerIdSet.has(slot.playerId) && !replacementCutIdSet.has(slot.playerId)) {
        postTradePoolMap.set(slot.playerId, slot);
      }
    }
    for (const inSlot of incomingSlotObjects) {
      postTradePoolMap.set(inSlot.playerId, inSlot);
    }
    const postTradePool = [...postTradePoolMap.values()];

    const preOptimal = solveOptimalStarting10Lineup(preTradePool);
    const postOptimal = solveOptimalStarting10Lineup(postTradePool);
    const preTradeOptimalStarterFpg = preOptimal.totalFpg;
    const postTradeOptimalStarterFpg = postOptimal.totalFpg;
    const starting10DeltaFppg =
      Math.round((postTradeOptimalStarterFpg - preTradeOptimalStarterFpg) * 10) / 10;
    const preTradeOptimalStarterAvgLockIn = preOptimal.totalAvgLockIn;
    const postTradeOptimalStarterAvgLockIn = postOptimal.totalAvgLockIn;
    const starting10DeltaAvgLockIn =
      Math.round((postTradeOptimalStarterAvgLockIn - preTradeOptimalStarterAvgLockIn) * 10) / 10;

    // Average Age Delta
    const computeAvgAge = (pool: RosterPlayerSlot[]): number => {
      const withAge = pool.filter((p) => typeof p.age === 'number' && p.age > 0);
      if (withAge.length === 0) return 0;
      const sum = withAge.reduce((acc, p) => acc + (p.age as number), 0);
      return Math.round((sum / withAge.length) * 10) / 10;
    };
    const preTradeAverageAge = computeAvgAge(preTradePool);
    const postTradeAverageAge = computeAvgAge(postTradePool);
    const averageAgeDelta = Math.round((postTradeAverageAge - preTradeAverageAge) * 10) / 10;

    // 2-Center (C) Depth Impact
    const preTradeCenterCount = preTradePool.filter((p) => p.positions.includes('C')).length;
    const postTradeCenterCount = postTradePool.filter((p) => p.positions.includes('C')).length;
    const centerDepthDelta = postTradeCenterCount - preTradeCenterCount;

    let centerImpactSummary = `Holds steady at ${postTradeCenterCount} C-eligible players for the 2-Center lineup.`;
    if (centerDepthDelta > 0) {
      centerImpactSummary = `+${centerDepthDelta} C depth (${preTradeCenterCount} → ${postTradeCenterCount} Centers) — bolsters 2-Center positional scarcity.`;
    } else if (centerDepthDelta < 0) {
      centerImpactSummary = `${centerDepthDelta} C depth (${preTradeCenterCount} → ${postTradeCenterCount} Centers) — thins 2-Center coverage${postTradeCenterCount < 2 ? ' (WARNING: fewer than 2 required Centers!)' : '.'}`;
    }

    // Composite Grade Score combining Axis 1 (Adjusted Package Dynasty Value) and Axis 2 (Starting 10 Δ Avg Lock-In)
    // When acquiring draft picks or positive Dynasty Value in a rebuild, dampen negative Starting 10 Δ Avg Lock-In
    const lockInWeight =
      adjustedDynastyDelta > 0 && starting10DeltaAvgLockIn < 0 && incomingPicks.length > 0
        ? 0.9
        : 2.2;
    const compositeGradeScore =
      Math.round((adjustedDynastyDelta + starting10DeltaAvgLockIn * lockInWeight) * 10) / 10;
    const letterGrade = getTradeLetterGrade(compositeGradeScore);

    // Build Plain-English Takeaways
    const takeaways: string[] = [];
    const deltaSign = adjustedDynastyDelta >= 0 ? '+' : '';
    takeaways.push(
      `Net Adjusted Package Dynasty Value: ${deltaSign}${adjustedDynastyDelta.toFixed(1)} (${adjustedIncomingDynastyValue.toFixed(1)} in vs. ${adjustedOutgoingDynastyValue.toFixed(1)} out).`
    );

    if (consolidationPremium > 0) {
      takeaways.push(
        `Applies a +${consolidationPremium.toFixed(1)} Consolidation Premium for acquiring elite cornerstone talent in a 10-team, 10-starter format.`
      );
    }
    if (outgoingConsolidationPremium > 0 && consolidationPremium === 0) {
      takeaways.push(
        `Surrenders a +${outgoingConsolidationPremium.toFixed(1)} Consolidation Premium by breaking up an elite cornerstone asset.`
      );
    }

    if (replacementCutAssets.length > 0) {
      const cutNames = replacementCutAssets
        .map((c) => `${c.fullName} (${c.dynastyValue.toFixed(1)})`)
        .join(', ');
      takeaways.push(
        `Uneven trade absorbs +${replacementCutAssets.length} extra player(s), requiring Replacement Cut Asset drop(s): ${cutNames} (-${replacementCutPenalty.toFixed(1)} Dynasty Value).`
      );
    }

    const lockInSign = starting10DeltaAvgLockIn >= 0 ? '+' : '';
    const fpgSign = starting10DeltaFppg >= 0 ? '+' : '';
    takeaways.push(
      `Optimal Starting 10 Impact: ${lockInSign}${starting10DeltaAvgLockIn.toFixed(1)} Avg Lock-In (${preTradeOptimalStarterAvgLockIn.toFixed(1)} → ${postTradeOptimalStarterAvgLockIn.toFixed(1)} Avg LI; ${fpgSign}${starting10DeltaFppg.toFixed(1)} raw FP/G).`
    );

    if (centerDepthDelta !== 0 || incomingPlayers.some((p) => p.positions.includes('C')) || outgoingPlayers.some((p) => p.positions.includes('C'))) {
      takeaways.push(centerImpactSummary);
    }

    if (averageAgeDelta !== 0) {
      const ageDirection = averageAgeDelta < 0 ? 'younger' : 'older';
      takeaways.push(
        `Roster Age Shift: ${averageAgeDelta > 0 ? '+' : ''}${averageAgeDelta.toFixed(1)} yrs ${ageDirection} (${preTradeAverageAge.toFixed(1)} → ${postTradeAverageAge.toFixed(1)} avg age).`
      );
    }

    if (incomingPicks.length > 0) {
      const pickSummary = incomingPicks
        .map((p) => `${p.displayLabel} [${p.projectedTier}${p.hasManualTierOverride ? ' override' : ''}: ${p.dynastyValue.toFixed(1)}]`)
        .join(', ');
      takeaways.push(`Acquires Draft Pick Capital: ${pickSummary}.`);
    }

    return {
      rosterId: part.rosterId,
      rosterName: roster.manager.rosterName,
      managerDisplayName: roster.manager.displayName,
      incomingPlayers,
      outgoingPlayers,
      incomingPicks,
      outgoingPicks,
      rawIncomingDynastyValue,
      rawOutgoingDynastyValue,
      rawDynastyDelta,
      consolidationPremium,
      outgoingConsolidationPremium,
      replacementCutAssets,
      replacementCutPenalty,
      adjustedIncomingDynastyValue,
      adjustedOutgoingDynastyValue,
      adjustedDynastyDelta,
      preTradeOptimalStarterFpg,
      postTradeOptimalStarterFpg,
      starting10DeltaFppg,
      preTradeOptimalStarterAvgLockIn,
      postTradeOptimalStarterAvgLockIn,
      starting10DeltaAvgLockIn,
      preTradeOptimalStarters: preOptimal.starters,
      postTradeOptimalStarters: postOptimal.starters,
      preTradeAverageAge,
      postTradeAverageAge,
      averageAgeDelta,
      preTradeCenterCount,
      postTradeCenterCount,
      centerDepthDelta,
      centerImpactSummary,
      letterGrade,
      compositeGradeScore,
      isWinner: false,
      takeaways,
    };
  });

  // Determine overall trade winner and Fairness Meter
  let winnerRosterId: number | null = null;
  let winnerRosterName: string | null = null;
  let netAdjustedSpread = 0;

  if (participantEvaluations.length >= 2) {
    const sortedByComposite = [...participantEvaluations].sort(
      (a, b) =>
        b.compositeGradeScore - a.compositeGradeScore ||
        b.adjustedDynastyDelta - a.adjustedDynastyDelta
    );
    const top = sortedByComposite[0];
    const bottom = sortedByComposite[sortedByComposite.length - 1];
    const deltas = participantEvaluations.map((p) => p.adjustedDynastyDelta);
    netAdjustedSpread =
      Math.round((Math.max(...deltas) - Math.min(...deltas)) / 2 * 10) / 10;

    if (top.compositeGradeScore - bottom.compositeGradeScore >= 1.5 || Math.abs(top.adjustedDynastyDelta) >= 1.5) {
      winnerRosterId = top.rosterId;
      winnerRosterName = top.rosterName;
      for (const p of participantEvaluations) {
        p.isWinner = p.rosterId === winnerRosterId;
      }
    }
  }

  const fairnessScore = Math.max(
    0,
    Math.min(100, Math.round(100 - netAdjustedSpread * 1.8))
  );

  let fairnessLabel: TradeFairnessLabel = 'Balanced Trade';
  if (fairnessScore < 45) {
    fairnessLabel = 'Fleecing Alert';
  } else if (fairnessScore < 68) {
    fairnessLabel = 'Lopsided Trade';
  } else if (fairnessScore < 85) {
    fairnessLabel = 'Slight Edge';
  }

  const summaryHeadline =
    winnerRosterName && netAdjustedSpread >= 2
      ? `${winnerRosterName} wins by +${netAdjustedSpread.toFixed(1)} Adjusted Dynasty Value (${fairnessLabel})`
      : `Balanced MBA Dynasty Deal (${fairnessScore}/100 Fairness)`;

  return {
    participants: participantEvaluations,
    fairnessScore,
    fairnessLabel,
    winnerRosterId,
    winnerRosterName,
    netAdjustedSpread,
    summaryHeadline,
    appliedPickTierOverrides,
  };
}

/**
 * Encodes a TradeProposal into a compact, URL-safe query parameter string for ?trade=...
 */
export function encodeTradeProposalToQueryParam(proposal: TradeProposal): string {
  const payload = {
    p: proposal.participants.map((part) => ({
      r: part.rosterId,
      op: part.outgoingPlayerIds ?? [],
      ip: part.incomingPlayerIds ?? [],
      ok: part.outgoingPickIds ?? [],
      ik: part.incomingPickIds ?? [],
    })),
    t: proposal.pickTierOverrides ?? {},
  };
  const json = JSON.stringify(payload);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf-8').toString('base64url');
  }
  return btoa(encodeURIComponent(json));
}

/**
 * Decodes a TradeProposal from a URL query parameter string (?trade=...).
 */
export function decodeTradeProposalFromQueryParam(encoded: string | null | undefined): TradeProposal | null {
  if (!encoded || !encoded.trim()) return null;
  try {
    let json: string;
    if (typeof Buffer !== 'undefined') {
      json = Buffer.from(encoded.trim(), 'base64url').toString('utf-8');
    } else {
      json = decodeURIComponent(atob(encoded.trim()));
    }
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.p) || parsed.p.length < 2) {
      return null;
    }
    const participants = parsed.p.slice(0, 3).map((item: Record<string, unknown>) => ({
      rosterId: Number(item.r),
      outgoingPlayerIds: Array.isArray(item.op) ? item.op.map(String) : [],
      incomingPlayerIds: Array.isArray(item.ip) ? item.ip.map(String) : [],
      outgoingPickIds: Array.isArray(item.ok) ? item.ok.map(String) : [],
      incomingPickIds: Array.isArray(item.ik) ? item.ik.map(String) : [],
    }));

    const pickTierOverrides: Record<string, ProjectedPickTier> = {};
    if (parsed.t && typeof parsed.t === 'object') {
      for (const [k, v] of Object.entries(parsed.t)) {
        if (v === 'Early' || v === 'Mid' || v === 'Late') {
          pickTierOverrides[k] = v;
        }
      }
    }

    return {
      participants,
      pickTierOverrides,
    };
  } catch {
    return null;
  }
}
