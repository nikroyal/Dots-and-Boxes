// Achievement catalog. Each achievement has:
//   id, name, description, check(stats) -> boolean
// stats shape: { wins, losses, draws, gamesPlayed, totalBoxes, biggestChain,
//                fastestWin, longestGame, perfectWins, friends, elo }

export const ACHIEVEMENTS = [
  { id: 'first_steps',    name: 'First Steps',    desc: 'Play your first game',
    check: s => s.gamesPlayed >= 1 },
  { id: 'first_blood',    name: 'First Blood',    desc: 'Win your first game',
    check: s => s.wins >= 1 },
  { id: 'veteran_10',     name: 'Veteran',        desc: 'Play 10 games',
    check: s => s.gamesPlayed >= 10 },
  { id: 'veteran_50',     name: 'Seasoned',       desc: 'Play 50 games',
    check: s => s.gamesPlayed >= 50 },
  { id: 'veteran_100',    name: 'Centurion',      desc: 'Play 100 games',
    check: s => s.gamesPlayed >= 100 },
  { id: 'streak_5',       name: 'On Fire',        desc: 'Win 5 in a row',
    check: s => (s.winStreak || 0) >= 5 },
  { id: 'streak_10',      name: 'Unstoppable',    desc: 'Win 10 in a row',
    check: s => (s.winStreak || 0) >= 10 },
  { id: 'collector_100',  name: 'Collector',      desc: 'Claim 100 boxes total',
    check: s => (s.totalBoxes || 0) >= 100 },
  { id: 'collector_1000', name: 'Hoarder',        desc: 'Claim 1000 boxes total',
    check: s => (s.totalBoxes || 0) >= 1000 },
  { id: 'chain_master',   name: 'Chain Master',   desc: 'Claim 5+ boxes on a single move',
    check: s => (s.biggestChain || 0) >= 5 },
  { id: 'chain_legend',   name: 'Chain Legend',   desc: 'Claim 10+ boxes on a single move',
    check: s => (s.biggestChain || 0) >= 10 },
  { id: 'perfectionist',  name: 'Perfectionist',  desc: 'Win without giving up a single box',
    check: s => (s.perfectWins || 0) >= 1 },
  { id: 'social_butterfly', name: 'Social Butterfly', desc: 'Add 5 friends',
    check: s => (s.friends || 0) >= 5 },
  { id: 'rated_1200',     name: 'Rated',          desc: 'Reach 1200 ELO',
    check: s => (s.elo || 1000) >= 1200 },
  { id: 'rated_1500',     name: 'Skilled',        desc: 'Reach 1500 ELO',
    check: s => (s.elo || 1000) >= 1500 },
  { id: 'rated_1800',     name: 'Expert',         desc: 'Reach 1800 ELO',
    check: s => (s.elo || 1000) >= 1800 },
  { id: 'rated_2000',     name: 'Master',         desc: 'Reach 2000 ELO',
    check: s => (s.elo || 1000) >= 2000 },
  { id: 'big_board',      name: 'Big Thinker',    desc: 'Win a 10x10 or larger game',
    check: s => (s.bigBoardWins || 0) >= 1 },
  { id: 'comeback',       name: 'Comeback Kid',   desc: 'Win after being down by 5+ boxes',
    check: s => (s.comebackWins || 0) >= 1 },
  { id: 'speed_demon',    name: 'Speed Demon',    desc: 'Win a game in under 2 minutes',
    check: s => (s.fastestWin || Infinity) < 120000 },
];

// Returns a list of newly-unlocked achievement IDs
export function checkUnlocks(stats, alreadyUnlocked = []) {
  const newlyUnlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (!alreadyUnlocked.includes(a.id) && a.check(stats)) {
      newlyUnlocked.push(a.id);
    }
  }
  return newlyUnlocked;
}

// Avatar options — emoji-based for simplicity, no image storage needed
export const AVATAR_OPTIONS = [
  '◆', '◇', '●', '○', '■', '□', '▲', '△', '▼', '▽',
  '★', '☆', '♠', '♣', '♥', '♦', '✦', '✧', '◉', '⬢',
];

export const TITLE_OPTIONS = [
  'Novice', 'Apprentice', 'Player', 'Strategist', 'Tactician',
  'Master', 'Grandmaster', 'Legend', 'The Patient', 'The Bold',
];

export function getRankFromElo(elo) {
  if (elo >= 2000) return { name: 'Master',      color: '#B91C3C' };
  if (elo >= 1800) return { name: 'Expert',      color: '#B7791F' };
  if (elo >= 1500) return { name: 'Skilled',     color: '#2F6B3F' };
  if (elo >= 1200) return { name: 'Rated',       color: '#1A1A1A' };
  if (elo >= 1000) return { name: 'Player',      color: '#666' };
  return { name: 'Novice', color: '#999' };
}
