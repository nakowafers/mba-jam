import { evaluateDynastyTrade } from './trade-analyzer';
import {
  FlippedAssetChainRecord,
  GradedHistoricalTrade,
  HistoricalTradeFilterOptions,
  MBA_LEAGUE_ID_2025,
  MBA_LEAGUE_ID_2026,
  ManagerStateStore,
  MbaLeagueSnapshot,
  SleeperTransaction,
  TradeParticipantProposal,
  TradeProposal,
} from '../types/mba';

function inferSeasonFromTransaction(tx: SleeperTransaction): '2026' | '2025' | string {
  if (tx.season) return tx.season;
  if (tx.league_id === MBA_LEAGUE_ID_2025) return '2025';
  if (tx.league_id === MBA_LEAGUE_ID_2026) return '2026';
  // Timestamps prior to July 2025 belong to the 2025 season
  if (tx.created > 0 && tx.created < 1751328000000) return '2025';
  return '2026';
}

function inferLeagueIdFromTransaction(
  tx: SleeperTransaction,
  season: string
): string {
  if (tx.league_id) return tx.league_id;
  return season === '2025' ? MBA_LEAGUE_ID_2025 : MBA_LEAGUE_ID_2026;
}

function formatTransactionDate(timestampMs: number): string {
  if (!timestampMs || Number.isNaN(timestampMs)) return 'Unknown Date';
  const d = new Date(timestampMs);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Converts a raw Sleeper trade transaction into a canonical MBA Jam TradeProposal.
 */
export function convertTransactionToTradeProposal(
  tx: SleeperTransaction
): TradeProposal {
  const rosterIdSet = new Set<number>(tx.roster_ids ?? []);

  for (const rId of Object.values(tx.adds ?? {})) {
    if (typeof rId === 'number') rosterIdSet.add(rId);
  }
  for (const rId of Object.values(tx.drops ?? {})) {
    if (typeof rId === 'number') rosterIdSet.add(rId);
  }
  for (const dp of tx.draft_picks ?? []) {
    if (typeof dp.owner_id === 'number') rosterIdSet.add(dp.owner_id);
    if (typeof dp.previous_owner_id === 'number') rosterIdSet.add(dp.previous_owner_id);
  }

  const orderedRosterIds = [...rosterIdSet].sort((a, b) => a - b);

  const participantMap = new Map<number, TradeParticipantProposal>();
  for (const rId of orderedRosterIds) {
    participantMap.set(rId, {
      rosterId: rId,
      incomingPlayerIds: [],
      outgoingPlayerIds: [],
      incomingPickIds: [],
      outgoingPickIds: [],
    });
  }

  for (const [playerId, receivingRosterId] of Object.entries(tx.adds ?? {})) {
    const part = participantMap.get(receivingRosterId);
    if (part && !part.incomingPlayerIds!.includes(playerId)) {
      part.incomingPlayerIds!.push(playerId);
    }
  }

  for (const [playerId, sendingRosterId] of Object.entries(tx.drops ?? {})) {
    const part = participantMap.get(sendingRosterId);
    if (part && !part.outgoingPlayerIds!.includes(playerId)) {
      part.outgoingPlayerIds!.push(playerId);
    }
  }

  for (const dp of tx.draft_picks ?? []) {
    const pickId = `${dp.season}-r${dp.round}-orig-${dp.roster_id}`;
    const receiver = participantMap.get(dp.owner_id);
    if (receiver && !receiver.incomingPickIds!.includes(pickId)) {
      receiver.incomingPickIds!.push(pickId);
    }
    const sender = participantMap.get(dp.previous_owner_id);
    if (sender && !sender.outgoingPickIds!.includes(pickId)) {
      sender.outgoingPickIds!.push(pickId);
    }
  }

  return {
    participants: orderedRosterIds.map((rId) => participantMap.get(rId)!),
  };
}

/**
 * Grades all completed historical trades across the 2025 (1212393765696700416) and 2026 (1344293979830640640)
 * MBA seasons using the ADR-0002 dual-axis trade analyzer, detects chronological Flipped Asset chains,
 * and filters by season and/or participating Manager / Roster.
 */
export function evaluateHistoricalLeagueTrades(params: {
  transactions: SleeperTransaction[];
  snapshot: MbaLeagueSnapshot;
  stateStore?: ManagerStateStore;
  options?: HistoricalTradeFilterOptions;
}): GradedHistoricalTrade[] {
  const { transactions, snapshot, stateStore, options } = params;

  const rosterNameById = new Map<number, string>(
    snapshot.rosters.map((r) => [r.rosterId, r.manager.rosterName])
  );

  // 1. Filter to completed trade transactions and deduplicate by transaction_id
  const uniqueTradesMap = new Map<string, SleeperTransaction>();
  for (const tx of transactions) {
    if (!tx || tx.type !== 'trade' || tx.status !== 'complete') continue;
    uniqueTradesMap.set(tx.transaction_id, tx);
  }

  // 2. Sort chronologically (oldest -> newest) for Flipped Asset chain detection
  const chronologicalTxs = [...uniqueTradesMap.values()].sort((a, b) => {
    if (a.created !== b.created) return a.created - b.created;
    const seasonA = Number.parseInt(String(inferSeasonFromTransaction(a)), 10) || 2025;
    const seasonB = Number.parseInt(String(inferSeasonFromTransaction(b)), 10) || 2025;
    if (seasonA !== seasonB) return seasonA - seasonB;
    if (a.leg !== b.leg) return a.leg - b.leg;
    return a.transaction_id.localeCompare(b.transaction_id);
  });

  // 3. Build baseline dual-axis evaluations for each historical trade
  const gradedChronological: GradedHistoricalTrade[] = chronologicalTxs.map((tx) => {
    const season = inferSeasonFromTransaction(tx);
    const leagueId = inferLeagueIdFromTransaction(tx, season);
    const proposal = convertTransactionToTradeProposal(tx);
    const evaluation = evaluateDynastyTrade({
      proposal,
      snapshot,
      stateStore,
    });

    return {
      transactionId: tx.transaction_id,
      leagueId,
      season,
      leg: tx.leg || 1,
      created: tx.created,
      formattedDate: formatTransactionDate(tx.created),
      rosterIds: proposal.participants.map((p) => p.rosterId),
      proposal,
      evaluation,
      participants: evaluation.participants,
      winnerRosterId: evaluation.winnerRosterId,
      winnerRosterName: evaluation.winnerRosterName,
      fairnessScore: evaluation.fairnessScore,
      fairnessLabel: evaluation.fairnessLabel,
      netAdjustedSpread: evaluation.netAdjustedSpread,
      summaryHeadline: evaluation.summaryHeadline,
      flippedAssets: [],
      hasFlippedAssets: false,
    };
  });

  // 4. Detect Flipped Assets across the chronological timeline:
  // Whenever Roster X acquires a player (playerId) or Draft Pick Asset (season-round-originalRosterId)
  // in trade T_1 at t_1 and later sends that exact same asset away in trade T_2 at t_2 > t_1,
  // mark the asset on T_1 as a Flipped Asset pointing to T_2.
  for (let i = 0; i < gradedChronological.length; i++) {
    const earlierTrade = gradedChronological[i];
    const flippedRecords: FlippedAssetChainRecord[] = [];

    for (const part of earlierTrade.participants) {
      const acquiringRosterId = part.rosterId;
      const acquiredByRosterName =
        rosterNameById.get(acquiringRosterId) ?? part.rosterName;

      // Check incoming players acquired by acquiringRosterId
      for (const playerAsset of part.incomingPlayers) {
        let subsequentMatch: {
          trade: GradedHistoricalTrade;
          toRosterId: number;
          toRosterName: string;
        } | null = null;

        for (let j = i + 1; j < gradedChronological.length; j++) {
          const laterTrade = gradedChronological[j];
          const senderPart = laterTrade.participants.find(
            (p) =>
              p.rosterId === acquiringRosterId &&
              p.outgoingPlayers.some((outP) => outP.playerId === playerAsset.playerId)
          );
          if (senderPart) {
            const outAsset = senderPart.outgoingPlayers.find(
              (outP) => outP.playerId === playerAsset.playerId
            );
            const receiverPart = laterTrade.participants.find((p) =>
              p.incomingPlayers.some((inP) => inP.playerId === playerAsset.playerId)
            );
            const toRosterId =
              receiverPart?.rosterId ?? outAsset?.toRosterId ?? laterTrade.rosterIds[0];
            const toRosterName =
              rosterNameById.get(toRosterId) ??
              receiverPart?.rosterName ??
              `Roster #${toRosterId}`;
            subsequentMatch = {
              trade: laterTrade,
              toRosterId,
              toRosterName,
            };
            break;
          }
        }

        if (subsequentMatch) {
          const summary = `Flipped to Roster #${subsequentMatch.toRosterId} (${subsequentMatch.toRosterName}) in ${subsequentMatch.trade.season} Wk ${subsequentMatch.trade.leg}`;
          playerAsset.isFlippedAsset = true;
          playerAsset.flippedInTransactionId = subsequentMatch.trade.transactionId;
          playerAsset.flippedTimestamp = subsequentMatch.trade.created;
          playerAsset.flippedToRosterId = subsequentMatch.toRosterId;
          playerAsset.flippedToRosterName = subsequentMatch.toRosterName;
          playerAsset.flippedSeason = subsequentMatch.trade.season;
          playerAsset.flippedLeg = subsequentMatch.trade.leg;
          playerAsset.flippedSummary = summary;

          flippedRecords.push({
            assetType: 'PLAYER',
            assetId: playerAsset.playerId,
            assetLabel: playerAsset.fullName,
            acquiredByRosterId: acquiringRosterId,
            acquiredByRosterName,
            acquiredInTransactionId: earlierTrade.transactionId,
            acquiredTimestamp: earlierTrade.created,
            isFlippedAsset: true,
            flippedInTransactionId: subsequentMatch.trade.transactionId,
            flippedTimestamp: subsequentMatch.trade.created,
            flippedToRosterId: subsequentMatch.toRosterId,
            flippedToRosterName: subsequentMatch.toRosterName,
            flippedSeason: subsequentMatch.trade.season,
            flippedLeg: subsequentMatch.trade.leg,
            flippedSummary: summary,
          });
        } else {
          playerAsset.isFlippedAsset = false;
          playerAsset.flippedInTransactionId = null;
          playerAsset.flippedTimestamp = null;
          playerAsset.flippedToRosterId = null;
          playerAsset.flippedToRosterName = null;
          playerAsset.flippedSeason = null;
          playerAsset.flippedLeg = null;
          playerAsset.flippedSummary = null;
        }
      }

      // Check incoming Draft Pick Assets acquired by acquiringRosterId
      for (const pickAsset of part.incomingPicks) {
        let subsequentMatch: {
          trade: GradedHistoricalTrade;
          toRosterId: number;
          toRosterName: string;
        } | null = null;

        for (let j = i + 1; j < gradedChronological.length; j++) {
          const laterTrade = gradedChronological[j];
          const senderPart = laterTrade.participants.find(
            (p) =>
              p.rosterId === acquiringRosterId &&
              p.outgoingPicks.some(
                (outPk) =>
                  outPk.pickId === pickAsset.pickId ||
                  (outPk.season === pickAsset.season &&
                    outPk.round === pickAsset.round &&
                    outPk.originalRosterId === pickAsset.originalRosterId)
              )
          );
          if (senderPart) {
            const outAsset = senderPart.outgoingPicks.find(
              (outPk) =>
                outPk.pickId === pickAsset.pickId ||
                (outPk.season === pickAsset.season &&
                  outPk.round === pickAsset.round &&
                  outPk.originalRosterId === pickAsset.originalRosterId)
            );
            const receiverPart = laterTrade.participants.find((p) =>
              p.incomingPicks.some(
                (inPk) =>
                  inPk.pickId === pickAsset.pickId ||
                  (inPk.season === pickAsset.season &&
                    inPk.round === pickAsset.round &&
                    inPk.originalRosterId === pickAsset.originalRosterId)
              )
            );
            const toRosterId =
              receiverPart?.rosterId ?? outAsset?.toRosterId ?? laterTrade.rosterIds[0];
            const toRosterName =
              rosterNameById.get(toRosterId) ??
              receiverPart?.rosterName ??
              `Roster #${toRosterId}`;
            subsequentMatch = {
              trade: laterTrade,
              toRosterId,
              toRosterName,
            };
            break;
          }
        }

        if (subsequentMatch) {
          const summary = `Flipped to Roster #${subsequentMatch.toRosterId} (${subsequentMatch.toRosterName}) in ${subsequentMatch.trade.season} Wk ${subsequentMatch.trade.leg}`;
          pickAsset.isFlippedAsset = true;
          pickAsset.flippedInTransactionId = subsequentMatch.trade.transactionId;
          pickAsset.flippedTimestamp = subsequentMatch.trade.created;
          pickAsset.flippedToRosterId = subsequentMatch.toRosterId;
          pickAsset.flippedToRosterName = subsequentMatch.toRosterName;
          pickAsset.flippedSeason = subsequentMatch.trade.season;
          pickAsset.flippedLeg = subsequentMatch.trade.leg;
          pickAsset.flippedSummary = summary;

          flippedRecords.push({
            assetType: 'PICK',
            assetId: pickAsset.pickId,
            assetLabel: pickAsset.displayLabel,
            acquiredByRosterId: acquiringRosterId,
            acquiredByRosterName,
            acquiredInTransactionId: earlierTrade.transactionId,
            acquiredTimestamp: earlierTrade.created,
            isFlippedAsset: true,
            flippedInTransactionId: subsequentMatch.trade.transactionId,
            flippedTimestamp: subsequentMatch.trade.created,
            flippedToRosterId: subsequentMatch.toRosterId,
            flippedToRosterName: subsequentMatch.toRosterName,
            flippedSeason: subsequentMatch.trade.season,
            flippedLeg: subsequentMatch.trade.leg,
            flippedSummary: summary,
          });
        } else {
          pickAsset.isFlippedAsset = false;
          pickAsset.flippedInTransactionId = null;
          pickAsset.flippedTimestamp = null;
          pickAsset.flippedToRosterId = null;
          pickAsset.flippedToRosterName = null;
          pickAsset.flippedSeason = null;
          pickAsset.flippedLeg = null;
          pickAsset.flippedSummary = null;
        }
      }
    }

    earlierTrade.flippedAssets = flippedRecords;
    earlierTrade.hasFlippedAssets = flippedRecords.length > 0;
  }

  // 5. Sort newest-first (descending by created timestamp) and apply season / rosterId filters
  const newestFirst = [...gradedChronological].sort(
    (a, b) =>
      b.created - a.created ||
      b.leg - a.leg ||
      b.transactionId.localeCompare(a.transactionId)
  );

  return filterGradedHistoricalTrades(newestFirst, options);
}

/**
 * Filters a pre-graded list of historical trades by season ('2026', '2025', 'ALL') and/or participating Roster ID.
 */
export function filterGradedHistoricalTrades(
  trades: readonly GradedHistoricalTrade[],
  options?: HistoricalTradeFilterOptions
): GradedHistoricalTrade[] {
  const seasonFilter = options?.season ?? 'ALL';
  const rosterIdFilter = options?.rosterId ?? null;

  return trades.filter((trade) => {
    if (seasonFilter !== 'ALL' && trade.season !== seasonFilter) {
      return false;
    }
    if (
      typeof rosterIdFilter === 'number' &&
      rosterIdFilter > 0 &&
      !trade.rosterIds.includes(rosterIdFilter)
    ) {
      return false;
    }
    return true;
  });
}
