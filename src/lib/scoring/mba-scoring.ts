import {
  DEFAULT_MBA_SCORING_SETTINGS,
  MbaScoringSettings,
  PlayerSeasonMetrics,
  SleeperStatLine,
} from '../types/mba';

export function computeMbaPoints(
  stats: SleeperStatLine | undefined | null,
  scoringSettings: MbaScoringSettings = DEFAULT_MBA_SCORING_SETTINGS
): number {
  if (!stats) return 0;

  let total = 0;
  const keys: Array<keyof MbaScoringSettings> = [
    'pts',
    'reb',
    'ast',
    'stl',
    'blk',
    'tpm',
    'to',
    'tf',
    'ff',
    'dd',
    'td',
    'bonus_pt_40p',
    'bonus_pt_50p',
  ];

  for (const key of keys) {
    const statVal = stats[key as string];
    const weight = scoringSettings[key] ?? DEFAULT_MBA_SCORING_SETTINGS[key] ?? 0;
    if (typeof statVal === 'number' && !Number.isNaN(statVal)) {
      total += statVal * weight;
    }
  }

  return Math.round(total * 100) / 100;
}

export function computeSeasonMetrics(
  stats: SleeperStatLine | undefined | null,
  scoringSettings: MbaScoringSettings = DEFAULT_MBA_SCORING_SETTINGS
): PlayerSeasonMetrics {
  const gp = stats?.gp && stats.gp > 0 ? stats.gp : 0;
  const totalMbaPoints = computeMbaPoints(stats, scoringSettings);
  const perGame = (val?: number) => (gp > 0 && typeof val === 'number' ? Math.round((val / gp) * 10) / 10 : 0);

  return {
    gamesPlayed: gp,
    totalMbaPoints,
    mbaFantasyPointsPerGame: gp > 0 ? Math.round((totalMbaPoints / gp) * 10) / 10 : 0,
    ptsPerGame: perGame(stats?.pts),
    rebPerGame: perGame(stats?.reb),
    astPerGame: perGame(stats?.ast),
    stlPerGame: perGame(stats?.stl),
    blkPerGame: perGame(stats?.blk),
    tpmPerGame: perGame(stats?.tpm),
    toPerGame: perGame(stats?.to),
  };
}
