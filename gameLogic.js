// Pure game logic — no Firebase, no React. Used by both client rendering
// and Firestore transactions.

export const PLAYER_COLORS = [
  { name: 'Ink',     hex: '#1A1A1A', soft: 'rgba(26,26,26,0.08)' },
  { name: 'Crimson', hex: '#B91C3C', soft: 'rgba(185,28,60,0.08)' },
  { name: 'Ochre',   hex: '#B7791F', soft: 'rgba(183,121,31,0.08)' },
  { name: 'Forest',  hex: '#2F6B3F', soft: 'rgba(47,107,63,0.08)' },
];

export function createEmptyGame(rows, cols, playerIds) {
  return {
    rows, cols,
    // Use flat objects keyed by "r,c" so Firestore can store them
    // (nested arrays of arrays are awkward in Firestore).
    hLines: {}, // "r,c" -> playerId
    vLines: {}, // "r,c" -> playerId
    boxes:  {}, // "r,c" -> playerId
    currentPlayerIdx: 0,
    scores: Object.fromEntries(playerIds.map(id => [id, 0])),
    moveCount: 0,
    moves: [], // for replay: { type:'h'|'v', r, c, by, ts }
  };
}

export const hKey = (r, c) => `${r},${c}`;
export const vKey = (r, c) => `${r},${c}`;
export const bKey = (r, c) => `${r},${c}`;

export function checkBoxComplete(game, r, c) {
  return game.hLines[hKey(r, c)]     != null
      && game.hLines[hKey(r + 1, c)] != null
      && game.vLines[vKey(r, c)]     != null
      && game.vLines[vKey(r, c + 1)] != null;
}

// Apply a move and return { newGame, claimed, finished, winnerIdx }
export function applyMove(game, orientation, r, c, playerId, playerIds) {
  const newGame = JSON.parse(JSON.stringify(game));

  if (orientation === 'h') {
    if (r < 0 || r > newGame.rows || c < 0 || c >= newGame.cols)
      return { error: 'invalid-coords' };
    if (newGame.hLines[hKey(r, c)] != null)
      return { error: 'already-played' };
    newGame.hLines[hKey(r, c)] = playerId;
  } else if (orientation === 'v') {
    if (r < 0 || r >= newGame.rows || c < 0 || c > newGame.cols)
      return { error: 'invalid-coords' };
    if (newGame.vLines[vKey(r, c)] != null)
      return { error: 'already-played' };
    newGame.vLines[vKey(r, c)] = playerId;
  } else {
    return { error: 'invalid-orientation' };
  }

  // Check box completion
  let claimed = 0;
  if (orientation === 'h') {
    if (r > 0           && checkBoxComplete(newGame, r - 1, c)) { newGame.boxes[bKey(r - 1, c)] = playerId; claimed++; }
    if (r < newGame.rows && checkBoxComplete(newGame, r,     c)) { newGame.boxes[bKey(r, c)]     = playerId; claimed++; }
  } else {
    if (c > 0           && checkBoxComplete(newGame, r, c - 1)) { newGame.boxes[bKey(r, c - 1)] = playerId; claimed++; }
    if (c < newGame.cols && checkBoxComplete(newGame, r, c))     { newGame.boxes[bKey(r, c)]     = playerId; claimed++; }
  }

  newGame.scores[playerId] = (newGame.scores[playerId] || 0) + claimed;
  newGame.moveCount++;
  newGame.moves.push({ type: orientation, r, c, by: playerId, claimed, ts: Date.now() });

  // Advance turn unless they claimed a box (extra turn rule)
  if (claimed === 0) {
    newGame.currentPlayerIdx = (newGame.currentPlayerIdx + 1) % playerIds.length;
  }

  // Check finish
  const totalBoxes = newGame.rows * newGame.cols;
  const totalClaimed = Object.values(newGame.scores).reduce((a, b) => a + b, 0);
  let finished = false;
  let winnerIdx = null;
  if (totalClaimed >= totalBoxes) {
    finished = true;
    let max = -1;
    let tied = false;
    playerIds.forEach((id, idx) => {
      if (newGame.scores[id] > max) { max = newGame.scores[id]; winnerIdx = idx; tied = false; }
      else if (newGame.scores[id] === max) { tied = true; }
    });
    if (tied) winnerIdx = -1; // draw
  }

  return { newGame, claimed, finished, winnerIdx };
}

// ELO calculation (simple two-player version)
// K-factor = 32 (standard for casual)
export function computeElo(ratingA, ratingB, scoreA) {
  // scoreA: 1 = A won, 0.5 = draw, 0 = A lost
  const K = 32;
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const newA = Math.round(ratingA + K * (scoreA - expectedA));
  const newB = Math.round(ratingB + K * ((1 - scoreA) - expectedB));
  return { newA, newB, deltaA: newA - ratingA, deltaB: newB - ratingB };
}
