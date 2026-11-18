import {
  MBA_LEAGUE_ID_2025,
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
    const cloned = structuredClone(this.bundle);
    const legKeys = Object.keys(this.transactionsByLeg);
    if (legKeys.length > 0) {
      const txMap = new Map<string, SleeperTransaction>();
      for (const tx of cloned.transactions ?? []) {
        txMap.set(tx.transaction_id, tx);
      }
      for (const key of legKeys) {
        const [leagueId, legStr] = key.split(':');
        const legNum = Number.parseInt(legStr ?? '1', 10);
        const inferredSeason = leagueId === MBA_LEAGUE_ID_2025 ? '2025' : '2026';
        for (const tx of this.transactionsByLeg[key] ?? []) {
          txMap.set(tx.transaction_id, {
            ...structuredClone(tx),
            league_id: tx.league_id ?? leagueId,
            season: tx.season ?? inferredSeason,
            leg: tx.leg ?? (Number.isNaN(legNum) ? 1 : legNum),
          });
        }
      }
      cloned.transactions = [...txMap.values()];
    }
    return cloned;
  }

  async fetchTransactions(leagueId: string, leg: number): Promise<SleeperTransaction[]> {
    const key = `${leagueId}:${leg}`;
    if (this.transactionsByLeg[key]) {
      return structuredClone(this.transactionsByLeg[key]);
    }
    const inferredSeason = leagueId === MBA_LEAGUE_ID_2025 ? '2025' : '2026';
    const matching = (this.bundle.transactions ?? []).filter(
      (tx) =>
        (tx.league_id === leagueId || tx.season === inferredSeason) && tx.leg === leg
    );
    return structuredClone(matching);
  }

  updateBundle(updater: (bundle: SleeperLeagueBundle) => void): void {
    updater(this.bundle);
  }
}
