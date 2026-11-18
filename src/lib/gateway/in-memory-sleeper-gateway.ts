import {
  SleeperGateway,
  SleeperLeagueBundle,
  SleeperTransaction,
} from '../types/mba';

export class InMemorySleeperGateway implements SleeperGateway {
  private bundle: SleeperLeagueBundle;
  private transactionsByLeg: Record<string, SleeperTransaction[]>;
  public fetchCount = 0;

  constructor(
    bundle: SleeperLeagueBundle,
    transactionsByLeg: Record<string, SleeperTransaction[]> = {}
  ) {
    this.bundle = bundle;
    this.transactionsByLeg = transactionsByLeg;
  }

  async fetchLeagueBundle(_options?: { forceRefresh?: boolean; leg?: number }): Promise<SleeperLeagueBundle> {
    this.fetchCount += 1;
    return structuredClone(this.bundle);
  }

  async fetchTransactions(leagueId: string, leg: number): Promise<SleeperTransaction[]> {
    return structuredClone(this.transactionsByLeg[`${leagueId}:${leg}`] ?? []);
  }

  updateBundle(updater: (bundle: SleeperLeagueBundle) => void): void {
    updater(this.bundle);
  }
}
