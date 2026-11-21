import { resolveDraftPickMatrix } from './dynasty-valuation';
import { normalizeTradeParticipants } from './trade-analyzer';
import {
  DraftPickAsset,
  DraftPickSeason,
  HydratedRoster,
  ManagerStateStore,
  MbaLeagueSnapshot,
  ParsedTradeTextResult,
  ProjectedPickTier,
  RosterPlayerSlot,
  TradeParticipantProposal,
  TradeProposal,
} from '../types/mba';

function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PLAYER_NICKNAME_MAP: Record<string, string> = {
  wemby: 'Victor Wembanyama',
  wembanyama: 'Victor Wembanyama',
  sga: 'Shai Gilgeous-Alexander',
  shai: 'Shai Gilgeous-Alexander',
  jokic: 'Nikola Jokic',
  giannis: 'Giannis Antetokounmpo',
  greekfreak: 'Giannis Antetokounmpo',
  sengun: 'Alperen Sengun',
  luka: 'Luka Doncic',
  doncic: 'Luka Doncic',
  booker: 'Devin Booker',
  dbook: 'Devin Booker',
  hali: 'Tyrese Haliburton',
  haliburton: 'Tyrese Haliburton',
  tatum: 'Jayson Tatum',
  paolo: 'Paolo Banchero',
  banchero: 'Paolo Banchero',
  scottie: 'Scottie Barnes',
  ant: 'Anthony Edwards',
  edwards: 'Anthony Edwards',
  flagg: 'Cooper Flagg',
  jdub: 'Jalen Williams',
  amen: 'Amen Thompson',
  chet: 'Chet Holmgren',
  holmgren: 'Chet Holmgren',
  ja: 'Ja Morant',
  morant: 'Ja Morant',
  sarr: 'Alexandre Sarr',
  steph: 'Stephen Curry',
  curry: 'Stephen Curry',
  kd: 'Kevin Durant',
  durant: 'Kevin Durant',
  ad: 'Anthony Davis',
  cade: 'Cade Cunningham',
  sabonis: 'Domantas Sabonis',
  lamelo: 'LaMelo Ball',
  mobley: 'Evan Mobley',
  brunson: 'Jalen Brunson',
  maxey: 'Tyrese Maxey',
  kat: 'Karl-Anthony Towns',
  towns: 'Karl-Anthony Towns',
  trae: 'Trae Young',
  zion: 'Zion Williamson',
  spida: 'Donovan Mitchell',
  mitchell: 'Donovan Mitchell',
  bam: 'Bam Adebayo',
};

interface ClauseAnchor {
  rosterId: number;
  direction: 'IN' | 'OUT';
  matchStart: number;
  contentStart: number;
}

/**
 * Matches freeform trade text against MBA Rosters, Managers, NBA players, and 2026–2029 Draft Pick Assets
 * to produce a structured TradeProposal ready for evaluateTrade.
 */
export function parseFreeformTradeText(params: {
  rawText: string;
  snapshot: MbaLeagueSnapshot;
  stateStore?: ManagerStateStore;
}): ParsedTradeTextResult {
  const { rawText, snapshot, stateStore } = params;

  const pickMatrix = resolveDraftPickMatrix({
    rosters: snapshot.rosters,
    tradedPicks: snapshot.tradedPicks,
    stateStore,
  });

  // Build candidate alias phrases for every Roster in the league, sorted longest-first
  // so "Ashley ketchcum" matches before "Ash Ketchum"
  const rosterAliases: Array<{ alias: string; rosterId: number }> = [];
  for (const r of snapshot.rosters) {
    const rName = r.manager.rosterName.trim();
    const dName = r.manager.displayName.trim();
    if (rName) rosterAliases.push({ alias: rName, rosterId: r.rosterId });
    if (dName) rosterAliases.push({ alias: dName, rosterId: r.rosterId });
    rosterAliases.push({ alias: `Roster #${r.rosterId}`, rosterId: r.rosterId });
    rosterAliases.push({ alias: `Roster ${r.rosterId}`, rosterId: r.rosterId });
    rosterAliases.push({ alias: `Team #${r.rosterId}`, rosterId: r.rosterId });
    rosterAliases.push({ alias: `Team ${r.rosterId}`, rosterId: r.rosterId });
  }

  rosterAliases.sort((a, b) => b.alias.length - a.alias.length);

  const aliasPattern = rosterAliases.map((a) => escapeRegex(a.alias)).join('|');
  const verbPattern =
    '(?:receives|receive|gets|get|acquires|acquire|lands|sends|send|trades|trade|gives|give|ships|:)';
  const anchorRegex = new RegExp(`(${aliasPattern})\\s*(${verbPattern})\\b:?`, 'gi');

  const anchors: ClauseAnchor[] = [];
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(rawText)) !== null) {
    const matchedAliasRaw = match[1].trim().toLowerCase();
    const matchedVerbRaw = match[2].trim().toLowerCase();

    const matchedRoster = rosterAliases.find(
      (a) => a.alias.toLowerCase() === matchedAliasRaw
    );
    if (!matchedRoster) continue;

    const isOutgoing = /^(sends|send|trades|trade|gives|give|ships)$/.test(matchedVerbRaw);
    anchors.push({
      rosterId: matchedRoster.rosterId,
      direction: isOutgoing ? 'OUT' : 'IN',
      matchStart: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  // Build global player index across all rosters
  const allPlayerSlots: Array<{ slot: RosterPlayerSlot; ownerRosterId: number }> = [];
  for (const r of snapshot.rosters) {
    for (const slot of r.allPlayers) {
      allPlayerSlots.push({ slot, ownerRosterId: r.rosterId });
    }
  }

  const matchPlayerToken = (token: string): { slot: RosterPlayerSlot; ownerRosterId: number } | null => {
    const cleaned = normalizeText(token.replace(/\([^)]*\)/g, ''));
    if (!cleaned || cleaned.length < 2) return null;

    // 1. Check nickname dictionary
    const compact = cleaned.replace(/\s+/g, '');
    const nicknameTarget = PLAYER_NICKNAME_MAP[cleaned] ?? PLAYER_NICKNAME_MAP[compact];
    if (nicknameTarget) {
      const targetNorm = normalizeText(nicknameTarget);
      const found = allPlayerSlots.find((p) => normalizeText(p.slot.fullName) === targetNorm);
      if (found) return found;
    }

    // 2. Exact fullName match
    const exactFull = allPlayerSlots.find((p) => normalizeText(p.slot.fullName) === cleaned);
    if (exactFull) return exactFull;

    // 3. Exact lastName or firstName match
    const exactLast = allPlayerSlots.find((p) => normalizeText(p.slot.lastName) === cleaned);
    if (exactLast) return exactLast;

    const exactFirst = allPlayerSlots.find(
      (p) => cleaned.length >= 4 && normalizeText(p.slot.firstName) === cleaned
    );
    if (exactFirst) return exactFirst;

    // 4. Token inclusion match
    const words = cleaned.split(' ').filter((w) => w.length >= 2);
    if (words.length > 0) {
      const partial = allPlayerSlots.find((p) => {
        const fullNorm = normalizeText(p.slot.fullName);
        return words.every((w) => fullNorm.includes(w));
      });
      if (partial) return partial;
    }

    return null;
  };

  const usedPickIds = new Set<string>();
  const pickTierOverrides: Record<string, ProjectedPickTier> = {};

  const matchPickToken = (
    token: string,
    clauseRosterId: number,
    direction: 'IN' | 'OUT',
    participatingRosterIds: number[]
  ): DraftPickAsset | null => {
    const norm = normalizeText(token);
    // Look for year: 2026..2029 or 26..29 accompanied by round 1st/2nd
    const yearMatch = /\b(2026|2027|2028|2029|26|27|28|29)\b/.exec(norm);
    const round1Match = /\b(1st|first|rd\s*1|round\s*1|r1)\b/.exec(norm);
    const round2Match = /\b(2nd|second|rd\s*2|round\s*2|r2)\b/.exec(norm);

    if (!yearMatch || (!round1Match && !round2Match)) {
      return null;
    }

    const rawYear = yearMatch[1];
    const season = (rawYear.length === 2 ? `20${rawYear}` : rawYear) as DraftPickSeason;
    const round: 1 | 2 = round1Match ? 1 : 2;

    let explicitTier: ProjectedPickTier | null = null;
    if (/\bearly\b/.test(norm)) explicitTier = 'Early';
    else if (/\bmid\b/.test(norm)) explicitTier = 'Mid';
    else if (/\blate\b/.test(norm)) explicitTier = 'Late';

    // Check if an explicit original roster # was mentioned (e.g. "via Roster #10" or "#6")
    const viaMatch = /(?:#|roster\s*|orig\s*)(10|[1-9])\b/.exec(norm);
    const explicitOrigRosterId = viaMatch ? Number.parseInt(viaMatch[1], 10) : null;

    const candidates = pickMatrix.allPicks.filter(
      (p) => p.season === season && p.round === round && !usedPickIds.has(p.id)
    );
    if (candidates.length === 0) return null;

    const otherParticipantIds = participatingRosterIds.filter((id) => id !== clauseRosterId);

    let chosen: DraftPickAsset | undefined;
    if (explicitOrigRosterId !== null) {
      chosen = candidates.find((p) => p.originalRosterId === explicitOrigRosterId);
    }

    if (!chosen) {
      if (direction === 'IN') {
        // Prefer a pick owned by one of the other participating rosters
        chosen =
          candidates.find(
            (p) =>
              otherParticipantIds.includes(p.currentOwnerRosterId) &&
              p.originalRosterId === p.currentOwnerRosterId
          ) ??
          candidates.find((p) => otherParticipantIds.includes(p.currentOwnerRosterId)) ??
          candidates.find((p) => otherParticipantIds.includes(p.originalRosterId)) ??
          candidates.find((p) => p.currentOwnerRosterId === clauseRosterId) ??
          candidates[0];
      } else {
        // Outgoing pick from clauseRosterId
        chosen =
          candidates.find(
            (p) =>
              p.currentOwnerRosterId === clauseRosterId &&
              p.originalRosterId === clauseRosterId
          ) ??
          candidates.find((p) => p.currentOwnerRosterId === clauseRosterId) ??
          candidates.find((p) => p.originalRosterId === clauseRosterId) ??
          candidates[0];
      }
    }

    if (chosen) {
      usedPickIds.add(chosen.id);
      if (explicitTier) {
        pickTierOverrides[chosen.id] = explicitTier;
      }
      return chosen;
    }

    return null;
  };

  const unmatchedTokens: string[] = [];
  const participantMap = new Map<number, TradeParticipantProposal>();

  const ensureParticipant = (rosterId: number): TradeParticipantProposal => {
    let part = participantMap.get(rosterId);
    if (!part) {
      part = {
        rosterId,
        incomingPlayerIds: [],
        outgoingPlayerIds: [],
        incomingPickIds: [],
        outgoingPickIds: [],
      };
      participantMap.set(rosterId, part);
    }
    return part;
  };

  if (anchors.length > 0) {
    const anchoredRosterIds = Array.from(new Set(anchors.map((a) => a.rosterId)));

    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      const nextStart = i + 1 < anchors.length ? anchors[i + 1].matchStart : rawText.length;
      const clauseContent = rawText
        .slice(anchor.contentStart, nextStart)
        .replace(/^[,\s;:+]+|[,\s;:+]+$/g, '');

      const part = ensureParticipant(anchor.rosterId);
      const rawTokens = clauseContent
        .split(/[,+;]|\band\b/i)
        .map((t) => t.trim())
        .filter(Boolean);

      for (const token of rawTokens) {
        const pick = matchPickToken(token, anchor.rosterId, anchor.direction, anchoredRosterIds);
        if (pick) {
          if (anchor.direction === 'IN') {
            part.incomingPickIds!.push(pick.id);
          } else {
            part.outgoingPickIds!.push(pick.id);
          }
          continue;
        }

        const playerMatch = matchPlayerToken(token);
        if (playerMatch) {
          if (anchor.direction === 'IN') {
            part.incomingPlayerIds!.push(playerMatch.slot.playerId);
          } else {
            part.outgoingPlayerIds!.push(playerMatch.slot.playerId);
          }
          continue;
        }

        unmatchedTokens.push(token);
      }
    }
  } else {
    // Fallback when no explicit Roster header was given (e.g., "Giannis, 2028 1st for Sengun, 2027 1st")
    const sides = rawText.split(/\bfor\b|;|\/|\n/i).map((s) => s.trim()).filter(Boolean);
    for (const sideText of sides.slice(0, 3)) {
      const tokens = sideText
        .split(/[,+]|\band\b/i)
        .map((t) => t.trim())
        .filter(Boolean);
      const matchedPlayers: Array<{ slot: RosterPlayerSlot; ownerRosterId: number }> = [];
      const rawPickTokens: string[] = [];

      for (const token of tokens) {
        const pMatch = matchPlayerToken(token);
        if (pMatch) {
          matchedPlayers.push(pMatch);
        } else {
          rawPickTokens.push(token);
        }
      }

      const inferredRosterId =
        matchedPlayers[0]?.ownerRosterId ?? snapshot.activeRosterId;
      const part = ensureParticipant(inferredRosterId);
      for (const pm of matchedPlayers) {
        part.outgoingPlayerIds!.push(pm.slot.playerId);
      }
      for (const pt of rawPickTokens) {
        const pick = matchPickToken(pt, inferredRosterId, 'OUT', [...participantMap.keys()]);
        if (pick) {
          part.outgoingPickIds!.push(pick.id);
        } else {
          unmatchedTokens.push(pt);
        }
      }
    }
  }

  // Ensure at least 2 participants exist
  if (participantMap.size === 1) {
    const [onlyRosterId] = [...participantMap.keys()];
    const fallbackOtherId =
      snapshot.activeRosterId !== onlyRosterId
        ? snapshot.activeRosterId
        : snapshot.rosters.find((r) => r.rosterId !== onlyRosterId)?.rosterId ?? 2;
    ensureParticipant(fallbackOtherId);
  } else if (participantMap.size === 0) {
    ensureParticipant(snapshot.activeRosterId);
    const secondId =
      snapshot.rosters.find((r) => r.rosterId !== snapshot.activeRosterId)?.rosterId ?? 2;
    ensureParticipant(secondId);
  }

  const rosterById = new Map<number, HydratedRoster>(
    snapshot.rosters.map((r) => [r.rosterId, r])
  );
  const pickById = new Map<string, DraftPickAsset>(
    pickMatrix.allPicks.map((p) => [p.id, p])
  );

  // Cross-populate incoming/outgoing for 2-team/3-team proposals so the returned proposal is immediately complete
  const participants = normalizeTradeParticipants(
    {
      participants: [...participantMap.values()].slice(0, 3),
      pickTierOverrides:
        Object.keys(pickTierOverrides).length > 0 ? pickTierOverrides : undefined,
    },
    rosterById,
    pickById
  );

  const matchedRosters = participants.map((p) => {
    const r = rosterById.get(p.rosterId);
    return {
      rosterId: p.rosterId,
      rosterName: r?.manager.rosterName ?? `Roster #${p.rosterId}`,
      managerDisplayName: r?.manager.displayName ?? `Manager ${p.rosterId}`,
    };
  });

  const proposal: TradeProposal = {
    participants,
    pickTierOverrides:
      Object.keys(pickTierOverrides).length > 0 ? pickTierOverrides : undefined,
  };

  return {
    ...proposal,
    proposal,
    matchedRosters,
    unmatchedTokens,
  };
}
