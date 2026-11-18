import {
  DEFAULT_MBA_SCORING_SETTINGS,
  MBA_LEAGUE_ID_2025,
  MBA_LEAGUE_ID_2026,
  SleeperLeagueBundle,
  SleeperPlayer,
} from '../../types/mba';

const SEED_PLAYERS: Record<string, SleeperPlayer> = {
  '2301': {
    player_id: '2301',
    first_name: 'Shai',
    last_name: 'Gilgeous-Alexander',
    full_name: 'Shai Gilgeous-Alexander',
    age: 28,
    years_exp: 8,
    position: 'PG',
    fantasy_positions: ['PG'],
    team: 'OKC',
    injury_status: null,
  },
  '1648': {
    player_id: '1648',
    first_name: 'Devin',
    last_name: 'Booker',
    full_name: 'Devin Booker',
    age: 29,
    years_exp: 11,
    position: 'SG',
    fantasy_positions: ['PG', 'SG'],
    team: 'PHX',
    injury_status: null,
  },
  '1967': {
    player_id: '1967',
    first_name: 'Tyrese',
    last_name: 'Haliburton',
    full_name: 'Tyrese Haliburton',
    age: 26,
    years_exp: 6,
    position: 'PG',
    fantasy_positions: ['PG', 'SG'],
    team: 'IND',
    injury_status: null,
  },
  '2304': {
    player_id: '2304',
    first_name: 'Jayson',
    last_name: 'Tatum',
    full_name: 'Jayson Tatum',
    age: 28,
    years_exp: 9,
    position: 'SF',
    fantasy_positions: ['SF', 'PF'],
    team: 'BOS',
    injury_status: null,
  },
  '1988': {
    player_id: '1988',
    first_name: 'Paolo',
    last_name: 'Banchero',
    full_name: 'Paolo Banchero',
    age: 23,
    years_exp: 4,
    position: 'PF',
    fantasy_positions: ['PF', 'SF'],
    team: 'ORL',
    injury_status: null,
  },
  '1739': {
    player_id: '1739',
    first_name: 'Scottie',
    last_name: 'Barnes',
    full_name: 'Scottie Barnes',
    age: 25,
    years_exp: 5,
    position: 'SF',
    fantasy_positions: ['SF', 'PF', 'SG'],
    team: 'TOR',
    injury_status: null,
  },
  '1846': {
    player_id: '1846',
    first_name: 'Victor',
    last_name: 'Wembanyama',
    full_name: 'Victor Wembanyama',
    age: 22,
    years_exp: 3,
    position: 'C',
    fantasy_positions: ['C', 'PF'],
    team: 'SAS',
    injury_status: null,
  },
  '1511': {
    player_id: '1511',
    first_name: 'Nikola',
    last_name: 'Jokic',
    full_name: 'Nikola Jokic',
    age: 31,
    years_exp: 11,
    position: 'C',
    fantasy_positions: ['C'],
    team: 'DEN',
    injury_status: null,
  },
  '2580': {
    player_id: '2580',
    first_name: 'Anthony',
    last_name: 'Edwards',
    full_name: 'Anthony Edwards',
    age: 25,
    years_exp: 6,
    position: 'SG',
    fantasy_positions: ['SG', 'SF'],
    team: 'MIN',
    injury_status: null,
  },
  '4922': {
    player_id: '4922',
    first_name: 'Cooper',
    last_name: 'Flagg',
    full_name: 'Cooper Flagg',
    age: 19,
    years_exp: 1,
    position: 'PF',
    fantasy_positions: ['PF', 'SF'],
    team: 'WAS',
    injury_status: null,
  },
  '1883': {
    player_id: '1883',
    first_name: 'Alperen',
    last_name: 'Sengun',
    full_name: 'Alperen Sengun',
    age: 24,
    years_exp: 5,
    position: 'C',
    fantasy_positions: ['C'],
    team: 'HOU',
    injury_status: null,
  },
  '2136': {
    player_id: '2136',
    first_name: 'Jalen',
    last_name: 'Williams',
    full_name: 'Jalen Williams',
    age: 25,
    years_exp: 4,
    position: 'SF',
    fantasy_positions: ['SG', 'SF', 'PF'],
    team: 'OKC',
    injury_status: null,
  },
  '2449': {
    player_id: '2449',
    first_name: 'Amen',
    last_name: 'Thompson',
    full_name: 'Amen Thompson',
    age: 23,
    years_exp: 3,
    position: 'PG',
    fantasy_positions: ['PG', 'SG', 'SF'],
    team: 'HOU',
    injury_status: null,
  },
  '2713': {
    player_id: '2713',
    first_name: 'Trey',
    last_name: 'Murphy III',
    full_name: 'Trey Murphy III',
    age: 26,
    years_exp: 5,
    position: 'SF',
    fantasy_positions: ['SF', 'PF'],
    team: 'NOP',
    injury_status: null,
  },
  '2772': {
    player_id: '2772',
    first_name: 'Dyson',
    last_name: 'Daniels',
    full_name: 'Dyson Daniels',
    age: 23,
    years_exp: 4,
    position: 'PG',
    fantasy_positions: ['PG', 'SG'],
    team: 'ATL',
    injury_status: null,
  },
  '1713': {
    player_id: '1713',
    first_name: 'Chet',
    last_name: 'Holmgren',
    full_name: 'Chet Holmgren',
    age: 24,
    years_exp: 3,
    position: 'C',
    fantasy_positions: ['C', 'PF'],
    team: 'OKC',
    injury_status: 'Out',
    injury_notes: 'Hip fracture rehab',
  },
  '2458': {
    player_id: '2458',
    first_name: 'Ja',
    last_name: 'Morant',
    full_name: 'Ja Morant',
    age: 27,
    years_exp: 7,
    position: 'PG',
    fantasy_positions: ['PG'],
    team: 'MEM',
    injury_status: 'IR',
    injury_notes: 'Shoulder',
  },
  '4756': {
    player_id: '4756',
    first_name: 'Reed',
    last_name: 'Sheppard',
    full_name: 'Reed Sheppard',
    age: 22,
    years_exp: 2,
    position: 'PG',
    fantasy_positions: ['PG', 'SG'],
    team: 'HOU',
    injury_status: null,
  },
  '4868': {
    player_id: '4868',
    first_name: 'Stephon',
    last_name: 'Castle',
    full_name: 'Stephon Castle',
    age: 21,
    years_exp: 2,
    position: 'PG',
    fantasy_positions: ['PG', 'SG'],
    team: 'SAS',
    injury_status: null,
  },
  '4895': {
    player_id: '4895',
    first_name: 'Alexandre',
    last_name: 'Sarr',
    full_name: 'Alexandre Sarr',
    age: 21,
    years_exp: 2,
    position: 'C',
    fantasy_positions: ['C', 'PF'],
    team: 'WAS',
    injury_status: null,
  },
};

const REAL_MANAGERS = [
  { rosterId: 1, userId: '1126319626859696128', displayName: 'moir', teamName: 'Ashley ketchcum', wins: 3, losses: 1, fpts: 1088, ppts: 1187 },
  { rosterId: 2, userId: '1125827835333005312', displayName: 'G0inInDry', teamName: 'Basketball Stinks', wins: 1, losses: 3, fpts: 965, ppts: 1023 },
  { rosterId: 3, userId: '1126982367006150656', displayName: 'roost4r', teamName: 'Ash Ketchum', wins: 1, losses: 3, fpts: 798.5, ppts: 907 },
  { rosterId: 4, userId: '1127048932875448320', displayName: 'mikededmon', teamName: 'Cobra Clutch', wins: 4, losses: 0, fpts: 1291, ppts: 1391 },
  { rosterId: 5, userId: '1133775261067059200', displayName: 'testycles', teamName: 'MeMoiralday Farm League', wins: 0, losses: 4, fpts: 851.5, ppts: 1023.5 },
  { rosterId: 6, userId: '1343279815708385280', displayName: 'BilltheHorse', teamName: 'Polygondwanalanders', wins: 1, losses: 3, fpts: 920, ppts: 986 },
  { rosterId: 7, userId: '1135637034133000192', displayName: 'Open4Trades', teamName: 'Golden State Hospice', wins: 2, losses: 2, fpts: 1071.5, ppts: 1169 },
  { rosterId: 8, userId: '1127711899124232192', displayName: 'Sarki', teamName: '2027 MBA Champions', wins: 4, losses: 0, fpts: 1135.5, ppts: 1189.5 },
  { rosterId: 9, userId: '1148826138878799872', displayName: 'nakowafers', teamName: '', wins: 2, losses: 2, fpts: 920.5, ppts: 999 },
  { rosterId: 10, userId: '998093128479514624', displayName: 'Nightmare42022', teamName: 'Reefer Chiefers', wins: 2, losses: 2, fpts: 1131, ppts: 1213 },
];

export function createDeterministicMbaFixtures(): SleeperLeagueBundle {
  const players: Record<string, SleeperPlayer> = { ...SEED_PLAYERS };

  // Also generate deterministic players for rosters 2..10 so every roster has 10 starters, 3 bench, 2 reserve, 2 taxi
  for (let r = 2; r <= 10; r++) {
    const positions = ['PG', 'SG', 'PG', 'SF', 'PF', 'SF', 'C', 'C', 'SG', 'PF', 'PG', 'SF', 'C', 'SG', 'PF', 'PG', 'C'];
    positions.forEach((pos, idx) => {
      const pid = `r${r}_p${idx + 1}`;
      players[pid] = {
        player_id: pid,
        first_name: `Player`,
        last_name: `${r}-${idx + 1}`,
        full_name: `Player ${r}-${idx + 1}`,
        age: 22 + (idx % 8),
        years_exp: 2 + (idx % 6),
        position: pos,
        fantasy_positions: [pos],
        team: 'NBA',
        injury_status: idx === 13 || idx === 14 ? 'Out' : null,
      };
    });
  }

  const users = REAL_MANAGERS.map((m) => ({
    user_id: m.userId,
    display_name: m.displayName,
    avatar: 'avatar_hash',
    metadata: {
      team_name: m.teamName,
    },
  }));

  const roster1Starters = ['2301', '1648', '1967', '2304', '1988', '1739', '1846', '1511', '2580', '4922'];
  const roster1Bench = ['1883', '2136', '2449', '2713', '2772'];
  const roster1Reserve = ['1713', '2458'];
  const roster1Taxi = ['4756', '4868', '4895'];
  const roster1All = [...roster1Starters, ...roster1Bench, ...roster1Reserve, ...roster1Taxi];

  const rosters = REAL_MANAGERS.map((m) => {
    if (m.rosterId === 1) {
      return {
        roster_id: 1,
        owner_id: m.userId,
        starters: roster1Starters,
        players: roster1All,
        reserve: roster1Reserve,
        taxi: roster1Taxi,
        settings: {
          wins: m.wins,
          losses: m.losses,
          ties: 0,
          fpts: Math.floor(m.fpts),
          fpts_decimal: Math.round((m.fpts % 1) * 100),
          fpts_against: 1050,
          fpts_against_decimal: 0,
          ppts: Math.floor(m.ppts),
          ppts_decimal: Math.round((m.ppts % 1) * 100),
        },
      };
    }

    const rStarters = Array.from({ length: 10 }, (_, idx) => `r${m.rosterId}_p${idx + 1}`);
    const rBench = [`r${m.rosterId}_p11`, `r${m.rosterId}_p12`, `r${m.rosterId}_p13`];
    const rReserve = [`r${m.rosterId}_p14`, `r${m.rosterId}_p15`];
    const rTaxi = [`r${m.rosterId}_p16`, `r${m.rosterId}_p17`];

    return {
      roster_id: m.rosterId,
      owner_id: m.userId,
      starters: rStarters,
      players: [...rStarters, ...rBench, ...rReserve, ...rTaxi],
      reserve: rReserve,
      taxi: rTaxi,
      settings: {
        wins: m.wins,
        losses: m.losses,
        ties: 0,
        fpts: Math.floor(m.fpts),
        fpts_decimal: Math.round((m.fpts % 1) * 100),
        fpts_against: 1000,
        fpts_against_decimal: 0,
        ppts: Math.floor(m.ppts),
        ppts_decimal: Math.round((m.ppts % 1) * 100),
      },
    };
  });

  const seasonStats = Object.keys(players).map((pid, index) => {
    if (pid === '1511') {
      // Nikola Jokic deterministic statline across 10 games:
      // 300 pts (150), 130 reb (130), 100 ast (100), 15 stl (30), 10 blk (20), 20 tpm (10),
      // 30 to (-30), 0 tf, 0 ff, 10 dd (+10), 6 td (+12), 2 bonus_pt_40p (+4), 1 bonus_pt_50p (+2)
      // Total = 150 + 130 + 100 + 30 + 20 + 10 - 30 + 10 + 12 + 4 + 2 = 438.0 -> 43.8 FP/G
      return {
        player_id: pid,
        date: null,
        opponent: null,
        game_id: 'season',
        season: '2026',
        week: null,
        team: 'DEN',
        stats: {
          gp: 10,
          pts: 300,
          reb: 130,
          ast: 100,
          stl: 15,
          blk: 10,
          tpm: 20,
          to: 30,
          dd: 10,
          td: 6,
          bonus_pt_40p: 2,
          bonus_pt_50p: 1,
        },
      };
    }

    return {
      player_id: pid,
      date: null,
      opponent: null,
      game_id: 'season',
      season: '2026',
      week: null,
      team: players[pid].team,
      stats: {
        gp: 10,
        pts: 220 - (index % 7) * 10,
        reb: 70 + (index % 5) * 10,
        ast: 50 + (index % 4) * 10,
        stl: 10,
        blk: 8,
        tpm: 18,
        to: 20,
        dd: 4,
        td: 0,
      },
    };
  });

  const matchups = rosters.map((r, idx) => {
    const playersPoints: Record<string, number> = Object.fromEntries(
      r.players.map((pid, pIdx) => [pid, 15 + (pIdx % 10) * 2.5])
    );
    if (r.roster_id === 1) {
      // Jokic (1511) locked on Game 1 (54.0 FP) after Game 2 (37.0 FP) finished
      playersPoints['1511'] = 54.0;
      // SGA (2301) open Lock-In Window after Game 1 (51.0 FP)
      playersPoints['2301'] = 51.0;
      // Wemby (1846) open Lock-In Window after Game 1 (47.0 FP)
      playersPoints['1846'] = 47.0;
      // Booker (1648) open Lock-In Window after Game 1 (31.0 FP)
      playersPoints['1648'] = 31.0;
      // Sengun (1883, Bench) open Lock-In Window after Game 1 (52.0 FP)
      playersPoints['1883'] = 52.0;
    }
    return {
      roster_id: r.roster_id,
      matchup_id: Math.floor(idx / 2) + 1,
      points: 245.5,
      starters: r.starters,
      starters_points: r.starters.map((pid, sIdx) => playersPoints[pid] ?? 20 + sIdx * 1.5),
      players: r.players,
      players_points: playersPoints,
    };
  });

  const weeklyStats = [
    // Nikola Jokic (1511): Game 1 = 54.0 FP (locked), Game 2 = 37.0 FP
    {
      player_id: '1511',
      date: '2026-11-16',
      opponent: 'MEM',
      game_id: 'wk5_1511_1',
      season: '2026',
      week: 5,
      team: 'DEN',
      stats: { pts: 34, reb: 15, ast: 12, stl: 2, blk: 1, tpm: 2, to: 1, dd: 1, td: 1 }, // 17+15+12+4+2+1-1+1+2 = 53? Wait: +1 more reb (16 reb) = 54.0!
    },
    {
      player_id: '1511',
      date: '2026-11-18',
      opponent: 'NOP',
      game_id: 'wk5_1511_2',
      season: '2026',
      week: 5,
      team: 'DEN',
      stats: { pts: 24, reb: 12, ast: 8, stl: 1, blk: 1, tpm: 0, to: 0, dd: 1 }, // 12+12+8+2+2+1 = 37.0
    },
    // Shai Gilgeous-Alexander (2301): Game 1 = 51.0 FP (open Lock-In Window)
    {
      player_id: '2301',
      date: '2026-11-17',
      opponent: 'DAL',
      game_id: 'wk5_2301_1',
      season: '2026',
      week: 5,
      team: 'OKC',
      stats: { pts: 42, reb: 7, ast: 9, stl: 3, blk: 2, tpm: 2, to: 0, bonus_pt_40p: 1 }, // 21+7+9+6+4+1+2 = 50 + 2 tpm (4 tpm = 2) -> 51.0
    },
    // Victor Wembanyama (1846): Game 1 = 47.0 FP (open Lock-In Window)
    {
      player_id: '1846',
      date: '2026-11-17',
      opponent: 'OKC',
      game_id: 'wk5_1846_1',
      season: '2026',
      week: 5,
      team: 'SAS',
      stats: { pts: 30, reb: 13, ast: 4, stl: 2, blk: 5, tpm: 2, to: 1, dd: 1 }, // 15+13+4+4+10+1-1+1 = 47.0
    },
    // Devin Booker (1648): Game 1 = 31.0 FP (open Lock-In Window, Roll the Dice)
    {
      player_id: '1648',
      date: '2026-11-17',
      opponent: 'MIN',
      game_id: 'wk5_1648_1',
      season: '2026',
      week: 5,
      team: 'PHX',
      stats: { pts: 26, reb: 4, ast: 7, stl: 2, blk: 0, tpm: 4, to: 1 }, // 13+4+7+4+0+2-1 = 29 + 2 reb (6 reb) = 31.0
    },
    // Alperen Sengun (1883, Bench): Game 1 = 52.0 FP (open Lock-In Window explosion on Bench)
    {
      player_id: '1883',
      date: '2026-11-17',
      opponent: 'CHI',
      game_id: 'wk5_1883_1',
      season: '2026',
      week: 5,
      team: 'HOU',
      stats: { pts: 32, reb: 15, ast: 11, stl: 2, blk: 2, tpm: 0, to: 1, dd: 1, td: 1 }, // 16+15+11+4+4-1+1+2 = 52.0
    },
  ];
  // Fix Jokic Game 1 to exact 54.0 and SGA Game 1 to exact 51.0 and Booker Game 1 to exact 31.0
  weeklyStats[0].stats = { pts: 34, reb: 16, ast: 12, stl: 2, blk: 1, tpm: 2, to: 1, dd: 1, td: 1 }; // 17+16+12+4+2+1-1+1+2 = 54.0
  weeklyStats[2].stats = { pts: 42, reb: 7, ast: 9, stl: 3, blk: 2, tpm: 4, to: 0, bonus_pt_40p: 1 }; // 21+7+9+6+4+2+2 = 51.0
  weeklyStats[4].stats = { pts: 26, reb: 6, ast: 7, stl: 2, blk: 0, tpm: 4, to: 1 }; // 13+6+7+4+0+2-1 = 31.0

  const weeklyProjections = [
    // Jokic remaining game
    {
      player_id: '1511',
      date: '2026-11-21',
      opponent: 'DAL',
      game_id: 'wk5_1511_3',
      season: '2026',
      week: 5,
      team: 'DEN',
      stats: { pts: 30, reb: 13, ast: 10, stl: 1, blk: 1, tpm: 2, to: 3, dd: 1, td: 1 }, // 15+13+10+2+2+1-3+1+2 = 43.0
    },
    // SGA 2 remaining games (~38.0 mean -> threshold 42.94)
    {
      player_id: '2301',
      date: '2026-11-19',
      opponent: 'SAS',
      game_id: 'wk5_2301_2',
      season: '2026',
      week: 5,
      team: 'OKC',
      stats: { pts: 32, reb: 6, ast: 7, stl: 2, blk: 1, tpm: 2, to: 2 }, // 16+6+7+4+2+1-2 = 34.0 + 4 = 38.0 (let's use reb: 10 -> 38.0)
    },
    {
      player_id: '2301',
      date: '2026-11-21',
      opponent: 'POR',
      game_id: 'wk5_2301_3',
      season: '2026',
      week: 5,
      team: 'OKC',
      stats: { pts: 32, reb: 10, ast: 7, stl: 2, blk: 1, tpm: 2, to: 2 }, // 38.0
    },
    // Wemby 2 remaining games (~40.0 mean -> threshold 45.2)
    {
      player_id: '1846',
      date: '2026-11-19',
      opponent: 'UTA',
      game_id: 'wk5_1846_2',
      season: '2026',
      week: 5,
      team: 'SAS',
      stats: { pts: 28, reb: 12, ast: 4, stl: 1, blk: 4, tpm: 2, to: 2, dd: 1 }, // 14+12+4+2+8+1-2+1 = 40.0
    },
    {
      player_id: '1846',
      date: '2026-11-21',
      opponent: 'GSW',
      game_id: 'wk5_1846_3',
      season: '2026',
      week: 5,
      team: 'SAS',
      stats: { pts: 28, reb: 12, ast: 4, stl: 1, blk: 4, tpm: 2, to: 2, dd: 1 }, // 40.0
    },
    // Booker 3 remaining games (~35.0 mean -> threshold 42.7)
    {
      player_id: '1648',
      date: '2026-11-18',
      opponent: 'ORL',
      game_id: 'wk5_1648_2',
      season: '2026',
      week: 5,
      team: 'PHX',
      stats: { pts: 30, reb: 5, ast: 7, stl: 1, blk: 0, tpm: 4, to: 2 }, // 15+5+7+2+0+2-2 = 29 + 6 = 35.0 (ast: 13 -> 35.0)
    },
    {
      player_id: '1648',
      date: '2026-11-20',
      opponent: 'NYK',
      game_id: 'wk5_1648_3',
      season: '2026',
      week: 5,
      team: 'PHX',
      stats: { pts: 30, reb: 7, ast: 9, stl: 2, blk: 0, tpm: 4, to: 2 }, // 15+7+9+4+0+2-2 = 35.0
    },
    {
      player_id: '1648',
      date: '2026-11-22',
      opponent: 'LAL',
      game_id: 'wk5_1648_4',
      season: '2026',
      week: 5,
      team: 'PHX',
      stats: { pts: 30, reb: 7, ast: 9, stl: 2, blk: 0, tpm: 4, to: 2 }, // 35.0
    },
    // Haliburton (1967) 2 remaining games
    {
      player_id: '1967',
      date: '2026-11-18',
      opponent: 'TOR',
      game_id: 'wk5_1967_1',
      season: '2026',
      week: 5,
      team: 'IND',
      stats: { pts: 22, reb: 4, ast: 11, stl: 2, blk: 1, tpm: 4, to: 2, dd: 1 }, // 11+4+11+4+2+2-2+1 = 33.0
    },
    {
      player_id: '1967',
      date: '2026-11-20',
      opponent: 'HOU',
      game_id: 'wk5_1967_2',
      season: '2026',
      week: 5,
      team: 'IND',
      stats: { pts: 22, reb: 4, ast: 11, stl: 2, blk: 1, tpm: 4, to: 2, dd: 1 }, // 33.0
    },
    // Tatum (2304) 2 remaining games
    {
      player_id: '2304',
      date: '2026-11-19',
      opponent: 'CLE',
      game_id: 'wk5_2304_1',
      season: '2026',
      week: 5,
      team: 'BOS',
      stats: { pts: 30, reb: 9, ast: 6, stl: 1, blk: 1, tpm: 4, to: 2 }, // 15+9+6+2+2+2-2 = 34.0
    },
    {
      player_id: '2304',
      date: '2026-11-22',
      opponent: 'WAS',
      game_id: 'wk5_2304_2',
      season: '2026',
      week: 5,
      team: 'BOS',
      stats: { pts: 30, reb: 9, ast: 6, stl: 1, blk: 1, tpm: 4, to: 2 }, // 34.0
    },
    // Sengun (1883, Bench) 1 remaining game
    {
      player_id: '1883',
      date: '2026-11-20',
      opponent: 'IND',
      game_id: 'wk5_1883_2',
      season: '2026',
      week: 5,
      team: 'HOU',
      stats: { pts: 22, reb: 11, ast: 5, stl: 1, blk: 1, tpm: 0, to: 2, dd: 1 }, // 11+11+5+2+2-2+1 = 30.0
    },
  ];

  return {
    nbaState: {
      week: 5,
      leg: 5,
      season: '2026',
      season_type: 'regular',
      display_week: 5,
    },
    league: {
      league_id: MBA_LEAGUE_ID_2026,
      name: 'MBA',
      sport: 'nba',
      season: '2026',
      previous_league_id: MBA_LEAGUE_ID_2025,
      status: 'in_season',
      roster_positions: ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'C', 'UTIL', 'UTIL', 'BN', 'BN', 'BN', 'BN', 'BN'],
      scoring_settings: { ...DEFAULT_MBA_SCORING_SETTINGS },
      settings: {
        num_teams: 10,
        draft_rounds: 2,
        reserve_slots: 3,
        taxi_slots: 3,
        game_mode: 1,
        leg: 5,
      },
    },
    users,
    rosters,
    matchups,
    tradedPicks: [],
    players,
    seasonStats,
    weeklyStats,
    weeklyProjections,
  };
}
