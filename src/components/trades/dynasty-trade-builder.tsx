'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ClipboardPaste,
  Plus,
  RotateCcw,
  Scale,
  Scissors,
  Share2,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useMbaLeague } from '@/components/providers/mba-league-provider';
import { DynastyValueEstBadge } from '@/components/trades/dynasty-value-est-badge';
import { describeReplacementCutAdjustment } from '@/lib/trades/trade-analyzer';
import {
  DraftPickAsset,
  HydratedRoster,
  ProjectedPickTier,
  RosterPlayerSlot,
  TradeLetterGrade,
  TradeParticipantEvaluation,
  TradeProposal,
} from '@/lib/types/mba';

interface DirectedPlayerAsset {
  playerId: string;
  fromRosterId: number;
  toRosterId: number;
}

interface DirectedPickAsset {
  pickId: string;
  fromRosterId: number;
  toRosterId: number;
}

const SAMPLE_PASTED_TRADES = [
  {
    label: 'Giannis + 2028 1st for Sengun + 2027 Picks',
    text: 'Reefer Chiefers receives Giannis Antetokounmpo, 2028 1st; Ashley ketchcum receives Alperen Sengun, 2027 1st, 2027 2nd',
  },
  {
    label: '3-for-1 Bench Package vs. Wembanyama (Anti-4-Quarters Test)',
    text: 'Ashley ketchcum receives Trae Young, Player 2-11, Player 2-12; Basketball Stinks receives Victor Wembanyama',
  },
  {
    label: 'Contender vs. Rebuilder Pick Tier Deal',
    text: 'Roster 1 gets Luka Doncic + 2026 Early 1st, Roster 10 gets Devin Booker + 2028 2nd',
  },
];

function GradeBadge({ grade }: { grade: TradeLetterGrade }) {
  const isNA = grade === 'N/A';
  const isA = grade.startsWith('A');
  const isB = grade.startsWith('B');
  const isC = grade.startsWith('C');

  const style = isNA
    ? 'border-slate-600/60 bg-slate-800/70 text-slate-300 shadow-slate-950/50 text-lg'
    : isA
      ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-emerald-950/50 text-2xl'
      : isB
        ? 'border-sky-500/50 bg-sky-500/20 text-sky-300 shadow-sky-950/50 text-2xl'
        : isC
          ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 shadow-amber-950/50 text-2xl'
          : 'border-rose-500/50 bg-rose-500/20 text-rose-300 shadow-rose-950/50 text-2xl';

  return (
    <div
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 font-mono font-black shadow-lg ${style}`}
    >
      {grade}
    </div>
  );
}

function deriveBuilderStateFromProposal(
  proposal: TradeProposal,
  rosters: HydratedRoster[],
  allPicks: DraftPickAsset[]
): {
  teamCount: 2 | 3;
  selectedRosterIds: number[];
  directedPlayers: DirectedPlayerAsset[];
  directedPicks: DirectedPickAsset[];
  pickTierOverrides: Record<string, ProjectedPickTier>;
} | null {
  if (!proposal.participants || proposal.participants.length < 2) return null;
  const count: 2 | 3 = proposal.participants.length >= 3 ? 3 : 2;
  const pIds = proposal.participants.slice(0, count).map((p) => p.rosterId);
  const fallbackThird = rosters.find((r) => !pIds.includes(r.rosterId))?.rosterId ?? 4;

  const nextPlayers: DirectedPlayerAsset[] = [];
  const nextPicks: DirectedPickAsset[] = [];

  const ownerByPlayerId = new Map<string, number>();
  for (const r of rosters) {
    for (const p of r.allPlayers) {
      ownerByPlayerId.set(p.playerId, r.rosterId);
    }
  }
  const ownerByPickId = new Map<string, number>();
  for (const pk of allPicks) {
    ownerByPickId.set(pk.id, pk.currentOwnerRosterId);
  }

  for (let i = 0; i < proposal.participants.length && i < count; i++) {
    const part = proposal.participants[i];
    const otherDefaultId = proposal.participants[(i + 1) % count].rosterId;

    for (const inPid of part.incomingPlayerIds ?? []) {
      const explicitSender = proposal.participants.find(
        (other) =>
          other.rosterId !== part.rosterId && (other.outgoingPlayerIds ?? []).includes(inPid)
      )?.rosterId;
      const fromRosterId =
        explicitSender ??
        (pIds.includes(ownerByPlayerId.get(inPid) ?? -1) &&
        ownerByPlayerId.get(inPid) !== part.rosterId
          ? ownerByPlayerId.get(inPid)!
          : otherDefaultId);
      if (!nextPlayers.some((x) => x.playerId === inPid && x.toRosterId === part.rosterId)) {
        nextPlayers.push({
          playerId: inPid,
          fromRosterId,
          toRosterId: part.rosterId,
        });
      }
    }

    for (const inPickId of part.incomingPickIds ?? []) {
      const explicitSender = proposal.participants.find(
        (other) =>
          other.rosterId !== part.rosterId && (other.outgoingPickIds ?? []).includes(inPickId)
      )?.rosterId;
      const fromRosterId =
        explicitSender ??
        (pIds.includes(ownerByPickId.get(inPickId) ?? -1) &&
        ownerByPickId.get(inPickId) !== part.rosterId
          ? ownerByPickId.get(inPickId)!
          : otherDefaultId);
      if (!nextPicks.some((x) => x.pickId === inPickId && x.toRosterId === part.rosterId)) {
        nextPicks.push({
          pickId: inPickId,
          fromRosterId,
          toRosterId: part.rosterId,
        });
      }
    }
  }

  for (let i = 0; i < proposal.participants.length && i < count; i++) {
    const part = proposal.participants[i];
    const otherDefaultId = proposal.participants[(i + 1) % count].rosterId;
    for (const outPid of part.outgoingPlayerIds ?? []) {
      if (!nextPlayers.some((x) => x.playerId === outPid)) {
        nextPlayers.push({
          playerId: outPid,
          fromRosterId: part.rosterId,
          toRosterId: otherDefaultId,
        });
      }
    }
    for (const outPickId of part.outgoingPickIds ?? []) {
      if (!nextPicks.some((x) => x.pickId === outPickId)) {
        nextPicks.push({
          pickId: outPickId,
          fromRosterId: part.rosterId,
          toRosterId: otherDefaultId,
        });
      }
    }
  }

  return {
    teamCount: count,
    selectedRosterIds: count === 3 ? pIds : [pIds[0], pIds[1], fallbackThird],
    directedPlayers: nextPlayers,
    directedPicks: nextPicks,
    pickTierOverrides: proposal.pickTierOverrides ?? {},
  };
}

export function DynastyTradeBuilder({
  externalProposal,
  onExternalProposalConsumed,
}: {
  externalProposal?: TradeProposal | null;
  onExternalProposalConsumed?: () => void;
} = {}) {
  const { engine, snapshot, activeRosterId } = useMbaLeague();

  const pickMatrix = useMemo(
    () => engine.getDraftPickMatrix(snapshot),
    [engine, snapshot]
  );

  const initialBuilderState = useMemo(() => {
    if (externalProposal) {
      return deriveBuilderStateFromProposal(externalProposal, snapshot.rosters, pickMatrix.allPicks);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [teamCount, setTeamCount] = useState<2 | 3>(initialBuilderState?.teamCount ?? 2);
  const [selectedRosterIds, setSelectedRosterIds] = useState<number[]>(() => {
    if (initialBuilderState) return initialBuilderState.selectedRosterIds;
    const first = activeRosterId || 1;
    const second = first === 10 ? 1 : 10;
    return [first, second, 4];
  });

  // Default seeded trade so the Grade Card is immediately interactive on first visit
  const [directedPlayers, setDirectedPlayers] = useState<DirectedPlayerAsset[]>(
    initialBuilderState?.directedPlayers ?? [
      { playerId: '1883', fromRosterId: 1, toRosterId: 10 }, // Alperen Sengun
      { playerId: 'r10_p5', fromRosterId: 10, toRosterId: 1 }, // Giannis Antetokounmpo
    ]
  );
  const [directedPicks, setDirectedPicks] = useState<DirectedPickAsset[]>(
    initialBuilderState?.directedPicks ?? [
      { pickId: '2027-r1-orig-6', fromRosterId: 1, toRosterId: 10 },
      { pickId: '2028-r1-orig-10', fromRosterId: 1, toRosterId: 10 },
    ]
  );
  const [pickTierOverrides, setPickTierOverrides] = useState<Record<string, ProjectedPickTier>>(
    initialBuilderState?.pickTierOverrides ?? {}
  );

  // Search/filter state per Roster panel
  const [playerSearchByRoster, setPlayerSearchByRoster] = useState<Record<number, string>>({});
  const [posFilterByRoster, setPosFilterByRoster] = useState<Record<number, string>>({});

  // Quick Trade Text Parser modal/drawer state
  const [isParserOpen, setIsParserOpen] = useState(false);
  const [parserText, setParserText] = useState(SAMPLE_PASTED_TRADES[0].text);
  const [parserStatus, setParserStatus] = useState<string | null>(null);

  // Shareable URL state
  const [copiedLink, setCopiedLink] = useState(false);

  const activeParticipantIds = useMemo(
    () => selectedRosterIds.slice(0, teamCount),
    [selectedRosterIds, teamCount]
  );

  // Apply a structured TradeProposal into builder state
  const applyProposalToState = useCallback(
    (proposal: TradeProposal) => {
      const derived = deriveBuilderStateFromProposal(proposal, snapshot.rosters, pickMatrix.allPicks);
      if (!derived) return;
      setTeamCount(derived.teamCount);
      setSelectedRosterIds(derived.selectedRosterIds);
      setDirectedPlayers(derived.directedPlayers);
      setDirectedPicks(derived.directedPicks);
      setPickTierOverrides(derived.pickTierOverrides);
    },
    [pickMatrix.allPicks, snapshot.rosters]
  );

  // Reconstruct trade state from URL query parameter ?trade=... on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tradeParam = params.get('trade');
    if (tradeParam) {
      const decoded = engine.decodeTradeUrlParam(tradeParam);
      if (decoded) {
        applyProposalToState(decoded);
      }
    }
  }, [applyProposalToState, engine]);

  // Apply external proposal when loaded from Completed League Trade Grader
  useEffect(() => {
    if (!externalProposal) return;
    applyProposalToState(externalProposal);
    setParserStatus('Loaded Historical MBA Trade into Trade Builder');
    onExternalProposalConsumed?.();
  }, [externalProposal, applyProposalToState, onExternalProposalConsumed]);

  // Build active TradeProposal from current state
  const currentProposal: TradeProposal = useMemo(() => {
    const participants = activeParticipantIds.map((rId) => {
      const outgoingPlayerIds = directedPlayers
        .filter((p) => p.fromRosterId === rId && activeParticipantIds.includes(p.toRosterId))
        .map((p) => p.playerId);
      const incomingPlayerIds = directedPlayers
        .filter((p) => p.toRosterId === rId && activeParticipantIds.includes(p.fromRosterId))
        .map((p) => p.playerId);
      const outgoingPickIds = directedPicks
        .filter((p) => p.fromRosterId === rId && activeParticipantIds.includes(p.toRosterId))
        .map((p) => p.pickId);
      const incomingPickIds = directedPicks
        .filter((p) => p.toRosterId === rId && activeParticipantIds.includes(p.fromRosterId))
        .map((p) => p.pickId);

      return {
        rosterId: rId,
        outgoingPlayerIds,
        incomingPlayerIds,
        outgoingPickIds,
        incomingPickIds,
      };
    });

    return {
      participants,
      pickTierOverrides,
    };
  }, [activeParticipantIds, directedPlayers, directedPicks, pickTierOverrides]);

  const evaluation = useMemo(
    () => engine.evaluateTrade(currentProposal, snapshot),
    [engine, currentProposal, snapshot]
  );

  const handleRosterSelectChange = (slotIdx: number, newRosterId: number) => {
    setSelectedRosterIds((prev) => {
      const next = [...prev];
      const oldRosterId = next[slotIdx];
      next[slotIdx] = newRosterId;

      // Re-point any directed assets from/to oldRosterId to newRosterId
      setDirectedPlayers((dp) =>
        dp
          .filter((item) => item.fromRosterId !== oldRosterId)
          .map((item) =>
            item.toRosterId === oldRosterId ? { ...item, toRosterId: newRosterId } : item
          )
      );
      setDirectedPicks((dk) =>
        dk
          .filter((item) => item.fromRosterId !== oldRosterId)
          .map((item) =>
            item.toRosterId === oldRosterId ? { ...item, toRosterId: newRosterId } : item
          )
      );

      return next;
    });
  };

  const handleAddPlayer = (player: RosterPlayerSlot, fromRosterId: number, toRosterId?: number) => {
    const defaultReceiver =
      toRosterId ??
      activeParticipantIds.find((id) => id !== fromRosterId) ??
      activeParticipantIds[0];

    setDirectedPlayers((prev) => {
      if (prev.some((p) => p.playerId === player.playerId)) return prev;
      return [...prev, { playerId: player.playerId, fromRosterId, toRosterId: defaultReceiver }];
    });
  };

  const handleRemovePlayer = (playerId: string) => {
    setDirectedPlayers((prev) => prev.filter((p) => p.playerId !== playerId));
  };

  const handleChangePlayerDestination = (playerId: string, toRosterId: number) => {
    setDirectedPlayers((prev) =>
      prev.map((p) => (p.playerId === playerId ? { ...p, toRosterId } : p))
    );
  };

  const handleAddPick = (pick: DraftPickAsset, fromRosterId: number, toRosterId?: number) => {
    const defaultReceiver =
      toRosterId ??
      activeParticipantIds.find((id) => id !== fromRosterId) ??
      activeParticipantIds[0];

    setDirectedPicks((prev) => {
      if (prev.some((p) => p.pickId === pick.id)) return prev;
      return [...prev, { pickId: pick.id, fromRosterId, toRosterId: defaultReceiver }];
    });
  };

  const handleRemovePick = (pickId: string) => {
    setDirectedPicks((prev) => prev.filter((p) => p.pickId !== pickId));
  };

  const handleChangePickDestination = (pickId: string, toRosterId: number) => {
    setDirectedPicks((prev) =>
      prev.map((p) => (p.pickId === pickId ? { ...p, toRosterId } : p))
    );
  };

  const handleSetPickTierOverride = (pickId: string, tier: ProjectedPickTier | null) => {
    engine.setPickTierOverride(pickId, tier);
    setPickTierOverrides((prev) => {
      const next = { ...prev };
      if (tier === null) {
        delete next[pickId];
      } else {
        next[pickId] = tier;
      }
      return next;
    });
  };

  const handleParseTradeText = () => {
    if (!parserText.trim()) return;
    const result = engine.parseTradeText(parserText, snapshot);
    applyProposalToState(result.proposal);
    const matchedSummary = result.matchedRosters.map((r) => r.rosterName).join(' ↔ ');
    setParserStatus(`Populated Trade Builder: ${matchedSummary}`);
    setIsParserOpen(false);
  };

  const handleShareTradeLink = async () => {
    if (typeof window === 'undefined') return;
    const encoded = engine.encodeTradeUrlParam(currentProposal);
    const url = new URL(window.location.href);
    url.searchParams.set('trade', encoded);
    window.history.replaceState({}, '', url.toString());

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.toString());
      }
    } catch {
      // Fallback: URL bar is already updated with ?trade=...
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleClearTrade = () => {
    setDirectedPlayers([]);
    setDirectedPicks([]);
    setPickTierOverrides({});
    setParserStatus(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('trade');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const totalAssetsInTrade = directedPlayers.length + directedPicks.length;

  return (
    <div className="space-y-6">
      {/* Builder Action Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-800 bg-slate-950 p-1 text-xs">
            <button
              type="button"
              data-testid="trade-mode-2team"
              onClick={() => setTeamCount(2)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 font-bold transition ${
                teamCount === 2
                  ? 'bg-orange-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              2-Team Trade
            </button>
            <button
              type="button"
              data-testid="trade-mode-3team"
              onClick={() => setTeamCount(3)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 font-bold transition ${
                teamCount === 3
                  ? 'bg-orange-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              3-Team Trade
            </button>
          </div>

          <button
            type="button"
            data-testid="open-quick-trade-parser-btn"
            onClick={() => setIsParserOpen((v) => !v)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/15 px-3.5 py-2 text-xs font-bold text-orange-300 transition hover:bg-orange-500/25"
          >
            <ClipboardPaste className="h-4 w-4" />
            <span>Quick Trade Text Parser</span>
          </button>

          {parserStatus && (
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
              {parserStatus}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="share-trade-link-btn"
            onClick={handleShareTradeLink}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3.5 py-2 text-xs font-bold text-sky-200 transition hover:bg-sky-500/25"
          >
            {copiedLink ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-300">Share Trade Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" />
                <span>Share Trade Link</span>
              </>
            )}
          </button>

          <button
            type="button"
            data-testid="reset-trade-btn"
            onClick={handleClearTrade}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Clear Trade</span>
          </button>
        </div>
      </div>

      {/* Quick Trade Text Parser Drawer / Panel */}
      {isParserOpen && (
        <section
          aria-label="Quick Trade Text Parser"
          className="rounded-2xl border border-orange-500/40 bg-slate-900/95 p-5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-extrabold text-white">
                <ClipboardPaste className="h-4 w-4 text-orange-400" />
                <span>Quick Trade Text Parser</span>
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Paste any freeform Sleeper DM, Discord message, or trade summary to resolve MBA Rosters, players, and 2026–2029 Draft Pick Assets automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsParserOpen(false)}
              className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Sample Presets:
            </span>
            {SAMPLE_PASTED_TRADES.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setParserText(preset.text)}
                className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-orange-500/50 hover:text-orange-300"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <textarea
              data-testid="quick-trade-parser-textarea"
              rows={3}
              value={parserText}
              onChange={(e) => setParserText(e.target.value)}
              placeholder='e.g. "Reefer Chiefers receives Giannis Antetokounmpo, 2028 1st; Ashley ketchcum receives Alperen Sengun, 2027 1st, 2027 2nd"'
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-100 outline-none focus:border-orange-500"
            />
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              data-testid="parse-trade-submit-btn"
              onClick={handleParseTradeText}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-extrabold text-slate-950 transition hover:bg-orange-400"
            >
              <Sparkles className="h-4 w-4" />
              <span>Parse & Populate Trade Builder</span>
            </button>
          </div>
        </section>
      )}

      {/* Fairness Meter & Executive Trade Summary Banner */}
      {totalAssetsInTrade > 0 &&
        (evaluation.isSettlementTransfer ? (
          <section
            aria-label="Incomplete Trade Proposal Prompt"
            data-testid="incomplete-proposal-banner"
            className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-5 shadow-xl"
          >
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Mid-Build Proposal
                    </span>
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-amber-200 ring-1 ring-amber-500/30">
                      Not Yet Graded (N/A)
                    </span>
                  </div>
                  <h2 className="mt-1 text-lg font-extrabold text-white">
                    {evaluation.summaryHeadline}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Every participating Roster needs at least one incoming and one outgoing asset before Dual-Axis Trade Grades and Fairness scoring are computed.
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section
            aria-label="Trade Fairness Meter & Dual-Axis Summary"
            data-testid="trade-fairness-banner"
            className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-5 shadow-xl"
          >
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-orange-300">
                      ADR-0002 Dual-Axis Verdict
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                        evaluation.fairnessLabel === 'Balanced Trade'
                          ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                          : evaluation.fairnessLabel === 'Slight Edge'
                            ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40'
                            : evaluation.fairnessLabel === 'Lopsided Trade'
                              ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                              : 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40'
                      }`}
                    >
                      {evaluation.fairnessLabel} ({evaluation.fairnessScore}/100 Fairness)
                    </span>
                  </div>
                  <h2 className="mt-1 text-lg font-extrabold text-white">
                    {evaluation.summaryHeadline}
                  </h2>
                </div>
              </div>

              {/* Visual Fairness Gauge */}
              <div className="w-full max-w-sm space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-400">Fairness Index</span>
                  <span className="font-mono font-bold text-white">
                    {evaluation.fairnessScore}% • Net Spread {evaluation.netAdjustedSpread.toFixed(1)} pts
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      evaluation.fairnessScore >= 85
                        ? 'bg-emerald-500'
                        : evaluation.fairnessScore >= 68
                          ? 'bg-sky-500'
                          : evaluation.fairnessScore >= 45
                            ? 'bg-amber-400'
                            : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.max(8, evaluation.fairnessScore)}%` }}
                  />
                </div>
              </div>
            </div>
          </section>
        ))}

      {/* Dual-Axis Grade Cards for Each Participating Roster */}
      <section
        aria-label="Participating Roster Trade Grade Cards"
        className={`grid grid-cols-1 gap-5 ${
          teamCount === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
        }`}
      >
        {evaluation.participants.map((part: TradeParticipantEvaluation, idx: number) => {
          const otherParticipants = activeParticipantIds
            .filter((id) => id !== part.rosterId)
            .map((id) => snapshot.rosters.find((r) => r.rosterId === id))
            .filter(Boolean);

          return (
            <div
              key={part.rosterId}
              data-testid={`trade-grade-card-${part.rosterId}`}
              className={`flex flex-col justify-between rounded-2xl border p-5 shadow-xl transition ${
                part.isWinner
                  ? 'border-emerald-500/40 bg-slate-900/90'
                  : 'border-slate-800 bg-slate-900/75'
              }`}
            >
              <div className="space-y-4">
                {/* Roster Selector & Grade Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Roster Side {String.fromCharCode(65 + idx)}
                      </span>
                      {part.isWinner && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300 ring-1 ring-emerald-500/40">
                          <Trophy className="h-3 w-3" />
                          TRADE WINNER
                        </span>
                      )}
                    </div>

                    <select
                      aria-label={`Select Roster Side ${String.fromCharCode(65 + idx)}`}
                      data-testid={`roster-select-side-${idx}`}
                      value={part.rosterId}
                      onChange={(e) =>
                        handleRosterSelectChange(idx, Number.parseInt(e.target.value, 10))
                      }
                      className="mt-1.5 w-full cursor-pointer rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-extrabold text-white outline-none focus:border-orange-500"
                    >
                      {snapshot.rosters.map((r) => (
                        <option
                          key={r.rosterId}
                          value={r.rosterId}
                          disabled={
                            activeParticipantIds.includes(r.rosterId) &&
                            r.rosterId !== part.rosterId
                          }
                        >
                          Roster #{r.rosterId} — {r.manager.rosterName} (@{r.manager.displayName})
                        </option>
                      ))}
                    </select>
                  </div>

                  <GradeBadge grade={part.letterGrade} />
                </div>

                {/* Dual-Axis Metrics Strip */}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Adj. Dynasty Δ
                    </div>
                    <div
                      data-testid={`adjusted-dynasty-delta-${part.rosterId}`}
                      className={`mt-0.5 font-mono text-base font-black ${
                        part.adjustedDynastyDelta > 0
                          ? 'text-emerald-400'
                          : part.adjustedDynastyDelta < 0
                            ? 'text-rose-400'
                            : 'text-slate-200'
                      }`}
                    >
                      {part.adjustedDynastyDelta > 0 ? '+' : ''}
                      {part.adjustedDynastyDelta.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Raw: {part.rawDynastyDelta > 0 ? '+' : ''}
                      {part.rawDynastyDelta.toFixed(1)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Starting 10 Δ Avg Lock-In
                    </div>
                    <div
                      data-testid={`starting10-delta-${part.rosterId}`}
                      className={`mt-0.5 flex items-center gap-1 font-mono text-base font-black ${
                        part.starting10DeltaAvgLockIn > 0
                          ? 'text-emerald-400'
                          : part.starting10DeltaAvgLockIn < 0
                            ? 'text-rose-400'
                            : 'text-slate-200'
                      }`}
                    >
                      {part.starting10DeltaAvgLockIn > 0 ? (
                        <TrendingUp className="h-3.5 w-3.5" />
                      ) : part.starting10DeltaAvgLockIn < 0 ? (
                        <TrendingDown className="h-3.5 w-3.5" />
                      ) : null}
                      <span>
                        {part.starting10DeltaAvgLockIn > 0 ? '+' : ''}
                        {part.starting10DeltaAvgLockIn.toFixed(1)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {part.preTradeOptimalStarterAvgLockIn.toFixed(1)} →{' '}
                      {part.postTradeOptimalStarterAvgLockIn.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      FP/G Δ: {part.starting10DeltaFppg > 0 ? '+' : ''}
                      {part.starting10DeltaFppg.toFixed(1)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Avg Age Shift
                    </div>
                    <div className="mt-0.5 font-mono text-base font-extrabold text-sky-300">
                      {part.averageAgeDelta > 0 ? '+' : ''}
                      {part.averageAgeDelta.toFixed(1)}y
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {part.preTradeAverageAge.toFixed(1)} → {part.postTradeAverageAge.toFixed(1)} yrs
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      2-Center Depth
                    </div>
                    <div className="mt-0.5 font-mono text-base font-extrabold text-indigo-300">
                      {part.centerDepthDelta > 0 ? '+' : ''}
                      {part.centerDepthDelta} C
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {part.preTradeCenterCount} → {part.postTradeCenterCount} Centers
                    </div>
                  </div>
                </div>

                {/* Incoming Package Box */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                      Receives Package ({part.incomingPlayers.length + part.incomingPicks.length} Assets)
                    </span>
                    <span className="font-mono text-xs font-bold text-white">
                      Adj. {part.adjustedIncomingDynastyValue.toFixed(1)} pts
                    </span>
                  </div>

                  {part.incomingPlayers.length === 0 && part.incomingPicks.length === 0 ? (
                    <div className="mt-2 rounded-lg border border-dashed border-slate-800 p-3 text-center text-xs text-slate-500">
                      Add players or 2026–2029 Draft Pick Assets from another Roster below
                    </div>
                  ) : (
                    <div className="mt-2.5 space-y-2">
                      {part.incomingPlayers.map((p) => (
                        <div
                          key={p.playerId}
                          className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs"
                        >
                          <div>
                            <div className="font-bold text-white">{p.fullName}</div>
                            <div className="text-[11px] text-slate-400">
                              {p.positions.join('/')} • Age {p.age ?? '—'} • {p.avgLockIn.toFixed(1)} Avg LI • {p.fpg.toFixed(1)} FP/G • from Roster #{p.fromRosterId}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="rounded bg-orange-500/15 px-2 py-0.5 font-mono text-xs font-bold text-orange-300">
                                {p.dynastyValue.toFixed(1)}
                              </span>
                              <DynastyValueEstBadge
                                source={p.dynastyValueSource}
                                basisNote={p.dynastyValueBasisNote}
                              />
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove ${p.fullName}`}
                              onClick={() => handleRemovePlayer(p.playerId)}
                              className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {part.incomingPicks.map((pk) => (
                        <div
                          key={pk.pickId}
                          data-testid={`traded-pick-card-${pk.pickId}`}
                          className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="font-bold text-purple-200">{pk.displayLabel}</div>
                              <div className="text-[11px] text-slate-400">
                                Orig: {pk.originalRosterName} (Slot {pk.round}.
                                {String(pk.projectedSlot).padStart(2, '0')})
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                data-testid={`traded-pick-value-${pk.pickId}`}
                                className="rounded bg-purple-500/20 px-2 py-0.5 font-mono text-xs font-bold text-purple-200"
                              >
                                {pk.dynastyValue.toFixed(1)}
                              </span>
                              <button
                                type="button"
                                aria-label={`Remove ${pk.displayLabel}`}
                                onClick={() => handleRemovePick(pk.pickId)}
                                className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-rose-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Manual Projected Pick Tier Override Controls */}
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Projected Pick Tier Override:
                            </span>
                            <div className="flex items-center gap-1">
                              {(['Early', 'Mid', 'Late'] as const).map((tier) => {
                                const isActive = pk.projectedTier === tier;
                                return (
                                  <button
                                    key={tier}
                                    type="button"
                                    data-testid={`pick-tier-override-${pk.pickId}-${tier}`}
                                    onClick={() => handleSetPickTierOverride(pk.pickId, tier)}
                                    className={`cursor-pointer rounded px-2 py-0.5 font-mono text-[10px] font-bold transition ${
                                      isActive
                                        ? 'bg-orange-500 text-slate-950'
                                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                    }`}
                                  >
                                    {tier}
                                  </button>
                                );
                              })}
                              {pk.hasManualTierOverride && (
                                <button
                                  type="button"
                                  onClick={() => handleSetPickTierOverride(pk.pickId, null)}
                                  className="cursor-pointer rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white"
                                >
                                  Auto
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Consolidation Premium & Replacement Cut Asset Callouts */}
                  {(part.consolidationPremium > 0 || part.replacementCutAssets.length > 0) && (
                    <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-2.5 text-xs">
                      {part.consolidationPremium > 0 && (
                        <div
                          data-testid={`consolidation-premium-${part.rosterId}`}
                          className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-emerald-300"
                        >
                          <span className="flex items-center gap-1.5 font-semibold">
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Consolidation Premium (Elite Cornerstone)</span>
                          </span>
                          <span className="font-mono font-bold">
                            +{part.consolidationPremium.toFixed(1)}
                          </span>
                        </div>
                      )}

                      {part.replacementCutAssets.length > 0 && (() => {
                        const cutAdjustment = describeReplacementCutAdjustment({
                          replacementCutAssets: part.replacementCutAssets,
                          replacementCutPenalty: part.replacementCutPenalty,
                          outgoingPicksCount: part.outgoingPicks.length,
                          incomingPicksCount: part.incomingPicks.length,
                        });
                        const hasStarterFallback = part.replacementCutAssets.some(
                          (c) => c.slotLabel !== 'BN'
                        );
                        return (
                          <div
                            data-testid={`replacement-cut-callout-${part.rosterId}`}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-rose-200"
                          >
                            <div className="flex items-center justify-between font-semibold">
                              <span className="flex items-center gap-1.5">
                                <Scissors className="h-3.5 w-3.5 text-rose-400" />
                                <span>
                                  Replacement Cut Asset Penalty ({part.replacementCutAssets.length}{' '}
                                  {hasStarterFallback ? 'Roster' : 'Bench'} Drop
                                  {part.replacementCutAssets.length > 1 ? 's' : ''})
                                </span>
                              </span>
                              <span className="font-mono font-bold text-rose-300">
                                -{part.replacementCutPenalty.toFixed(1)}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-rose-300/90">
                              Must displace lowest-value {hasStarterFallback ? 'BN/Starter' : 'BN'}:{' '}
                              {part.replacementCutAssets
                                .map((c) => `${c.fullName} (${c.dynastyValue.toFixed(1)})`)
                                .join(', ')}
                            </div>
                            {cutAdjustment.isReduced && (
                              <div className="mt-1 text-[11px] text-amber-200/90">
                                Gross {cutAdjustment.rawCutSum.toFixed(1)} DV reduced to -
                                {part.replacementCutPenalty.toFixed(1)} via{' '}
                                {cutAdjustment.reasons.join(' & ')}.
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Plain-English Bullet Takeaways */}
                <div className="space-y-1.5 rounded-xl border border-slate-800/90 bg-slate-950/50 p-3.5">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                    Trade Takeaways
                  </div>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {part.takeaways.map((bullet, bIdx) => (
                      <li key={bIdx} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Outgoing Asset Selector (Players & Owned 2026–2029 Draft Pick Assets) */}
                <RosterAssetPicker
                  rosterId={part.rosterId}
                  teamCount={teamCount}
                  otherParticipants={otherParticipants.map((r) => ({
                    rosterId: r!.rosterId,
                    rosterName: r!.manager.rosterName,
                  }))}
                  directedPlayers={directedPlayers}
                  directedPicks={directedPicks}
                  searchQuery={playerSearchByRoster[part.rosterId] ?? ''}
                  posFilter={posFilterByRoster[part.rosterId] ?? 'ALL'}
                  onSearchChange={(q) =>
                    setPlayerSearchByRoster((prev) => ({ ...prev, [part.rosterId]: q }))
                  }
                  onPosFilterChange={(pos) =>
                    setPosFilterByRoster((prev) => ({ ...prev, [part.rosterId]: pos }))
                  }
                  onAddPlayer={handleAddPlayer}
                  onRemovePlayer={handleRemovePlayer}
                  onChangePlayerDestination={handleChangePlayerDestination}
                  onAddPick={handleAddPick}
                  onRemovePick={handleRemovePick}
                  onChangePickDestination={handleChangePickDestination}
                />
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function RosterAssetPicker({
  rosterId,
  teamCount,
  otherParticipants,
  directedPlayers,
  directedPicks,
  searchQuery,
  posFilter,
  onSearchChange,
  onPosFilterChange,
  onAddPlayer,
  onRemovePlayer,
  onChangePlayerDestination,
  onAddPick,
  onRemovePick,
  onChangePickDestination,
}: {
  rosterId: number;
  teamCount: 2 | 3;
  otherParticipants: Array<{ rosterId: number; rosterName: string }>;
  directedPlayers: DirectedPlayerAsset[];
  directedPicks: DirectedPickAsset[];
  searchQuery: string;
  posFilter: string;
  onSearchChange: (q: string) => void;
  onPosFilterChange: (pos: string) => void;
  onAddPlayer: (player: RosterPlayerSlot, fromRosterId: number, toRosterId?: number) => void;
  onRemovePlayer: (playerId: string) => void;
  onChangePlayerDestination: (playerId: string, toRosterId: number) => void;
  onAddPick: (pick: DraftPickAsset, fromRosterId: number, toRosterId?: number) => void;
  onRemovePick: (pickId: string) => void;
  onChangePickDestination: (pickId: string, toRosterId: number) => void;
}) {
  const { engine, snapshot } = useMbaLeague();
  const [subTab, setSubTab] = useState<'PLAYERS' | 'PICKS'>('PLAYERS');

  const roster = useMemo(
    () => snapshot.rosters.find((r) => r.rosterId === rosterId) ?? snapshot.rosters[0],
    [snapshot.rosters, rosterId]
  );

  const pickMatrix = useMemo(
    () => engine.getDraftPickMatrix(snapshot),
    [engine, snapshot]
  );

  const ownedPicks = useMemo(() => {
    const row = pickMatrix.rows.find((r) => r.rosterId === rosterId);
    return row ? row.allOwnedPicks : [];
  }, [pickMatrix.rows, rosterId]);

  const filteredPlayers = useMemo(() => {
    return [...roster.allPlayers]
      .filter((p) => {
        if (posFilter !== 'ALL' && !p.positions.includes(posFilter)) return false;
        if (
          searchQuery.trim() &&
          !p.fullName.toLowerCase().includes(searchQuery.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.dynastyValue - a.dynastyValue);
  }, [roster.allPlayers, posFilter, searchQuery]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1 text-xs">
          <button
            type="button"
            data-testid={`asset-tab-players-${rosterId}`}
            onClick={() => setSubTab('PLAYERS')}
            className={`cursor-pointer rounded-md px-2.5 py-1 font-bold transition ${
              subTab === 'PLAYERS'
                ? 'bg-orange-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Send Players ({roster.allPlayers.length})
          </button>
          <button
            type="button"
            data-testid={`asset-tab-picks-${rosterId}`}
            onClick={() => setSubTab('PICKS')}
            className={`cursor-pointer rounded-md px-2.5 py-1 font-bold transition ${
              subTab === 'PICKS'
                ? 'bg-orange-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Send 2026–2029 Picks ({ownedPicks.length})
          </button>
        </div>

        {subTab === 'PLAYERS' && (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter player..."
              className="w-28 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-orange-500 sm:w-36"
            />
            <select
              aria-label={`Filter positions for Roster ${rosterId}`}
              value={posFilter}
              onChange={(e) => onPosFilterChange(e.target.value)}
              className="cursor-pointer rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none"
            >
              <option value="ALL">All Pos</option>
              <option value="PG">PG</option>
              <option value="SG">SG</option>
              <option value="SF">SF</option>
              <option value="PF">PF</option>
              <option value="C">C (2x)</option>
            </select>
          </div>
        )}
      </div>

      {subTab === 'PLAYERS' ? (
        <div className="mt-3 max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {filteredPlayers.map((player) => {
            const existing = directedPlayers.find((d) => d.playerId === player.playerId);
            const isSent = Boolean(existing);

            return (
              <div
                key={player.playerId}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                  isSent
                    ? 'border-orange-500/40 bg-orange-500/10'
                    : 'border-slate-800/80 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-300">
                      {player.slotLabel}
                    </span>
                    <span className="truncate font-bold text-white">{player.fullName}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {player.positions.join('/')} • Age {player.age ?? '—'} •{' '}
                    {player.seasonMetrics.averageLockInPoints.toFixed(1)} Avg LI •{' '}
                    {player.seasonMetrics.mbaFantasyPointsPerGame.toFixed(1)} FP/G
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-mono text-xs font-extrabold text-orange-300">
                      {player.dynastyValue.toFixed(1)}
                    </span>
                    <DynastyValueEstBadge
                      source={player.dynastyValueSource}
                      basisNote={player.dynastyValueBasisNote}
                    />
                  </span>

                  {isSent && teamCount === 3 && otherParticipants.length > 1 && (
                    <select
                      aria-label={`Destination roster for ${player.fullName}`}
                      value={existing!.toRosterId}
                      onChange={(e) =>
                        onChangePlayerDestination(
                          player.playerId,
                          Number.parseInt(e.target.value, 10)
                        )
                      }
                      className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold text-orange-200"
                    >
                      {otherParticipants.map((op) => (
                        <option key={op.rosterId} value={op.rosterId}>
                          → #{op.rosterId}
                        </option>
                      ))}
                    </select>
                  )}

                  {isSent ? (
                    <button
                      type="button"
                      data-testid={`remove-player-btn-${player.playerId}`}
                      onClick={() => onRemovePlayer(player.playerId)}
                      className="cursor-pointer rounded-lg bg-rose-500/20 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/30"
                    >
                      Sent
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid={`add-player-btn-${player.playerId}`}
                      onClick={() => onAddPlayer(player, rosterId)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-200 hover:bg-orange-500 hover:text-slate-950"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Trade</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {ownedPicks.map((pick) => {
            const existing = directedPicks.find((d) => d.pickId === pick.id);
            const isSent = Boolean(existing);

            return (
              <div
                key={pick.id}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                  isSent
                    ? 'border-purple-500/40 bg-purple-500/15'
                    : 'border-slate-800/80 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white">{pick.displayLabel}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                      {pick.projectedTier} ({pick.round}.{String(pick.projectedSlot).padStart(2, '0')})
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    Orig: Roster #{pick.originalRosterId} ({pick.originalRosterName})
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xs font-extrabold text-purple-300">
                    {pick.dynastyValue.toFixed(1)}
                  </span>

                  {isSent && teamCount === 3 && otherParticipants.length > 1 && (
                    <select
                      aria-label={`Destination roster for ${pick.displayLabel}`}
                      value={existing!.toRosterId}
                      onChange={(e) =>
                        onChangePickDestination(pick.id, Number.parseInt(e.target.value, 10))
                      }
                      className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold text-purple-200"
                    >
                      {otherParticipants.map((op) => (
                        <option key={op.rosterId} value={op.rosterId}>
                          → #{op.rosterId}
                        </option>
                      ))}
                    </select>
                  )}

                  {isSent ? (
                    <button
                      type="button"
                      data-testid={`remove-pick-btn-${pick.id}`}
                      onClick={() => onRemovePick(pick.id)}
                      className="cursor-pointer rounded-lg bg-rose-500/20 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/30"
                    >
                      Sent
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid={`add-pick-btn-${pick.id}`}
                      onClick={() => onAddPick(pick, rosterId)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-200 hover:bg-orange-500 hover:text-slate-950"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Trade</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
