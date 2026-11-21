import {
  LineupMutationAdapter,
  StageLineupPayload,
  StagedLineupChecklist,
} from '../types/mba';

export class ChecklistLineupAdapter implements LineupMutationAdapter {
  public readonly mode = 'CHECKLIST' as const;

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
        detail: `${lock.recommendation}${lock.opponent ? ` vs ${lock.opponent}` : ''}${lock.date ? ` (${lock.date})` : ''}`,
      });
    });

    if (payload.irMoves && payload.irMoves.length > 0) {
      payload.irMoves.forEach((move, index) => {
        steps.push({
          id: `ir-${index}-${move.playerInId}`,
          type: 'IR',
          title: `Move ${move.playerInName} from ${move.fromSlot} to ${move.toSlot}`,
          detail: move.playerOutName
            ? `Swaps with ${move.playerOutName} (${move.reason})`
            : move.reason,
        });
      });
    }

    return {
      leagueId: payload.leagueId,
      rosterId: payload.rosterId,
      week: payload.week,
      sleeperDeepLink: `https://sleeper.com/leagues/${payload.leagueId}/team`,
      steps,
    };
  }
}

export interface SleeperGraphQLWriteConfig {
  authToken?: string;
  endpoint?: string;
}

export class SleeperGraphQLNotConfiguredError extends Error {
  public readonly code = 'NOT_CONFIGURED' as const;
  public readonly mode = 'SLEEPER_GRAPHQL' as const;

  constructor(
    message = 'SleeperGraphQLWriteAdapter requires Sleeper GraphQL credentials (authToken) for v2 direct lineup/lock mutations.'
  ) {
    super(message);
    this.name = 'SleeperGraphQLNotConfiguredError';
  }
}

/**
 * v2 scaffold implementing LineupMutationAdapter for direct Sleeper GraphQL write mutations.
 * In v1, Sleeper's public REST API is read-only and ChecklistLineupAdapter is used by default;
 * calling this adapter without credentials throws SleeperGraphQLNotConfiguredError ('NOT_CONFIGURED').
 */
export class SleeperGraphQLWriteAdapter implements LineupMutationAdapter {
  public readonly mode = 'SLEEPER_GRAPHQL' as const;
  private readonly config: SleeperGraphQLWriteConfig;

  constructor(config: SleeperGraphQLWriteConfig = {}) {
    this.config = config;
  }

  public isConfigured(): boolean {
    return Boolean(this.config.authToken && this.config.authToken.trim().length > 0);
  }

  stageLineupChanges(_payload: StageLineupPayload): StagedLineupChecklist {
    if (!this.isConfigured()) {
      throw new SleeperGraphQLNotConfiguredError();
    }
    throw new SleeperGraphQLNotConfiguredError(
      'Direct Sleeper GraphQL lineup push is scaffolded for v2 and not yet enabled; use ChecklistLineupAdapter in v1.'
    );
  }
}

