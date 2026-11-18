import {
  LineupMutationAdapter,
  StageLineupPayload,
  StagedLineupChecklist,
} from '../types/mba';

export class ChecklistLineupAdapter implements LineupMutationAdapter {
  stageLineupChanges(payload: StageLineupPayload): StagedLineupChecklist {
    const steps: StagedLineupChecklist['steps'] = [];

    payload.slotSwaps.forEach((swap, index) => {
      steps.push({
        id: `swap-${index}-${swap.playerInId}`,
        type: 'SWAP',
        title: `Move ${swap.playerInName} from ${swap.fromSlot} to ${swap.toSlot}`,
        detail: swap.playerOutName
          ? `Replaces ${swap.playerOutName} (${swap.reason})`
          : swap.reason,
      });
    });

    payload.lockActions.forEach((lock, index) => {
      steps.push({
        id: `lock-${index}-${lock.playerId}`,
        type: 'LOCK',
        title: `Lock ${lock.playerName} (${lock.gameScore.toFixed(1)} MBA FP)`,
        detail: `${lock.recommendation}${lock.opponent ? ` vs ${lock.opponent}` : ''}`,
      });
    });

    return {
      leagueId: payload.leagueId,
      rosterId: payload.rosterId,
      week: payload.week,
      sleeperDeepLink: `https://sleeper.com/leagues/${payload.leagueId}/team`,
      steps,
    };
  }
}
